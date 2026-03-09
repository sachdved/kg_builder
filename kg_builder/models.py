"""Data models for the knowledge graph."""

from dataclasses import dataclass, field
from enum import Enum
from typing import Any, Optional


class EntityType(Enum):
    """Types of entities that can exist in a knowledge graph."""

    FILE = "FILE"
    MODULE = "MODULE"
    CLASS = "CLASS"
    FUNCTION = "FUNCTION"
    ASYNC_FUNCTION = "ASYNC_FUNCTION"
    CONSTANT = "CONSTANT"
    VARIABLE = "VARIABLE"
    IMPORT = "IMPORT"
    DIRECTORY = "DIRECTORY"
    DECORATOR = "DECORATOR"
    EXCEPTION = "EXCEPTION"
    EXTERNAL_REF = "EXTERNAL_REF"


class RelationshipType(Enum):
    """Types of relationships between entities."""

    CONTAINS = "CONTAINS"
    DEFINES_IN = "DEFINES_IN"
    CALLS = "CALLS"
    IMPORTS = "IMPORTS"
    INHERITS = "INHERITS"
    INSTANTIATES = "INSTANTIATES"
    USES = "USES"
    LOCATED_IN = "LOCATED_IN"
    IMPORTS_RESOLVED_TO = "IMPORTS_RESOLVED_TO"
    CALLS_RESOLVED = "CALLS_RESOLVED"
    DEFINES_SYMBOL = "DEFINES_SYMBOL"


@dataclass
class Entity:
    """Represents an entity in the knowledge graph.

    Attributes:
        id: Unique identifier for this entity.
        name: Name of the entity.
        type: The type of this entity (EntityType enum).
        file_path: Path to the source file where this entity is defined.
        line_number: Line number where the entity is defined.
        end_line: Optional end line number for code span tracking.
        properties: Dictionary containing additional metadata.
    """

    id: str
    name: str
    type: EntityType
    file_path: str
    line_number: int
    end_line: Optional[int] = None
    properties: dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        """Convert entity to a dictionary representation.

        Returns:
            Dictionary with all entity attributes.
        """
        result = {
            "id": self.id,
            "name": self.name,
            "type": self.type.value,
            "file_path": self.file_path,
            "line_number": self.line_number,
            "properties": self.properties,
        }
        if self.end_line is not None:
            result["end_line"] = self.end_line
        return result


@dataclass
class Relationship:
    """Represents a relationship between two entities.

    Attributes:
        source_id: ID of the source entity.
        target_id: ID of the target entity.
        type: The type of relationship (RelationshipType enum).
        line_number: Line number where this relationship is detected.
    """

    source_id: str
    target_id: str
    type: RelationshipType
    line_number: int
    weight: float = 1.0  # For traversal scoring
    is_resolved: bool = False  # Resolution status flag
    properties: dict[str, Any] = field(default_factory=dict)  # Semantic context

    def to_dict(self) -> dict[str, Any]:
        """Convert relationship to a dictionary representation.

        Returns:
            Dictionary with all relationship attributes.
        """
        result = {
            "source_id": self.source_id,
            "target_id": self.target_id,
            "type": self.type.value,
            "line_number": self.line_number,
        }
        if self.weight != 1.0:
            result["weight"] = self.weight
        if self.is_resolved:
            result["is_resolved"] = self.is_resolved
        if self.properties:
            result["properties"] = self.properties
        return result


class KnowledgeGraph:
    """Represents a knowledge graph with entities and relationships.

    Attributes:
        entities: Dictionary mapping entity IDs to Entity objects.
        relationships: List of all relationships in the graph.
    """

    def __init__(self) -> None:
        """Initialize an empty knowledge graph."""
        self.entities: dict[str, Entity] = {}
        self.relationships: list[Relationship] = []
        # Indices for fast lookups
        self._by_name: dict[str, list[str]] = {}
        self._by_file: dict[str, list[str]] = {}
        self._adjacency: dict[str, list[Relationship]] = {}
        self._reverse_adjacency: dict[str, list[Relationship]] = {}

    def _build_indices(self) -> None:
        """Build lookup indices after all entities/relationships are added."""
        # Index by name (lowercase for case-insensitive lookups)
        for entity in self.entities.values():
            name = entity.name.lower()
            if name not in self._by_name:
                self._by_name[name] = []
            self._by_name[name].append(entity.id)

            # Index by file path
            fp = entity.file_path
            if fp not in self._by_file:
                self._by_file[fp] = []
            self._by_file[fp].append(entity.id)

        # Build adjacency lists
        for rel in self.relationships:
            if rel.source_id not in self._adjacency:
                self._adjacency[rel.source_id] = []
            self._adjacency[rel.source_id].append(rel)

            if rel.target_id not in self._reverse_adjacency:
                self._reverse_adjacency[rel.target_id] = []
            self._reverse_adjacency[rel.target_id].append(rel)

    def add_entity(self, entity: Entity) -> None:
        """Add an entity to the knowledge graph.

        Args:
            entity: The entity to add.
        """
        self.entities[entity.id] = entity

    def add_relationship(self, relationship: Relationship) -> None:
        """Add a relationship to the knowledge graph.

        Args:
            relationship: The relationship to add.
        """
        self.relationships.append(relationship)

    def merge(self, other: "KnowledgeGraph") -> None:
        """Merge another knowledge graph into this one.

        Args:
            other: The knowledge graph to merge from.
        """
        self.entities.update(other.entities)
        self.relationships.extend(other.relationships)

    def to_dict(self) -> dict[str, Any]:
        """Convert the knowledge graph to a dictionary representation.

        Returns:
            Dictionary with 'entities' and 'relationships' keys.
        """
        return {
            "entities": {entity_id: entity.to_dict() for entity_id, entity in self.entities.items()},
            "relationships": [rel.to_dict() for rel in self.relationships],
        }

    def to_json(self) -> str:
        """Convert the knowledge graph to a JSON string.

        Returns:
            JSON string representation of the knowledge graph.
        """
        import json

        return json.dumps(self.to_dict(), indent=2)
