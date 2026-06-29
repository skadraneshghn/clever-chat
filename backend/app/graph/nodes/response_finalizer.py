"""Response finalizer node — persists the AI message to the database."""

from __future__ import annotations

import structlog

from app.graph.state import AgentState

logger = structlog.get_logger()


async def response_finalizer(state: AgentState) -> dict:
    """Finalize the response after LLM generation.
    
    This node:
    1. Marks the conversation as complete
    2. Message persistence is handled by the SSE endpoint after stream completes
    3. Returns metadata for the frontend
    """
    return {
        "finish_reason": state.get("finish_reason", "stop"),
        "error_message": state.get("error_message", ""),
        "input_tokens": state.get("input_tokens", 0),
        "output_tokens": state.get("output_tokens", 0),
    }
