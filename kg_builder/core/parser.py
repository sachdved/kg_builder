"""Python AST parser for extracting entities from code."""

import ast
from typing import Any

from kg_builder.core.models import Entity, EntityType
from kg_builder.core.utils import generate_entity_id, is_constant_name


def parse_file(file_path: str) -> tuple[list[Entity], list[Entity]]:
    """Parse a Python file and extract all entities.

    Args:
        file_path: Path to the Python file to parse.

    Returns:
        Tuple of (all_entities, file_entity). All entities found in the file,
        plus the special FILE entity representing the file itself.
    """
    try:
        with open(file_path, "r", encoding="utf-8") as f:
            source = f.read()
    except (OSError, UnicodeDecodeError) as e:
        # Return empty list if file cannot be read
        return [], []

    try:
        tree = ast.parse(source, filename=file_path)
    except SyntaxError:
        # Return empty list if file has syntax errors
        return [], []

    entities: list[Entity] = []

    # Create FILE entity
    file_entity = Entity(
        id=file_path,
        name=file_path,
        type=EntityType.FILE,
        file_path=file_path,
        line_number=0,
        properties={"description": f"File: {file_path}"},
    )
    entities.append(file_entity)

    # Create MODULE entity
    module_entity = Entity(
        id=file_path,
        name=file_path,
        type=EntityType.MODULE,
        file_path=file_path,
        line_number=0,
        properties={"description": ast.get_docstring(tree) or "No module docstring"},
    )
    entities.append(module_entity)

    # Walk the AST and extract entities
    _walk_ast(tree, file_path, entities, scope_stack=[])

    return entities, file_entity


def _walk_ast(
    node: ast.AST,
    file_path: str,
    entities: list[Entity],
    scope_stack: list[str],
) -> None:
    """Recursively walk the AST and extract entities.

    Args:
        node: The current AST node being processed.
        file_path: Path to the source file.
        entities: List to append extracted entities to.
        scope_stack: Current scope hierarchy (for nested classes/functions).
    """
    # Process based on node type - these handlers walk their own bodies
    if isinstance(node, ast.ClassDef):
        _extract_class(node, file_path, entities, scope_stack)
        return  # Body already processed in _extract_class
    elif isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
        _extract_function(node, file_path, entities, scope_stack, isinstance(node, ast.AsyncFunctionDef))
        return  # Body already processed in _extract_function

    # Handle simple assignments and imports at current scope level only
    if isinstance(node, ast.Assign):
        _extract_assignments(node, file_path, entities, scope_stack)
        return
    elif isinstance(node, ast.AnnAssign):
        _extract_annotated_assign(node, file_path, entities, scope_stack)
        return
    elif isinstance(node, ast.Import):
        _extract_imports(node, file_path, entities, scope_stack)
        return
    elif isinstance(node, ast.ImportFrom):
        _extract_from_imports(node, file_path, entities, scope_stack)
        return

    # For Module and other composite nodes, recursively walk children
    for child in ast.iter_child_nodes(node):
        _walk_ast(child, file_path, entities, scope_stack)


def _extract_class(
    node: ast.ClassDef,
    file_path: str,
    entities: list[Entity],
    scope_stack: list[str],
) -> None:
    """Extract a class definition entity.

    Args:
        node: The ClassDef AST node.
        file_path: Path to the source file.
        entities: List to append extracted entities to.
        scope_stack: Current scope hierarchy.
    """
    # Build the class ID with full scope
    class_scopes = scope_stack + [node.name]
    class_id = generate_entity_id(file_path, *class_scopes)

    # Collect decorators
    decorators = [_get_decorator_name(dec) for dec in node.decorator_list]

    # Get base class names for inheritance
    bases = [_get_base_name(base) for base in node.bases if _get_base_name(base)]

    properties: dict[str, Any] = {
        "description": ast.get_docstring(node) or "No docstring",
        "decorators": decorators if decorators else None,
        "bases": bases if bases else None,
    }

    entity = Entity(
        id=class_id,
        name=node.name,
        type=EntityType.CLASS,
        file_path=file_path,
        line_number=node.lineno,
        end_line=getattr(node, 'end_lineno', None),
        properties=properties,
    )
    entities.append(entity)

    # Walk the class body with updated scope
    new_scope = scope_stack + [node.name]
    for child in node.body:
        _walk_ast(child, file_path, entities, new_scope)


