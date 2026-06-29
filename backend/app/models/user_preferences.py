"""User preferences model — customisation settings persisted per user."""

from __future__ import annotations

import uuid
from datetime import UTC, datetime

from sqlalchemy import Boolean, DateTime, Float, ForeignKey, Integer, String, Text, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class UserPreferences(Base):
    __tablename__ = "user_preferences"

    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"),
        primary_key=True,
    )
    theme: Mapped[str] = mapped_column(String(16), nullable=False, default="dark")
    sidebar_mode: Mapped[str] = mapped_column(String(16), nullable=False, default="expanded")
    default_model_id: Mapped[str] = mapped_column(String(64), nullable=False, default="gpt-4o")
    default_temperature: Mapped[float] = mapped_column(Float, nullable=False, default=0.7)
    default_max_tokens: Mapped[int] = mapped_column(Integer, nullable=False, default=4096)
    default_system_prompt: Mapped[str | None] = mapped_column(Text, nullable=True)
    code_theme: Mapped[str] = mapped_column(String(32), nullable=False, default="github-dark")
    font_size: Mapped[str] = mapped_column(String(8), nullable=False, default="md")
    send_on_enter: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    show_token_counts: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    context_strategy: Mapped[str] = mapped_column(
        String(32), nullable=False, default="auto"
    )  # all / last_n / auto
    enable_rag: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    message_width: Mapped[str] = mapped_column(String(8), nullable=False, default="md")
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=lambda: datetime.now(UTC),
        server_default=func.now(), onupdate=lambda: datetime.now(UTC),
    )

    # Relationships
    user = relationship("User", back_populates="preferences")

    def __repr__(self) -> str:
        return f"<UserPreferences user={self.user_id}>"
