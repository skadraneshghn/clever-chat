"""FastAPI application entry point with lifespan management."""

from __future__ import annotations

from contextlib import asynccontextmanager

import structlog
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.auth import router as auth_router
from app.api.chat import router as chat_router
from app.api.conversations import router as conversations_router
from app.api.media import router as media_router
from app.api.preferences import router as preferences_router
from app.api.providers import router as providers_router
from app.core.config import get_settings
from app.core.database import close_db, init_db
from app.core.process_pool import init_process_pool, shutdown_process_pool
from app.graph.builder import get_compiled_graph
from app.middleware.logging import RequestLoggingMiddleware

# ── Structlog Configuration ─────────────────────────────────────────────────

structlog.configure(
    processors=[
        structlog.contextvars.merge_contextvars,
        structlog.stdlib.add_log_level,
        structlog.stdlib.add_logger_name,
        structlog.processors.TimeStamper(fmt="iso"),
        structlog.processors.StackInfoRenderer(),
        structlog.processors.format_exc_info,
        structlog.dev.ConsoleRenderer() if get_settings().DEBUG else structlog.processors.JSONRenderer(),
    ],
    wrapper_class=structlog.stdlib.BoundLogger,
    context_class=dict,
    logger_factory=structlog.stdlib.LoggerFactory(),
    cache_logger_on_first_use=True,
)

logger = structlog.get_logger()


