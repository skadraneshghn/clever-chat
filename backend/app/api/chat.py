"""Chat API router — SSE streaming, message management."""

from __future__ import annotations

import asyncio
import json
import time
import uuid

import structlog
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import StreamingResponse, Response
from langchain_core.messages import AIMessageChunk, HumanMessage
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.schemas import ChatStreamRequest, MessageEditRequest, MessageResponse
from app.core.config import get_settings
from app.core.database import get_db
from app.core.locks import acquire_conversation_lock, release_conversation_lock
from app.core.security import get_current_user
from app.graph.builder import get_compiled_graph
from app.models.conversation import Conversation
from app.models.message import Message

logger = structlog.get_logger()
router = APIRouter(prefix="/chat", tags=["Chat"])


async def _sse_event(event: str, data: dict) -> str:
    """Format a single SSE event."""
    return f"event: {event}\ndata: {json.dumps(data)}\n\n"


def _extract_chunk_content(chunk: AIMessageChunk) -> tuple[str, str]:
    """Safely extract (text_token, thinking_token) from an AIMessageChunk.

    Handles all known provider streaming formats:

    1. OpenAI / generic OpenAI-compatible
       - content is a plain string with the answer text

    2. DeepSeek R1 / QwQ / similar open-weight reasoning models
       - chunk.content is "" (empty string for thinking chunks)
       - chunk.additional_kwargs["reasoning_content"] = thinking text
       - When text reply starts, content becomes a normal string again

    3. Anthropic Claude extended thinking (langchain-anthropic >= 0.3)
       - content is a list of dicts:
         [{"type": "thinking", "thinking": "..."}]   (thinking phase)
         [{"type": "text", "text": "..."}]            (answer phase)
         [{"type": "redacted_thinking", ...}]         (redacted, skip)

    4. Malformed providers that put integers or None in content list
       - These are silently skipped (the prior ValidationError bug)

    Returns (text_token, thinking_token) — both may be empty strings.
    """
    text_token = ""
    thinking_token = ""

    # ── 1. Check additional_kwargs.reasoning_content (DeepSeek, QwQ) ─────────
    additional_kwargs = getattr(chunk, "additional_kwargs", None) or {}
    rc = additional_kwargs.get("reasoning_content")
    if rc and isinstance(rc, str):
        thinking_token = rc

    # Also check top-level attribute (some langchain wrappers expose it directly)
    if not thinking_token:
        rc2 = getattr(chunk, "reasoning_content", None)
        if rc2 and isinstance(rc2, str):
            thinking_token = rc2

    # ── 2. Parse chunk.content ────────────────────────────────────────────────
    raw = getattr(chunk, "content", None)

    if isinstance(raw, str):
        if raw and raw != thinking_token:
            # Non-empty string that isn't already captured as thinking
            text_token = raw

    elif isinstance(raw, list):
        for block in raw:
            # Guard: skip anything that isn't a dict (bare integers, None, etc.)
            if not isinstance(block, dict):
                continue
            block_type = block.get("type", "")

            if block_type == "text":
                t = block.get("text") or block.get("content") or ""
                if isinstance(t, str):
                    text_token += t

            elif block_type in ("thinking", "reasoning"):
                # Anthropic extended thinking
                t = block.get("thinking") or block.get("text") or block.get("content") or ""
                if isinstance(t, str):
                    thinking_token += t

            # "redacted_thinking", "tool_use", "input_json_delta" → ignored

    # ── Fallback: int / None / unexpected raw type → return empty (safe) ─────
    return text_token, thinking_token



def _message_to_response(msg: Message, sender_username: str | None = None) -> MessageResponse:
    """Convert a Message ORM object to MessageResponse schema."""
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
        sender_username=sender_username,
        hidden_from_owner=msg.hidden_from_owner,
        execution_status=msg.execution_status,
        version=msg.version,
    )


