"""LLM caller node — JIT client factory that dynamically resolves provider connections."""

from __future__ import annotations

import structlog
from langchain_openai import ChatOpenAI

from app.graph.state import AgentState

logger = structlog.get_logger()


# ── JIT LLM Factory ─────────────────────────────────────────────────────────


async def _resolve_connection(model_id: str, user_id: str) -> dict | None:
    """Look up provider connection details for a given model_id from the database.
    
    Returns a dict with: base_url, provider_type, api_key, model_id (upstream)
    or None if not found (falls back to legacy behavior).
    """
    from app.core.database import get_db_context
    from app.models.discovered_model import DiscoveredModel
    from app.models.provider_connection import ProviderConnection
    from sqlalchemy import select
    import uuid as uuid_mod

    try:
        # Convert string to UUID for safe comparison with asyncpg
        user_uuid = uuid_mod.UUID(user_id) if isinstance(user_id, str) else user_id

        async with get_db_context() as db:
            result = await db.execute(
                select(DiscoveredModel, ProviderConnection)
                .join(
                    ProviderConnection,
                    DiscoveredModel.connection_id == ProviderConnection.id,
                )
                .where(
                    DiscoveredModel.model_id == model_id,
                    ProviderConnection.user_id == user_uuid,
                    ProviderConnection.is_active == True,
                    DiscoveredModel.is_active == True,
                )
                .limit(1)
            )
            row = result.first()
            if not row:
                return None

            model, conn = row
            return {
                "base_url": conn.base_url,
                "provider_type": conn.provider_type,
                "api_key": conn.api_key_encrypted,  # plain text for now
                "model_id": model.model_id,
                "capabilities": model.capabilities or {},
            }
    except Exception as exc:
        logger.warning("connection_resolve_failed", error=str(exc), model_id=model_id)
        return None


def _build_llm(
    model_id: str,
    provider_type: str,
    base_url: str,
    api_key: str | None,
    capabilities: dict,
    temperature: float = 0.7,
    max_tokens: int = 4096,
):
    """Build a LangChain chat model instance dynamically based on provider type."""
    # Ensure base_url ends with /v1 but not /v1/v1
    clean_url = base_url.rstrip("/")
    if not clean_url.endswith("/v1"):
        clean_url = f"{clean_url}/v1"

    # Reasoning model special handling
    is_reasoning = capabilities.get("reasoning", False)
    extra_kwargs = {}
    if is_reasoning:
        extra_kwargs["model_kwargs"] = {
            "reasoning_effort": "medium",
        }
        # Reasoning models typically don't use temperature
        temperature = 1.0

    if provider_type == "ollama":
        # Ollama uses ChatOpenAI with a local base URL and no API key
        return ChatOpenAI(
            model=model_id,
            temperature=temperature,
            max_tokens=max_tokens,
            base_url=clean_url,
            api_key="ollama",  # Ollama doesn't require a key but LangChain needs a non-empty string
            streaming=True,
        )

    if provider_type == "nvidia":
        return ChatOpenAI(
            model=model_id,
            temperature=temperature,
            max_tokens=max_tokens,
            base_url=clean_url,
            api_key=api_key or "",
            streaming=True,
            **extra_kwargs,
        )

    # openai | generic_openai_compatible
    init_kwargs = {
        "model": model_id,
        "temperature": temperature,
        "max_tokens": max_tokens,
        "streaming": True,
    }
    if api_key:
        init_kwargs["api_key"] = api_key
    if provider_type == "generic_openai_compatible":
        init_kwargs["base_url"] = clean_url
    elif provider_type == "openai":
        # Standard OpenAI — override base URL only if non-empty custom
        if base_url:
            init_kwargs["base_url"] = clean_url

    init_kwargs.update(extra_kwargs)
    return ChatOpenAI(**init_kwargs)


def _build_legacy_llm(model_id: str, temperature: float, max_tokens: int):
    """Legacy fallback — uses env-based API keys for known providers."""
    from app.core.config import get_settings
    settings = get_settings()

    if model_id.startswith(("claude-",)):
        from langchain_anthropic import ChatAnthropic
        return ChatAnthropic(
            model=model_id,
            temperature=temperature,
            max_tokens=max_tokens,
            api_key=settings.ANTHROPIC_API_KEY,
        )

    # Default to OpenAI for gpt-*, o1, o3, o4, or unknown
    return ChatOpenAI(
        model=model_id,
        temperature=temperature,
        max_tokens=max_tokens,
        api_key=settings.OPENAI_API_KEY,
        streaming=True,
    )


# ── LLM Caller Node ─────────────────────────────────────────────────────────


async def llm_caller(state: AgentState) -> dict:
    """Call the LLM and return the response.
    
    Uses JIT provider resolution: looks up the model in the database first,
    falls back to legacy env-based config if not found.
    
    Note: Streaming is handled at the graph level via astream_events.
    This node invokes the LLM and returns the complete response.
    """
    model_id = state.get("model_id", "gpt-4o")
    temperature = state.get("temperature", 0.7)
    max_tokens = state.get("max_tokens", 4096)
    user_id = state.get("user_id", "")

    # Try dynamic resolution first
    conn_info = await _resolve_connection(model_id, user_id)

    if conn_info:
        llm = _build_llm(
            model_id=conn_info["model_id"],
            provider_type=conn_info["provider_type"],
            base_url=conn_info["base_url"],
            api_key=conn_info["api_key"],
            capabilities=conn_info["capabilities"],
            temperature=temperature,
            max_tokens=max_tokens,
        )
        logger.info(
            "using_dynamic_provider",
            model_id=model_id,
            provider_type=conn_info["provider_type"],
        )
    else:
        # Legacy fallback for env-configured models
        llm = _build_legacy_llm(model_id, temperature, max_tokens)
        logger.info("using_legacy_provider", model_id=model_id)

    messages = state.get("messages", [])

    try:
        response = await llm.ainvoke(messages)

        # Extract token usage if available
        usage_metadata = getattr(response, "usage_metadata", {}) or {}
        input_tokens = usage_metadata.get("input_tokens", 0)
        output_tokens = usage_metadata.get("output_tokens", 0)

        return {
            "messages": [response],
            "input_tokens": input_tokens,
            "output_tokens": output_tokens,
            "finish_reason": "stop",
        }
    except Exception as e:
        logger.error("llm_call_failed", error=str(e), model_id=model_id)
        return {
            "finish_reason": "error",
        }
