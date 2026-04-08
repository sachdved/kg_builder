"""MCP server exposing kg_builder tools for agentic coding environments.

Runs as a stdio MCP server that Claude Code, Cursor, and Windsurf
can connect to. Manages a cached KG instance and exposes all
kg_builder tools as native MCP tools.

Usage:
    python -m kg_builder.mcp_server                    # serves current directory
    python -m kg_builder.mcp_server /path/to/project   # serves specific project

Configuration (in .claude/settings.json):
    {
      "mcpServers": {
        "kg-builder": {
          "type": "stdio",
          "command": "python",
          "args": ["-m", "kg_builder.mcp_server"]
        }
      }
    }
"""

import json
import os
import sys
from typing import Optional

from mcp.server.fastmcp import FastMCP

# Initialize MCP server
mcp = FastMCP(
    "kg-builder",
    instructions="Knowledge graph tools for understanding and planning code changes in Python codebases.",
)

# --- KG State Management ---

_kg_cache: dict = {
    "kg": None,
    "kg_dict": None,
    "codebase_path": None,
}


def _get_codebase_path() -> str:
    """Get the codebase path from args or environment."""
    if len(sys.argv) > 1:
        return os.path.abspath(sys.argv[1])
    return os.getcwd()


def _ensure_kg():
    """Build or return the cached KG. Rebuilds if codebase path changed."""
    codebase = _get_codebase_path()

    if _kg_cache["kg"] is not None and _kg_cache["codebase_path"] == codebase:
        return _kg_cache["kg"], _kg_cache["kg_dict"]

    from kg_builder import build_knowledge_graph

    kg = build_knowledge_graph(codebase, exclude_patterns=["**/venv/*", "**/.venv/*", "**/node_modules/*", "**/__pycache__/*"])
    kg_dict = kg.to_dict()

    _kg_cache["kg"] = kg
    _kg_cache["kg_dict"] = kg_dict
    _kg_cache["codebase_path"] = codebase

    return kg, kg_dict


# --- Tools ---


@mcp.tool()
def kg_rebuild() -> str:
    """Rebuild the knowledge graph from the current codebase.

    Call this after significant file changes to refresh the graph.
    Returns a summary of what was parsed.
    """
    _kg_cache["kg"] = None  # Force rebuild
    kg, kg_dict = _ensure_kg()

    entity_count = len(kg_dict["entities"])
    rel_count = len(kg_dict["relationships"])
    files = set(e["file_path"] for e in kg_dict["entities"].values())

    return json.dumps({
        "success": True,
        "entities": entity_count,
        "relationships": rel_count,
        "files_parsed": len(files),
        "codebase_path": _kg_cache["codebase_path"],
    })


@mcp.tool()
def kg_find_entity(
    query: str,
    entity_type: Optional[str] = None,
    file_path: Optional[str] = None,
    fuzzy: bool = True,
    max_results: int = 10,
) -> str:
    """Search for entities (classes, functions, variables) in the knowledge graph.

    Args:
        query: Name or partial name to search for (e.g., "parse_file", "User")
        entity_type: Filter by type: CLASS, FUNCTION, ASYNC_FUNCTION, FILE, MODULE, CONSTANT, VARIABLE, IMPORT, DECORATOR
        file_path: Filter to entities in a specific file path
        fuzzy: If true, matches substrings. If false, exact match only.
        max_results: Maximum results to return
    """
    kg, _ = _ensure_kg()
    from kg_builder.tools.find_entity import kg_find_entity as _find
    return json.dumps(_find(kg, query, entity_type, file_path, fuzzy, max_results))


@mcp.tool()
def kg_get_neighbors(
    entity_id: str,
    direction: str = "both",
    relationship_types: Optional[str] = None,
    max_results: int = 20,
) -> str:
    """Get entities connected to a given entity through relationships.

    Args:
        entity_id: The entity ID (e.g., "parser.py::parse_file")
        direction: "outgoing" (dependencies), "incoming" (dependents), or "both"
        relationship_types: Comma-separated filter (e.g., "CALLS,INHERITS"). Options: CONTAINS, CALLS, INHERITS, IMPORTS, INSTANTIATES, DEFINES_IN, USES, IMPORTS_RESOLVED_TO, CALLS_RESOLVED
        max_results: Maximum neighbors to return
    """
    kg, _ = _ensure_kg()
    from kg_builder.tools.get_neighbors import kg_get_neighbors as _neighbors

    rel_types = relationship_types.split(",") if relationship_types else None
    return json.dumps(_neighbors(kg, entity_id, direction, rel_types, max_results))


@mcp.tool()
def kg_get_callers(
    entity_id: str,
    max_depth: int = 1,
) -> str:
    """Find all entities that call a given function or class.

    Args:
        entity_id: The entity ID to find callers for
        max_depth: How many levels of transitive callers to include (1 = direct only)
    """
    kg, _ = _ensure_kg()
    from kg_builder.tools.get_callers import kg_get_callers as _callers
    return json.dumps(_callers(kg, entity_id, max_depth))


