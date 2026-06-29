"""Asynchronous model discovery engine — queries provider endpoints for available models."""

from __future__ import annotations

import structlog
import httpx

logger = structlog.get_logger()


# ── Capability Mapper ────────────────────────────────────────────────────────

def _detect_capabilities(model_id: str) -> dict:
    """Single-pass string filter to auto-tag model capabilities."""
    mid = model_id.lower()
    return {
        "vision": any(kw in mid for kw in ("vision", "vl", "llava", "4o", "o4", "gpt-4-turbo")),
        "reasoning": (
            any(kw in mid for kw in ("r1", "think", "reasoning", "qwq", "o3-"))
            or (("o1" in mid or "o3" in mid) and "4o" not in mid)
        ),
        "function_calling": any(kw in mid for kw in ("gpt-", "claude-", "mistral", "command")),
    }

def is_chat_model(model_id: str) -> bool:
    """Filter out non-chat models (embeddings, reward models, safety guards, etc.)."""
    mid = model_id.lower()
    non_chat_keywords = (
        "embed", "clip", "safety", "guard", "reward", "detector",
        "retriever", "parse", "topic-control", "rerank", "classifier"
    )
    return not any(kw in mid for kw in non_chat_keywords)

def _make_display_name(model_id: str) -> str:
    """Parse a model identifier into a human-friendly display name."""
    # Strip common prefixes like "accounts/fireworks/models/"
    name = model_id.rsplit("/", 1)[-1] if "/" in model_id else model_id
    # Convert kebab-case / underscores to title
    name = name.replace("-", " ").replace("_", " ").replace(":", " ").title()
    return name


# ── Protocol-specific Normalizers ────────────────────────────────────────────

async def discover_ollama(base_url: str) -> list[dict]:
    """Discover models from an Ollama instance via /api/tags."""
    url = f"{base_url.rstrip('/')}/api/tags"
    async with httpx.AsyncClient(timeout=15.0) as client:
        resp = await client.get(url)
        resp.raise_for_status()
        data = resp.json()

    models = []
    for entry in data.get("models", []):
        model_id = entry.get("name", "")
        if not model_id or not is_chat_model(model_id):
            continue
        models.append({
            "model_id": model_id,
            "display_name": _make_display_name(model_id),
            "capabilities": _detect_capabilities(model_id),
        })

    logger.info("ollama_discovery_complete", base_url=base_url, model_count=len(models))
    return models


async def discover_openai_compatible(base_url: str, api_key: str | None = None) -> list[dict]:
    """Discover models from an OpenAI-compatible API via /v1/models or /models."""
    headers = {}
    if api_key:
        headers["Authorization"] = f"Bearer {api_key}"

    clean_url = base_url.rstrip("/")
    if not clean_url.endswith("/v1"):
        clean_url = f"{clean_url}/v1"

    async with httpx.AsyncClient(timeout=15.0) as client:
        # Try /v1/models (clean_url/models) first, then /models (parent_url/models)
        urls = [f"{clean_url}/models", f"{clean_url.rsplit('/v1', 1)[0]}/models"]
        for url in urls:
            try:
                resp = await client.get(url, headers=headers)
                if resp.status_code == 200:
                    break
            except httpx.HTTPError:
                continue
        else:
            raise RuntimeError(
                f"Could not reach model list at {base_url}. "
                f"Tried: {', '.join(urls)}"
            )

        data = resp.json()

    raw_models = data.get("data", [])
    if not raw_models and isinstance(data, list):
        raw_models = data

    models = []
    for entry in raw_models:
        model_id = entry.get("id", "") if isinstance(entry, dict) else str(entry)
        if not model_id or not is_chat_model(model_id):
            continue
        models.append({
            "model_id": model_id,
            "display_name": _make_display_name(model_id),
            "capabilities": _detect_capabilities(model_id),
        })

    logger.info(
        "openai_compatible_discovery_complete",
        base_url=base_url, model_count=len(models),
    )
    return models


# ── Public API ───────────────────────────────────────────────────────────────

async def discover_models(provider_type: str, base_url: str, api_key: str | None = None) -> list[dict]:
    """Route to the appropriate discovery normalizer based on provider type.
    
    Returns a list of dicts: [{"model_id": ..., "display_name": ..., "capabilities": {...}}, ...]
    """
    if provider_type == "ollama":
        return await discover_ollama(base_url)
    else:
        # openai, nvidia, generic_openai_compatible — all use the same protocol
        return await discover_openai_compatible(base_url, api_key)
