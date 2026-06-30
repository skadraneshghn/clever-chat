"""Chat API router — SSE streaming, message management."""

from __future__ import annotations

import json
import time
import uuid

import structlog
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import StreamingResponse
from langchain_core.messages import AIMessageChunk, HumanMessage
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.schemas import ChatStreamRequest, MessageResponse
from app.core.config import get_settings
from app.core.database import get_db
from app.core.security import get_current_user
from app.graph.builder import get_compiled_graph
from app.models.conversation import Conversation
from app.models.message import Message

logger = structlog.get_logger()
router = APIRouter(prefix="/chat", tags=["Chat"])


async def _sse_event(event: str, data: dict) -> str:
    """Format a single SSE event."""
    return f"event: {event}\ndata: {json.dumps(data)}\n\n"


@router.post("/stream")
async def chat_stream(
    body: ChatStreamRequest,
    user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Stream chat response via Server-Sent Events.
    
    Creates or continues a conversation, runs the LangGraph agent,
    and streams tokens back as SSE events.
    """
    settings = get_settings()
    start_time = time.monotonic()

    # Get or create conversation
    if body.conversation_id:
        from app.models.conversation_share import ConversationShare
        result = await db.execute(
            select(Conversation).where(
                (Conversation.id == body.conversation_id) &
                ((Conversation.user_id == user.id) |
                 Conversation.id.in_(
                     select(ConversationShare.conversation_id).where(ConversationShare.user_id == user.id)
                 ))
            )
        )
        conversation = result.scalar_one_or_none()
        if not conversation:
            raise HTTPException(status_code=404, detail="Conversation not found")
    else:
        conversation = Conversation(
            user_id=user.id,
            title="New Chat",
            model_id=body.model_id or settings.DEFAULT_MODEL_ID,
            system_prompt=body.system_prompt,
        )
        db.add(conversation)
        await db.flush()

    # Save user message — build multimodal content blocks if images are attached
    content_blocks: list[dict] = [{"type": "text", "text": body.message}]

    # Resolve attached image assets
    image_assets = []
    if body.media_asset_ids:
        from app.models.media_asset import MediaAsset
        asset_result = await db.execute(
            select(MediaAsset).where(
                MediaAsset.id.in_(body.media_asset_ids),
                MediaAsset.user_id == user.id,
            )
        )
        image_assets = asset_result.scalars().all()
        for asset in image_assets:
            if asset.mime_type.startswith("image/"):
                content_blocks.append({
                    "type": "image_url",
                    "image_url": {"url": f"/api/v1/media/{asset.id}"},
                    "asset_id": str(asset.id),
                })

    user_message = Message(
        conversation_id=conversation.id,
        parent_message_id=body.parent_message_id,
        role="user",
        content=content_blocks,
        sender_id=user.id,
        hidden_from_owner=body.hidden_from_owner,
    )
    db.add(user_message)
    await db.flush()

    # Load conversation history
    is_owner = conversation.user_id == user.id
    if is_owner:
        msg_filter = (Message.hidden_from_owner == False)
    else:
        msg_filter = ((Message.hidden_from_owner == False) | (Message.sender_id == user.id))

    result = await db.execute(
        select(Message)
        .where(
            Message.conversation_id == conversation.id,
            Message.is_active_branch == True,
            msg_filter,
        )
        .order_by(Message.created_at)
    )
    history_messages = result.scalars().all()

    # Convert to LangChain messages (supports multimodal content blocks)
    lc_messages = []
    for msg in history_messages:
        if msg.role == "user":
            # Build multimodal content list if there are image blocks
            blocks = msg.content if isinstance(msg.content, list) else [{"type": "text", "text": str(msg.content)}]
            has_images = any(b.get("type") == "image_url" for b in blocks)
            if has_images:
                # Build list-content for vision: [{"type": "text", ...}, {"type": "image_url", ...}]
                lc_content = []
                for block in blocks:
                    if block.get("type") == "text":
                        lc_content.append({"type": "text", "text": block.get("text", "")})
                    elif block.get("type") == "image_url":
                        img_url = block["image_url"]["url"]
                        # Convert relative URL to absolute for the LLM to fetch
                        if img_url.startswith("/"):
                            from app.core.config import get_settings as _gs
                            _s = _gs()
                            base = getattr(_s, 'PUBLIC_BASE_URL', '').rstrip('/') or ""
                            asset_id = block.get("asset_id", "")
                            if asset_id and base:
                                # Use absolute URL if configured
                                img_url = f"{base}{img_url}"
                            elif asset_id:
                                # Fallback: encode image as base64 data-URI
                                try:
                                    import base64
                                    from pathlib import Path as _Path
                                    from app.core.config import get_settings as _gs2
                                    _s2 = _gs2()
                                    import uuid as _uuid
                                    asset_uuid = _uuid.UUID(asset_id)
                                    from app.models.media_asset import MediaAsset as _MA
                                    from sqlalchemy import select as _select
                                    _ar = await db.execute(_select(_MA).where(_MA.id == asset_uuid))
                                    _asset = _ar.scalar_one_or_none()
                                    if _asset:
                                        ext = _Path(_asset.original_filename).suffix.lower()
                                        fp = _s2.upload_path / str(_asset.user_id) / f"{_asset.id}{ext}"
                                        if fp.exists():
                                            raw = fp.read_bytes()
                                            b64 = base64.b64encode(raw).decode()
                                            img_url = f"data:{_asset.mime_type};base64,{b64}"
                                except Exception as _enc_err:
                                    logger.warning("image_encode_failed", error=str(_enc_err))
                        lc_content.append({"type": "image_url", "image_url": {"url": img_url}})
                lc_messages.append(HumanMessage(content=lc_content))
            else:
                lc_messages.append(HumanMessage(content=msg.text_content))
        elif msg.role == "assistant":
            from langchain_core.messages import AIMessage
            lc_messages.append(AIMessage(content=msg.text_content))

    # Build graph input
    graph_input = {
        "messages": lc_messages,
        "thread_id": str(conversation.id),
        "user_id": str(user.id),
        "model_id": body.model_id or conversation.model_id or settings.DEFAULT_MODEL_ID,
        "temperature": body.temperature if body.temperature is not None else settings.DEFAULT_TEMPERATURE,
        "max_tokens": body.max_tokens or settings.DEFAULT_MAX_TOKENS,
        "system_prompt": body.system_prompt or conversation.system_prompt or settings.DEFAULT_SYSTEM_PROMPT,
        "retrieved_context": [],
        "search_performed": False,
        "media_refs": [],
        "tool_calls": [],
        "tool_results": [],
        "needs_retrieval": False,
        "needs_tool_use": False,
        "input_tokens": 0,
        "output_tokens": 0,
        "finish_reason": "",
        "error_message": "",
        # Image generation
        "image_generation_mode": body.image_generation_mode,
        "image_n": body.image_n,
        "generated_image_assets": [],
    }

    # Commit the user message before streaming
    await db.commit()

    async def event_generator():
        """Async generator yielding SSE events from LangGraph execution."""
        graph = get_compiled_graph()
        full_response = ""
        input_tokens = 0
        output_tokens = 0
        ai_message_id = uuid.uuid4()

        try:
            # Send conversation metadata
            yield await _sse_event("message_start", {
                "conversation_id": str(conversation.id),
                "message_id": str(ai_message_id),
                "user_message_id": str(user_message.id),
            })

            # Stream from LangGraph
            generated_images: list[dict] = []
            async for event in graph.astream_events(graph_input, version="v2"):
                kind = event.get("event", "")

                # Stream tokens from LLM (text mode only)
                if kind == "on_chat_model_stream" and not body.image_generation_mode:
                    chunk = event.get("data", {}).get("chunk")
                    if chunk and isinstance(chunk, AIMessageChunk):
                        token = chunk.content
                        if token:
                            full_response += token
                            yield await _sse_event("token", {
                                "content": token,
                            })

                # Node execution events
                elif kind == "on_chain_start":
                    node_name = event.get("name", "")
                    if node_name in ("input_validator", "prompt_builder", "llm_caller", "response_finalizer"):
                        # Emit a friendlier node name for image generation
                        display_name = "image_generator" if (
                            node_name == "llm_caller" and body.image_generation_mode
                        ) else node_name
                        yield await _sse_event("node_start", {
                            "node": display_name,
                        })

                elif kind == "on_chain_end":
                    node_name = event.get("name", "")
                    output = event.get("data", {}).get("output", {})
                    if node_name in ("input_validator", "prompt_builder", "llm_caller", "response_finalizer"):
                        if isinstance(output, dict):
                            input_tokens = output.get("input_tokens", input_tokens)
                            output_tokens = output.get("output_tokens", output_tokens)

                            # Capture generated images
                            if output.get("finish_reason") == "image_generated":
                                generated_images = output.get("generated_image_assets", [])

                            if output.get("finish_reason") == "error":
                                yield await _sse_event("error", {
                                    "code": "llm_call_failed",
                                    "message": output.get("error_message", "LLM call failed"),
                                    "recoverable": False,
                                })
                                return
                        display_name = "image_generator" if (
                            node_name == "llm_caller" and body.image_generation_mode
                        ) else node_name
                        yield await _sse_event("node_end", {
                            "node": display_name,
                        })

            # Calculate latency
            latency_ms = int((time.monotonic() - start_time) * 1000)

            # Persist AI message
            from app.core.database import get_db_context
            async with get_db_context() as save_db:
                # Build content blocks for AI message
                if generated_images:
                    # Image generation response: intro text + image blocks
                    img_count = len(generated_images)
                    intro = f"Generated {img_count} image{'s' if img_count > 1 else ''} based on your prompt."
                    ai_content: list[dict] = [{"type": "text", "text": intro}]
                    for img in generated_images:
                        ai_content.append({
                            "type": "image_url",
                            "image_url": {"url": img["url"]},
                            "asset_id": img["asset_id"],
                        })
                else:
                    ai_content = [{"type": "text", "text": full_response}]

                ai_message = Message(
                    id=ai_message_id,
                    conversation_id=conversation.id,
                    parent_message_id=user_message.id,
                    role="assistant",
                    content=ai_content,
                    model_id=graph_input["model_id"],
                    input_tokens=input_tokens or None,
                    output_tokens=output_tokens or None,
                    latency_ms=latency_ms,
                    sender_id=user_message.sender_id,
                    hidden_from_owner=user_message.hidden_from_owner,
                )
                save_db.add(ai_message)

                # Auto-generate a meaningful title on the first exchange
                generated_title: str | None = None
                if len(history_messages) <= 1 and full_response:
                    conv = await save_db.get(Conversation, conversation.id)
                    if conv and conv.title == "New Chat":
                        from app.services.title_generator import generate_title
                        generated_title = await generate_title(
                            user_message=body.message,
                            ai_response=full_response,
                            model_id=graph_input["model_id"],
                            user_id=str(user.id),
                        )
                        conv.title = generated_title

            # Send completion event
            meta_payload: dict = {
                "message_id": str(ai_message_id),
                "input_tokens": input_tokens,
                "output_tokens": output_tokens,
                "latency_ms": latency_ms,
                "model_id": graph_input["model_id"],
            }
            if generated_images:
                meta_payload["generated_images"] = generated_images

            yield await _sse_event("message_meta", meta_payload)
            # Send title update if a new title was generated
            if generated_title:
                yield await _sse_event("title_update", {
                    "conversation_id": str(conversation.id),
                    "title": generated_title,
                })
            yield await _sse_event("done", {"finish_reason": "stop"})

        except Exception as e:
            logger.error("stream_error", error=str(e), conversation_id=str(conversation.id))
            yield await _sse_event("error", {
                "code": "stream_error",
                "message": str(e),
                "recoverable": False,
            })

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@router.get("/history/{conversation_id}", response_model=list[MessageResponse])
async def get_chat_history(
    conversation_id: uuid.UUID,
    user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get all messages for a conversation (accessible by owner or shared users)."""
    from app.models.conversation_share import ConversationShare
    from sqlalchemy.orm import selectinload, joinedload

    # Verify ownership or share access
    result = await db.execute(
        select(Conversation)
        .options(selectinload(Conversation.user))
        .where(
            (Conversation.id == conversation_id) &
            ((Conversation.user_id == user.id) |
             Conversation.id.in_(
                 select(ConversationShare.conversation_id).where(ConversationShare.user_id == user.id)
             ))
        )
    )
    conv = result.scalar_one_or_none()
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found")

    is_owner = conv.user_id == user.id
    if is_owner:
        msg_filter = (Message.hidden_from_owner == False)
    else:
        msg_filter = ((Message.hidden_from_owner == False) | (Message.sender_id == user.id))

    result = await db.execute(
        select(Message)
        .options(joinedload(Message.sender))
        .where(
            Message.conversation_id == conversation_id,
            msg_filter
        )
        .order_by(Message.created_at)
    )
    messages = result.scalars().all()

    return [
        MessageResponse(
            id=msg.id,
            conversation_id=msg.conversation_id,
            parent_message_id=msg.parent_message_id,
            role=msg.role,
            content=msg.content if isinstance(msg.content, list) else [msg.content],
            model_id=msg.model_id,
            input_tokens=msg.input_tokens,
            output_tokens=msg.output_tokens,
            latency_ms=msg.latency_ms,
            is_active_branch=msg.is_active_branch,
            created_at=msg.created_at,
            sender_id=msg.sender_id,
            sender_username=msg.sender.username if msg.sender else None,
            hidden_from_owner=msg.hidden_from_owner,
        )
        for msg in messages
    ]


@router.patch("/messages/{message_id}/visibility", response_model=MessageResponse)
async def toggle_message_visibility(
    message_id: uuid.UUID,
    user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Toggle a message's hidden_from_owner visibility. Sender only."""
    from sqlalchemy.orm import joinedload

    result = await db.execute(
        select(Message)
        .options(joinedload(Message.sender))
        .where(Message.id == message_id, Message.sender_id == user.id)
    )
    msg = result.scalar_one_or_none()
    if not msg:
        raise HTTPException(
            status_code=404,
            detail="Message not found or you are not authorized to modify it"
        )

    # Toggle visibility
    new_visibility = not msg.hidden_from_owner
    msg.hidden_from_owner = new_visibility

    # Also synchronize all child assistant responses (replies generated from this prompt)
    child_responses_result = await db.execute(
        select(Message)
        .where(
            Message.conversation_id == msg.conversation_id,
            Message.parent_message_id == msg.id,
            Message.role == "assistant"
        )
    )
    child_responses = child_responses_result.scalars().all()
    for child in child_responses:
        child.hidden_from_owner = new_visibility

    await db.commit()
    await db.refresh(msg, ["sender"])

    return MessageResponse(
        id=msg.id,
        conversation_id=msg.conversation_id,
        parent_message_id=msg.parent_message_id,
        role=msg.role,
        content=msg.content if isinstance(msg.content, list) else [msg.content],
        model_id=msg.model_id,
        input_tokens=msg.input_tokens,
        output_tokens=msg.output_tokens,
        latency_ms=msg.latency_ms,
        is_active_branch=msg.is_active_branch,
        created_at=msg.created_at,
        sender_id=msg.sender_id,
        sender_username=msg.sender.username if msg.sender else None,
        hidden_from_owner=msg.hidden_from_owner,
    )


@router.delete("/message/{message_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_message(
    message_id: uuid.UUID,
    user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Delete a specific message and its children."""
    result = await db.execute(
        select(Message)
        .join(Conversation, Message.conversation_id == Conversation.id)
        .where(Message.id == message_id, Conversation.user_id == user.id)
    )
    message = result.scalar_one_or_none()
    if not message:
        raise HTTPException(status_code=404, detail="Message not found")

    await db.delete(message)
