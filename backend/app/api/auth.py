"""Authentication API router — register, login, refresh, logout, me."""

from __future__ import annotations

import hashlib
import uuid
from datetime import UTC, datetime, timedelta

import structlog
from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.schemas import LoginRequest, RegisterRequest, TokenResponse, UserResponse
from app.core.config import get_settings
from app.core.database import get_db
from app.core.security import (
    create_access_token,
    create_refresh_token,
    decode_token,
    get_current_user,
    hash_password,
    verify_password,
)
from app.models.session import Session
from app.models.user import User
from app.models.user_preferences import UserPreferences

logger = structlog.get_logger()
router = APIRouter(prefix="/auth", tags=["Authentication"])


def _hash_refresh_token(token: str) -> str:
    """SHA-256 hash of a refresh token for secure storage."""
    return hashlib.sha256(token.encode()).hexdigest()


@router.post("/register", response_model=TokenResponse, status_code=status.HTTP_201_CREATED)
async def register(body: RegisterRequest, request: Request, db: AsyncSession = Depends(get_db)):
    """Register a new user. First user becomes admin."""
    settings = get_settings()

    # Check existing email
    existing = await db.execute(select(User).where(User.email == body.email))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="Email already registered")

    # Check existing username
    existing = await db.execute(select(User).where(User.username == body.username))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="Username already taken")

    # Determine role: first user is admin
    user_count = await db.execute(select(func.count()).select_from(User))
    is_first_user = user_count.scalar() == 0
    role = "admin" if is_first_user else "user"

    # Create user
    user = User(
        email=body.email,
        username=body.username,
        password_hash=hash_password(body.password),
        role=role,
        is_active=True,
    )
    db.add(user)
    await db.flush()

    # Create default preferences
    prefs = UserPreferences(user_id=user.id)
    db.add(prefs)

    # Create session + tokens
    access_token = create_access_token({"sub": str(user.id), "email": user.email, "role": role})
    refresh_token = create_refresh_token({"sub": str(user.id)})

    session = Session(
        user_id=user.id,
        refresh_token_hash=_hash_refresh_token(refresh_token),
        user_agent=request.headers.get("user-agent"),
        ip_address=request.client.host if request.client else None,
        expires_at=datetime.now(UTC) + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS),
    )
    db.add(session)

    logger.info("user_registered", user_id=str(user.id), role=role, is_first=is_first_user)

    return TokenResponse(
        access_token=access_token,
        expires_in=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
    )


@router.post("/login", response_model=TokenResponse)
async def login(body: LoginRequest, request: Request, db: AsyncSession = Depends(get_db)):
    """Authenticate with email and password."""
    settings = get_settings()

    result = await db.execute(select(User).where(User.email == body.email))
    user = result.scalar_one_or_none()

    if not user or not user.password_hash:
        raise HTTPException(status_code=401, detail="Invalid email or password")

    if not verify_password(body.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Invalid email or password")

    if not user.is_active:
        raise HTTPException(status_code=403, detail="Account is deactivated")

    # Update last_active
    user.last_active_at = datetime.now(UTC)

    # Create tokens
    access_token = create_access_token({
        "sub": str(user.id), "email": user.email, "role": user.role
    })
    refresh_token = create_refresh_token({"sub": str(user.id)})

    # Store session
    session = Session(
        user_id=user.id,
        refresh_token_hash=_hash_refresh_token(refresh_token),
        user_agent=request.headers.get("user-agent"),
        ip_address=request.client.host if request.client else None,
        expires_at=datetime.now(UTC) + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS),
    )
    db.add(session)

    logger.info("user_login", user_id=str(user.id))

    response = TokenResponse(
        access_token=access_token,
        expires_in=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
    )
    return response


@router.post("/refresh", response_model=TokenResponse)
async def refresh_token(request: Request, db: AsyncSession = Depends(get_db)):
    """Refresh access token using refresh token from Authorization header."""
    auth_header = request.headers.get("authorization", "")
    if not auth_header.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Refresh token required")

    token = auth_header[7:]
    payload = decode_token(token)

    if payload.get("type") != "refresh":
        raise HTTPException(status_code=401, detail="Invalid token type")

    user_id = payload.get("sub")
    token_hash = _hash_refresh_token(token)

    # Validate session exists
    result = await db.execute(
        select(Session).where(
            Session.refresh_token_hash == token_hash,
            Session.expires_at > datetime.now(UTC),
        )
    )
    session = result.scalar_one_or_none()

    if not session:
        raise HTTPException(status_code=401, detail="Invalid or expired refresh token")

    # Get user
    result = await db.execute(select(User).where(User.id == uuid.UUID(user_id)))
    user = result.scalar_one_or_none()

    if not user or not user.is_active:
        raise HTTPException(status_code=401, detail="User not found or deactivated")

    # Delete old session
    await db.delete(session)

    settings = get_settings()

    # Create new tokens (rotation)
    new_access = create_access_token({
        "sub": str(user.id), "email": user.email, "role": user.role
    })
    new_refresh = create_refresh_token({"sub": str(user.id)})

    new_session = Session(
        user_id=user.id,
        refresh_token_hash=_hash_refresh_token(new_refresh),
        user_agent=request.headers.get("user-agent"),
        ip_address=request.client.host if request.client else None,
        expires_at=datetime.now(UTC) + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS),
    )
    db.add(new_session)

    return TokenResponse(
        access_token=new_access,
        expires_in=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
    )


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
async def logout(user=Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    """Invalidate current session."""
    # Delete all sessions for this user (full logout)
    result = await db.execute(select(Session).where(Session.user_id == user.id))
    sessions = result.scalars().all()
    for s in sessions:
        await db.delete(s)

    logger.info("user_logout", user_id=str(user.id))
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/me", response_model=UserResponse)
async def get_me(user=Depends(get_current_user)):
    """Get current authenticated user profile."""
    return user


@router.get("/users", response_model=list[UserResponse])
async def list_users(user=Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    """List all other active users on the system."""
    result = await db.execute(
        select(User).where(User.id != user.id, User.is_active == True).order_by(User.username)
    )
    return result.scalars().all()
