"""Import resolution tool for knowledge graph queries.

This module provides kg_resolve_import() for resolving import statements
to their actual definitions in the codebase.
"""

from kg_builder.models import KnowledgeGraph


def kg_resolve_import(
    kg: KnowledgeGraph,
    import_entity_id: str,
) -> dict:
    """Resolve an import entity to its actual definition.

    Args:
        kg: The knowledge graph to query.
        import_entity_id: The ID of the IMPORT entity to resolve.

    Returns:
        {
            "success": bool,
            "import_entity_id": str,
            "resolved_to": str | None,  # Entity ID if resolved
            "resolved_entity": dict | None,  # Full entity info if found
            "is_external": bool,  # True if resolved to external package
            "module": str,  # The imported module name
            "name": str  # The imported symbol name
        }

    Example:
        >>> result = kg_resolve_import(kg, "kg_builder/__init__.py::IMPORT::parse_file")
        >>> if result["success"]:
        ...     if result["resolved_to"]:
        ...         print(f"Resolved to: {result['resolved_entity']['file_path']}")
        ...     elif result["is_external"]:
        ...         print("External import (stdlib or third-party)")

        Returns:
        {
            "success": True,
            "import_entity_id": "...",
            "resolved_to": "kg_builder/parser.py::parse_file",
            "resolved_entity": {...},
            "is_external": False,
            "module": "kg_builder.parser",
            "name": "parse_file"
        }
    """
    try:
        from kg_builder.symbol_resolver import SymbolResolver

        # Validate entity exists and is an IMPORT type
        if import_entity_id not in kg.entities:
            return {
                "success": False,
                "error": f"Entity not found: {import_entity_id}",
                "import_entity_id": import_entity_id,
                "resolved_to": None,
                "resolved_entity": None,
                "is_external": False,
                "module": "",
                "name": "",
            }

        import_entity = kg.entities[import_entity_id]

        # Build symbol table if needed
        resolver = SymbolResolver(kg)
        if not resolver._symbol_table:
            resolver.build_symbol_table()

        # Get import details
        module = import_entity.properties.get("module", "")
        name = import_entity.name
        original_name = import_entity.properties.get("original_name", name)

        # Try to resolve the import
        resolved_id = resolver.resolve_import(import_entity)

        # Check if it's an external reference
        is_external = False
        resolved_entity_info = None

        if resolved_id and resolved_id in kg.entities:
            resolved_entity = kg.entities[resolved_id]

            # Check for EXTERNAL_REF type
            from kg_builder.models import EntityType

            if resolved_entity.type == EntityType.EXTERNAL_REF:
                is_external = True

            resolved_entity_info = {
                "id": resolved_id,
                "name": resolved_entity.name,
                "type": resolved_entity.type.value,
                "file_path": resolved_entity.file_path,
                "line_number": resolved_entity.line_number,
            }

        return {
            "success": True,
            "import_entity_id": import_entity_id,
            "resolved_to": resolved_id,
            "resolved_entity": resolved_entity_info,
            "is_external": is_external,
            "module": module,
            "name": name,
        }

    except Exception as e:
        return {
            "success": False,
            "error": str(e),
            "import_entity_id": import_entity_id,
            "resolved_to": None,
            "resolved_entity": None,
            "is_external": False,
            "module": "",
            "name": "",
        }
