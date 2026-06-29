"""Message model — supports branching via parent_message_id self-FK."""

from __future__ import annotations

import uuid
from datetime import UTC, datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class Message(Base):
    __tablename__ = "messages"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4,
        server_default=func.uuid_generate_v4(),
    )
    conversation_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("conversations.id", ondelete="CASCADE"),
        nullable=False, index=True,
    )
    parent_message_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("messages.id", ondelete="SET NULL"),
        nullable=True, index=True,
    )
    role: Mapped[str] = mapped_column(String(16), nullable=False)  # user / assistant / tool / system
    content: Mapped[dict | list] = mapped_column(
        JSONB, nullable=False, default=list,
    )  # Array of content blocks: [{type, text}, {type, image_url}, ...]
    model_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    input_tokens: Mapped[int | None] = mapped_column(Integer, nullable=True)
    output_tokens: Mapped[int | None] = mapped_column(Integer, nullable=True)
    latency_ms: Mapped[int | None] = mapped_column(Integer, nullable=True)
    is_active_branch: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    sender_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True,
    )
    hidden_from_owner: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=lambda: datetime.now(UTC),
        server_default=func.now(),
    )

    # Relationships
    conversation = relationship("Conversation", back_populates="messages")
    parent = relationship("Message", remote_side="Message.id", backref="children")
    sender = relationship("User", foreign_keys=[sender_id])

    def __repr__(self) -> str:
        return f"<Message {self.id} role={self.role}>"

    @property
    def text_content(self) -> str:
        """Extract plain text from the JSONB content blocks."""
        if isinstance(self.content, list):
            parts = []
            for block in self.content:
                if isinstance(block, dict) and block.get("type") == "text":
                    parts.append(block.get("text", ""))
            return " ".join(parts)
        return str(self.content)
