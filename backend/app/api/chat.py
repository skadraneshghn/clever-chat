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
        result = await db.execute(
            select(Conversation).where(
                Conversation.id == body.conversation_id,
                Conversation.user_id == user.id,
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

    # Save user message
    content_blocks = [{"type": "text", "text": body.message}]

    user_message = Message(
        conversation_id=conversation.id,
        parent_message_id=body.parent_message_id,
        role="user",
        content=content_blocks,
    )
    db.add(user_message)
    await db.flush()

    # Load conversation history
    result = await db.execute(
        select(Message)
        .where(
            Message.conversation_id == conversation.id,
            Message.is_active_branch == True,
        )
        .order_by(Message.created_at)
    )
    history_messages = result.scalars().all()

    # Convert to LangChain messages
    lc_messages = []
    for msg in history_messages:
        text = msg.text_content
        if msg.role == "user":
            lc_messages.append(HumanMessage(content=text))
        elif msg.role == "assistant":
            from langchain_core.messages import AIMessage
            lc_messages.append(AIMessage(content=text))

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
            async for event in graph.astream_events(graph_input, version="v2"):
                kind = event.get("event", "")

                # Stream tokens from LLM
                if kind == "on_chat_model_stream":
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
                        yield await _sse_event("node_start", {
                            "node": node_name,
                        })

                elif kind == "on_chain_end":
                    node_name = event.get("name", "")
                    output = event.get("data", {}).get("output", {})
                    if node_name in ("input_validator", "prompt_builder", "llm_caller", "response_finalizer"):
                        if isinstance(output, dict):
                            input_tokens = output.get("input_tokens", input_tokens)
                            output_tokens = output.get("output_tokens", output_tokens)
                            if node_name == "llm_caller" and output.get("finish_reason") == "error":
                                yield await _sse_event("error", {
                                    "code": "llm_call_failed",
                                    "message": output.get("error_message", "LLM call failed"),
                                    "recoverable": False,
                                })
                                return
                        yield await _sse_event("node_end", {
                            "node": node_name,
                        })

            # Calculate latency
            latency_ms = int((time.monotonic() - start_time) * 1000)

            # Persist AI message
            from app.core.database import get_db_context
            async with get_db_context() as save_db:
                ai_message = Message(
                    id=ai_message_id,
                    conversation_id=conversation.id,
                    parent_message_id=user_message.id,
                    role="assistant",
                    content=[{"type": "text", "text": full_response}],
                    model_id=graph_input["model_id"],
                    input_tokens=input_tokens or None,
                    output_tokens=output_tokens or None,
                    latency_ms=latency_ms,
                )
                save_db.add(ai_message)

                # Auto-generate title from first message
                if len(history_messages) <= 1 and full_response:
                    title = body.message[:80].strip()
                    if len(body.message) > 80:
                        title += "..."
                    conv = await save_db.get(Conversation, conversation.id)
                    if conv and conv.title == "New Chat":
                        conv.title = title

            # Send completion event
            yield await _sse_event("message_meta", {
                "message_id": str(ai_message_id),
                "input_tokens": input_tokens,
                "output_tokens": output_tokens,
                "latency_ms": latency_ms,
                "model_id": graph_input["model_id"],
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
    """Get all messages for a conversation (full tree for branching)."""
    # Verify ownership
    result = await db.execute(
        select(Conversation).where(
            Conversation.id == conversation_id,
            Conversation.user_id == user.id,
        )
    )
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Conversation not found")

    result = await db.execute(
        select(Message)
        .where(Message.conversation_id == conversation_id)
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
        )
        for msg in messages
    ]


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
