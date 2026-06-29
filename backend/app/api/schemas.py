"""Pydantic schemas for API request/response validation."""

from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel, EmailStr, Field, field_validator

# ── Auth Schemas ─────────────────────────────────────────────────────────────


class RegisterRequest(BaseModel):
    email: EmailStr
    username: str = Field(min_length=3, max_length=64, pattern=r"^[a-zA-Z0-9_-]+$")
    password: str = Field(min_length=8, max_length=128)

    @field_validator("username")
    @classmethod
    def username_alphanumeric(cls, v: str) -> str:
        return v.lower()


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_in: int  # seconds


class UserResponse(BaseModel):
    id: uuid.UUID
    email: str
    username: str
    avatar_url: str | None
    role: str
    created_at: datetime

    model_config = {"from_attributes": True}


# ── Conversation Schemas ─────────────────────────────────────────────────────


class ConversationCreate(BaseModel):
    title: str = "New Chat"
    model_id: str = "gpt-4o"
    system_prompt: str | None = None


class ConversationUpdate(BaseModel):
    title: str | None = None
    model_id: str | None = None
    system_prompt: str | None = None
    is_archived: bool | None = None
    is_pinned: bool | None = None


class ConversationResponse(BaseModel):
    id: uuid.UUID
    title: str
    model_id: str
    system_prompt: str | None
    is_archived: bool
    is_pinned: bool
    share_token: str | None
    created_at: datetime
    updated_at: datetime
    message_count: int = 0
    last_message_preview: str | None = None

    model_config = {"from_attributes": True}


class ConversationListResponse(BaseModel):
    conversations: list[ConversationResponse]
    total: int
    page: int
    page_size: int


# ── Message Schemas ──────────────────────────────────────────────────────────


class ContentBlock(BaseModel):
    type: str  # text, image, audio, document
    text: str | None = None
    asset_id: str | None = None
    url: str | None = None
    mime_type: str | None = None
    transcription: str | None = None


class MessageResponse(BaseModel):
    id: uuid.UUID
    conversation_id: uuid.UUID
    parent_message_id: uuid.UUID | None
    role: str
    content: list[ContentBlock] | list[dict]
    model_id: str | None
    input_tokens: int | None
    output_tokens: int | None
    latency_ms: int | None
    is_active_branch: bool
    created_at: datetime
    children_count: int = 0

    model_config = {"from_attributes": True}


class ChatStreamRequest(BaseModel):
    conversation_id: uuid.UUID | None = None
    message: str
    model_id: str | None = None
    temperature: float | None = None
    max_tokens: int | None = None
    system_prompt: str | None = None
    parent_message_id: uuid.UUID | None = None
    media_asset_ids: list[uuid.UUID] = []


# ── Preferences Schemas ─────────────────────────────────────────────────────


class PreferencesResponse(BaseModel):
    theme: str
    color_theme: str
    sidebar_mode: str
    default_model_id: str
    default_temperature: float
    default_max_tokens: int
    default_system_prompt: str | None
    code_theme: str
    font_size: str
    send_on_enter: bool
    show_token_counts: bool
    context_strategy: str
    enable_rag: bool
    message_width: str
    chat_bg_pattern: str

    model_config = {"from_attributes": True}


class PreferencesUpdate(BaseModel):
    theme: str | None = None
    color_theme: str | None = None
    sidebar_mode: str | None = None
    default_model_id: str | None = None
    default_temperature: float | None = Field(default=None, ge=0.0, le=2.0)
    default_max_tokens: int | None = Field(default=None, ge=64, le=128000)
    default_system_prompt: str | None = None
    code_theme: str | None = None
    font_size: str | None = None
    send_on_enter: bool | None = None
    show_token_counts: bool | None = None
    context_strategy: str | None = None
    enable_rag: bool | None = None
    message_width: str | None = None
    chat_bg_pattern: str | None = None


# ── Export / Import Schemas ──────────────────────────────────────────────────


class ExportConversation(BaseModel):
    schema_version: str = "1.0"
    exported_at: datetime
    conversation: dict


class ImportConversation(BaseModel):
    schema_version: str
    conversation: dict


# ── Provider Connection Schemas ──────────────────────────────────────────────


class ProviderConnectionCreate(BaseModel):
    name: str = Field(min_length=1, max_length=128)
    provider_type: str = Field(
        description="One of: openai, ollama, nvidia, generic_openai_compatible"
    )
    base_url: str = Field(min_length=1)
    api_key: str | None = None  # Plain text — encrypted on the server

    @field_validator("provider_type")
    @classmethod
    def validate_provider_type(cls, v: str) -> str:
        allowed = {"openai", "ollama", "nvidia", "generic_openai_compatible"}
        if v not in allowed:
            raise ValueError(f"provider_type must be one of {allowed}")
        return v


class ProviderConnectionUpdate(BaseModel):
    name: str | None = None
    base_url: str | None = None
    api_key: str | None = None
    is_active: bool | None = None


class DiscoveredModelResponse(BaseModel):
    id: uuid.UUID
    connection_id: uuid.UUID
    model_id: str
    display_name: str
    is_active: bool
    capabilities: dict | None
    created_at: datetime

    model_config = {"from_attributes": True}


class ProviderConnectionResponse(BaseModel):
    id: uuid.UUID
    name: str
    provider_type: str
    base_url: str
    is_active: bool
    created_at: datetime
    updated_at: datetime
    model_count: int = 0
    models: list[DiscoveredModelResponse] = []

    model_config = {"from_attributes": True}


class ProviderSyncResponse(BaseModel):
    """Returned after creating/syncing a provider — includes discovered models."""
    connection: ProviderConnectionResponse
    discovered_count: int


class AvailableModelResponse(BaseModel):
    """Flat model item for the model selector dropdown."""
    id: uuid.UUID
    model_id: str
    display_name: str
    provider_type: str
    provider_name: str
    connection_id: uuid.UUID
    capabilities: dict | None
    is_active: bool

    model_config = {"from_attributes": True}

