"""Relationship detection logic for the knowledge graph."""

import ast
from typing import Any

from kg_builder.models import Entity, EntityType, Relationship, RelationshipType
from kg_builder.utils import generate_entity_id


def find_all_relationships(
    file_path: str, entities: list[Entity], tree: ast.AST
) -> list[Relationship]:
    """Find all relationships in a parsed Python file.

    Args:
        file_path: Path to the source file.
        entities: List of entities extracted from the file.
        tree: The AST of the file.

    Returns:
        List of all detected relationships.
    """
    relationships = []

    # Find CONTAINS relationships based on scope hierarchy
    relationships.extend(_find_contains(file_path, entities))

    # Find IMPORTS relationships
    relationships.extend(_find_imports(file_path, entities))

    # Walk the tree to find other relationships
    _walk_for_relationships(tree, file_path, entities, relationships, scope_stack=[])

    return relationships


def _find_contains(file_path: str, entities: list[Entity]) -> list[Relationship]:
    """Find CONTAINS relationships based on entity IDs.

    An entity ID like "file.py::OuterClass::method" implies:
    - file.py CONTAINS OuterClass
    - OuterClass CONTAINS method

    Args:
        file_path: Path to the source file.
        entities: List of entities in the file.

    Returns:
        List of CONTAINS relationships.
    """
    relationships = []

    # Create a mapping from ID prefix to entity
    file_entities = [e for e in entities if e.file_path == file_path]

    for entity in file_entities:
        # Skip FILE and MODULE entities themselves
        if entity.type.value in ("FILE", "MODULE"):
            continue

        # Parse the entity ID to find its parent
        parts = entity.id.split("::")
        if len(parts) <= 1:
            # Top-level entity (like imports or top-level functions)
            # Find the file entity
            file_entity_id = file_path
            relationships.append(
                Relationship(
                    source_id=file_entity_id,
                    target_id=entity.id,
                    type=RelationshipType.CONTAINS,
                    line_number=entity.line_number,
                )
            )
        else:
            # Build parent hierarchy
            for i in range(1, len(parts)):
                parent_id = "::".join(parts[:i])
                relationships.append(
                    Relationship(
                        source_id=parent_id,
                        target_id=entity.id,
                        type=RelationshipType.CONTAINS,
                        line_number=entity.line_number,
                    )
                )

    return relationships


def _find_imports(file_path: str, entities: list[Entity]) -> list[Relationship]:
    """Find IMPORTS relationships from import statements.

    Args:
        file_path: Path to the source file.
        entities: List of entities in the file.

    Returns:
        List of IMPORTS relationships.
    """
    relationships = []

    for entity in entities:
        if entity.type == EntityType.IMPORT:
            # The module imports the imported name
            relationships.append(
                Relationship(
                    source_id=file_path,
                    target_id=entity.id,
                    type=RelationshipType.IMPORTS,
                    line_number=entity.line_number,
                )
            )

    return relationships


def _walk_for_relationships(
    node: ast.AST,
    file_path: str,
    entities: list[Entity],
    relationships: list[Relationship],
    scope_stack: list[str],
) -> None:
    """Recursively walk the AST to find relationships.

    Args:
        node: Current AST node.
        file_path: Path to the source file.
        entities: List of all entities for lookup.
        relationships: List to append found relationships to.
        scope_stack: Current scope hierarchy.
    """
    if isinstance(node, ast.ClassDef):
        _process_class_for_relationships(
            node, file_path, entities, relationships, scope_stack
        )
    elif isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
        _process_function_for_relationships(
            node, file_path, entities, relationships, scope_stack
        )

    # Recursively process children
    new_scope = scope_stack
    if isinstance(node, ast.ClassDef):
        new_scope = scope_stack + [node.name]
    elif isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
        new_scope = scope_stack + [node.name]

    for child in ast.iter_child_nodes(node):
        _walk_for_relationships(child, file_path, entities, relationships, new_scope)


def _process_class_for_relationships(
    node: ast.ClassDef,
    file_path: str,
    entities: list[Entity],
    relationships: list[Relationship],
    scope_stack: list[str],
) -> None:
    """Find relationships from a class definition.

    Args:
        node: The ClassDef AST node.
        file_path: Path to the source file.
        entities: List of all entities for lookup.
        relationships: List to append found relationships to.
        scope_stack: Current scope hierarchy.
    """
    class_scopes = scope_stack + [node.name]
    class_id = generate_entity_id(file_path, *class_scopes)

    # Find INHERITS relationships from base classes
    for base in node.bases:
        base_name = _get_base_name(base)
        if base_name:
            # Create a synthetic target ID for external classes
            # In a full implementation, we'd resolve this to the actual class entity
            relationships.append(
                Relationship(
                    source_id=class_id,
                    target_id=base_name,  # External reference
                    type=RelationshipType.INHERITS,
                    line_number=node.lineno,
                )
            )

    # Find INSTANTIATES relationships within the class body
    for child in ast.walk(node):
        if isinstance(child, ast.Call):
            call_info = _extract_call_info(child)
            if call_info:
                callee_name = call_info["name"]
                # Check if this looks like a class instantiation
                if _looks_like_class_name(callee_name):
                    relationships.append(
                        Relationship(
                            source_id=class_id,
                            target_id=callee_name,
                            type=RelationshipType.INSTANTIATES,
                            line_number=call_info["line"],
                        )
                    )


