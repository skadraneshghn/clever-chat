"""LangGraph agent state definition."""

from __future__ import annotations

from typing import TypedDict

from langchain_core.messages import BaseMessage


class AgentState(TypedDict):
    """State tracked through the LangGraph execution graph."""

    # ── Core Conversation ────────────────────────────────────────
    messages: list[BaseMessage]
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
    error_message: str

    # ── Image Generation ─────────────────────────────────────────────────────
    image_generation_mode: bool         # True when user requests image gen
    image_n: int                        # Number of images to generate (1-4)
    generated_image_assets: list[dict]  # [{asset_id, url, thumbnail_url}]

    # ── Error Handling ───────────────────────────────────────────────────────
    # Set to True by llm_caller when an exception occurs. The graph routes to
    # response_finalizer regardless, which cascades the error to the SSE endpoint.
    error_raised: bool
