"""Tool functions for programmatic access to knowledge graph capabilities.

This module provides tool functions that can be auto-invoked by LLM agents
to query the knowledge graph for code understanding before making changes.

Each tool returns a structured dict with "success": bool as the first key,
making them easy to parse and use in automated workflows.

Example usage:

    from kg_builder import build_knowledge_graph
    from kg_builder.tools import kg_find_entity, KGCacheManager

    # Use cache manager for efficient repeated queries
    cache = KGCacheManager("/path/to/project")
    kg = cache.get_or_build()

    # Find entities
    result = kg_find_entity(kg, "parse_file")
    if result["success"]:
        for entity in result["matches"]:
            print(f"Found: {entity['name']} at {entity['file_path']}")
"""

from typing import Any, Callable

# Tool registry for dynamic discovery
TOOL_REGISTRY: dict[str, Callable] = {}


def register_tool(name: str) -> Callable[[Callable], Callable]:
    """Register a tool function with the registry.

    Args:
        name: The name of the tool (e.g., "kg_find_entity").

    Returns:
        Decorator that registers the decorated function.

    Example:
        @register_tool("my_tool")
        def my_tool(...):
            ...
    """
    def decorator(func: Callable) -> Callable:
        TOOL_REGISTRY[name] = func
        return func
    return decorator


# Import tool functions - they will register themselves
from kg_builder.tools.cache_manager import KGCacheManager  # noqa: E402
from kg_builder.tools.find_entity import kg_find_entity  # noqa: E402
from kg_builder.tools.get_neighbors import kg_get_neighbors  # noqa: E402
from kg_builder.tools.extract_context import kg_extract_context  # noqa: E402
from kg_builder.tools.get_callers import kg_get_callers  # noqa: E402
from kg_builder.tools.traverse import kg_traverse  # noqa: E402
from kg_builder.tools.resolve_import import kg_resolve_import  # noqa: E402


__all__ = [
    "TOOL_REGISTRY",
    "register_tool",
    "KGCacheManager",
    "kg_find_entity",
    "kg_get_neighbors",
    "kg_extract_context",
    "kg_get_callers",
    "kg_traverse",
    "kg_resolve_import",
]
