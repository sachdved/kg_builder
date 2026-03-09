"""Agent helper functions for knowledge graph-guided code understanding.

This module provides high-level functions that agents should use BEFORE
making code changes to understand the context and impact of their modifications.

Example usage:

    from kg_builder.agent_helper import understand_function, analyze_impact

    # Before modifying a function, understand it first
    info = understand_function("parse_file", ".")
    print(f"Function is called by: {info['called_by']}")

    # Before refactoring, analyze impact
    impact = analyze_impact("KGQueryEngine", ".")
    if impact["risk_level"] == "HIGH":
        print("Warning: High risk change!")
"""

from typing import Any


def understand_function(
    name: str,
    codebase: str = ".",
) -> dict[str, Any]:
    """Get context about a function before modifying it.

    This is the PRIMARY function agents should call before working with any
    function. It returns:
    - Function details (location, type, etc.)
    - Who calls this function (direct callers)
    - Code snippets of the function and related entities

    Args:
        name: The function/class name to understand.
        codebase: Path to codebase (default: current directory).

    Returns:
        {
            "success": bool,
            "function": dict with entity info,
            "called_by": list of caller names,
            "context": code snippets organized by file,
            "error": str (if success=False)
        }

    Example:
        >>> info = understand_function("parse_file")
        >>> print(info["function"]["file_path"])
        kg_builder/parser.py
    """
    try:
        from kg_builder.tools import (
            KGCacheManager,
            kg_find_entity,
            kg_get_callers,
            kg_extract_context,
        )

        # Build or load cached KG
        cache = KGCacheManager(codebase)
        kg = cache.get_or_build()

        # Find the function (fuzzy match to handle variations)
        find_result = kg_find_entity(kg, name, fuzzy=True, max_results=5)

        if not find_result["matches"]:
            return {
                "success": False,
                "function": None,
                "called_by": [],
                "context": {},
                "error": f"Function '{name}' not found in codebase",
            }

        entity_id = find_result["matches"][0]["id"]

        # Get callers (who uses this function?)
        callers_result = kg_get_callers(kg, entity_id, max_depth=1)
        direct_callers = callers_result.get("direct_callers", [])

        # Extract code context
        context_result = kg_extract_context(
            kg, entity_id, max_hops=1, exclude_types=["IMPORT", "VARIABLE"]
        )

        return {
            "success": True,
            "function": find_result["matches"][0],
            "called_by": direct_callers[:5],  # Top 5 callers
            "context": context_result.get("context", {}),
            "total_callers": len(direct_callers),
        }

    except Exception as e:
        return {
            "success": False,
            "function": None,
            "called_by": [],
            "context": {},
            "error": f"Error understanding '{name}': {str(e)}",
        }


def analyze_impact(
    entity_name: str,
    codebase: str = ".",
    depth: int = 2,
) -> dict[str, Any]:
    """Analyze what will break if this entity changes.

    Agents should call this before refactoring or making breaking changes.

    Args:
        entity_name: Name of entity to analyze.
        codebase: Path to codebase.
        depth: How far to traverse for transitive impact (1-4).

    Returns:
        {
            "success": bool,
            "entity": dict with entity info,
            "direct_impact": list of directly affected entities,
            "transitive_impact": list of transitively affected entities,
            "files_affected": list of file paths,
            "risk_level": "LOW" | "MEDIUM" | "HIGH",
            "reasons": list of risk assessment reasons,
            "error": str (if success=False)
        }

    Example:
        >>> impact = analyze_impact("KGQueryEngine")
        >>> if impact["risk_level"] == "HIGH":
        ...     print("Consider careful testing!")
    """
    try:
        from kg_builder.tools import (
            KGCacheManager,
            kg_find_entity,
            kg_get_callers,
            kg_traverse,
        )

        # Build or load cached KG
        cache = KGCacheManager(codebase)
        kg = cache.get_or_build()

        # Find the entity
        find_result = kg_find_entity(kg, entity_name, fuzzy=True, max_results=1)

        if not find_result["matches"]:
            return {
                "success": False,
                "entity": None,
                "direct_impact": [],
                "transitive_impact": [],
                "files_affected": [],
                "risk_level": "UNKNOWN",
                "reasons": [],
                "error": f"Entity '{entity_name}' not found",
            }

        entity_id = find_result["matches"][0]["id"]

        # Get callers (reverse dependencies)
        callers_result = kg_get_callers(kg, entity_id, max_depth=depth)
        direct_callers = callers_result.get("direct_callers", [])
        transitive_callers = callers_result.get("transitive_callers", [])

        # Traverse to find all affected files
        traverse_result = kg_traverse(
            kg, [entity_id], max_hops=depth, include_relationships=["CALLS"]
        )

        files_affected = set()
        for detail in traverse_result.get("entity_details", []):
            if "file_path" in detail:
                files_affected.add(detail["file_path"])

        # Assess risk
        total_affected = len(direct_callers) + len(transitive_callers)

        reasons = []
        if total_affected == 0:
            risk_level = "LOW"
            reasons.append("No other entities depend on this")
        elif total_affected >= 20:
            risk_level = "HIGH"
            reasons.append(f"High reach: {total_affected} entities affected")
        elif total_affected >= 10:
            risk_level = "MEDIUM"
            reasons.append(f"Moderate reach: {total_affected} entities affected")
        else:
            risk_level = "LOW"
            reasons.append(f"Low reach: {total_affected} entities affected")

        if len(files_affected) >= 5:
            risk_level = max(risk_level, "MEDIUM", key=lambda x: ["LOW", "MEDIUM", "HIGH"].index(x))
            reasons.append(f"Cross-file impact: {len(files_affected)} files involved")

        return {
            "success": True,
            "entity": find_result["matches"][0],
            "direct_impact": direct_callers[:5],
            "transitive_impact": transitive_callers[:10],
            "files_affected": list(files_affected)[:10],
            "risk_level": risk_level,
            "reasons": reasons,
        }

    except Exception as e:
        return {
            "success": False,
            "entity": None,
            "direct_impact": [],
            "transitive_impact": [],
            "files_affected": [],
            "risk_level": "UNKNOWN",
            "reasons": [],
            "error": f"Error analyzing impact: {str(e)}",
        }


