"""Agent integration layer.

This submodule provides high-level helper functions for LLM agents to query
the knowledge graph before making code changes:
- understand_function: get context about a function
- analyze_impact: assess risk of changes
- find_all_by_pattern: discover entities matching a pattern
- get_import_deps: analyze file dependencies
"""

from kg_builder.agents.agent_helper import (
    understand_function,
    analyze_impact,
    find_all_by_pattern,
    get_import_deps,
)

__all__ = [
    "understand_function",
    "analyze_impact",
    "find_all_by_pattern",
    "get_import_deps",
]
