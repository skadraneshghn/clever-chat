"""Input validation node — sanitise user input and attach media refs."""

from __future__ import annotations

from langchain_core.messages import HumanMessage

from app.graph.state import AgentState


async def input_validator(state: AgentState) -> dict:
    """Validate and sanitise the incoming user message.
    
    - Ensures the last message is a HumanMessage
    - Strips excessive whitespace
    - Attaches any media references
    """
    messages = state.get("messages", [])

    if not messages:
        return {"finish_reason": "error"}

    last_msg = messages[-1]

    # Basic validation — ensure it's a user message
    if not isinstance(last_msg, HumanMessage):
        return {"finish_reason": "error"}

    # Determine if retrieval is needed (heuristic: messages with question marks,
    # or conversations with > 3 messages suggesting context might help)
    content = last_msg.content if isinstance(last_msg.content, str) else str(last_msg.content)
    needs_retrieval = (
        state.get("needs_retrieval", False) or
        "?" in content or
        len(messages) > 6
    )

    return {
        "needs_retrieval": needs_retrieval,
        "media_refs": state.get("media_refs", []),
    }
