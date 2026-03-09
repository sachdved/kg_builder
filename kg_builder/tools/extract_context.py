"""Code context extraction tool for knowledge graph queries.

This module provides kg_extract_context() for loading source code of an entity
and its neighbors, organized by file for efficient token usage.
"""

from typing import Optional

from kg_builder.models import KnowledgeGraph


def kg_extract_context(
    kg: KnowledgeGraph,
    entity_id: str,
    max_hops: int = 1,
    exclude_types: Optional[list[str]] = None,
) -> dict:
    """Extract source code for an entity and its neighbors.

    Args:
        kg: The knowledge graph to query.
        entity_id: The entity ID to extract context for.
        max_hops: Number of relationship hops to include (default: 1).
        exclude_types: Entity types to skip (e.g., ["IMPORT", "VARIABLE"]).

    Returns:
        {
            "success": bool,
            "entity_id": str,
            "context": {
                "file_path": {
                    "entities": [
                        {
                            "id": str,
                            "name": str,
                            "code": str,
                            "line_range": [start, end]
                        }
                    ]
                }
            },
            "total_files": int,
            "total_entities": int
        }

    Example:
        >>> result = kg_extract_context(kg, "kg_builder/parser.py::parse_file", max_hops=1)
        >>> if result["success"]:
        ...     for filepath, data in result["context"].items():
        ...         print(f"\n=== {filepath} ===")
        ...         for entity in data["entities"]:
        ...             print(f"{entity['name']}:\\n{entity['code']}")

        Returns:
        {
            "success": True,
            "entity_id": "kg_builder/parser.py::parse_file",
            "context": {
                "/home/.../kg_builder/parser.py": {"entities": [...]},
            },
            "total_files": 1,
            "total_entities": 5
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
                "context": {},
                "total_files": 0,
                "total_entities": 0,
            }

        engine = KGQueryEngine(kg)

        # Get visited entities through traversal
        visited = engine.traverse_hops(
            start_ids=[entity_id],
            max_hops=max_hops,
            exclude_types=exclude_types,
        )

        # Group by file for efficient reading
        files_to_read: dict[str, list[str]] = {}
        for eid in visited.keys():
            if eid in kg.entities:
                fp = kg.entities[eid].file_path
                if fp not in files_to_read:
                    files_to_read[fp] = []
                files_to_read[fp].append(eid)

        # Extract code for each file
        context: dict[str, dict] = {}
        total_entities = 0

        for filepath, entity_ids in files_to_read.items():
            try:
                with open(filepath, "r", encoding="utf-8") as f:
                    lines = f.readlines()

                entities_list = []
                for eid in entity_ids:
                    if eid not in kg.entities:
                        continue

                    entity = kg.entities[eid]
                    start = max(0, entity.line_number - 1)  # 0-indexed
                    end = entity.end_line if entity.end_line else min(len(lines), start + 20)

                    code = "".join(lines[start:end]).rstrip()

                    entities_list.append({
                        "id": eid,
                        "name": entity.name,
                        "type": entity.type.value,
                        "code": code,
                        "line_range": [start + 1, end],  # 1-indexed for display
                    })
                    total_entities += 1

                if entities_list:
                    context[filepath] = {"entities": entities_list}

            except (OSError, IndexError, TypeError) as e:
                context[filepath] = {
                    "entities": [{
                        "error": f"Could not extract code: {str(e)}",
                    }]
                }

        return {
            "success": True,
            "entity_id": entity_id,
            "context": context,
            "total_files": len(context),
            "total_entities": total_entities,
        }

    except Exception as e:
        return {
            "success": False,
            "error": str(e),
            "entity_id": entity_id,
            "context": {},
            "total_files": 0,
            "total_entities": 0,
        }
