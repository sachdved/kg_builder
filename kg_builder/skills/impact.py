"""Impact analysis skill for change impact assessment.

This module provides ImpactSkill, which handles the /impact command
for analyzing what will be affected by changing a specific entity.

Usage:
    /impact <entity_name> [--depth N] [--include-code]
"""

from typing import Any

from kg_builder.models import KnowledgeGraph, RelationshipType
from kg_builder.skills.base import BaseSkill
from kg_builder.skills import register_skill


@register_skill("impact")
class ImpactSkill(BaseSkill):
    """Handle /impact <entity_name> [--depth N] [--include-code].

    This skill analyzes what will be affected by modifying an entity:
    - Direct callers (entities that call this one)
    - Transitive dependents (callers of callers, etc.)
    - Impact categorized by relationship type and files
    - Risk assessment based on reach

    Example:
        >>> /impact parse_file --depth 3
    """

    def __init__(
        self,
        kg: KnowledgeGraph,
        args: dict[str, Any],
        target_path: str | None = None,
    ) -> None:
        """Initialize the impact skill.

        Args:
            kg: The knowledge graph to query.
            args: Parsed command arguments.
            target_path: Optional path for code extraction.
        """
        super().__init__(kg, args, target_path)
        self.entity_name = self.get_required_arg("entity_name")
        self.depth = self.get_arg("depth", 2)
        self.include_code = self.get_arg("include_code", False)

    def run(self) -> str:
        """Execute the impact analysis skill.

        Returns:
            Formatted impact analysis output.
        """
        # Find the target entity
        target_id = self._find_entity_by_name(self.entity_name, fuzzy=True)

        if not target_id:
            return f"## No entities found matching '{self.entity_name}'"

        entity = self.kg.entities[target_id]
        parts = []

        # Header
        type_short = entity.type.value if hasattr(entity.type, 'value') else str(entity.type)
        parts.append(f"## Impact Analysis: `{entity.name}` ({type_short})")
        parts.append(f"**Target**: {self._format_entity(target_id)}")
        parts.append("")

        # Get direct callers
        direct_callers = self.engine.get_callers(target_id)

        # Traverse to find all dependents (reverse direction)
        # We traverse incoming CALLS relationships to find who depends on this
        all_affected = set()
        call_graph = []

        # BFS for transitive callers
        queue = list(direct_callers)
        depths = {caller: 1 for caller in direct_callers}

        while queue:
            current = queue.pop(0)
            current_depth = depths[current]

            if current_depth >= self.depth:
                continue

            parent_callers = self.engine.get_callers(current)
            for parent in parent_callers:
                if parent not in all_affected:
                    all_affected.add(parent)
                    depths[parent] = current_depth + 1
                    queue.append(parent)
                    call_graph.append({
                        "caller": parent,
                        "callee": current,
                        "depth": current_depth + 1,
                    })

        transitive_callers = [c for c in all_affected if c not in direct_callers]

        # Direct impact section
        parts.append("### Direct Impact")
        if direct_callers:
            parts.append(f"**{len(direct_callers)} entity/entities directly call this**:")
            for caller_id in direct_callers[:5]:
                parts.append(f"- {self._format_entity(caller_id)}")
            if len(direct_callers) > 5:
                parts.append(f"... and {len(direct_callers) - 5} more")
        else:
            parts.append("*No direct callers found*")
        parts.append("")

        # Transitive impact section
        parts.append("### Transitive Impact")
        if transitive_callers:
            parts.append(f"**{len(transitive_callers)} additional entities transitively depend on this** (at depth {self.depth}):")
            for caller_id in transitive_callers[:5]:
                depth = depths.get(caller_id, 0)
                parts.append(f"- {self._format_entity(caller_id)} (depth: {depth})")
            if len(transitive_callers) > 5:
                parts.append(f"... and {len(transitive_callers) - 5} more")
        else:
            parts.append("*No transitive dependents found*")
        parts.append("")

        # Files affected
        files_affected = set()
        for eid in all_affected:
            if eid in self.kg.entities:
                files_affected.add(self.kg.entities[eid].file_path)

        parts.append("### Files Affected")
        parts.append(f"**{len(files_affected)} file/files contain affected entities**:")
        for fpath in sorted(files_affected)[:10]:
            # Show relative path
            short_path = fpath.split("/")[-1] if "/" in fpath else fpath
            parts.append(f"- `{short_path}`")
        if len(files_affected) > 10:
            parts.append(f"... and {len(files_affected) - 10} more files")
        parts.append("")

        # Risk assessment
        total_affected = len(all_affected)
        risk_level, risk_reasons = self._assess_risk(total_affected, direct_callers, files_affected)

        parts.append("### Risk Assessment")
        parts.append(f"**Risk Level**: {risk_level}")
        parts.append("")
        parts.append("**Reasoning**:")
        for reason in risk_reasons:
            parts.append(f"- {reason}")

        return "\n".join(parts)

    def _assess_risk(
        self,
        total_affected: int,
        direct_callers: list[str],
        files_affected: set[str],
    ) -> tuple[str, list[str]]:
        """Assess the risk level of changing this entity.

        Args:
            total_affected: Total number of affected entities.
            direct_callers: List of direct caller IDs.
            files_affected: Set of affected file paths.

        Returns:
            Tuple of (risk_level, reasons).
        """
        reasons = []
        score = 0

        if total_affected == 0:
            return "LOW", ["No other entities depend on this"]

        if total_affected >= 20:
            score += 3
            reasons.append(f"High reach: {total_affected} entities affected")
        elif total_affected >= 10:
            score += 2
            reasons.append(f"Moderate reach: {total_affected} entities affected")
        else:
            score += 1
            reasons.append(f"Low reach: {total_affected} entities affected")

        if len(files_affected) >= 5:
            score += 2
            reasons.append(f"Cross-file impact: {len(files_affected)} files involved")
        elif len(files_affected) >= 3:
            score += 1
            reasons.append(f"Some cross-file impact: {len(files_affected)} files involved")

        # Check for test files
        test_files = [f for f in files_affected if "test" in f.lower()]
        if test_files:
            reasons.append(f"Affects {len(test_files)} test file(s)")

        # Determine level
        if score >= 5:
            level = "HIGH"
        elif score >= 3:
            level = "MEDIUM"
        else:
            level = "LOW"

        return level, reasons