# ── Lifespan ─────────────────────────────────────────────────────────────────


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application startup/shutdown lifecycle.
    
    Runs once per Gunicorn worker process (after fork).
    Initialises all shared resources.
    """
    settings = get_settings()
    logger.info("app_starting", environment=settings.ENVIRONMENT, debug=settings.DEBUG)

    # 1. Database connection pool
    await init_db()
    logger.info("database_connected")

    # 2. Create required PostgreSQL extensions + tables
    from app.core.database import Base, get_engine

    # Import all models to register them with SQLAlchemy metadata
    from app.models import (  # noqa: F401
        conversation,
        discovered_model,
        embeddings,
        media_asset,
        chat_resource,
        message,
        provider_connection,
        session,
        user,
        user_preferences,
    )
    try:
        async with get_engine().begin() as conn:
            # Enable extensions first (required before creating vector columns)
            await conn.execute(
                __import__('sqlalchemy').text('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"')
            )
            await conn.execute(
                __import__('sqlalchemy').text('CREATE EXTENSION IF NOT EXISTS "pgcrypto"')
            )
            await conn.execute(
                __import__('sqlalchemy').text('CREATE EXTENSION IF NOT EXISTS vector')
            )
            # Create all tables
            await conn.run_sync(Base.metadata.create_all)
            # Ensure sender_id column exists on messages
            await conn.execute(
                __import__("sqlalchemy").text(
                    "ALTER TABLE messages ADD COLUMN IF NOT EXISTS "
                    "sender_id UUID REFERENCES users(id) ON DELETE SET NULL"
                )
            )
            # Ensure hidden_from_owner column exists on messages
            await conn.execute(
                __import__("sqlalchemy").text(
                    "ALTER TABLE messages ADD COLUMN IF NOT EXISTS "
                    "hidden_from_owner BOOLEAN NOT NULL DEFAULT FALSE"
                )
            )
            # Ensure color_theme column exists
            await conn.execute(
                __import__("sqlalchemy").text(
                    "ALTER TABLE user_preferences ADD COLUMN IF NOT EXISTS "
                    "color_theme VARCHAR(32) NOT NULL DEFAULT 'indigo'"
                )
            )
            # Ensure chat_bg_pattern column exists
            await conn.execute(
                __import__("sqlalchemy").text(
                    "ALTER TABLE user_preferences ADD COLUMN IF NOT EXISTS "
                    "chat_bg_pattern VARCHAR(32) NOT NULL DEFAULT 'none'"
                )
            )
            # Ensure media_assets advanced columns exist
            await conn.execute(
                __import__("sqlalchemy").text(
                    "ALTER TABLE media_assets ADD COLUMN IF NOT EXISTS "
                    "file_hash VARCHAR(64)"
                )
            )
            await conn.execute(
                __import__("sqlalchemy").text(
                    "ALTER TABLE media_assets ADD COLUMN IF NOT EXISTS "
                    "source_url TEXT"
                )
            )
            await conn.execute(
                __import__("sqlalchemy").text(
                    "ALTER TABLE media_assets ADD COLUMN IF NOT EXISTS "
                    "status VARCHAR(32) NOT NULL DEFAULT 'completed'"
                )
            )
            await conn.execute(
                __import__("sqlalchemy").text(
                    "ALTER TABLE media_assets ADD COLUMN IF NOT EXISTS "
                    "extraction_status VARCHAR(32) NOT NULL DEFAULT 'none'"
                )
            )
            await conn.execute(
                __import__("sqlalchemy").text(
                    "ALTER TABLE media_assets ADD COLUMN IF NOT EXISTS "
                    "token_count INTEGER"
                )
            )
            await conn.execute(
                __import__("sqlalchemy").text(
                    "ALTER TABLE media_assets ADD COLUMN IF NOT EXISTS "
                    "extracted_text TEXT"
                )
            )
            await conn.execute(
                __import__("sqlalchemy").text(
                    "ALTER TABLE media_assets ADD COLUMN IF NOT EXISTS "
                    "folder_name VARCHAR(255)"
                )
            )
            await conn.execute(
                __import__("sqlalchemy").text(
                    "ALTER TABLE media_assets ADD COLUMN IF NOT EXISTS "
                    "updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()"
                )
            )
        logger.info("database_tables_created")
    except Exception as exc:
        logger.error("database_setup_failed", error=str(exc))
        raise  # Re-raise so worker fails fast with a clear error

    # Initialize S3 Cellar bucket
    try:
        from app.services.s3_storage import ensure_bucket_exists
        ensure_bucket_exists()
        logger.info("s3_storage_initialized")
    except Exception as exc:
        logger.error("s3_storage_initialization_failed", error=str(exc))

    # 3. Process pool for CPU-bound work
    init_process_pool()
    logger.info("process_pool_initialized")

    # 4. Pre-compile LangGraph
    get_compiled_graph()
    logger.info("langgraph_compiled")

    logger.info("app_started", app_name=settings.APP_NAME, version=settings.APP_VERSION)

    yield  # App is running

    # Shutdown
    logger.info("app_shutting_down")
    shutdown_process_pool()
    await close_db()
    logger.info("app_stopped")


# ── FastAPI App ──────────────────────────────────────────────────────────────


def create_app() -> FastAPI:
    """Factory function to create the FastAPI application."""
    settings = get_settings()

    app = FastAPI(
        title=settings.APP_NAME,
        version=settings.APP_VERSION,
        description="Production-grade AI Chat Platform",
        lifespan=lifespan,
        docs_url="/docs",
        redoc_url="/redoc",
    )

    # ── Middleware (applied in reverse order) ────────────────────────────

    # 1. CORS
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins_list,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
        expose_headers=["X-Request-ID"],
    )

    # 2. Request Logging
    app.add_middleware(RequestLoggingMiddleware)

    # ── Routes ───────────────────────────────────────────────────────────

    api_prefix = "/api/v1"
    app.include_router(auth_router, prefix=api_prefix)
    app.include_router(chat_router, prefix=api_prefix)
    app.include_router(conversations_router, prefix=api_prefix)
    app.include_router(preferences_router, prefix=api_prefix)
    app.include_router(media_router, prefix=api_prefix)
    app.include_router(providers_router, prefix=api_prefix)

    # ── Health Check ─────────────────────────────────────────────────────

    @app.get("/health")
    async def health_check():
        return {"status": "ok", "app": settings.APP_NAME, "version": settings.APP_VERSION}

    return app


app = create_app()
