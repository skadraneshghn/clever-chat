"""Async database engine, session factory, and dependency providers."""

from __future__ import annotations

from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager

from sqlalchemy import text
from sqlalchemy.ext.asyncio import (
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.orm import DeclarativeBase

from app.core.config import get_settings


class Base(DeclarativeBase):
    """SQLAlchemy declarative base for all models."""
    pass


# ── Engine & Session Factory (initialised at startup) ────────────────────────

_engine = None
_async_session_factory = None


def _build_engine():
    settings = get_settings()
    return create_async_engine(
        settings.DATABASE_URL,
        pool_size=settings.DB_POOL_MIN_SIZE,
        max_overflow=settings.DB_POOL_MAX_SIZE - settings.DB_POOL_MIN_SIZE,
        pool_timeout=settings.DB_COMMAND_TIMEOUT,
        pool_recycle=300,
        pool_pre_ping=True,
        echo=settings.DEBUG,
    )


async def init_db() -> None:
    """Create engine, session factory, and ensure pgvector extension exists."""
    global _engine, _async_session_factory

    _engine = _build_engine()
    _async_session_factory = async_sessionmaker(
        _engine, class_=AsyncSession, expire_on_commit=False
    )

    # Ensure required extensions are present
    async with _engine.begin() as conn:
        await conn.execute(text('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"'))
        await conn.execute(text('CREATE EXTENSION IF NOT EXISTS "pgcrypto"'))
        await conn.execute(text('CREATE EXTENSION IF NOT EXISTS "vector"'))


async def close_db() -> None:
    """Dispose engine and connection pool."""
    global _engine, _async_session_factory
    if _engine:
        await _engine.dispose()
        _engine = None
        _async_session_factory = None


def get_engine():
    """Return the current engine (must call init_db first)."""
    if _engine is None:
        raise RuntimeError("Database not initialised — call init_db() first.")
    return _engine


# ── Dependency Providers ─────────────────────────────────────────────────────


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    """FastAPI dependency — yields an async session, auto-commits/rollbacks."""
    if _async_session_factory is None:
        raise RuntimeError("Database not initialised — call init_db() first.")
    async with _async_session_factory() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise


@asynccontextmanager
async def get_db_context() -> AsyncGenerator[AsyncSession, None]:
    """Context manager variant for use outside of FastAPI dependencies."""
    if _async_session_factory is None:
        raise RuntimeError("Database not initialised — call init_db() first.")
    async with _async_session_factory() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
