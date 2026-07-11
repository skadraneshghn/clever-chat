"""Response finalizer node — passes graph state metadata back to the SSE endpoint."""

from __future__ import annotations

import structlog

from app.graph.state import AgentState

logger = structlog.get_logger()


async def response_finalizer(state: AgentState) -> dict:
    """Finalize the response after LLM generation.

    This is a lightweight pass-through node. All actual persistence is done
    by the SSE streaming endpoint after the graph completes, because the SSE
    endpoint already holds a DB session and can commit atomically.

    Returns all metadata the SSE endpoint needs to:
    - Persist the AI message with correct execution_status
    - Detect and handle errors (finish_reason='error', error_raised=True)
    - Surface image generation results
    """
    return {
        "finish_reason": state.get("finish_reason", "stop"),
        "error_message": state.get("error_message", ""),
        "error_raised": state.get("error_raised", False),
        "input_tokens": state.get("input_tokens", 0),
        "output_tokens": state.get("output_tokens", 0),
        "generated_image_assets": state.get("generated_image_assets", []),
    }
