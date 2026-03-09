"""Entity lookup tool for knowledge graph queries.

This module provides kg_find_entity() for finding entities by name,
with optional type filtering and fuzzy matching.
"""

from typing import Optional

from kg_builder.models import KnowledgeGraph


def kg_find_entity(
    kg: KnowledgeGraph,
    query: str,
    entity_type: Optional[str] = None,
    file_path: Optional[str] = None,
    fuzzy: bool = True,
    max_results: int = 10,
) -> dict:
    """Find entities matching a query string.

    Args:
        kg: The knowledge graph to search.
        query: Name or partial name to search for.
        entity_type: Optional type filter (CLASS, FUNCTION, etc.).
        file_path: Optional filter to specific file path.
        fuzzy: If True, use substring matching; if False, exact match.
        max_results: Maximum number of results to return.

    Returns:
        {
            "success": bool,
            "matches": [
                {
                    "id": str,
                    "name": str,
                    "type": str,
                    "file_path": str,
                    "line_number": int
                }
            ],
            "count": int
        }

    Example:
        >>> result = kg_find_entity(kg, "parse_file")
        >>> if result["success"]:
        ...     for match in result["matches"]:
        ...         print(f"Found {match['name']} in {match['file_path']}")

        Returns:
        {
            "success": True,
            "matches": [
                {"id": "kg_builder/parser.py::parse_file", "name": "parse_file", ...}
            ],
            "count": 1
        }
    """
    try:
        # Use the query engine for searching
        from kg_builder.query_engine import KGQueryEngine

        engine = KGQueryEngine(kg)
        entity_ids = engine.search_by_name(query, fuzzy=fuzzy)

        # Build result list with filters applied
        matches = []
        for eid in entity_ids:
            if eid not in kg.entities:
                continue

            entity = kg.entities[eid]

            # Apply type filter
            if entity_type is not None:
                entity_type_value = (
                    entity.type.value if hasattr(entity.type, "value") else str(entity.type)
                )
                if entity_type_value != entity_type:
                    continue

            # Apply file path filter
            if file_path is not None:
                if file_path not in entity.file_path:
                    continue

            matches.append({
                "id": entity.id,
                "name": entity.name,
                "type": entity.type.value if hasattr(entity.type, "value") else str(entity.type),
                "file_path": entity.file_path,
                "line_number": entity.line_number,
            })

            # Truncate if we've hit max results
            if len(matches) >= max_results:
                break

        return {
            "success": True,
            "matches": matches,
            "count": len(matches),
        }

    except Exception as e:
        return {
            "success": False,
            "error": str(e),
            "matches": [],
            "count": 0,
        }
