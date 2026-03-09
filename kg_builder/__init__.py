"""Knowledge Graph Builder - Extract knowledge graphs from Python codebases.

This package provides tools to parse Python files and extract entities
(classes, functions, variables, etc.) and their relationships into a
structured knowledge graph representation.

Example usage:

    from kg_builder import build_knowledge_graph

    # Build knowledge graph from a directory
    kg = build_knowledge_graph("/path/to/codebase")

    # Output as JSON
    print(kg.to_json())
"""

from kg_builder.models import Entity, EntityType, KnowledgeGraph, Relationship, RelationshipType
from kg_builder.parser import parse_file


def build_knowledge_graph(
    target_path: str, exclude_patterns: list[str] | None = None
) -> KnowledgeGraph:
    """Build a knowledge graph from a file or directory.

    This is the main entry point for building knowledge graphs programmatically.

    Args:
        target_path: Path to a Python file or directory to parse.
        exclude_patterns: Optional list of glob patterns to exclude (e.g., ['**/tests/*']).

    Returns:
        A KnowledgeGraph containing all entities and relationships.

    Example:
        >>> kg = build_knowledge_graph("/path/to/project")
        >>> print(kg.to_json())
    """
    import ast

    from kg_builder.relationship_finder import find_all_relationships
    from kg_builder.utils import get_python_files

    kg = KnowledgeGraph()
    files = list(get_python_files(target_path, exclude_patterns))

    for file_path in files:
        try:
            entities, _ = parse_file(str(file_path))
            if not entities:
                continue

            # Read and parse the source for relationship finding
            with open(file_path, "r", encoding="utf-8") as f:
                source = f.read()

            try:
                tree = ast.parse(source, filename=str(file_path))
                relationships = find_all_relationships(
                    str(file_path), entities, tree
                )
            except SyntaxError:
                relationships = []

            # Add to the knowledge graph
            for entity in entities:
                kg.add_entity(entity)

            for relationship in relationships:
                kg.add_relationship(relationship)

        except Exception:
            # Skip files that can't be processed
            continue

    return kg


__all__ = [
    "Entity",
    "EntityType",
    "KnowledgeGraph",
    "Relationship",
    "RelationshipType",
    "parse_file",
    "build_knowledge_graph",
]
