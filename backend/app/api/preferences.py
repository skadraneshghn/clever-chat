"""User preferences API router."""

from __future__ import annotations

import structlog
from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.schemas import PreferencesResponse, PreferencesUpdate
from app.core.database import get_db
from app.core.security import get_current_user
from app.models.user_preferences import UserPreferences

logger = structlog.get_logger()
router = APIRouter(prefix="/preferences", tags=["Preferences"])


@router.get("", response_model=PreferencesResponse)
async def get_preferences(
    user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get current user's preferences."""
    result = await db.execute(
        select(UserPreferences).where(UserPreferences.user_id == user.id)
    )
    prefs = result.scalar_one_or_none()

    if not prefs:
        # Create defaults if missing
        prefs = UserPreferences(user_id=user.id)
        db.add(prefs)
        await db.flush()

    return prefs


@router.patch("", response_model=PreferencesResponse)
async def update_preferences(
    body: PreferencesUpdate,
    user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Update user preferences (partial update)."""
    result = await db.execute(
        select(UserPreferences).where(UserPreferences.user_id == user.id)
    )
    prefs = result.scalar_one_or_none()

    if not prefs:
        prefs = UserPreferences(user_id=user.id)
        db.add(prefs)
        await db.flush()

    update_data = body.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(prefs, key, value)

    logger.info("preferences_updated", user_id=str(user.id), fields=list(update_data.keys()))
    return prefs
