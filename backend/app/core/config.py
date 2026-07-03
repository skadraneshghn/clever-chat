"""Application configuration via environment variables using Pydantic Settings.

Supports both local .env and Clever Cloud addon environment variables.
Clever Cloud PostgreSQL addon injects: POSTGRESQL_ADDON_URI, POSTGRESQL_ADDON_HOST, etc.
"""

from __future__ import annotations

import os
from functools import lru_cache
from pathlib import Path

from pydantic import model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Central configuration loaded from environment variables / .env file."""

    model_config = SettingsConfigDict(
        env_file=os.getenv("ENV_FILE", ".env"),
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    # ── Application ──────────────────────────────────────────────
    APP_NAME: str = "CleverChat"
    APP_VERSION: str = "0.1.0"
    DEBUG: bool = False
    ENVIRONMENT: str = "production"  # development | staging | production
    PORT: int = 8080  # Clever Cloud injects PORT

    # ── Database ─────────────────────────────────────────────────
    DATABASE_URL: str = ""
    DB_POOL_MIN_SIZE: int = 4
    DB_POOL_MAX_SIZE: int = 20
    DB_COMMAND_TIMEOUT: int = 30

    # ── Clever Cloud PostgreSQL Addon ────────────────────────────
    POSTGRESQL_ADDON_URI: str = ""
    POSTGRESQL_ADDON_HOST: str = ""
    POSTGRESQL_ADDON_PORT: str = "5432"
    POSTGRESQL_ADDON_DB: str = ""
    POSTGRESQL_ADDON_USER: str = ""
    POSTGRESQL_ADDON_PASSWORD: str = ""

    @model_validator(mode="after")
    def resolve_database_url(self) -> "Settings":
        """Build DATABASE_URL from Clever Cloud addon env vars if not set directly."""
        if not self.DATABASE_URL:
            if self.POSTGRESQL_ADDON_URI:
                # Convert postgres:// to postgresql+asyncpg://
                uri = self.POSTGRESQL_ADDON_URI
                if uri.startswith("postgres://"):
                    uri = uri.replace("postgres://", "postgresql+asyncpg://", 1)
                elif uri.startswith("postgresql://"):
                    uri = uri.replace("postgresql://", "postgresql+asyncpg://", 1)
                self.DATABASE_URL = uri
            elif self.POSTGRESQL_ADDON_HOST:
                self.DATABASE_URL = (
                    f"postgresql+asyncpg://{self.POSTGRESQL_ADDON_USER}:"
                    f"{self.POSTGRESQL_ADDON_PASSWORD}@{self.POSTGRESQL_ADDON_HOST}:"
                    f"{self.POSTGRESQL_ADDON_PORT}/{self.POSTGRESQL_ADDON_DB}"
                )
            else:
                # Fallback for local development
                self.DATABASE_URL = (
                    "postgresql+asyncpg://cleverchat:cleverchat_dev@localhost:5432/cleverchat"
                )
        elif self.DATABASE_URL.startswith("postgres://"):
            self.DATABASE_URL = self.DATABASE_URL.replace(
                "postgres://", "postgresql+asyncpg://", 1
            )
        elif self.DATABASE_URL.startswith("postgresql://") and "+asyncpg" not in self.DATABASE_URL:
            self.DATABASE_URL = self.DATABASE_URL.replace(
                "postgresql://", "postgresql+asyncpg://", 1
            )
        return self

    # ── Security / JWT ───────────────────────────────────────────
    SECRET_KEY: str = "change-me-to-a-random-64-char-string-in-production"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60
    REFRESH_TOKEN_EXPIRE_DAYS: int = 30

    # ── CORS ─────────────────────────────────────────────────────
    CORS_ORIGINS: str = "http://localhost:3000"

    @property
    def cors_origins_list(self) -> list[str]:
        return [origin.strip() for origin in self.CORS_ORIGINS.split(",")]

    # ── LLM Providers ────────────────────────────────────────────
    OPENAI_API_KEY: str = ""
    ANTHROPIC_API_KEY: str = ""
    DEFAULT_MODEL_ID: str = "gpt-4o"
    DEFAULT_TEMPERATURE: float = 0.7
    DEFAULT_MAX_TOKENS: int = 4096
    DEFAULT_SYSTEM_PROMPT: str = (
        "You are CleverChat, a helpful, harmless, and honest AI assistant. "
        "Be concise, accurate, and friendly. Use markdown formatting when appropriate."
    )

    # ── File Storage ─────────────────────────────────────────────
    UPLOAD_DIR: str = "./uploads"
    MAX_UPLOAD_SIZE_MB: int = 50
    CELLAR_ADDON_HOST: str = "cellar-c2.services.clever-cloud.com"
    CELLAR_ADDON_KEY_ID: str = "RD180HYLWYFRPAVOMZHN"
    CELLAR_ADDON_KEY_SECRET: str = "8aNfSsoP3Q7RtBb1GuffdQxbhrXVB0kuqJ77wrlX"
    CELLAR_BUCKET: str = "cleverchat-media"

    @property
    def upload_path(self) -> Path:
        path = Path(self.UPLOAD_DIR)
        path.mkdir(parents=True, exist_ok=True)
        return path

    @property
    def max_upload_bytes(self) -> int:
        return self.MAX_UPLOAD_SIZE_MB * 1024 * 1024

    # ── Redis / Clever Cloud Redis Addon ────────────────────────
    REDIS_URL: str = ""
    REDIS_HOST: str = ""
    REDIS_PORT: str = "6379"
    REDIS_PASSWORD: str = ""

    @property
    def redis_url(self) -> str:
        """Build Redis URL from Clever Cloud addon env vars or use REDIS_URL directly."""
        if self.REDIS_URL:
            return self.REDIS_URL
        if self.REDIS_HOST:
            if self.REDIS_PASSWORD:
                return f"redis://:{self.REDIS_PASSWORD}@{self.REDIS_HOST}:{self.REDIS_PORT}/0"
            return f"redis://{self.REDIS_HOST}:{self.REDIS_PORT}/0"
        return "redis://localhost:6379/0"

    # ── Process Pool ─────────────────────────────────────────────
    PROCESS_POOL_WORKERS: int | None = None  # None = cpu_count()


@lru_cache
def get_settings() -> Settings:
    """Return cached Settings instance (singleton)."""
    return Settings()
