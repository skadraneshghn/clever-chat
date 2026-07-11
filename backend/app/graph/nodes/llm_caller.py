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
    if is_reasoning and provider_type == "openai":
        extra_kwargs["reasoning_effort"] = "medium"
        # OpenAI reasoning models (o1/o3-mini) require temperature = 1.0
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

    Supports two modes:
    1. Standard text/vision chat (streaming via astream_events at graph level)
    2. Image generation (non-streaming, returns generated_image_assets)
    """
    model_id = state.get("model_id", "gpt-4o")
    temperature = state.get("temperature", 0.7)
    max_tokens = state.get("max_tokens", 4096)
    user_id = state.get("user_id", "")
    image_generation_mode = state.get("image_generation_mode", False)

    # Try dynamic resolution first
    conn_info = await _resolve_connection(model_id, user_id)

    # ── Image Generation Branch ──────────────────────────────────────────────
    if image_generation_mode:
        return await _image_generation_caller(state, conn_info, model_id, user_id)

    # ── Standard Text / Vision Branch ───────────────────────────────────────
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
            "messages": messages + [response],
            "input_tokens": input_tokens,
            "output_tokens": output_tokens,
            "finish_reason": "stop",
            "error_raised": False,
        }
    except Exception as e:
        logger.error("llm_call_failed", error=str(e), model_id=model_id)

        error_msg = str(e)
        is_not_found = False
        lower_err = error_msg.lower()
        if "not found" in lower_err or "not_found" in lower_err or "404" in lower_err or "unauthorized" in lower_err or "forbidden" in lower_err or "permission" in lower_err:
            is_not_found = True

        if is_not_found:
            try:
                from app.core.database import get_db_context
                from app.models.discovered_model import DiscoveredModel
                from app.models.provider_connection import ProviderConnection
                from sqlalchemy import update, select
                import uuid as uuid_mod

                async with get_db_context() as session:
                    if user_id:
                        user_uuid = uuid_mod.UUID(user_id) if isinstance(user_id, str) else user_id
                        subq = (
                            select(ProviderConnection.id)
                            .where(ProviderConnection.user_id == user_uuid)
                        )
                        stmt = (
                            update(DiscoveredModel)
                            .where(
                                DiscoveredModel.model_id == model_id,
                                DiscoveredModel.connection_id.in_(subq),
                                DiscoveredModel.is_active == True
                            )
                            .values(is_active=False)
                        )
                        await session.execute(stmt)
                        await session.commit()
                        logger.info("model_auto_deactivated", model_id=model_id, user_id=str(user_id))
            except Exception as db_exc:
                logger.error("failed_to_auto_deactivate_model", error=str(db_exc))

            friendly_message = (
                "The selected model is not available or authorized for your provider account. "
                "We have automatically deactivated it from your list. Please select another model."
            )
        else:
            friendly_message = error_msg

        # Return error state gracefully — graph continues to response_finalizer
        # which passes the error through to the SSE endpoint.
        return {
            "finish_reason": "error",
            "error_message": friendly_message,
            "error_raised": True,
        }


# ── Image Generation Implementation ─────────────────────────────────────────


# Maps Pillow image formats to (file extension, MIME type) for persisting
# generated images. The upstream API frequently returns WebP even when PNG is
# requested, so we detect the real format rather than assuming PNG.
_IMAGE_FORMAT_MAP: dict[str, tuple[str, str]] = {
    "PNG": (".png", "image/png"),
    "JPEG": (".jpg", "image/jpeg"),
    "WEBP": (".webp", "image/webp"),
    "GIF": (".gif", "image/gif"),
}


async def _image_generation_caller(
    state: AgentState,
    conn_info: dict | None,
    model_id: str,
    user_id: str,
) -> dict:
    """Generate images using the OpenAI-compatible images API.

    Fetches each generated image (from a returned URL or inline b64_json),
    uploads it to S3 object storage, creates MediaAsset DB records, and
    returns structured asset metadata that the frontend can render.
    """
    import base64
    import io as io_mod
    import uuid as uuid_mod

    import httpx
    from fastapi.concurrency import run_in_threadpool
    from PIL import Image as PILImage

    from app.core.config import get_settings
    from app.core.database import get_db_context
    from app.models.media_asset import MediaAsset
    from app.services.s3_storage import upload_bytes_to_s3

    image_n = state.get("image_n", 1)
    messages = state.get("messages", [])

    # Extract text prompt from the last HumanMessage
    last_msg = messages[-1] if messages else None
    if last_msg is None:
        return {"finish_reason": "error", "error_message": "No prompt provided for image generation."}

    raw = last_msg.content
    if isinstance(raw, str):
        prompt = raw
    elif isinstance(raw, list):
        prompt = " ".join(
            b.get("text", "") for b in raw if isinstance(b, dict) and b.get("type") == "text"
        )
    else:
        prompt = str(raw)

    if not prompt.strip():
        return {"finish_reason": "error", "error_message": "Image generation requires a text prompt."}

    # Resolve provider connection details
    if conn_info:
        base_url = conn_info["base_url"].rstrip("/")
        api_key = conn_info["api_key"] or "sk-placeholder"
        upstream_model = conn_info["model_id"]
    else:
        _s = get_settings()
        base_url = "https://api.openai.com"
        api_key = _s.OPENAI_API_KEY or "sk-placeholder"
        upstream_model = model_id

    # Normalise base_url — images API uses /v1/images/generations
    if not base_url.endswith("/v1"):
        api_base = f"{base_url}/v1"
    else:
        api_base = base_url

    logger.info(
        "image_generation_start",
        model=upstream_model,
        n=image_n,
        prompt_len=len(prompt),
    )

    try:
        import openai as openai_lib
        client = openai_lib.AsyncOpenAI(api_key=api_key, base_url=api_base)
        # response_format is intentionally omitted: many OpenAI-compatible
        # gateways (including clever-ai-gate) only return a download URL and
        # silently ignore response_format="b64_json". Both url and b64_json
        # are handled in the persistence step below so either works.
        response = await client.images.generate(
            model=upstream_model,
            prompt=prompt,
            n=image_n,
            size="1024x1024",
        )
    except Exception as exc:
        logger.error("image_generation_api_failed", error=str(exc))
        return {
            "finish_reason": "error",
            "error_message": f"Image generation failed: {exc}",
        }

    user_uuid = uuid_mod.UUID(user_id) if isinstance(user_id, str) else user_id

    generated_assets = []

    async with get_db_context() as db:
        for idx, img_data in enumerate(response.data):
            try:
                # Obtain raw image bytes — support both inline b64 and a URL.
                # Many gateways ignore response_format and only return a URL.
                raw_bytes: bytes | None = None
                source_url: str | None = None

                if getattr(img_data, "b64_json", None):
                    raw_bytes = base64.b64decode(img_data.b64_json)
                elif getattr(img_data, "url", None):
                    source_url = img_data.url
                    async with httpx.AsyncClient(timeout=120.0) as dl:
                        dl_resp = await dl.get(source_url)
                        dl_resp.raise_for_status()
                        raw_bytes = dl_resp.content
                else:
                    logger.warning("image_no_payload", index=idx)
                    continue

                if not raw_bytes:
                    logger.warning("image_empty_bytes", index=idx)
                    continue

                # Detect the real format/dimensions (the API often returns
                # WebP rather than the PNG we requested).
                with PILImage.open(io_mod.BytesIO(raw_bytes)) as pil_img:
                    fmt = (pil_img.format or "PNG").upper()
                    width, height = pil_img.size

                ext, mime_type = _IMAGE_FORMAT_MAP.get(fmt, (".png", "image/png"))

                asset_id = uuid_mod.uuid4()
                file_key = f"uploads/{user_uuid}/{asset_id}{ext}"

                # Upload the original to S3 (boto3 is blocking → threadpool).
                uploaded = await run_in_threadpool(
                    upload_bytes_to_s3, raw_bytes, file_key, mime_type
                )
                if not uploaded:
                    logger.error("image_s3_upload_failed", asset_id=str(asset_id))
                    continue

                # Generate + upload a thumbnail. The key must match the pattern
                # used by GET /media/{id}/thumbnail: uploads/{user_id}/{id}_thumb{ext}
                has_thumb = False
                try:
                    def _make_thumb(data: bytes = raw_bytes, save_fmt: str = fmt) -> bytes:
                        thumb_io = io_mod.BytesIO()
                        with PILImage.open(io_mod.BytesIO(data)) as im:
                            im = im.convert("RGB")
                            im.thumbnail((256, 256))
                            im.save(thumb_io, format=save_fmt)
                        return thumb_io.getvalue()

                    thumb_bytes = await run_in_threadpool(_make_thumb)
                    thumb_key = f"uploads/{user_uuid}/{asset_id}_thumb{ext}"
                    await run_in_threadpool(
                        upload_bytes_to_s3, thumb_bytes, thumb_key, mime_type
                    )
                    has_thumb = True
                except Exception as thumb_exc:
                    logger.warning("image_thumb_failed", error=str(thumb_exc))

                # DB record
                asset = MediaAsset(
                    id=asset_id,
                    user_id=user_uuid,
                    file_key=file_key,
                    mime_type=mime_type,
                    original_filename=f"{asset_id}{ext}",
                    size_bytes=len(raw_bytes),
                    width=width,
                    height=height,
                    source_url=source_url,
                    status="completed",
                )
                db.add(asset)
                await db.flush()

                generated_assets.append({
                    "asset_id": str(asset_id),
                    "url": f"/api/v1/media/{asset_id}",
                    "thumbnail_url": f"/api/v1/media/{asset_id}/thumbnail" if has_thumb else f"/api/v1/media/{asset_id}",
                })
                logger.info("image_saved", asset_id=str(asset_id), mime=mime_type)

            except Exception as img_exc:
                logger.error("image_save_failed", error=str(img_exc))

    if not generated_assets:
        return {
            "finish_reason": "error",
            "error_message": "Image generation succeeded but failed to save images.",
        }

    return {
        "generated_image_assets": generated_assets,
        "finish_reason": "image_generated",
        "input_tokens": 0,
        "output_tokens": 0,
    }
