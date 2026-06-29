"""LangGraph state graph builder and compilation."""

from __future__ import annotations

from langgraph.graph import END, StateGraph

from app.graph.nodes.input_validator import input_validator
from app.graph.nodes.llm_caller import llm_caller
from app.graph.nodes.prompt_builder import prompt_builder
from app.graph.nodes.response_finalizer import response_finalizer
from app.graph.state import AgentState


def _route_after_llm(state: AgentState) -> str:
    """Conditional routing after LLM response."""
    finish_reason = state.get("finish_reason", "stop")
    
    if finish_reason == "error":
        return "response_finalizer"
    
    # Check for tool calls (future: route to tool_executor)
    # For now, always go to response_finalizer
    return "response_finalizer"


def build_graph() -> StateGraph:
    """Build and compile the LangGraph state graph.
    
    Graph flow:
        START → input_validator → prompt_builder → llm_caller → response_finalizer → END
    
    Future additions:
        - context_retriever (RAG node, Phase 3)
        - tool_executor (tool calls, Phase 2)
        - error_handler (retry logic)
    """
    graph = StateGraph(AgentState)
    
    # Add nodes
    graph.add_node("input_validator", input_validator)
    graph.add_node("prompt_builder", prompt_builder)
    graph.add_node("llm_caller", llm_caller)
    graph.add_node("response_finalizer", response_finalizer)
    
    # Define edges
    graph.set_entry_point("input_validator")
    graph.add_edge("input_validator", "prompt_builder")
    graph.add_edge("prompt_builder", "llm_caller")
    graph.add_conditional_edges("llm_caller", _route_after_llm, {
        "response_finalizer": "response_finalizer",
    })
    graph.add_edge("response_finalizer", END)
    
    return graph


# ── Compiled graph singleton ─────────────────────────────────────────────────

_compiled_graph = None


def get_compiled_graph():
    """Return the compiled graph (singleton)."""
    global _compiled_graph
    if _compiled_graph is None:
        _compiled_graph = build_graph().compile()
    return _compiled_graph


def reset_graph():
    """Reset the compiled graph (useful for testing)."""
    global _compiled_graph
    _compiled_graph = None
