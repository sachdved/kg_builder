"""Explore skill for entity discovery and visualization.

This module provides ExploreSkill, which handles the /explore command
for discovering entities and exploring their relationships in the knowledge graph.

Usage:
    /explore <entity_name> [--hops N] [--show-code] [--type TYPE]
"""

from typing import Any

from kg_builder.core.models import KnowledgeGraph, RelationshipType
from kg_builder.skills.base import BaseSkill
from kg_builder.skills import register_skill


@register_skill("explore")
class ExploreSkill(BaseSkill):
    """Handle /explore <entity_name> [--hops N] [--show-code] [--type TYPE].

    This skill finds an entity and shows:
    - Entity details (name, type, file location)
    - Outgoing relationships (what it contains/calls/imports)
    - Incoming relationships (what imports/calls it)
    - Callers list
    - Traversal statistics
    - Optional code snippets with --show-code

    Example:
        >>> /explore parse_file --hops 2 --show-code
    """

    def __init__(
        self,
        kg: KnowledgeGraph,
        args: dict[str, Any],
        target_path: str | None = None,
    ) -> None:
        """Initialize the explore skill.

        Args:
            kg: The knowledge graph to query.
            args: Parsed command arguments.
            target_path: Optional path for code extraction.
        """
        super().__init__(kg, args, target_path)
        self.entity_name = self.get_required_arg("entity_name")
        self.hops = self.get_arg("hops", 1)
        self.show_code = self.get_arg("show_code", False)
        self.type_filter = self.get_arg("type", None)

    def run(self) -> str:
        """Execute the explore skill.

        Returns:
            Formatted exploration output.
        """
        # Find matching entities
        matches = self.engine.search_by_name(self.entity_name, fuzzy=True)

        if not matches:
            return f"## No entities found matching '{self.entity_name}'"

        # Filter by type if specified
        if self.type_filter:
            filtered_matches = []
            for eid in matches:
                if eid in self.kg.entities:
                    entity = self.kg.entities[eid]
                    etype = entity.type.value if hasattr(entity.type, 'value') else str(entity.type)
                    if etype == self.type_filter:
                        filtered_matches.append(eid)
            matches = filtered_matches

        if not matches:
            return f"## No entities found matching '{self.entity_name}' with type '{self.type_filter}'"

        output_parts = []

        # Show all matches (up to 5)
        for i, entity_id in enumerate(matches[:5]):
            if i > 0:
                output_parts.append("\n---\n")

            output_parts.extend(self._explore_entity(entity_id))

        if len(matches) > 5:
            output_parts.append(f"\n*... and {len(matches) - 5} more matches (use exact name to filter)*")

        return "\n".join(output_parts)

    def _explore_entity(self, entity_id: str) -> list[str]:
        """Explore a single entity.

        Args:
            entity_id: The entity ID to explore.

        Returns:
            List of formatted output lines.
        """
        parts = []
        entity = self.kg.entities[entity_id]

        # Entity header
        type_short = entity.type.value if hasattr(entity.type, 'value') else str(entity.type)
        parts.append(f"## Entity: `{entity.name}` ({type_short})")
        parts.append(f"**File**: `{entity.file_path}:{entity.line_number}`")

        if entity.end_line:
            parts.append(f"**Lines**: {entity.line_number}-{entity.end_line}")

        # Properties
        if entity.properties:
            props = ", ".join(f"{k}={v}" for k, v in list(entity.properties.items())[:5])
            parts.append(f"**Properties**: {props}")

        parts.append("")

        # Outgoing relationships
        outgoing = self.engine.get_neighbors(
            entity_id, direction="outgoing",
            relationship_types=[RelationshipType.CONTAINS, RelationshipType.CALLS, RelationshipType.IMPORTS]
        )
        if outgoing:
            parts.append("### Outgoing Relationships")
            parts.append(self._format_relationships(outgoing))
            parts.append("")

        # Incoming relationships
        incoming = self.engine.get_neighbors(
            entity_id, direction="incoming",
            relationship_types=[RelationshipType.CONTAINS, RelationshipType.IMPORTS]
        )
        if incoming:
            parts.append("### Incoming Relationships")
            parts.append(self._format_relationships(incoming))
            parts.append("")

        # Callers
        callers = self.engine.get_callers(entity_id)
        if callers:
            parts.append(f"### Callers ({len(callers)})")
            for caller_id in callers[:5]:
                parts.append(f"- {self._format_entity(caller_id)}")
            if len(callers) > 5:
                parts.append(f"... and {len(callers) - 5} more")
            parts.append("")

        # Traversal stats
        visited = self.engine.traverse_hops(
            start_ids=[entity_id],
            max_hops=self.hops,
        )
        parts.append(f"### Reachability ({self.hops} hops)")
        parts.append(f"- Entities within 1 hop: {len([e for e in visited if visited[e][0] == 1])}")
        parts.append(f"- Total entities reachable: {len(visited)}")

        # Code snippets if requested
        if self.show_code:
            parts.append("")
            parts.append("### Code Snippets")
            code_context = self.engine.get_code_context(entity_id, max_hops=min(self.hops, 1))

            for eid, code in list(code_context.items())[:3]:
                if eid in self.kg.entities:
                    name = self.kg.entities[eid].name
                    parts.append(f"\n#### {name}")
                    parts.append("```python")
                    # Truncate long snippets
                    lines = code.split("\n")[:20]
                    parts.append("\n".join(lines))
                    if len(code.split("\n")) > 20:
                        parts.append("...")
                    parts.append("```")

        return parts
