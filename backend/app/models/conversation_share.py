"""ConversationShare model — tracks private conversation sharing between users."""

from __future__ import annotations

import uuid
from datetime import UTC, datetime

from sqlalchemy import DateTime, ForeignKey, func, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class ConversationShare(Base):
    __tablename__ = "conversation_shares"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4,
        server_default=func.uuid_generate_v4(),
    )
    conversation_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("conversations.id", ondelete="CASCADE"), nullable=False, index=True,
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=lambda: datetime.now(UTC),
        server_default=func.now(),
    )

    # Relationships
    conversation = relationship("Conversation", backref="shares")
    user = relationship("User", backref="shared_conversations")

    __table_args__ = (
        UniqueConstraint("conversation_id", "user_id", name="uq_conversation_user_share"),
    )

    def __repr__(self) -> str:
        return f"<ConversationShare conv={self.conversation_id} user={self.user_id}>"
