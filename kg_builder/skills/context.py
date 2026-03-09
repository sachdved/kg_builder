"""Code context loading skill.

This module provides ContextSkill, which handles the /context command
for loading comprehensive code context for an entity including its own code,
callers, callees, and imported modules.

Usage:
    /context <entity_name> [--hops N] [--exclude-types TYPES]
"""

from typing import Any

from kg_builder.models import KnowledgeGraph
from kg_builder.skills.base import BaseSkill
from kg_builder.skills import register_skill


@register_skill("context")
class ContextSkill(BaseSkill):
    """Handle /context <entity_name> [--hops N] [--exclude-types TYPES].

    This skill loads code context for an entity:
    - The entity's own code
    - Dependencies and related code (based on hops)
    - Organized by file for efficient reading
    - Optional exclusion of certain entity types

    Example:
        >>> /context parse_file --hops 1
    """

    def __init__(
        self,
        kg: KnowledgeGraph,
        args: dict[str, Any],
        target_path: str | None = None,
    ) -> None:
        """Initialize the context skill.

        Args:
            kg: The knowledge graph to query.
            args: Parsed command arguments.
            target_path: Optional path for code extraction.
        """
        super().__init__(kg, args, target_path)
        self.entity_name = self.get_required_arg("entity_name")
        self.hops = self.get_arg("hops", 1)
        self.exclude_types = self._parse_exclude_types()

    def _parse_exclude_types(self) -> list[str] | None:
        """Parse the --exclude-types argument.

        Returns:
            List of entity type values to exclude, or None.
        """
        exclude_str = self.get_arg("exclude_types")
        if not exclude_str:
            return None

        # Handle comma-separated or space-separated
        if isinstance(exclude_str, str):
            return [t.strip() for t in exclude_str.replace(",", " ").split()]
        return list(exclude_str) if isinstance(exclude_str, list) else None

    def run(self) -> str:
        """Execute the context loading skill.

        Returns:
            Formatted code context output.
        """
        # Find the target entity
        target_id = self._find_entity_by_name(self.entity_name, fuzzy=True)

        if not target_id:
            return f"## No entities found matching '{self.entity_name}'"

        target_entity = self.kg.entities[target_id]

        parts = []
        parts.append(f"## Code Context: `{target_entity.name}`")
        parts.append(f"**File**: {self._format_entity(target_id)}")
        parts.append("")

        # Traverse to get all relevant entities
        visited = self.engine.traverse_hops(
            start_ids=[target_id],
            max_hops=self.hops,
            exclude_types=self.exclude_types,
        )

        # Group by file
        files_to_read: dict[str, list[str]] = {}
        for eid in visited.keys():
            if eid in self.kg.entities:
                fp = self.kg.entities[eid].file_path
                if fp not in files_to_read:
                    files_to_read[fp] = []
                files_to_read[fp].append(eid)

        # Extract and format code for each file
        total_entities = 0
        for filepath, entity_ids in sorted(files_to_read.items()):
            try:
                with open(filepath, "r", encoding="utf-8") as f:
                    lines = f.readlines()

                # Show file header
                short_path = filepath.split("/")[-1] if "/" in filepath else filepath
                parts.append(f"### 📄 `{short_path}`")
                parts.append("")

                for eid in entity_ids:
                    if eid not in self.kg.entities:
                        continue

                    entity = self.kg.entities[eid]
                    total_entities += 1

                    # Show entity header
                    type_short = entity.type.value if hasattr(entity.type, 'value') else str(entity.type)
                    is_target = "⭐ (target)" if eid == target_id else ""
                    parts.append(f"**{entity.name}** ({type_short}) {is_target}")

                    # Extract code
                    start = max(0, entity.line_number - 1)
                    end = entity.end_line if entity.end_line else min(len(lines), start + 25)
                    code = "".join(lines[start:end]).rstrip()

                    # Truncate very long snippets
                    if len(code.split("\n")) > 40:
                        code_lines = code.split("\n")[:40]
                        code = "\n".join(code_lines) + "\n... [truncated]"

                    parts.append("```python")
                    parts.append(code)
                    parts.append("```")
                    parts.append("")

            except OSError as e:
                short_path = filepath.split("/")[-1]
                parts.append(f"### {short_path}")
                parts.append(f"*Error reading file: {e}*")
                parts.append("")

        # Summary
        parts.append("---")
        parts.append(f"**Summary**: {len(files_to_read)} file(s), {total_entities} entity(s)")
        if self.exclude_types:
            parts.append(f"Excluded types: {', '.join(self.exclude_types)}")

        return "\n".join(parts)
