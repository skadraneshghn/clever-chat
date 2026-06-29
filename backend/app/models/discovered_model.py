"""Discovered model — catalogues individual models returned by provider endpoints."""

from __future__ import annotations

import uuid
from datetime import UTC, datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, String, Text, func
from sqlalchemy.dialects.postgresql import JSON, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class DiscoveredModel(Base):
    __tablename__ = "discovered_models"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4,
    )
    connection_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("provider_connections.id", ondelete="CASCADE"),
        nullable=False, index=True,
    )
    model_id: Mapped[str] = mapped_column(
        String(256), nullable=False,
    )  # Upstream literal model identifier, e.g. "meta/llama-3.1-405b"
    display_name: Mapped[str] = mapped_column(
        String(256), nullable=False,
    )
    is_active: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=True,
    )
    capabilities: Mapped[dict | None] = mapped_column(
        JSON, nullable=True, default=dict,
    )  # {"vision": false, "reasoning": false, "function_calling": false}
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False,
        default=lambda: datetime.now(UTC), server_default=func.now(),
    )

    # Relationships
    connection = relationship("ProviderConnection", back_populates="models")

    def __repr__(self) -> str:
        return f"<DiscoveredModel {self.model_id}>"
