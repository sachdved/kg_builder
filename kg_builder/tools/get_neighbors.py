"""Relationship traversal tool for knowledge graph queries.

This module provides kg_get_neighbors() for finding entities connected
to a given entity through relationships.
"""

from typing import Optional

from kg_builder.models import KnowledgeGraph, RelationshipType


def kg_get_neighbors(
    kg: KnowledgeGraph,
    entity_id: str,
    direction: str = "both",
    relationship_types: Optional[list[str]] = None,
    max_results: int = 20,
) -> dict:
    """Get neighboring entities connected to the given entity.

    Args:
        kg: The knowledge graph to query.
        entity_id: The entity ID to get neighbors for.
        direction: "outgoing", "incoming", or "both".
        relationship_types: Optional filter (e.g., ["CALLS", "IMPORTS"]).
        max_results: Maximum neighbors to return.

    Returns:
        {
            "success": bool,
            "entity_id": str,
            "neighbors": [
                {
                    "entity_id": str,
                    "name": str,
                    "type": str,
                    "relationship_type": str,
                    "direction": "outgoing" | "incoming"
                }
            ],
            "count": int
        }

    Example:
        >>> result = kg_get_neighbors(kg, "kg_builder/query_engine.py::KGQueryEngine")
        >>> if result["success"]:
        ...     for neighbor in result["neighbors"]:
        ...         print(f"{neighbor['relationship_type']}: {neighbor['name']}")

        Returns:
        {
            "success": True,
            "entity_id": "kg_builder/query_engine.py::KGQueryEngine",
            "neighbors": [
                {"entity_id": "...::get_neighbors", "relationship_type": "CONTAINS", ...},
            ],
            "count": 5
        }
    """
    try:
        from kg_builder.query_engine import KGQueryEngine

        # Validate entity exists
        if entity_id not in kg.entities:
            return {
                "success": False,
                "error": f"Entity not found: {entity_id}",
                "entity_id": entity_id,
                "neighbors": [],
                "count": 0,
            }

        engine = KGQueryEngine(kg)

        # Convert relationship type strings to enum values if needed
        rel_type_filter = None
        if relationship_types is not None:
            rel_type_filter = [
                RelationshipType[rt] if isinstance(rt, str) else rt
                for rt in relationship_types
            ]

        neighbors_data = engine.get_neighbors(
            entity_id, direction=direction, relationship_types=rel_type_filter
        )

        # Build result list
        neighbors = []
        seen_pairs = set()  # Avoid duplicates

        for rel_type, neighbor_id in neighbors_data:
            # Skip duplicates
            pair = (neighbor_id, rel_type.value)
            if pair in seen_pairs:
                continue
            seen_pairs.add(pair)

            if len(neighbors) >= max_results:
                break

            # Determine direction of this relationship
            is_outgoing = neighbor_id in [n[1] for n in engine.kg._adjacency.get(entity_id, [])]
            actual_direction = "outgoing" if is_outgoing else "incoming"

            neighbor_info = {
                "relationship_type": rel_type.value,
                "direction": actual_direction,
            }

            if neighbor_id in kg.entities:
                entity = kg.entities[neighbor_id]
                neighbor_info.update({
                    "entity_id": neighbor_id,
                    "name": entity.name,
                    "type": entity.type.value,
                    "file_path": entity.file_path,
                })
            else:
                # External reference or unresolved
                neighbor_info.update({
                    "entity_id": neighbor_id,
                    "name": neighbor_id.split("::")[-1],
                    "type": "EXTERNAL",
                })

            neighbors.append(neighbor_info)

        return {
            "success": True,
            "entity_id": entity_id,
            "neighbors": neighbors,
            "count": len(neighbors),
        }

    except Exception as e:
        return {
            "success": False,
            "error": str(e),
            "entity_id": entity_id,
            "neighbors": [],
            "count": 0,
        }
