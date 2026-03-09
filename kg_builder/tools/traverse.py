"""Multi-hop traversal tool for knowledge graph queries.

This module provides kg_traverse() for breadth-first traversal from
starting entities, useful for impact analysis and code flow understanding.
"""

from typing import Optional

from kg_builder.models import KnowledgeGraph, RelationshipType


def kg_traverse(
    kg: KnowledgeGraph,
    start_entity_ids: list[str],
    max_hops: int = 2,
    include_relationships: Optional[list[str]] = None,
    exclude_types: Optional[list[str]] = None,
) -> dict:
    """Perform breadth-first traversal from starting entities.

    Args:
        kg: The knowledge graph to query.
        start_entity_ids: List of entity IDs to start from.
        max_hops: Maximum hop distance (default: 2).
        include_relationships: Only traverse these types (e.g., ["CALLS"]).
        exclude_types: Entity types to skip during traversal.

    Returns:
        {
            "success": bool,
            "traversal_result": {
                entity_id: {"hops": int, "path": str}
            },
            "entity_details": [
                {
                    "id": str,
                    "name": str,
                    "type": str,
                    "file_path": str,
                    "hops_from_start": int
                }
            ],
            "stats": {
                "total_entities": int,
                "files_touched": int,
                "max_depth_reached": int
            }
        }

    Example:
        >>> result = kg_traverse(
        ...     kg,
        ...     start_entity_ids=["kg_builder/query_engine.py::KGQueryEngine"],
        ...     max_hops=2,
        ...     include_relationships=["CALLS", "CONTAINS"]
        ... )
        >>> if result["success"]:
        ...     print(f"Reached {result['stats']['total_entities']} entities")
        ...     for detail in result["entity_details"]:
        ...         print(f"  {detail['hops_from_start']} hops: {detail['name']}")

        Returns:
        {
            "success": True,
            "traversal_result": {...},
            "entity_details": [...],
            "stats": {"total_entities": 15, "files_touched": 3, ...}
        }
    """
    try:
        from kg_builder.query_engine import KGQueryEngine

        # Validate at least one start entity exists
        valid_starts = [eid for eid in start_entity_ids if eid in kg.entities]
        if not valid_starts:
            return {
                "success": False,
                "error": f"No valid start entities found in: {start_entity_ids}",
                "traversal_result": {},
                "entity_details": [],
                "stats": {"total_entities": 0, "files_touched": 0, "max_depth_reached": 0},
            }

        engine = KGQueryEngine(kg)

        # Convert relationship type strings to enum values if needed
        rel_type_filter = None
        if include_relationships is not None:
            rel_type_filter = [
                RelationshipType[rt] if isinstance(rt, str) else rt
                for rt in include_relationships
            ]

        # Perform traversal
        raw_result = engine.traverse_hops(
            start_ids=valid_starts,
            max_hops=max_hops,
            include_relationships=rel_type_filter,
            exclude_types=exclude_types,
        )

        # Build entity details list
        entity_details = []
        files_touched = set()
        max_depth_reached = 0

        for eid, (hops, path) in raw_result.items():
            if eid in kg.entities:
                entity = kg.entities[eid]
                entity_details.append({
                    "id": eid,
                    "name": entity.name,
                    "type": entity.type.value,
                    "file_path": entity.file_path,
                    "hops_from_start": hops,
                })
                files_touched.add(entity.file_path)

            if hops > max_depth_reached:
                max_depth_reached = hops

        return {
            "success": True,
            "traversal_result": {eid: {"hops": hops, "path": path} for eid, (hops, path) in raw_result.items()},
            "entity_details": entity_details,
            "stats": {
                "total_entities": len(raw_result),
                "files_touched": len(files_touched),
                "max_depth_reached": max_depth_reached,
            },
        }

    except Exception as e:
        return {
            "success": False,
            "error": str(e),
            "traversal_result": {},
            "entity_details": [],
            "stats": {"total_entities": 0, "files_touched": 0, "max_depth_reached": 0},
        }
