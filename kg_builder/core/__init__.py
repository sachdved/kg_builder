"""Core KG building components.

This submodule contains the fundamental knowledge graph extraction engine:
- Entity and relationship models
- AST-based Python parsing
- Relationship detection
- Symbol resolution across files
- Query engine for graph traversal
"""

from kg_builder.core.models import (
    Entity,
    EntityType,
    KnowledgeGraph,
    Relationship,
    RelationshipType,
)
from kg_builder.core.parser import parse_file
from kg_builder.core.relationship_finder import find_all_relationships
from kg_builder.core.query_engine import KGQueryEngine
from kg_builder.core.symbol_resolver import SymbolResolver

__all__ = [
    # Models
    "Entity",
    "EntityType",
    "KnowledgeGraph",
    "Relationship",
    "RelationshipType",
    # Parsing and extraction
    "parse_file",
    "find_all_relationships",
    # Resolution and querying
    "SymbolResolver",
    "KGQueryEngine",
]