def find_all_by_pattern(
    pattern: str,
    entity_type: str | None = None,
    codebase: str = ".",
) -> list[dict[str, Any]]:
    """Find all entities matching a pattern.

    Useful for refactoring tasks like "extract all validation logic".

    Args:
        pattern: Name pattern to search for (uses fuzzy match).
        entity_type: Optional type filter ("CLASS", "FUNCTION", etc.).
        codebase: Path to codebase.

    Returns:
        List of entity dicts matching the pattern.

    Example:
        >>> validators = find_all_by_pattern("validate", "FUNCTION")
        >>> for v in validators:
        ...     print(f"{v['name']} at {v['file_path']}")
    """
    try:
        from kg_builder.tools import KGCacheManager, kg_find_entity

        cache = KGCacheManager(codebase)
        kg = cache.get_or_build()

        result = kg_find_entity(kg, pattern, fuzzy=True, entity_type=entity_type)

        return [
            {
                "id": m["id"],
                "name": m["name"],
                "type": m["type"],
                "file_path": m["file_path"],
                "line_number": m["line_number"],
            }
            for m in result.get("matches", [])
        ]

    except Exception as e:
        return [{"error": str(e)}]


def get_import_deps(
    file_path: str,
    codebase: str = ".",
) -> dict[str, Any]:
    """Get import dependencies for a file.

    Returns both internal imports (resolved within codebase) and external ones.

    Args:
        file_path: Path to the file to analyze.
        codebase: Path to codebase root.

    Returns:
        {
            "success": bool,
            "file": str,
            "internal_imports": list of resolved internal imports,
            "external_imports": list of external/stdlib imports,
            "error": str (if success=False)
        }

    Example:
        >>> deps = get_import_deps("kg_builder/parser.py")
        >>> print(f"Uses {len(deps['internal_imports'])} internal modules")
    """
    try:
        from kg_builder.tools import KGCacheManager, kg_find_entity, kg_resolve_import

        cache = KGCacheManager(codebase)
        kg = cache.get_or_build()

        # Find IMPORT entities in this file
        all_entities = kg_find_entity(kg, "", fuzzy=True, max_results=1000)

        import_entities = [
            m for m in all_entities["matches"]
            if m["type"] == "IMPORT" and file_path in m["file_path"]
        ]

        internal_imports = []
        external_imports = []

        for imp in import_entities:
            resolved = kg_resolve_import(kg, imp["id"])

            if resolved["success"]:
                if resolved.get("is_external"):
                    external_imports.append({
                        "name": resolved["name"],
                        "module": resolved["module"],
                    })
                elif resolved.get("resolved_entity"):
                    internal_imports.append({
                        "name": resolved["name"],
                        "resolved_to": resolved["resolved_entity"]["id"],
                        "file": resolved["resolved_entity"]["file_path"],
                    })

        return {
            "success": True,
            "file": file_path,
            "internal_imports": internal_imports,
            "external_imports": external_imports,
        }

    except Exception as e:
        return {
            "success": False,
            "file": file_path,
            "internal_imports": [],
            "external_imports": [],
            "error": str(e),
        }
