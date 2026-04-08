"""Base class for skill handlers.

This module provides BaseSkill, an abstract base class that all skills
should inherit from. It provides common functionality like KG access,
formatting helpers, and lazy symbol table building.
"""

from abc import ABC, abstractmethod
from typing import Any, Optional

from kg_builder.core.models import Entity, KnowledgeGraph, Relationship


class BaseSkill(ABC):
    """Abstract base class for skill handlers.

    All skills should inherit from this class and implement the run() method.

    Attributes:
        kg: The knowledge graph to query.
        args: Parsed command-line arguments as a dictionary.
        target_path: Optional path for file operations.

    Example:
        class MySkill(BaseSkill):
            def run(self) -> str:
                entity_id = self.get_arg("entity_name")
                return f"Entity: {entity_id}"
    """

    def __init__(
        self,
        kg: KnowledgeGraph,
        args: dict[str, Any],
        target_path: Optional[str] = None,
    ) -> None:
        """Initialize the skill with a knowledge graph and arguments.

        Args:
            kg: The knowledge graph to query.
            args: Parsed command-line arguments.
            target_path: Optional path for file operations.
        """
        self.kg = kg
        self.args = args
        self.target_path = target_path

        # Lazy initialization of query engine and symbol resolver
        self._engine: Any = None
        self._resolver: Any = None

    @property
    def engine(self):
        """Lazy initialization of KGQueryEngine."""
        if self._engine is None:
            from kg_builder.core.query_engine import KGQueryEngine
            self._engine = KGQueryEngine(self.kg)
        return self._engine

    @property
    def resolver(self):
        """Lazy initialization of SymbolResolver with symbol table building."""
        if self._resolver is None:
            from kg_builder.core.symbol_resolver import SymbolResolver
            self._resolver = SymbolResolver(self.kg)
            self._resolver.build_symbol_table()
        return self._resolver

    def get_arg(self, key: str, default: Any = None) -> Any:
        """Get an argument value with optional default.

        Args:
            key: The argument key.
            default: Default value if not found.

        Returns:
            The argument value or default.
        """
        return self.args.get(key, default)

    def get_required_arg(self, key: str) -> Any:
        """Get a required argument or raise an error.

        Args:
            key: The argument key.

        Returns:
            The argument value.

        Raises:
            ValueError: If the argument is not provided.
        """
        if key not in self.args:
            raise ValueError(f"Required argument '{key}' is missing")
        return self.args[key]

    def _format_entity(self, entity_id: str) -> str:
        """Format an entity ID for display.

        Args:
            entity_id: The entity ID to format.

        Returns:
            Formatted string like "ClassName in file.py:line".
        """
        if entity_id not in self.kg.entities:
            return entity_id

        entity = self.kg.entities[entity_id]
        type_short = entity.type.value[:4] if hasattr(entity.type, 'value') else str(entity.type)[:4]
        return f"`{entity.name}` ({type_short}) at {entity.file_path}:{entity.line_number}"

    def _format_entity_compact(self, entity_id: str) -> str:
        """Format an entity ID compactly for lists.

        Args:
            entity_id: The entity ID to format.

        Returns:
            Formatted string like "ClassName".
        """
        if entity_id not in self.kg.entities:
            return entity_id.split("::")[-1]

        entity = self.kg.entities[entity_id]
        return entity.name

    def _format_relationships(
        self,
        relationships: list[tuple],
        max_items: int = 10,
    ) -> str:
        """Format a list of relationships for display.

        Args:
            relationships: List of (relationship_type, entity_id) tuples.
            max_items: Maximum items to show.

        Returns:
            Formatted relationship list.
        """
        if not relationships:
            return "  (none)"

        lines = []
        for i, (rel_type, target_id) in enumerate(relationships[:max_items]):
            type_short = rel_type.value if hasattr(rel_type, 'value') else str(rel_type)
            name = self._format_entity_compact(target_id)
            lines.append(f"  - {type_short}: {name}")

        if len(relationships) > max_items:
            lines.append(f"  ... and {len(relationships) - max_items} more")

        return "\n".join(lines)

    def _find_entity_by_name(self, name: str, fuzzy: bool = True) -> Optional[str]:
        """Find an entity by name.

        Args:
            name: The name to search for.
            fuzzy: Whether to use fuzzy matching.

        Returns:
            First matching entity ID, or None if not found.
        """
        matches = self.engine.search_by_name(name, fuzzy=fuzzy)
        return matches[0] if matches else None

    @abstractmethod
    def run(self) -> str:
        """Execute the skill and return formatted output.

        Returns:
            Formatted text output for display to the user.
        """
        pass