def _process_function_for_relationships(
    node: ast.FunctionDef | ast.AsyncFunctionDef,
    file_path: str,
    entities: list[Entity],
    relationships: list[Relationship],
    scope_stack: list[str],
) -> None:
    """Find relationships from a function definition.

    Args:
        node: The FunctionDef or AsyncFunctionDef AST node.
        file_path: Path to the source file.
        entities: List of all entities for lookup.
        relationships: List to append found relationships to.
        scope_stack: Current scope hierarchy.
    """
    func_scopes = scope_stack + [node.name]
    func_id = generate_entity_id(file_path, *func_scopes)

    # Find CALLS relationships by looking for Call nodes in the function body
    for child in ast.walk(node):
        if isinstance(child, ast.Call):
            call_info = _extract_call_info(child)
            if call_info:
                callee_name = call_info["name"]
                is_method_call = call_info.get("is_method", False)

                # Determine the relationship type
                if is_method_call:
                    # This might be a method call - could be CALLS or USES
                    relationships.append(
                        Relationship(
                            source_id=func_id,
                            target_id=callee_name,
                            type=RelationshipType.CALLS,
                            line_number=call_info["line"],
                        )
                    )
                elif _looks_like_class_name(callee_name):
                    # Might be class instantiation
                    relationships.append(
                        Relationship(
                            source_id=func_id,
                            target_id=callee_name,
                            type=RelationshipType.INSTANTIATES,
                            line_number=call_info["line"],
                        )
                    )
                else:
                    # Regular function call
                    relationships.append(
                        Relationship(
                            source_id=func_id,
                            target_id=callee_name,
                            type=RelationshipType.CALLS,
                            line_number=call_info["line"],
                        )
                    )

    # Find DEFINES_IN relationships for variables in the function body
    _find_defined_variables(node, func_id, relationships)


def _extract_call_info(node: ast.Call) -> dict[str, Any] | None:
    """Extract information from a Call node.

    Args:
        node: The Call AST node.

    Returns:
        Dictionary with call details, or None if not extractable.
    """
    func = node.func

    if isinstance(func, ast.Name):
        return {"name": func.id, "line": node.lineno, "is_method": False}
    elif isinstance(func, ast.Attribute):
        # This is a method call like obj.method()
        if isinstance(func.value, ast.Name):
            return {
                "name": f"{func.value.id}.{func.attr}",
                "line": node.lineno,
                "is_method": True,
                "object": func.value.id,
                "method": func.attr,
            }
        # Nested attribute access - just use the full expression
        return {"name": ast.unparse(func), "line": node.lineno, "is_method": True}

    # Handle other cases (e.g., calls on function results)
    try:
        return {"name": ast.unparse(func), "line": node.lineno, "is_method": False}
    except Exception:
        return None


def _find_defined_variables(
    node: ast.AST, func_id: str, relationships: list[Relationship]
) -> None:
    """Find variables defined within a function scope.

    Args:
        node: The AST node (typically FunctionDef body).
        func_id: ID of the containing function.
        relationships: List to append DEFINES_IN relationships to.
    """
    for child in ast.walk(node):
        if isinstance(child, ast.Assign):
            for target in child.targets:
                if isinstance(target, ast.Name):
                    var_id = f"{func_id}::local:{target.id}"
                    relationships.append(
                        Relationship(
                            source_id=func_id,
                            target_id=var_id,
                            type=RelationshipType.DEFINES_IN,
                            line_number=child.lineno,
                        )
                    )
        elif isinstance(child, ast.AnnAssign) and isinstance(child.target, ast.Name):
            var_id = f"{func_id}::local:{child.target.id}"
            relationships.append(
                Relationship(
                    source_id=func_id,
                    target_id=var_id,
                    type=RelationshipType.DEFINES_IN,
                    line_number=child.lineno,
                )
            )


def _get_base_name(base: ast.expr) -> str | None:
    """Extract the name of a base class.

    Args:
        base: The base class AST node.

    Returns:
        The string representation of the base class name.
    """
    if isinstance(base, ast.Name):
        return base.id
    elif isinstance(base, ast.Attribute):
        return ast.unparse(base)
    elif isinstance(base, ast.Subscript):
        # Handle generic types like List[str]
        return _get_base_name(base.value)
    return None


def _looks_like_class_name(name: str) -> bool:
    """Heuristic to check if a name looks like a class name.

    Class names typically start with uppercase letters.

    Args:
        name: The name to check.

    Returns:
        True if the name appears to be a class name.
    """
    return name and name[0].isupper() and not name.isupper()
