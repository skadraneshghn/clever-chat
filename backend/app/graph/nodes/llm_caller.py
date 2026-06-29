"""LLM caller node — streams tokens from the selected LLM provider."""

from __future__ import annotations

import structlog
from langchain_anthropic import ChatAnthropic
from langchain_openai import ChatOpenAI

from app.core.config import get_settings
from app.graph.state import AgentState

logger = structlog.get_logger()

# ── LLM Factory ──────────────────────────────────────────────────────────────

_llm_cache: dict[str, object] = {}


def get_llm(model_id: str, temperature: float = 0.7, max_tokens: int = 4096):
    """Return a LangChain LLM instance for the given model ID."""
    settings = get_settings()
    cache_key = f"{model_id}:{temperature}:{max_tokens}"
    
    if cache_key in _llm_cache:
        return _llm_cache[cache_key]
    
    # Determine provider from model ID
    if model_id.startswith(("gpt-", "o1", "o3", "o4")):
        llm = ChatOpenAI(
            model=model_id,
            temperature=temperature,
            max_tokens=max_tokens,
            api_key=settings.OPENAI_API_KEY,
            streaming=True,
        )
    elif model_id.startswith(("claude-",)):
        llm = ChatAnthropic(
            model=model_id,
            temperature=temperature,
            max_tokens=max_tokens,
            api_key=settings.ANTHROPIC_API_KEY,
        )
    else:
        # Default to OpenAI
        llm = ChatOpenAI(
            model=model_id,
            temperature=temperature,
            max_tokens=max_tokens,
            api_key=settings.OPENAI_API_KEY,
            streaming=True,
        )
    
    _llm_cache[cache_key] = llm
    return llm


# ── LLM Caller Node ─────────────────────────────────────────────────────────


async def llm_caller(state: AgentState) -> dict:
    """Call the LLM and return the response.
    
    Note: Streaming is handled at the graph level via astream_events.
    This node invokes the LLM and returns the complete response.
    """
    model_id = state.get("model_id", "gpt-4o")
    temperature = state.get("temperature", 0.7)
    max_tokens = state.get("max_tokens", 4096)
    
    llm = get_llm(model_id, temperature, max_tokens)
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
