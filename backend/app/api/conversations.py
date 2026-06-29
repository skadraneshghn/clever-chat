"""Conversations API router — CRUD, share, export, import."""

from __future__ import annotations

import secrets
import uuid
from datetime import UTC, datetime

import structlog
from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import Response
from sqlalchemy import desc, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.schemas import (
    ConversationCreate,
    ConversationListResponse,
    ConversationResponse,
    ConversationUpdate,
    ImportConversation,
    MessageResponse,
)
from app.core.database import get_db
from app.core.security import get_current_user
from app.models.conversation import Conversation
from app.models.message import Message

logger = structlog.get_logger()
router = APIRouter(prefix="/conversations", tags=["Conversations"])


def _conv_to_response(conv: Conversation, msg_count: int = 0, preview: str | None = None) -> ConversationResponse:
    return ConversationResponse(
        id=conv.id,
        title=conv.title,
        model_id=conv.model_id,
        system_prompt=conv.system_prompt,
        is_archived=conv.is_archived,
        is_pinned=conv.is_pinned,
        share_token=conv.share_token,
        created_at=conv.created_at,
        updated_at=conv.updated_at,
        message_count=msg_count,
        last_message_preview=preview,
    )


@router.get("", response_model=ConversationListResponse)
async def list_conversations(
    page: int = Query(1, ge=1),
    page_size: int = Query(30, ge=1, le=100),
    search: str | None = None,
    archived: bool = False,
    user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List user's conversations with pagination, search, and archive filter."""
    query = select(Conversation).where(
        Conversation.user_id == user.id,
        Conversation.is_archived == archived,
    )

    if search:
        query = query.where(Conversation.title.ilike(f"%{search}%"))

    # Total count
    count_q = select(func.count()).select_from(query.subquery())
    total = (await db.execute(count_q)).scalar() or 0

    # Fetch page — pinned first, then by updated_at desc
    query = (
        query
        .order_by(desc(Conversation.is_pinned), desc(Conversation.updated_at))
        .offset((page - 1) * page_size)
        .limit(page_size)
    )
    result = await db.execute(query)
    conversations = result.scalars().all()

    # Get message counts and previews
    items = []
    for conv in conversations:
        count_result = await db.execute(
            select(func.count()).select_from(Message).where(Message.conversation_id == conv.id)
        )
        msg_count = count_result.scalar() or 0

        # Get last message preview
        last_msg_result = await db.execute(
            select(Message)
            .where(Message.conversation_id == conv.id, Message.is_active_branch == True)
            .order_by(desc(Message.created_at))
            .limit(1)
        )
        last_msg = last_msg_result.scalar_one_or_none()
        preview = last_msg.text_content[:100] if last_msg else None

        items.append(_conv_to_response(conv, msg_count, preview))

    return ConversationListResponse(
        conversations=items, total=total, page=page, page_size=page_size
    )


@router.post("", response_model=ConversationResponse, status_code=status.HTTP_201_CREATED)
async def create_conversation(
    body: ConversationCreate,
    user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Create a new conversation."""
    conv = Conversation(
        user_id=user.id,
        title=body.title,
        model_id=body.model_id,
        system_prompt=body.system_prompt,
    )
    db.add(conv)
    await db.flush()
    return _conv_to_response(conv)


@router.get("/{conv_id}", response_model=ConversationResponse)
async def get_conversation(
    conv_id: uuid.UUID,
    user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get a specific conversation by ID."""
    result = await db.execute(
        select(Conversation).where(Conversation.id == conv_id, Conversation.user_id == user.id)
    )
    conv = result.scalar_one_or_none()
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found")

    count_result = await db.execute(
        select(func.count()).select_from(Message).where(Message.conversation_id == conv.id)
    )
    return _conv_to_response(conv, count_result.scalar() or 0)


@router.patch("/{conv_id}", response_model=ConversationResponse)
async def update_conversation(
    conv_id: uuid.UUID,
    body: ConversationUpdate,
    user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Update conversation metadata (title, model, archive, pin)."""
    result = await db.execute(
        select(Conversation).where(Conversation.id == conv_id, Conversation.user_id == user.id)
    )
    conv = result.scalar_one_or_none()
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found")

    update_data = body.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(conv, key, value)
    conv.updated_at = datetime.now(UTC)

    return _conv_to_response(conv)


@router.delete("/{conv_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_conversation(
    conv_id: uuid.UUID,
    user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Delete a conversation and all its messages."""
    result = await db.execute(
        select(Conversation).where(Conversation.id == conv_id, Conversation.user_id == user.id)
    )
    conv = result.scalar_one_or_none()
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found")

    await db.delete(conv)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


# ── Sharing ──────────────────────────────────────────────────────────────────


@router.post("/{conv_id}/share")
async def share_conversation(
    conv_id: uuid.UUID,
    user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Generate a share link for a conversation."""
    result = await db.execute(
        select(Conversation).where(Conversation.id == conv_id, Conversation.user_id == user.id)
    )
    conv = result.scalar_one_or_none()
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found")

    if not conv.share_token:
        conv.share_token = secrets.token_urlsafe(32)

    return {"share_token": conv.share_token}


@router.delete("/{conv_id}/share", status_code=status.HTTP_204_NO_CONTENT)
async def unshare_conversation(
    conv_id: uuid.UUID,
    user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Revoke a share link."""
    result = await db.execute(
        select(Conversation).where(Conversation.id == conv_id, Conversation.user_id == user.id)
    )
    conv = result.scalar_one_or_none()
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found")

    conv.share_token = None
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/shared/{share_token}", response_model=list[MessageResponse])
async def get_shared_conversation(share_token: str, db: AsyncSession = Depends(get_db)):
    """Get a shared conversation (public, no auth required)."""
    result = await db.execute(
        select(Conversation).where(Conversation.share_token == share_token)
    )
    conv = result.scalar_one_or_none()
    if not conv:
        raise HTTPException(status_code=404, detail="Shared conversation not found")

    result = await db.execute(
        select(Message)
        .where(Message.conversation_id == conv.id, Message.is_active_branch == True)
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


# ── Export / Import ──────────────────────────────────────────────────────────


@router.get("/{conv_id}/export")
async def export_conversation(
    conv_id: uuid.UUID,
    user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Export a conversation as a JSON object."""
    result = await db.execute(
        select(Conversation).where(Conversation.id == conv_id, Conversation.user_id == user.id)
    )
    conv = result.scalar_one_or_none()
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found")

    result = await db.execute(
        select(Message).where(Message.conversation_id == conv.id).order_by(Message.created_at)
    )
    messages = result.scalars().all()

    return {
        "schema_version": "1.0",
        "exported_at": datetime.now(UTC).isoformat(),
        "conversation": {
            "id": str(conv.id),
            "title": conv.title,
            "model_id": conv.model_id,
            "system_prompt": conv.system_prompt,
            "created_at": conv.created_at.isoformat(),
            "messages": [
                {
                    "id": str(msg.id),
                    "parent_message_id": str(msg.parent_message_id) if msg.parent_message_id else None,
                    "role": msg.role,
                    "content": msg.content,
                    "created_at": msg.created_at.isoformat(),
                    "is_active_branch": msg.is_active_branch,
                }
                for msg in messages
            ],
        },
    }


@router.post("/import", response_model=ConversationResponse, status_code=status.HTTP_201_CREATED)
async def import_conversation(
    body: ImportConversation,
    user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Import a conversation from exported JSON."""
    conv_data = body.conversation

    # Create new conversation
    conv = Conversation(
        user_id=user.id,
        title=conv_data.get("title", "Imported Chat"),
        model_id=conv_data.get("model_id", "gpt-4o"),
        system_prompt=conv_data.get("system_prompt"),
    )
    db.add(conv)
    await db.flush()

    # Map old IDs to new IDs
    id_map: dict[str, uuid.UUID] = {}

    for msg_data in conv_data.get("messages", []):
        old_id = msg_data.get("id", str(uuid.uuid4()))
        new_id = uuid.uuid4()
        id_map[old_id] = new_id

    # Insert messages in order (parents before children)
    for msg_data in conv_data.get("messages", []):
        old_id = msg_data.get("id", str(uuid.uuid4()))
        old_parent = msg_data.get("parent_message_id")

        msg = Message(
            id=id_map[old_id],
            conversation_id=conv.id,
            parent_message_id=id_map.get(old_parent) if old_parent else None,
            role=msg_data.get("role", "user"),
            content=msg_data.get("content", []),
            is_active_branch=msg_data.get("is_active_branch", True),
        )
        db.add(msg)

    await db.flush()
    return _conv_to_response(conv)