@mcp.tool()
def kg_extract_context(
    entity_id: str,
    max_hops: int = 1,
    exclude_types: Optional[str] = None,
) -> str:
    """Extract source code for an entity and its neighbors.

    Loads actual code snippets from the filesystem for the entity
    and its n-hop neighbors. Useful for understanding context before
    making changes.

    Args:
        entity_id: The entity ID to extract context for
        max_hops: How many hops of neighbors to include (1-3 recommended)
        exclude_types: Comma-separated entity types to skip (e.g., "IMPORT,VARIABLE")
    """
    kg, _ = _ensure_kg()
    from kg_builder.tools.extract_context import kg_extract_context as _context

    excl = exclude_types.split(",") if exclude_types else None
    return json.dumps(_context(kg, entity_id, max_hops, excl))


@mcp.tool()
def kg_traverse(
    start_entity_ids: str,
    max_hops: int = 2,
    include_relationships: Optional[str] = None,
    exclude_types: Optional[str] = None,
) -> str:
    """Breadth-first traversal from one or more starting entities.

    Discovers all entities reachable within n hops. Useful for
    impact analysis and understanding dependency scope.

    Args:
        start_entity_ids: Comma-separated entity IDs to start from
        max_hops: Maximum traversal depth (1-4 recommended)
        include_relationships: Comma-separated relationship types to follow (e.g., "CALLS,INHERITS"). Default: all.
        exclude_types: Comma-separated entity types to skip (e.g., "IMPORT,VARIABLE")
    """
    kg, _ = _ensure_kg()
    from kg_builder.tools.traverse import kg_traverse as _traverse

    start_ids = [s.strip() for s in start_entity_ids.split(",")]
    incl_rels = include_relationships.split(",") if include_relationships else None
    excl_types = exclude_types.split(",") if exclude_types else None
    return json.dumps(_traverse(kg, start_ids, max_hops, incl_rels, excl_types))


@mcp.tool()
def kg_resolve_import(
    import_entity_id: str,
) -> str:
    """Resolve an import statement to its actual definition across files.

    Args:
        import_entity_id: The ID of an IMPORT entity to resolve
    """
    kg, _ = _ensure_kg()
    from kg_builder.tools.resolve_import import kg_resolve_import as _resolve
    return json.dumps(_resolve(kg, import_entity_id))


@mcp.tool()
def kg_diff(
    existing_kg_path: str,
    proposed_kg_path: str,
) -> str:
    """Compare two knowledge graph JSON files and produce a change specification.

    Args:
        existing_kg_path: Path to the base/existing KG JSON file
        proposed_kg_path: Path to the proposed KG JSON file
    """
    from kg_builder.planning.kg_diff import diff_knowledge_graphs

    with open(existing_kg_path, "r") as f:
        existing = json.load(f)
    with open(proposed_kg_path, "r") as f:
        proposed = json.load(f)

    spec = diff_knowledge_graphs(existing, proposed)
    return spec.to_json()


@mcp.tool()
def kg_generate_plan(
    change_spec_path: str,
    existing_kg_path: Optional[str] = None,
) -> str:
    """Generate an edit plan from a change specification.

    Reads a change spec (from kg_diff or viz export) and produces
    a structured plan showing which files to edit, what to change,
    and context from neighboring code.

    Args:
        change_spec_path: Path to the change spec JSON file
        existing_kg_path: Optional path to existing KG JSON (for loading neighbor code context)
    """
    from kg_builder.planning.agent_planner import generate_edit_plan
    from kg_builder.planning.kg_diff import ChangeSpec

    with open(change_spec_path, "r") as f:
        spec = ChangeSpec.from_json(f.read())

    existing_kg = None
    if existing_kg_path:
        with open(existing_kg_path, "r") as f:
            existing_kg = json.load(f)

    plan = generate_edit_plan(spec, _get_codebase_path(), existing_kg)
    return plan.to_markdown()


@mcp.tool()
def kg_impact_analysis(
    entity_name: str,
    depth: int = 2,
) -> str:
    """Analyze the impact of changing a specific entity.

    Shows what code depends on this entity, how many files are affected,
    and a risk assessment (LOW/MEDIUM/HIGH).

    Args:
        entity_name: Name of the entity to analyze (e.g., "parse_file", "KGQueryEngine")
        depth: How many hops of dependencies to check (1-3)
    """
    _ensure_kg()
    from kg_builder.agents.agent_helper import analyze_impact

    result = analyze_impact(entity_name, codebase=_get_codebase_path(), depth=depth)
    return json.dumps(result)


@mcp.tool()
def kg_understand_function(
    function_name: str,
) -> str:
    """Get complete context for a function: its code, what it calls, and who calls it.

    Args:
        function_name: Name of the function to understand
    """
    _ensure_kg()
    from kg_builder.agents.agent_helper import understand_function

    result = understand_function(function_name, codebase=_get_codebase_path())
    return json.dumps(result)


@mcp.tool()
def kg_export(
    output_path: Optional[str] = None,
) -> str:
    """Export the current knowledge graph as a JSON file.

    Args:
        output_path: Where to write the JSON. Default: kg_current.json in the project root.
    """
    kg, kg_dict = _ensure_kg()

    if output_path is None:
        output_path = os.path.join(_get_codebase_path(), "kg_current.json")

    with open(output_path, "w") as f:
        json.dump(kg_dict, f, indent=2)

    return json.dumps({
        "success": True,
        "path": output_path,
        "entities": len(kg_dict["entities"]),
        "relationships": len(kg_dict["relationships"]),
    })


# --- Entry point ---

def main():
    mcp.run(transport="stdio")


if __name__ == "__main__":
    main()