@router.post("/stream")
async def chat_stream(
    body: ChatStreamRequest,
    user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Stream chat response via Server-Sent Events.

    IMPORTANT: The conversation MUST already exist (created via POST /conversations/initialize
    or any prior request). If conversation_id is None this endpoint returns HTTP 400.

    Flow:
    1. Validate conversation access
    2. If leaf_user_message_id is set (retry/edit re-run), use that message as the prompt
    3. Otherwise, save the new user message immediately with execution_status='completed'
    4. Create a placeholder AI message with execution_status='streaming'
    5. Run LangGraph pipeline, stream tokens via SSE
    6. On completion: update AI message to execution_status='completed'
    7. On error: update AI message to execution_status='failed', stream error event
    """
    settings = get_settings()
    start_time = time.monotonic()

    # ── Validate conversation_id ─────────────────────────────────────────────
    if not body.conversation_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="conversation_id is required. Call POST /conversations/initialize first.",
        )

    # ── Load and authorize conversation ─────────────────────────────────────
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

    # ── Acquire per-conversation lock (prevents double-stream) ───────────────
    conv_id_str = str(conversation.id)
    if not await acquire_conversation_lock(conv_id_str):
        raise HTTPException(
            status_code=status.HTTP_423_LOCKED,
            detail="A response is already being generated for this conversation. Please wait.",
        )

    # ── Resolve user message ─────────────────────────────────────────────────
    # If leaf_user_message_id is set, this is a retry/edit re-run — use existing message.
    # Otherwise, save the incoming message text as a new user message.
    if body.leaf_user_message_id:
        # Retry or re-stream: fetch the existing user message
        existing_result = await db.execute(
            select(Message).where(
                Message.id == body.leaf_user_message_id,
                Message.conversation_id == conversation.id,
            )
        )
        user_message = existing_result.scalar_one_or_none()
        if not user_message:
            release_conversation_lock(conv_id_str)
            raise HTTPException(status_code=404, detail="User message not found")
    else:
        # Standard new-message path: build multimodal content blocks
        content_blocks: list[dict] = [{"type": "text", "text": body.message}]

        # Resolve attached media assets
        media_refs = []
        from app.models.media_asset import MediaAsset
        from app.models.chat_resource import ChatResource

        resolved_ids = list(body.media_asset_ids)
        res_ids_query = await db.execute(
            select(ChatResource.media_asset_id).where(
                ChatResource.conversation_id == conversation.id,
                ChatResource.is_active == True
            )
        )
        for rid in res_ids_query.scalars().all():
            if rid not in resolved_ids:
                resolved_ids.append(rid)

        if body.media_asset_ids:
            for asset_id in body.media_asset_ids:
                dup = await db.execute(
                    select(ChatResource).where(
                        ChatResource.conversation_id == conversation.id,
                        ChatResource.media_asset_id == asset_id
                    )
                )
                if not dup.scalar_one_or_none():
                    db.add(ChatResource(
                        conversation_id=conversation.id,
                        media_asset_id=asset_id,
                        is_active=True
                    ))
            await db.flush()

        if resolved_ids:
            asset_result = await db.execute(
                select(MediaAsset).where(
                    MediaAsset.id.in_(resolved_ids),
                    MediaAsset.user_id == user.id,
                )
            )
            all_assets = asset_result.scalars().all()
            for asset in all_assets:
                asset_type = "image" if asset.mime_type.startswith("image/") else (
                    "audio" if asset.mime_type.startswith("audio/") else (
                        "video" if asset.mime_type.startswith("video/") else "document"
                    )
                )
                media_refs.append({
                    "id": str(asset.id),
                    "type": asset_type,
                    "filename": asset.original_filename,
                    "mime_type": asset.mime_type,
                    "url": f"/api/v1/media/{asset.id}",
                    "extracted_text": asset.extracted_text,
                    "transcription": asset.transcription,
                    "token_count": asset.token_count,
                })

                if asset.mime_type.startswith("image/"):
                    content_blocks.append({
                        "type": "image_url",
                        "image_url": {"url": f"/api/v1/media/{asset.id}"},
                        "asset_id": str(asset.id),
                    })
                else:
                    content_blocks.append({
                        "type": asset_type,
                        "asset_id": str(asset.id),
                        "url": f"/api/v1/media/{asset.id}",
                        "mime_type": asset.mime_type,
                        "text": asset.original_filename,
                    })

        user_message = Message(
            conversation_id=conversation.id,
            parent_message_id=body.parent_message_id,
            role="user",
            content=content_blocks,
            sender_id=user.id,
            hidden_from_owner=body.hidden_from_owner,
            execution_status="completed",  # User messages are always immediately complete
        )
        db.add(user_message)
        await db.flush()

    # ── Pre-create AI message placeholder with execution_status='streaming' ──
    ai_message_id = uuid.uuid4()
    ai_message_placeholder = Message(
        id=ai_message_id,
        conversation_id=conversation.id,
        parent_message_id=user_message.id,
        role="assistant",
        content=[{"type": "text", "text": ""}],  # Empty placeholder
        model_id=body.model_id or conversation.model_id or settings.DEFAULT_MODEL_ID,
        sender_id=user_message.sender_id,
        hidden_from_owner=user_message.hidden_from_owner,
        execution_status="streaming",  # Critical: signals to UI that response is live
    )
    db.add(ai_message_placeholder)

    # ── Load conversation history for LangGraph ──────────────────────────────
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
        if msg.id == ai_message_id:
            continue  # Skip the placeholder we just created
        if msg.role == "user":
            blocks = msg.content if isinstance(msg.content, list) else [{"type": "text", "text": str(msg.content)}]
            has_images = any(b.get("type") == "image_url" for b in blocks)
            if has_images:
                lc_content = []
                for block in blocks:
                    if block.get("type") == "text":
                        lc_content.append({"type": "text", "text": block.get("text", "")})
                    elif block.get("type") == "image_url":
                        img_url = block["image_url"]["url"]
                        if img_url.startswith("/"):
                            from app.core.config import get_settings as _gs
                            _s = _gs()
                            base = getattr(_s, 'PUBLIC_BASE_URL', '').rstrip('/') or ""
                            asset_id = block.get("asset_id", "")
                            if asset_id and base:
                                img_url = f"{base}{img_url}"
                            elif asset_id:
                                try:
                                    import base64
                                    from pathlib import Path as _Path
                                    import uuid as _uuid
                                    asset_uuid = _uuid.UUID(asset_id)
                                    from app.models.media_asset import MediaAsset as _MA
                                    from sqlalchemy import select as _select
                                    _ar = await db.execute(_select(_MA).where(_MA.id == asset_uuid))
                                    _asset = _ar.scalar_one_or_none()
                                    if _asset:
                                        ext = _Path(_asset.original_filename).suffix.lower()
                                        fp = _s.upload_path / str(_asset.user_id) / f"{_asset.id}{ext}"
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
            # Skip failed/empty assistant messages from history
            if msg.execution_status not in ("failed",) and msg.text_content:
                lc_messages.append(AIMessage(content=msg.text_content))

    # Build graph input
    media_refs = locals().get("media_refs", [])
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
        "media_refs": media_refs,
        "tool_calls": [],
        "tool_results": [],
        "needs_retrieval": False,
        "needs_tool_use": False,
        "input_tokens": 0,
        "output_tokens": 0,
        "finish_reason": "",
        "error_message": "",
        "error_raised": False,
        "image_generation_mode": body.image_generation_mode,
        "image_n": body.image_n,
        "generated_image_assets": [],
    }

    # Commit user message + streaming placeholder before opening SSE
    await db.commit()

    async def event_generator():
        """Async generator yielding SSE events from LangGraph execution."""
        graph = get_compiled_graph()
        full_response = ""
        full_thinking = ""
        input_tokens = 0
        output_tokens = 0

        try:
            # Send conversation + message metadata to client for immediate UI update
            yield await _sse_event("message_start", {
                "conversation_id": str(conversation.id),
                "message_id": str(ai_message_id),
                "user_message_id": str(user_message.id),
            })

            generated_images: list[dict] = []
            stream_error = False
            error_detail = ""
            event_queue: asyncio.Queue = asyncio.Queue()
            _SENTINEL = object()

            async def _produce_graph_events():
                try:
                    async for ev in graph.astream_events(graph_input, version="v2"):
                        await event_queue.put(ev)
                except Exception as exc:
                    # Pydantic ValidationError from malformed chunks (e.g., content=<int>)
                    # should not kill the stream — log and put sentinel.
                    exc_name = type(exc).__name__
                    if "ValidationError" in exc_name or "validation" in str(exc).lower():
                        logger.warning(
                            "stream_chunk_validation_error",
                            error=str(exc)[:300],
                            note="Skipping malformed chunk from provider",
                        )
                    else:
                        await event_queue.put(exc)
                finally:
                    await event_queue.put(_SENTINEL)

            producer = asyncio.create_task(_produce_graph_events())

            try:
                while True:
                    try:
                        item = await asyncio.wait_for(event_queue.get(), timeout=15.0)
                    except asyncio.TimeoutError:
                        yield ": heartbeat\n\n"
                        continue

                    if item is _SENTINEL:
                        break
                    if isinstance(item, Exception):
                        raise item

                    event = item
                    kind = event.get("event", "")

                    if kind == "on_chat_model_stream" and not body.image_generation_mode:
                        chunk = event.get("data", {}).get("chunk")
                        if chunk and isinstance(chunk, AIMessageChunk):
                            token, reasoning_chunk = _extract_chunk_content(chunk)
                            if reasoning_chunk:
                                full_thinking += reasoning_chunk
                                yield await _sse_event("thinking", {"content": reasoning_chunk})
                            if token:
                                full_response += token
                                yield await _sse_event("token", {"content": token})

                    elif kind == "on_chain_start":
                        node_name = event.get("name", "")
                        if node_name in ("input_validator", "prompt_builder", "llm_caller", "response_finalizer"):
                            display_name = "image_generator" if (
                                node_name == "llm_caller" and body.image_generation_mode
                            ) else node_name
                            yield await _sse_event("node_start", {"node": display_name})

                    elif kind == "on_chain_end":
                        node_name = event.get("name", "")
                        output = event.get("data", {}).get("output", {})
                        if node_name in ("input_validator", "prompt_builder", "llm_caller", "response_finalizer"):
                            if isinstance(output, dict):
                                input_tokens = output.get("input_tokens", input_tokens)
                                output_tokens = output.get("output_tokens", output_tokens)

                                if output.get("finish_reason") == "image_generated":
                                    generated_images = output.get("generated_image_assets", [])

                                if output.get("finish_reason") == "error":
                                    error_detail = output.get("error_message", "LLM call failed")
                                    yield await _sse_event("error", {
                                        "code": "llm_call_failed",
                                        "message": error_detail,
                                        "message_id": str(ai_message_id),
                                        "recoverable": True,
                                    })
                                    stream_error = True
                                    break

                            display_name = "image_generator" if (
                                node_name == "llm_caller" and body.image_generation_mode
                            ) else node_name
                            yield await _sse_event("node_end", {"node": display_name})
            finally:
                if not producer.done():
                    producer.cancel()
                    try:
                        await producer
                    except BaseException:
                        pass

            # Calculate latency
            latency_ms = int((time.monotonic() - start_time) * 1000)

            # ── Persist AI message result ────────────────────────────────────
            from app.core.database import get_db_context
            async with get_db_context() as save_db:
                ai_msg = await save_db.get(Message, ai_message_id)
                if ai_msg:
                    if stream_error:
                        # Mark as failed, store error details in content
                        ai_msg.execution_status = "failed"
                        ai_msg.content = [{
                            "type": "error",
                            "text": error_detail or "The model encountered an error generating a response.",
                        }]
                        ai_msg.latency_ms = latency_ms
                    elif generated_images:
                        img_count = len(generated_images)
                        intro = f"Generated {img_count} image{'s' if img_count > 1 else ''} based on your prompt."
                        ai_msg.content = [{"type": "text", "text": intro}]
                        for img in generated_images:
                            ai_msg.content.append({
                                "type": "image_url",
                                "image_url": {"url": img["url"]},
                                "asset_id": img["asset_id"],
                            })
                        ai_msg.execution_status = "completed"
                        ai_msg.input_tokens = input_tokens or None
                        ai_msg.output_tokens = output_tokens or None
                        ai_msg.latency_ms = latency_ms
                    else:
                        ai_content: list[dict] = []
                        if full_thinking:
                            ai_content.append({"type": "thinking", "text": full_thinking})
                        ai_content.append({"type": "text", "text": full_response})
                        ai_msg.content = ai_content
                        ai_msg.execution_status = "completed"
                        ai_msg.input_tokens = input_tokens or None
                        ai_msg.output_tokens = output_tokens or None
                        ai_msg.latency_ms = latency_ms

                # Auto-generate conversation title on first exchange (only once)
                generated_title: str | None = None
                if not stream_error and full_response:
                    conv = await save_db.get(Conversation, conversation.id)
                    if conv and conv.title == "New Chat" and not conv.title_generated:
                        from app.services.title_generator import generate_title
                        generated_title = await generate_title(
                            user_message=user_message.text_content or body.message,
                            ai_response=full_response,
                            model_id=graph_input["model_id"],
                            user_id=str(user.id),
                        )
                        conv.title = generated_title
                        conv.title_generated = True

            if stream_error:
                # Error event already sent above; just notify done
                yield await _sse_event("done", {"finish_reason": "error"})
                return

            # Send completion metadata
            meta_payload: dict = {
                "message_id": str(ai_message_id),
                "input_tokens": input_tokens,
                "output_tokens": output_tokens,
                "latency_ms": latency_ms,
                "model_id": graph_input["model_id"],
            }
            if generated_images:
                meta_payload["generated_images"] = generated_images
            if full_thinking:
                meta_payload["thinking"] = full_thinking

            yield await _sse_event("message_meta", meta_payload)
            if generated_title:
                yield await _sse_event("title_update", {
                    "conversation_id": str(conversation.id),
                    "title": generated_title,
                })
            yield await _sse_event("done", {"finish_reason": "stop"})

        except Exception as e:
            logger.error("stream_error", error=str(e), conversation_id=str(conversation.id))
            # Update AI message to failed state
            try:
                from app.core.database import get_db_context
                async with get_db_context() as err_db:
                    ai_msg = await err_db.get(Message, ai_message_id)
                    if ai_msg and ai_msg.execution_status == "streaming":
                        ai_msg.execution_status = "failed"
                        ai_msg.content = [{"type": "error", "text": str(e)}]
            except Exception:
                pass
            yield await _sse_event("error", {
                "code": "stream_error",
                "message": str(e),
                "message_id": str(ai_message_id),
                "recoverable": True,
            })
            yield await _sse_event("done", {"finish_reason": "error"})
        finally:
            release_conversation_lock(conv_id_str)

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

    return [_message_to_response(msg, msg.sender.username if msg.sender else None) for msg in messages]


@router.post("/messages/{message_id}/edit")
async def edit_message(
    message_id: uuid.UUID,
    body: MessageEditRequest,
    user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Edit an existing user message, fork the conversation branch, and re-stream.

    This implements non-destructive branching:
    1. Deactivate all messages that came AFTER the edited message in the active branch
    2. Create a new user message with the updated content (same parent_message_id)
    3. Open an SSE stream for the new branch

    Returns a streaming SSE response (same format as /chat/stream).
    """
    from sqlalchemy.orm import joinedload

    # Load the target message
    result = await db.execute(
        select(Message)
        .join(Conversation, Message.conversation_id == Conversation.id)
        .where(
            Message.id == message_id,
            Message.role == "user",
            Conversation.user_id == user.id,
        )
    )
    original_msg = result.scalar_one_or_none()
    if not original_msg:
        raise HTTPException(status_code=404, detail="Message not found")

    conv_id = original_msg.conversation_id

    # Load conversation
    conv_result = await db.execute(
        select(Conversation).where(Conversation.id == conv_id)
    )
    conversation = conv_result.scalar_one_or_none()
    if not conversation:
        raise HTTPException(status_code=404, detail="Conversation not found")

    # Deactivate all messages after the original message's created_at in active branch
    all_msgs_result = await db.execute(
        select(Message)
        .where(
            Message.conversation_id == conv_id,
            Message.is_active_branch == True,
            Message.created_at >= original_msg.created_at,
        )
    )
    msgs_to_deactivate = all_msgs_result.scalars().all()
    for msg in msgs_to_deactivate:
        msg.is_active_branch = False

    await db.flush()

    # Create new user message with updated content (fork point)
    new_content_blocks = [{"type": "text", "text": body.message}]
    new_user_msg = Message(
        id=uuid.uuid4(),
        conversation_id=conv_id,
        parent_message_id=original_msg.parent_message_id,  # Same parent = sibling branch
        role="user",
        content=new_content_blocks,
        sender_id=user.id,
        hidden_from_owner=original_msg.hidden_from_owner,
        execution_status="completed",
        version=original_msg.version + 1,
    )
    db.add(new_user_msg)
    await db.flush()

    # Pre-create the AI placeholder
    ai_message_id = uuid.uuid4()
    model_id = body.model_id or conversation.model_id
    ai_placeholder = Message(
        id=ai_message_id,
        conversation_id=conv_id,
        parent_message_id=new_user_msg.id,
        role="assistant",
        content=[{"type": "text", "text": ""}],
        model_id=model_id,
        sender_id=user.id,
        hidden_from_owner=original_msg.hidden_from_owner,
        execution_status="streaming",
        version=original_msg.version + 1,
    )
    db.add(ai_placeholder)
    await db.flush()
    await db.commit()

    # Now delegate to the stream endpoint logic by constructing a ChatStreamRequest
    # and calling it with the known leaf_user_message_id
    settings = get_settings()
    stream_request = ChatStreamRequest(
        conversation_id=conv_id,
        message=body.message,
        model_id=body.model_id or conversation.model_id,
        temperature=body.temperature,
        max_tokens=body.max_tokens,
        leaf_user_message_id=new_user_msg.id,
        media_asset_ids=body.media_asset_ids,
    )

    # Acquire lock
    conv_id_str = str(conv_id)
    if not await acquire_conversation_lock(conv_id_str):
        raise HTTPException(
            status_code=status.HTTP_423_LOCKED,
            detail="A response is already being generated for this conversation.",
        )

    # Re-use stream logic inline
    async def edit_event_generator():
        from app.core.database import get_db_context
        graph = get_compiled_graph()
        full_response = ""
        full_thinking = ""
        input_tokens = 0
        output_tokens = 0
        start_time = time.monotonic()

        try:
            yield await _sse_event("message_start", {
                "conversation_id": str(conv_id),
                "message_id": str(ai_message_id),
                "user_message_id": str(new_user_msg.id),
                "is_edit": True,
                "original_message_id": str(message_id),
            })

            # Build history (active branch only, up to but not including new msgs)
            async with get_db_context() as history_db:
                hist_result = await history_db.execute(
                    select(Message)
                    .where(
                        Message.conversation_id == conv_id,
                        Message.is_active_branch == True,
                        Message.hidden_from_owner == False,
                    )
                    .order_by(Message.created_at)
                )
                history = hist_result.scalars().all()

            lc_messages = []
            for msg in history:
                if msg.id in (ai_message_id,):
                    continue
                if msg.role == "user":
                    lc_messages.append(HumanMessage(content=msg.text_content))
                elif msg.role == "assistant" and msg.execution_status not in ("failed",) and msg.text_content:
                    from langchain_core.messages import AIMessage
                    lc_messages.append(AIMessage(content=msg.text_content))

            graph_input = {
                "messages": lc_messages,
                "thread_id": str(conv_id),
                "user_id": str(user.id),
                "model_id": model_id or settings.DEFAULT_MODEL_ID,
                "temperature": body.temperature if body.temperature is not None else settings.DEFAULT_TEMPERATURE,
                "max_tokens": body.max_tokens or settings.DEFAULT_MAX_TOKENS,
                "system_prompt": conversation.system_prompt or settings.DEFAULT_SYSTEM_PROMPT,
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
                "error_raised": False,
                "image_generation_mode": False,
                "image_n": 1,
                "generated_image_assets": [],
            }

            stream_error = False
            error_detail = ""
            event_queue: asyncio.Queue = asyncio.Queue()
            _SENTINEL = object()

            async def _produce():
                try:
                    async for ev in graph.astream_events(graph_input, version="v2"):
                        await event_queue.put(ev)
                except Exception as exc:
                    exc_name = type(exc).__name__
                    if "ValidationError" in exc_name or "validation" in str(exc).lower():
                        logger.warning(
                            "edit_stream_chunk_validation_error",
                            error=str(exc)[:300],
                            note="Skipping malformed chunk from provider",
                        )
                    else:
                        await event_queue.put(exc)
                finally:
                    await event_queue.put(_SENTINEL)

            producer = asyncio.create_task(_produce())

            try:
                while True:
                    try:
                        item = await asyncio.wait_for(event_queue.get(), timeout=15.0)
                    except asyncio.TimeoutError:
                        yield ": heartbeat\n\n"
                        continue

                    if item is _SENTINEL:
                        break
                    if isinstance(item, Exception):
                        raise item

                    event = item
                    kind = event.get("event", "")

                    if kind == "on_chat_model_stream":
                        chunk = event.get("data", {}).get("chunk")
                        if chunk and isinstance(chunk, AIMessageChunk):
                            token, reasoning_chunk = _extract_chunk_content(chunk)
                            if reasoning_chunk:
                                full_thinking += reasoning_chunk
                                yield await _sse_event("thinking", {"content": reasoning_chunk})
                            if token:
                                full_response += token
                                yield await _sse_event("token", {"content": token})

                    elif kind == "on_chain_start":
                        node_name = event.get("name", "")
                        if node_name in ("input_validator", "prompt_builder", "llm_caller", "response_finalizer"):
                            yield await _sse_event("node_start", {"node": node_name})

                    elif kind == "on_chain_end":
                        node_name = event.get("name", "")
                        output = event.get("data", {}).get("output", {})
                        if node_name in ("input_validator", "prompt_builder", "llm_caller", "response_finalizer"):
                            if isinstance(output, dict):
                                input_tokens = output.get("input_tokens", input_tokens)
                                output_tokens = output.get("output_tokens", output_tokens)
                                if output.get("finish_reason") == "error":
                                    error_detail = output.get("error_message", "LLM call failed")
                                    yield await _sse_event("error", {
                                        "code": "llm_call_failed",
                                        "message": error_detail,
                                        "message_id": str(ai_message_id),
                                        "recoverable": True,
                                    })
                                    stream_error = True
                                    break
                            yield await _sse_event("node_end", {"node": node_name})
            finally:
                if not producer.done():
                    producer.cancel()
                    try:
                        await producer
                    except BaseException:
                        pass

            latency_ms = int((time.monotonic() - start_time) * 1000)

            async with get_db_context() as save_db:
                ai_msg = await save_db.get(Message, ai_message_id)
                if ai_msg:
                    if stream_error:
                        ai_msg.execution_status = "failed"
                        ai_msg.content = [{"type": "error", "text": error_detail}]
                    else:
                        ai_content = []
                        if full_thinking:
                            ai_content.append({"type": "thinking", "text": full_thinking})
                        ai_content.append({"type": "text", "text": full_response})
                        ai_msg.content = ai_content
                        ai_msg.execution_status = "completed"
                        ai_msg.input_tokens = input_tokens or None
                        ai_msg.output_tokens = output_tokens or None
                        ai_msg.latency_ms = latency_ms

            if not stream_error:
                yield await _sse_event("message_meta", {
                    "message_id": str(ai_message_id),
                    "input_tokens": input_tokens,
                    "output_tokens": output_tokens,
                    "latency_ms": latency_ms,
                    "model_id": model_id or settings.DEFAULT_MODEL_ID,
                })
            yield await _sse_event("done", {"finish_reason": "error" if stream_error else "stop"})

        except Exception as e:
            logger.error("edit_stream_error", error=str(e))
            try:
                async with get_db_context() as err_db:
                    ai_msg = await err_db.get(Message, ai_message_id)
                    if ai_msg and ai_msg.execution_status == "streaming":
                        ai_msg.execution_status = "failed"
                        ai_msg.content = [{"type": "error", "text": str(e)}]
            except Exception:
                pass
            yield await _sse_event("error", {
                "code": "stream_error",
                "message": str(e),
                "message_id": str(ai_message_id),
                "recoverable": True,
            })
            yield await _sse_event("done", {"finish_reason": "error"})
        finally:
            release_conversation_lock(conv_id_str)

    return StreamingResponse(
        edit_event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


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

    new_visibility = not msg.hidden_from_owner
    msg.hidden_from_owner = new_visibility

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

    return _message_to_response(msg, msg.sender.username if msg.sender else None)


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
    await db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
