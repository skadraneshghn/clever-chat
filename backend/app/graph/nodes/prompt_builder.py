"""Prompt builder node — assemble system prompt + history + retrieved context."""

from __future__ import annotations

from langchain_core.messages import SystemMessage

from app.graph.state import AgentState


def detect_prompt_language(text: str) -> str:
    """Detect the language of the prompt based on character blocks."""
    if not text:
        return "English"

    # Remove digits and basic punctuation to focus on letters
    cleaned = "".join(c for c in text if c.isalpha() or c.isspace())
    if not cleaned.strip():
        return "English"

    total = len(cleaned.replace(" ", ""))
    if total == 0:
        return "English"

    counts = {
        "Arabic/Persian": 0,
        "Cyrillic": 0,
        "CJK": 0,
        "Hiragana/Katakana": 0,
        "Hangul": 0,
        "Latin": 0,
    }

    is_persian = False
    persian_chars = {"گ", "چ", "پ", "ژ", "ی", "ک"}

    for char in cleaned:
        if char.isspace():
            continue
        code = ord(char)

        if 0x0600 <= code <= 0x06FF or 0x0750 <= code <= 0x077F or 0x08A0 <= code <= 0x08FF:
            counts["Arabic/Persian"] += 1
            if char in persian_chars:
                is_persian = True
        elif 0x0400 <= code <= 0x04FF:
            counts["Cyrillic"] += 1
        elif 0x4E00 <= code <= 0x9FFF:
            counts["CJK"] += 1
        elif 0x3040 <= code <= 0x309F or 0x30A0 <= code <= 0x30FF:
            counts["Hiragana/Katakana"] += 1
        elif 0xAC00 <= code <= 0xD7A3:
            counts["Hangul"] += 1
        elif (0x0041 <= code <= 0x005A) or (0x0061 <= code <= 0x007A) or (0x00C0 <= code <= 0x00FF):
            counts["Latin"] += 1

    max_label = max(counts, key=counts.get)
    if counts[max_label] == 0:
        return "English"

    if max_label == "Arabic/Persian":
        return "Persian" if is_persian else "Arabic"
    elif max_label == "Cyrillic":
        return "Russian"
    elif max_label == "CJK":
        return "Chinese"
    elif max_label == "Hiragana/Katakana":
        return "Japanese"
    elif max_label == "Hangul":
        return "Korean"
    elif max_label == "Latin":
        lower_text = cleaned.lower().split()
        es_words = {"el", "la", "los", "las", "un", "una", "y", "en", "para", "con"}
        fr_words = {"le", "la", "les", "un", "une", "et", "en", "pour", "avec", "dans"}
        de_words = {"der", "die", "das", "ein", "eine", "und", "in", "für", "mit", "von"}
        it_words = {"il", "la", "i", "gli", "le", "un", "una", "e", "in", "per", "con"}

        if any(w in lower_text for w in es_words):
            return "Spanish"
        if any(w in lower_text for w in fr_words):
            return "French"
        if any(w in lower_text for w in de_words):
            return "German"
        if any(w in lower_text for w in it_words):
            return "Italian"
        return "English"

    return "English"


async def prompt_builder(state: AgentState) -> dict:
    """Build the full prompt with system instructions and optional RAG context.

    Prepends a system message with:
    - User's system prompt (or default)
    - Auto-detected prompt language constraints
    - Retrieved context chunks (if any)
    - Media transcriptions (if any)
    """
    system_prompt = state.get("system_prompt", "You are a helpful AI assistant.")
    retrieved_context = state.get("retrieved_context", [])
    media_refs = state.get("media_refs", [])
    messages = list(state.get("messages", []))

    # Detect user's prompt language from the latest HumanMessage
    user_prompt = ""
    for msg in reversed(messages):
        if getattr(msg, "type", "") == "human" or msg.__class__.__name__ == "HumanMessage":
            user_prompt = msg.content if isinstance(msg.content, str) else str(msg.content)
            break

    detected_lang = detect_prompt_language(user_prompt)
    if detected_lang:
        system_prompt += (
            f"\n\n[System Language Constraint]: The user's prompt language "
            f"is detected as {detected_lang}. "
            f"You MUST write your entire response in {detected_lang}."
        )

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
    if messages and isinstance(messages[0], SystemMessage):
        messages[0] = SystemMessage(content=full_prompt)
    else:
        messages.insert(0, SystemMessage(content=full_prompt))

    return {"messages": messages}
