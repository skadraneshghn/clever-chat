"""Provider connections API router — CRUD, sync, model listing."""

from __future__ import annotations

import uuid
from datetime import UTC, datetime

import structlog
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import Response
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.api.schemas import (
    AvailableModelResponse,
    DiscoveredModelResponse,
    ProviderConnectionCreate,
    ProviderConnectionResponse,
    ProviderConnectionUpdate,
    ProviderSyncResponse,
)
from app.core.database import get_db
from app.core.security import get_current_user
from app.models.discovered_model import DiscoveredModel
from app.models.provider_connection import ProviderConnection
from app.services.discovery import discover_models, is_chat_model

logger = structlog.get_logger()
router = APIRouter(prefix="/providers", tags=["Providers"])


# ── Helpers ──────────────────────────────────────────────────────────────────

def _conn_to_response(conn: ProviderConnection) -> ProviderConnectionResponse:
    """Map a ProviderConnection ORM object to a response schema."""
    model_responses = [
        DiscoveredModelResponse(
            id=m.id,
            connection_id=m.connection_id,
            model_id=m.model_id,
            display_name=m.display_name,
            is_active=m.is_active,
            capabilities=m.capabilities,
            created_at=m.created_at,
        )
        for m in (conn.models or [])
    ]
    return ProviderConnectionResponse(
        id=conn.id,
        name=conn.name,
        provider_type=conn.provider_type,
        base_url=conn.base_url,
        is_active=conn.is_active,
        created_at=conn.created_at,
        updated_at=conn.updated_at,
        model_count=len(model_responses),
        models=model_responses,
    )


async def _sync_models(
    conn: ProviderConnection,
    db: AsyncSession,
) -> int:
    """Discover models from the provider and persist to DB.
    
    Returns the count of newly discovered models.
    """
    api_key = conn.api_key_encrypted  # Stored as plain text for now
    try:
        discovered = await discover_models(conn.provider_type, conn.base_url, api_key)
    except Exception as exc:
        logger.error(
            "model_discovery_failed",
            connection_id=str(conn.id),
            error=str(exc),
        )
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Failed to discover models from {conn.base_url}: {exc}",
        )

    # Get existing model IDs for this connection
    existing_result = await db.execute(
        select(DiscoveredModel.model_id).where(
            DiscoveredModel.connection_id == conn.id
        )
    )
    existing_ids = set(existing_result.scalars().all())

    new_count = 0
    for model_data in discovered:
        if model_data["model_id"] not in existing_ids:
            dm = DiscoveredModel(
                connection_id=conn.id,
                model_id=model_data["model_id"],
                display_name=model_data["display_name"],
                capabilities=model_data["capabilities"],
            )
            db.add(dm)
            new_count += 1

    await db.flush()
    logger.info(
        "models_synced",
        connection_id=str(conn.id),
        total_discovered=len(discovered),
        new_models=new_count,
    )
    return len(discovered)


# ── Flat Model List (for chat UI dropdown) ───────────────────────────────────
# NOTE: This must be defined BEFORE /{provider_id} routes to avoid UUID matching.