def _extract_function(
    node: ast.FunctionDef | ast.AsyncFunctionDef,
    file_path: str,
    entities: list[Entity],
    scope_stack: list[str],
    is_async: bool = False,
) -> None:
    """Extract a function/method definition entity.

    Args:
        node: The FunctionDef or AsyncFunctionDef AST node.
        file_path: Path to the source file.
        entities: List to append extracted entities to.
        scope_stack: Current scope hierarchy.
        is_async: Whether this is an async function.
    """
    # Build the function ID with full scope
    func_scopes = scope_stack + [node.name]
    func_id = generate_entity_id(file_path, *func_scopes)

    entity_type = EntityType.ASYNC_FUNCTION if is_async else EntityType.FUNCTION

    # Collect decorators
    decorators = [_get_decorator_name(dec) for dec in node.decorator_list]

    # Extract arguments with type annotations
    args = _extract_arguments(node.args)

    # Get return type annotation if present
    return_type = None
    if node.returns is not None:
        return_type = ast.unparse(node.returns)

    properties: dict[str, Any] = {
        "description": ast.get_docstring(node) or "No docstring",
        "decorators": decorators if decorators else None,
        "args": args if args else None,
        "return_type": return_type,
    }

    entity = Entity(
        id=func_id,
        name=node.name,
        type=entity_type,
        file_path=file_path,
        line_number=node.lineno,
        end_line=getattr(node, 'end_lineno', None),
        properties=properties,
    )
    entities.append(entity)

    # Walk the function body with updated scope
    new_scope = scope_stack + [node.name]
    for child in node.body:
        _walk_ast(child, file_path, entities, new_scope)


def _extract_assignments(
    node: ast.Assign,
    file_path: str,
    entities: list[Entity],
    scope_stack: list[str],
) -> None:
    """Extract variable/constant assignments.

    Args:
        node: The Assign AST node.
        file_path: Path to the source file.
        entities: List to append extracted entities to.
        scope_stack: Current scope hierarchy.
    """
    for target in node.targets:
        if isinstance(target, ast.Name):
            _extract_variable_entity(
                target.id, node.lineno, file_path, entities, scope_stack
            )


def _extract_annotated_assign(
    node: ast.AnnAssign,
    file_path: str,
    entities: list[Entity],
    scope_stack: list[str],
) -> None:
    """Extract annotated variable/constant assignments.

    Args:
        node: The AnnAssign AST node.
        file_path: Path to the source file.
        entities: List to append extracted entities to.
        scope_stack: Current scope hierarchy.
    """
    if isinstance(node.target, ast.Name):
        type_annotation = ast.unparse(node.annotation)
        _extract_variable_entity(
            node.target.id,
            node.lineno,
            file_path,
            entities,
            scope_stack,
            type_annotation=type_annotation,
        )


def _extract_variable_entity(
    name: str,
    line_number: int,
    file_path: str,
    entities: list[Entity],
    scope_stack: list[str],
    type_annotation: str | None = None,
) -> None:
    """Create a variable or constant entity.

    Args:
        name: The variable/constant name.
        line_number: Line number of the definition.
        file_path: Path to the source file.
        entities: List to append extracted entities to.
        scope_stack: Current scope hierarchy.
        type_annotation: Optional type annotation.
    """
    # Determine if this is a constant or variable
    entity_type = EntityType.CONSTANT if is_constant_name(name) else EntityType.VARIABLE

    var_scopes = scope_stack + [name]
    var_id = generate_entity_id(file_path, *var_scopes)

    properties: dict[str, Any] = {"description": f"{entity_type.value}: {name}"}
    if type_annotation:
        properties["type_annotation"] = type_annotation

    entity = Entity(
        id=var_id,
        name=name,
        type=entity_type,
        file_path=file_path,
        line_number=line_number,
        properties=properties,
    )
    entities.append(entity)


