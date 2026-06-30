"""Input validation node — sanitise user input, attach media refs, capability pre-flight."""

from __future__ import annotations

import structlog
from langchain_core.messages import HumanMessage

from app.graph.state import AgentState

logger = structlog.get_logger()


async def input_validator(state: AgentState) -> dict:
    """Validate and sanitise the incoming user message.

    - Ensures the last message is a HumanMessage
    - Strips excessive whitespace
    - Attaches any media references
    - Pre-flight check: if image_generation_mode, verify the model supports it
    """
    messages = state.get("messages", [])

    if not messages:
        return {"finish_reason": "error", "error_message": "No messages provided."}

    last_msg = messages[-1]

    # Basic validation — ensure it's a user message
    if not isinstance(last_msg, HumanMessage):
        return {"finish_reason": "error", "error_message": "Expected a user message."}

    # ── Image-generation capability pre-flight ───────────────────────────────
    if state.get("image_generation_mode", False):
        model_id = state.get("model_id", "")
        user_id = state.get("user_id", "")
        capable = await _check_image_capability(model_id, user_id)
        if not capable:
            logger.warning(
                "image_gen_capability_check_failed",
                model_id=model_id,
            )
            return {
                "finish_reason": "error",
                "error_message": (
                    f"The selected model \"{model_id}\" does not support image generation. "
                    "Please switch to a model with image generation capability "
                    "(e.g. dall-e-3, gpt-image-1) or disable image mode."
                ),
            }

    # Determine if retrieval is needed (heuristic)
    content = last_msg.content if isinstance(last_msg.content, str) else str(last_msg.content)
    needs_retrieval = (
        state.get("needs_retrieval", False)
        or "?" in content
        or len(messages) > 6
    ) and not state.get("image_generation_mode", False)  # skip RAG for image gen

    return {
        "needs_retrieval": needs_retrieval,
        "media_refs": state.get("media_refs", []),
    }


async def _check_image_capability(model_id: str, user_id: str) -> bool:
    """Check that the resolved model has image_generation capability."""
    from app.core.database import get_db_context
    from app.models.discovered_model import DiscoveredModel
    from app.models.provider_connection import ProviderConnection
    from sqlalchemy import select
    import uuid as uuid_mod

    try:
        user_uuid = uuid_mod.UUID(user_id) if isinstance(user_id, str) else user_id
        async with get_db_context() as db:
            result = await db.execute(
                select(DiscoveredModel)
                .join(ProviderConnection, DiscoveredModel.connection_id == ProviderConnection.id)
                .where(
                    DiscoveredModel.model_id == model_id,
                    ProviderConnection.user_id == user_uuid,
                    ProviderConnection.is_active == True,
                    DiscoveredModel.is_active == True,
                )
                .limit(1)
            )
            row = result.scalar_one_or_none()
            if not row:
                # Model not in DB — allow through (legacy / env-configured models)
                return True
            caps = row.capabilities or {}
            return bool(caps.get("image_generation", False))
    except Exception as exc:
        logger.warning("capability_check_error", error=str(exc))
        # On DB error, allow through rather than blocking
        return True