@router.get("/models/available", response_model=list[AvailableModelResponse])
async def list_available_models(
    user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List all active models across all active provider connections.
    
    This is the endpoint the model selector dropdown reads from.
    """
    result = await db.execute(
        select(DiscoveredModel, ProviderConnection)
        .join(ProviderConnection, DiscoveredModel.connection_id == ProviderConnection.id)
        .where(
            ProviderConnection.user_id == user.id,
            ProviderConnection.is_active == True,
            DiscoveredModel.is_active == True,
        )
        .order_by(ProviderConnection.name, DiscoveredModel.display_name)
    )
    rows = result.all()

    return [
        AvailableModelResponse(
            id=model.id,
            model_id=model.model_id,
            display_name=model.display_name,
            provider_type=conn.provider_type,
            provider_name=conn.name,
            connection_id=conn.id,
            capabilities=model.capabilities,
            is_active=model.is_active,
        )
        for model, conn in rows
        if is_chat_model(model.model_id)
    ]


# ── CRUD Endpoints ───────────────────────────────────────────────────────────


@router.get("", response_model=list[ProviderConnectionResponse])
async def list_providers(
    user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List all provider connections for the current user."""
    result = await db.execute(
        select(ProviderConnection)
        .where(ProviderConnection.user_id == user.id)
        .options(selectinload(ProviderConnection.models))
        .order_by(ProviderConnection.created_at)
    )
    connections = result.scalars().all()
    return [_conn_to_response(c) for c in connections]


@router.post("", response_model=ProviderSyncResponse, status_code=status.HTTP_201_CREATED)
async def create_provider(
    body: ProviderConnectionCreate,
    user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Create a new provider connection and auto-discover available models."""
    conn = ProviderConnection(
        user_id=user.id,
        name=body.name,
        provider_type=body.provider_type,
        base_url=body.base_url.rstrip("/"),
        api_key_encrypted=body.api_key,  # TODO: encrypt with AES-GCM
    )
    db.add(conn)
    await db.flush()

    # Auto-discover models
    discovered_count = await _sync_models(conn, db)

    # Reload with models relationship
    await db.refresh(conn, attribute_names=["models"])

    return ProviderSyncResponse(
        connection=_conn_to_response(conn),
        discovered_count=discovered_count,
    )


@router.get("/{provider_id}", response_model=ProviderConnectionResponse)
async def get_provider(
    provider_id: uuid.UUID,
    user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get a specific provider connection with its discovered models."""
    result = await db.execute(
        select(ProviderConnection)
        .where(
            ProviderConnection.id == provider_id,
            ProviderConnection.user_id == user.id,
        )
        .options(selectinload(ProviderConnection.models))
    )
    conn = result.scalar_one_or_none()
    if not conn:
        raise HTTPException(status_code=404, detail="Provider not found")
    return _conn_to_response(conn)


@router.patch("/{provider_id}", response_model=ProviderConnectionResponse)
async def update_provider(
    provider_id: uuid.UUID,
    body: ProviderConnectionUpdate,
    user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Update a provider connection. If base_url or api_key changed, re-sync models."""
    result = await db.execute(
        select(ProviderConnection)
        .where(
            ProviderConnection.id == provider_id,
            ProviderConnection.user_id == user.id,
        )
        .options(selectinload(ProviderConnection.models))
    )
    conn = result.scalar_one_or_none()
    if not conn:
        raise HTTPException(status_code=404, detail="Provider not found")

    update_data = body.model_dump(exclude_unset=True)
    needs_resync = False

    for key, value in update_data.items():
        if key == "api_key":
            conn.api_key_encrypted = value
            needs_resync = True
        elif key == "base_url":
            conn.base_url = value.rstrip("/") if value else value
            needs_resync = True
        else:
            setattr(conn, key, value)

    conn.updated_at = datetime.now(UTC)

    if needs_resync:
        # Clear existing models and re-discover
        await db.execute(
            select(DiscoveredModel).where(
                DiscoveredModel.connection_id == conn.id
            )
        )
        for model in list(conn.models):
            await db.delete(model)
        await db.flush()
        await _sync_models(conn, db)
        await db.refresh(conn, attribute_names=["models"])

    return _conn_to_response(conn)


@router.delete("/{provider_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_provider(
    provider_id: uuid.UUID,
    user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Delete a provider connection and all its discovered models (cascade)."""
    result = await db.execute(
        select(ProviderConnection).where(
            ProviderConnection.id == provider_id,
            ProviderConnection.user_id == user.id,
        )
    )
    conn = result.scalar_one_or_none()
    if not conn:
        raise HTTPException(status_code=404, detail="Provider not found")

    await db.delete(conn)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/{provider_id}/sync", response_model=ProviderSyncResponse)
async def sync_provider(
    provider_id: uuid.UUID,
    user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Re-discover models from an existing provider connection."""
    result = await db.execute(
        select(ProviderConnection)
        .where(
            ProviderConnection.id == provider_id,
            ProviderConnection.user_id == user.id,
        )
        .options(selectinload(ProviderConnection.models))
    )
    conn = result.scalar_one_or_none()
    if not conn:
        raise HTTPException(status_code=404, detail="Provider not found")

    discovered_count = await _sync_models(conn, db)
    await db.refresh(conn, attribute_names=["models"])

    return ProviderSyncResponse(
        connection=_conn_to_response(conn),
        discovered_count=discovered_count,
    )



