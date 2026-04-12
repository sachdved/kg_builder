"""Caller discovery tool for knowledge graph queries.

This module provides kg_get_callers() for finding all entities that call
a given entity, with support for transitive caller lookup.
"""

from typing import Optional

from kg_builder.core.models import KnowledgeGraph, RelationshipType


def kg_get_callers(
    kg: KnowledgeGraph,
    entity_id: str,
    max_depth: int = 1,
) -> dict:
    """Find all entities that call the given entity.

    Args:
        kg: The knowledge graph to query.
        entity_id: The entity ID to find callers for.
        max_depth: Transitive depth (1 = direct callers only).

    Returns:
        {
            "success": bool,
            "entity_id": str,
            "direct_callers": [str],
            "transitive_callers": [str],
            "call_graph": [
                {
                    "caller": str,
                    "callee": str,
                    "line_number": int,
                    "relationship_type": str,
                    "depth": int
                }
            ],
            "total_callers": int
        }

    Example:
        >>> result = kg_get_callers(kg, "kg_builder/parser.py::parse_file", max_depth=2)
        >>> if result["success"]:
        ...     print(f"Direct callers: {result['direct_callers']}")
        ...     print(f"Transitive callers (depth={max_depth}): {result['transitive_callers']}")

        Returns:
        {
            "success": True,
            "entity_id": "kg_builder/parser.py::parse_file",
            "direct_callers": ["kg_builder/__init__.py::build_knowledge_graph"],
            "transitive_callers": [...],
            "call_graph": [...],
            "total_callers": 5
        }
    """
    try:
        from kg_builder.core.query_engine import KGQueryEngine

        # Validate entity exists
        if entity_id not in kg.entities:
            return {
                "success": False,
                "error": f"Entity not found: {entity_id}",
                "entity_id": entity_id,
                "direct_callers": [],
                "transitive_callers": [],
                "call_graph": [],
                "total_callers": 0,
            }

        engine = KGQueryEngine(kg)

        # Get direct callers
        direct_callers = engine.get_callers(entity_id)

        if max_depth == 1:
            return {
                "success": True,
                "entity_id": entity_id,
                "direct_callers": direct_callers,
                "transitive_callers": [],
                "call_graph": [
                    {
                        "caller": caller,
                        "callee": entity_id,
                        "relationship_type": RelationshipType.CALLS.value,
                        "depth": 1,
                    }
                    for caller in direct_callers
                ],
                "total_callers": len(direct_callers),
            }

        # Get transitive callers by recursively finding callers of callers
        all_callers = set(direct_callers)
        call_graph = [
            {
                "caller": caller,
                "callee": entity_id,
                "relationship_type": RelationshipType.CALLS.value,
                "depth": 1,
            }
            for caller in direct_callers
        ]

        # BFS to find transitive callers up to max_depth
        queue = list(direct_callers)
        depths = {caller: 1 for caller in direct_callers}

        while queue:
            current = queue.pop(0)
            current_depth = depths[current]

            if current_depth >= max_depth:
                continue

            # Find callers of this caller
            parent_callers = engine.get_callers(current)
            for parent in parent_callers:
                if parent not in all_callers:
                    all_callers.add(parent)
                    depths[parent] = current_depth + 1
                    queue.append(parent)

                    call_graph.append({
                        "caller": parent,
                        "callee": current,
                        "relationship_type": RelationshipType.CALLS.value,
                        "depth": current_depth + 1,
                    })

        transitive_callers = [c for c in all_callers if c not in direct_callers]

        return {
            "success": True,
            "entity_id": entity_id,
            "direct_callers": direct_callers,
            "transitive_callers": transitive_callers,
            "call_graph": call_graph,
            "total_callers": len(all_callers),
        }

    except Exception as e:
        return {
            "success": False,
            "error": str(e),
            "entity_id": entity_id,
            "direct_callers": [],
            "transitive_callers": [],
            "call_graph": [],
            "total_callers": 0,
        }
