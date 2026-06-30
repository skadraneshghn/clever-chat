"""Title generation service — uses the active LLM to produce a short, meaningful
conversation title from the first user message and AI response."""

from __future__ import annotations

import re

import structlog

logger = structlog.get_logger()

# Prompt that instructs the LLM to produce only a short title — no extras.
_TITLE_SYSTEM_PROMPT = (
    "You are a conversation title generator. "
    "Your ONLY job is to output a short, descriptive title (3–8 words) that captures "
    "the main topic of the conversation. "
    "Rules: "
    "- Output ONLY the title text, nothing else. "
    "- No quotes, no punctuation at the end, no explanations. "
    "- Be specific and meaningful — avoid generic phrases like 'Chat about X'. "
    "- Write in the same language as the user's message. "
    "Examples of good titles: "
    "'Python async/await best practices', "
    "'Comparing React and Vue frameworks', "
    "'Recipe ideas for a vegan dinner party', "
    "'Debugging a segfault in C', "
    "'Marketing copy for a SaaS landing page'"
)

_TITLE_USER_TEMPLATE = (
    "User message: {user_message}\n\n"
    "Assistant reply (first 400 chars): {ai_snippet}\n\n"
    "Generate a short title for this conversation:"
)

_MAX_TITLE_LEN = 100


def _clean_title(raw: str) -> str:
    """Strip quotes, trailing punctuation, and excessive whitespace."""
    title = raw.strip().strip('"\'')
    # Remove a trailing period/colon if present
    title = re.sub(r'[.:]$', '', title).strip()
    if len(title) > _MAX_TITLE_LEN:
        title = title[:_MAX_TITLE_LEN].rsplit(' ', 1)[0]
    return title or "New Chat"


async def generate_title(
    user_message: str,
    ai_response: str,
    model_id: str,
    user_id: str,
) -> str:
    """Call the LLM to produce a short, meaningful conversation title.

    Falls back to a truncated first-message title if anything goes wrong,
    so this never raises.
    """
    from langchain_core.messages import HumanMessage, SystemMessage
    from app.graph.nodes.llm_caller import _resolve_connection, _build_llm, _build_legacy_llm

    try:
        prompt_text = _TITLE_USER_TEMPLATE.format(
            user_message=user_message[:500],
            ai_snippet=ai_response[:400],
        )

        # Re-use the same provider resolution as the main chat
        conn_info = await _resolve_connection(model_id, user_id)
        if conn_info:
            llm = _build_llm(
                model_id=conn_info["model_id"],
                provider_type=conn_info["provider_type"],
                base_url=conn_info["base_url"],
                api_key=conn_info["api_key"],
                capabilities=conn_info["capabilities"],
                # Low temperature for deterministic, concise output
                temperature=0.3,
                max_tokens=30,
            )
        else:
            llm = _build_legacy_llm(model_id, temperature=0.3, max_tokens=30)

        messages = [
            SystemMessage(content=_TITLE_SYSTEM_PROMPT),
            HumanMessage(content=prompt_text),
        ]
        response = await llm.ainvoke(messages)
        raw_title = response.content if isinstance(response.content, str) else ""
        title = _clean_title(raw_title)
        logger.info("title_generated", title=title, model_id=model_id)
        return title

    except Exception as exc:
        logger.warning("title_generation_failed", error=str(exc), model_id=model_id)
        # Graceful fallback: truncate user message
        fallback = user_message[:80].strip()
        if len(user_message) > 80:
            fallback += "…"
        return fallback or "New Chat"
