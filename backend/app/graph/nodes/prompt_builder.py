"""Prompt builder node — assemble system prompt + history + retrieved context."""

from __future__ import annotations

from langchain_core.messages import SystemMessage

from app.graph.state import AgentState


async def prompt_builder(state: AgentState) -> dict:
    """Build the full prompt with system instructions and optional RAG context.
    
    Prepends a system message with:
    - User's system prompt (or default)
    - Retrieved context chunks (if any)
    - Media transcriptions (if any)
    """
    system_prompt = state.get("system_prompt", "You are a helpful AI assistant.")
    retrieved_context = state.get("retrieved_context", [])
    media_refs = state.get("media_refs", [])
    
    # Build enhanced system prompt
    prompt_parts = [system_prompt]
    
    # Add retrieved context
    if retrieved_context:
        context_text = "\n\n".join(retrieved_context)
        prompt_parts.append(
            f"\n\n--- Relevant Context ---\n{context_text}\n--- End Context ---"
        )
    
    # Add media transcriptions
    for ref in media_refs:
        if ref.get("transcription"):
            prompt_parts.append(
                f"\n\n[Audio Transcription]: {ref['transcription']}"
            )
    
    full_prompt = "\n".join(prompt_parts)
    
    # Insert or replace system message at the beginning
    messages = list(state.get("messages", []))
    if messages and isinstance(messages[0], SystemMessage):
        messages[0] = SystemMessage(content=full_prompt)
    else:
        messages.insert(0, SystemMessage(content=full_prompt))
    
    return {"messages": messages}
