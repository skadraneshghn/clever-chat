"""LangGraph agent state definition."""

from __future__ import annotations

from typing import Annotated, TypedDict

from langchain_core.messages import BaseMessage
from langgraph.graph.message import add_messages


class AgentState(TypedDict):
    """State tracked through the LangGraph execution graph."""

    # ── Core Conversation ────────────────────────────────────────
    messages: Annotated[list[BaseMessage], add_messages]
    thread_id: str
    user_id: str

    # ── User Config Overrides ────────────────────────────────────
    model_id: str
    temperature: float
    max_tokens: int
    system_prompt: str

    # ── RAG / Retrieval ──────────────────────────────────────────
    retrieved_context: list[str]
    search_performed: bool

    # ── Media ────────────────────────────────────────────────────
    media_refs: list[dict]  # [{type, url, mime_type, transcription}]

    # ── Tool Execution ───────────────────────────────────────────
    tool_calls: list[dict]
    tool_results: list[dict]

    # ── Routing Signals ──────────────────────────────────────────
    needs_retrieval: bool
    needs_tool_use: bool

    # ── Output Metadata ──────────────────────────────────────────
    input_tokens: int
    output_tokens: int
    finish_reason: str