def _extract_imports(
    node: ast.Import,
    file_path: str,
    entities: list[Entity],
    scope_stack: list[str],
) -> None:
    """Extract import statements (import x).

    Args:
        node: The Import AST node.
        file_path: Path to the source file.
        entities: List to append extracted entities to.
        scope_stack: Current scope hierarchy.
    """
    for alias in node.names:
        import_name = alias.asname if alias.asname else alias.name
        import_id = generate_entity_id(file_path, f"import:{import_name}")

        entity = Entity(
            id=import_id,
            name=import_name,
            type=EntityType.IMPORT,
            file_path=file_path,
            line_number=node.lineno,
            properties={
                "description": f"Import: {alias.name}",
                "original_name": alias.name,
            },
        )
        entities.append(entity)


def _extract_from_imports(
    node: ast.ImportFrom,
    file_path: str,
    entities: list[Entity],
    scope_stack: list[str],
) -> None:
    """Extract from...import statements.

    Args:
        node: The ImportFrom AST node.
        file_path: Path to the source file.
        entities: List to append extracted entities to.
        scope_stack: Current scope hierarchy.
    """
    module = node.module or ""
    for alias in node.names:
        import_name = alias.asname if alias.asname else alias.name
        import_id = generate_entity_id(file_path, f"import:{import_name}")

        entity = Entity(
            id=import_id,
            name=import_name,
            type=EntityType.IMPORT,
            file_path=file_path,
            line_number=node.lineno,
            properties={
                "description": f"From {module} import {alias.name}",
                "module": module,
                "original_name": alias.name,
            },
        )
        entities.append(entity)


def _extract_arguments(args: ast.arguments) -> list[dict[str, Any]]:
    """Extract argument information from a function's arguments.

    Args:
        args: The arguments AST node.

    Returns:
        List of dictionaries containing argument details.
    """
    result = []

    # Regular positional arguments
    for arg in args.args:
        result.append(_arg_to_dict(arg))

    # Positional-only arguments (Python 3.8+)
    for arg in args.posonlyargs:
        result.append(_arg_to_dict(arg, is_positional_only=True))

    # *args
    if args.vararg:
        result.append(_arg_to_dict(args.vararg, is_vararg=True))

    # Keyword-only arguments
    for arg in args.kwonlyargs:
        result.append(_arg_to_dict(arg, is_kwonly=True))

    # **kwargs
    if args.kwarg:
        result.append(_arg_to_dict(args.kwarg, is_kwarg=True))

    return result


def _arg_to_dict(
    arg: ast.arg,
    is_positional_only: bool = False,
    is_vararg: bool = False,
    is_kwonly: bool = False,
    is_kwarg: bool = False,
) -> dict[str, Any]:
    """Convert an argument node to a dictionary.

    Args:
        arg: The argument AST node.
        is_positional_only: Whether this is a positional-only argument.
        is_vararg: Whether this is a *args argument.
        is_kwonly: Whether this is a keyword-only argument.
        is_kwarg: Whether this is a **kwargs argument.

    Returns:
        Dictionary with argument details.
    """
    result: dict[str, Any] = {"name": arg.arg}

    if arg.annotation:
        result["type"] = ast.unparse(arg.annotation)

    if is_positional_only:
        result["kind"] = "positional-only"
    elif is_vararg:
        result["kind"] = "vararg"
    elif is_kwonly:
        result["kind"] = "keyword-only"
    elif is_kwarg:
        result["kind"] = "kwarg"
    else:
        result["kind"] = "positional-or-keyword"

    return result


def _get_decorator_name(decorator: ast.expr) -> str:
    """Extract the name of a decorator.

    Args:
        decorator: The decorator AST node.

    Returns:
        The string representation of the decorator name.
    """
    if isinstance(decorator, ast.Name):
        return decorator.id
    elif isinstance(decorator, ast.Attribute):
        return ast.unparse(decorator)
    elif isinstance(decorator, ast.Call):
        return _get_decorator_name(decorator.func)
    else:
        return ast.unparse(decorator)


def _get_base_name(base: ast.expr) -> str | None:
    """Extract the name of a base class.

    Args:
        base: The base class AST node.

    Returns:
        The string representation of the base class name, or None if not extractable.
    """
    if isinstance(base, ast.Name):
        return base.id
    elif isinstance(base, ast.Attribute):
        return ast.unparse(base)
    # For other cases (e.g., generic types with parameters), we could handle them here
    return None
