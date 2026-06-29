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
    PrivateShareRequest,
    ShareUserResponse,
)
from app.core.database import get_db
from app.core.security import get_current_user
from app.models.conversation import Conversation
from app.models.user import User
from app.models.message import Message

logger = structlog.get_logger()
router = APIRouter(prefix="/conversations", tags=["Conversations"])


def _conv_to_response(conv: Conversation, msg_count: int = 0, preview: str | None = None, current_user_id: uuid.UUID | None = None) -> ConversationResponse:
    is_shared = False
    if current_user_id and conv.user_id != current_user_id:
        is_shared = True
    owner_username = conv.user.username if conv.user else None
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
        user_id=conv.user_id,
        is_shared=is_shared,
        owner_username=owner_username,
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
    """List user's conversations with pagination, search, and archive filter (includes shared chats)."""
    from app.models.conversation_share import ConversationShare
    from sqlalchemy.orm import selectinload

    # Fetch conversations owned by user OR shared with user
    query = (
        select(Conversation)
        .options(selectinload(Conversation.user))
        .where(
            ((Conversation.user_id == user.id) | 
             Conversation.id.in_(
                 select(ConversationShare.conversation_id).where(ConversationShare.user_id == user.id)
             )),
            Conversation.is_archived == archived,
        )
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
        # Filter hidden messages from previews and counts for owner
        is_owner = conv.user_id == user.id
        if is_owner:
            msg_filter = (Message.hidden_from_owner == False)
        else:
            msg_filter = ((Message.hidden_from_owner == False) | (Message.sender_id == user.id))

        count_result = await db.execute(
            select(func.count()).select_from(Message).where(
                Message.conversation_id == conv.id,
                msg_filter
            )
        )
        msg_count = count_result.scalar() or 0

        # Get last message preview
        last_msg_result = await db.execute(
            select(Message)
            .where(
                Message.conversation_id == conv.id,
                Message.is_active_branch == True,
                msg_filter
            )
            .order_by(desc(Message.created_at))
            .limit(1)
        )
        last_msg = last_msg_result.scalar_one_or_none()
        preview = last_msg.text_content[:100] if last_msg else None

        items.append(_conv_to_response(conv, msg_count, preview, user.id))

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
    await db.refresh(conv, ["user"])
    return _conv_to_response(conv, current_user_id=user.id)


@router.get("/{conv_id}", response_model=ConversationResponse)
async def get_conversation(
    conv_id: uuid.UUID,
    user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get a specific conversation by ID (accessible by owner or shared users)."""
    from app.models.conversation_share import ConversationShare
    from sqlalchemy.orm import selectinload

    result = await db.execute(
        select(Conversation)
        .options(selectinload(Conversation.user))
        .where(
            (Conversation.id == conv_id) & 
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

    count_result = await db.execute(
        select(func.count()).select_from(Message).where(
            Message.conversation_id == conv.id,
            msg_filter
        )
    )
    return _conv_to_response(conv, count_result.scalar() or 0, current_user_id=user.id)


@router.patch("/{conv_id}", response_model=ConversationResponse)
async def update_conversation(
    conv_id: uuid.UUID,
    body: ConversationUpdate,
    user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Update conversation metadata (title, model, archive, pin) — Owner only."""
    from sqlalchemy.orm import selectinload

    result = await db.execute(
        select(Conversation)
        .options(selectinload(Conversation.user))
        .where(Conversation.id == conv_id, Conversation.user_id == user.id)
    )
    conv = result.scalar_one_or_none()
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found")

    update_data = body.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(conv, key, value)
    conv.updated_at = datetime.now(UTC)

    return _conv_to_response(conv, current_user_id=user.id)


@router.delete("/{conv_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_conversation(
    conv_id: uuid.UUID,
    user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Delete a conversation (destroys if owner, removes share entry if recipient)."""
    result = await db.execute(
        select(Conversation).where(Conversation.id == conv_id)
    )
    conv = result.scalar_one_or_none()
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found")

    if conv.user_id == user.id:
        # Owner deletes the entire conversation
        await db.delete(conv)
    else:
        # Shared user deletes their shared access record (leaves the chat)
        from app.models.conversation_share import ConversationShare
        share_result = await db.execute(
            select(ConversationShare).where(
                ConversationShare.conversation_id == conv_id,
                ConversationShare.user_id == user.id
            )
        )
        share = share_result.scalar_one_or_none()
        if not share:
            raise HTTPException(status_code=403, detail="Not authorized to delete this conversation")
        await db.delete(share)
    
    await db.commit()
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


@router.get("/shared/{share_token}/metadata")
async def get_shared_conversation_metadata(share_token: str, db: AsyncSession = Depends(get_db)):
    """Get metadata for a shared conversation."""
    result = await db.execute(
        select(Conversation).where(Conversation.share_token == share_token)
    )
    conv = result.scalar_one_or_none()
    if not conv:
        raise HTTPException(status_code=404, detail="Shared conversation not found")
    
    return {
        "id": str(conv.id),
        "title": conv.title,
        "model_id": conv.model_id,
        "created_at": conv.created_at,
    }


@router.get("/shared/{share_token}", response_model=list[MessageResponse])
async def get_shared_conversation(share_token: str, db: AsyncSession = Depends(get_db)):
    """Get a shared conversation (public, no auth required)."""
    result = await db.execute(
        select(Conversation).where(Conversation.share_token == share_token)
    )
    conv = result.scalar_one_or_none()
    if not conv:
        raise HTTPException(status_code=404, detail="Shared conversation not found")

    from sqlalchemy.orm import joinedload
    result = await db.execute(
        select(Message)
        .options(joinedload(Message.sender))
        .where(
            Message.conversation_id == conv.id,
            Message.is_active_branch == True,
            Message.hidden_from_owner == False  # Never show hidden messages in public link
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
    await db.refresh(conv, ["user"])
    return _conv_to_response(conv, current_user_id=user.id)


# ── Private Sharing Management ────────────────────────────────────────────────


@router.post("/{conv_id}/share/private", response_model=ShareUserResponse)
async def share_conversation_private(
    conv_id: uuid.UUID,
    body: PrivateShareRequest,
    user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Share a conversation privately with another user by username."""
    from app.models.conversation_share import ConversationShare

    # Verify caller is owner of the conversation
    result = await db.execute(
        select(Conversation).where(Conversation.id == conv_id, Conversation.user_id == user.id)
    )
    conv = result.scalar_one_or_none()
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found")

    # Find recipient user
    recipient_result = await db.execute(
        select(User).where(User.username == body.username.lower(), User.is_active == True)
    )
    recipient = recipient_result.scalar_one_or_none()
    if not recipient:
        raise HTTPException(status_code=404, detail="User not found")

    if recipient.id == user.id:
        raise HTTPException(status_code=400, detail="Cannot share a conversation with yourself")

    # Check if share already exists
    existing = await db.execute(
        select(ConversationShare).where(
            ConversationShare.conversation_id == conv_id,
            ConversationShare.user_id == recipient.id
        )
    )
    if existing.scalar_one_or_none():
        return ShareUserResponse(id=recipient.id, username=recipient.username, email=recipient.email)

    # Create private share record
    share = ConversationShare(conversation_id=conv_id, user_id=recipient.id)
    db.add(share)
    await db.commit()

    return ShareUserResponse(id=recipient.id, username=recipient.username, email=recipient.email)


@router.delete("/{conv_id}/share/private/{username}", status_code=status.HTTP_204_NO_CONTENT)
async def unshare_conversation_private(
    conv_id: uuid.UUID,
    username: str,
    user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Revoke a private conversation share for a user."""
    from app.models.conversation_share import ConversationShare

    # Verify caller is owner
    result = await db.execute(
        select(Conversation).where(Conversation.id == conv_id, Conversation.user_id == user.id)
    )
    conv = result.scalar_one_or_none()
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found")

    # Find recipient user
    recipient_result = await db.execute(
        select(User).where(User.username == username.lower())
    )
    recipient = recipient_result.scalar_one_or_none()
    if not recipient:
        raise HTTPException(status_code=404, detail="User not found")

    # Delete share record
    share_result = await db.execute(
        select(ConversationShare).where(
            ConversationShare.conversation_id == conv_id,
            ConversationShare.user_id == recipient.id
        )
    )
    share = share_result.scalar_one_or_none()
    if not share:
        raise HTTPException(status_code=404, detail="Share record not found")

    await db.delete(share)
    await db.commit()

    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/{conv_id}/shares", response_model=list[ShareUserResponse])
async def list_conversation_shares(
    conv_id: uuid.UUID,
    user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List all users this conversation is privately shared with."""
    from app.models.conversation_share import ConversationShare

    # Verify caller is owner
    result = await db.execute(
        select(Conversation).where(Conversation.id == conv_id, Conversation.user_id == user.id)
    )
    conv = result.scalar_one_or_none()
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found")

    # Query shared users
    shares_result = await db.execute(
        select(User)
        .join(ConversationShare, User.id == ConversationShare.user_id)
        .where(ConversationShare.conversation_id == conv_id)
    )
    shared_users = shares_result.scalars().all()

    return [
        ShareUserResponse(id=u.id, username=u.username, email=u.email)
        for u in shared_users
    ]

