"""Agent plan generation from KG change specifications.

Given a ChangeSpec (diff between existing and proposed KG) and a codebase path,
produces a structured EditPlan that maps changes to file-level operations with
neighbor code context. The plan can be output as JSON or markdown for CLI-based
agent negotiation.
"""

import json
from collections import Counter
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Optional

from kg_builder.kg_diff import ChangeSpec, EntityChange


@dataclass
class FileEdit:
    """A set of changes targeting a single file.

    Attributes:
        file_path: Path to the file being edited.
        action: One of "create", "modify", "delete".
        entity_changes: The EntityChange objects affecting this file.
        context_snippets: Code snippets from 1-hop neighbors, keyed by entity_id.
        description: Human-readable summary of what to do in this file.
    """

    file_path: str
    action: str
    entity_changes: list[EntityChange] = field(default_factory=list)
    context_snippets: dict[str, str] = field(default_factory=dict)
    description: str = ""

    def to_dict(self) -> dict[str, Any]:
        return {
            "file_path": self.file_path,
            "action": self.action,
            "entity_changes": [ec.to_dict() for ec in self.entity_changes],
            "context_snippets": self.context_snippets,
            "description": self.description,
        }


@dataclass
class EditPlan:
    """A complete edit plan derived from a ChangeSpec.

    Attributes:
        change_spec_summary: Summary counts from the source ChangeSpec.
        codebase_path: Path to the codebase root.
        file_edits: One FileEdit per affected file.
        execution_order: File paths in suggested execution order.
        warnings: Potential issues for human review.
    """

    change_spec_summary: dict[str, int] = field(default_factory=dict)
    codebase_path: str = ""
    file_edits: list[FileEdit] = field(default_factory=list)
    execution_order: list[str] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        return {
            "change_spec_summary": self.change_spec_summary,
            "codebase_path": self.codebase_path,
            "file_edits": [fe.to_dict() for fe in self.file_edits],
            "execution_order": self.execution_order,
            "warnings": self.warnings,
        }

    def to_json(self) -> str:
        return json.dumps(self.to_dict(), indent=2)

    def to_markdown(self) -> str:
        """Render the edit plan as markdown for CLI negotiation."""
        total_files = len(self.file_edits)
        total_changes = sum(len(fe.entity_changes) for fe in self.file_edits)
        lines = [f"## Edit Plan — {total_files} file(s), {total_changes} change(s)\n"]

        for i, fe in enumerate(self.file_edits, 1):
            lines.append(f"### {i}. {fe.action.upper()}: `{fe.file_path}`")
            lines.append(f"**Action**: {fe.description}\n")

            for ec in fe.entity_changes:
                action_label = ec.action.upper()
                lines.append(f"- **{action_label}** `{ec.entity_id}` ({ec.entity_type})")
                if ec.field_diffs:
                    for field_name, (old, new) in ec.field_diffs.items():
                        lines.append(f"  - `{field_name}`: `{old}` → `{new}`")

            if fe.context_snippets:
                lines.append("\n**Neighbor context loaded**:")
                for eid, snippet in fe.context_snippets.items():
                    preview = snippet.strip().split("\n")[0][:80] if snippet.strip() else "(empty)"
                    lines.append(f"- `{eid}` — `{preview}`")

            lines.append("")

        if self.warnings:
            lines.append("### Warnings")
            for w in self.warnings:
                lines.append(f"- {w}")
            lines.append("")

        return "\n".join(lines)


def _infer_file_path(
    entity_change: EntityChange,
    change_spec: ChangeSpec,
    kg_entities: dict[str, Any],
) -> Optional[str]:
    """Infer where a new entity should be placed based on its relationships.

    Priority:
    1. CONTAINS edge from an existing file entity
    2. CONTAINS edge from an existing class/module
    3. Majority vote of CALLS/USES target file paths

    Args:
        entity_change: The added entity with blank file_path.
        change_spec: The full ChangeSpec for relationship context.
        kg_entities: Entity dict from the existing KG.

    Returns:
        Inferred file path, or None if no inference possible.
    """
    eid = entity_change.entity_id

    # Check relationship changes for CONTAINS edges pointing to this entity
    for rc in change_spec.relationship_changes:
        if rc.target_id == eid and rc.relationship_type == "CONTAINS":
            source = rc.source_id
            # If source is in existing KG, use its file_path
            if source in kg_entities:
                return kg_entities[source].get("file_path")

    # Check for CONTAINS where this entity is the source (less common)
    for rc in change_spec.relationship_changes:
        if rc.source_id == eid and rc.relationship_type == "CONTAINS":
            target = rc.target_id
            if target in kg_entities:
                return kg_entities[target].get("file_path")

    # Majority vote from CALLS/USES targets
    file_votes: list[str] = []
    for rc in change_spec.relationship_changes:
        if rc.source_id == eid and rc.relationship_type in ("CALLS", "USES", "INHERITS"):
            target = rc.target_id
            if target in kg_entities:
                fp = kg_entities[target].get("file_path")
                if fp:
                    file_votes.append(fp)

    if file_votes:
        most_common = Counter(file_votes).most_common(1)[0][0]
        return most_common

    return None


def _describe_file_edit(fe: FileEdit) -> str:
    """Generate a human-readable description for a FileEdit."""
    parts = []
    for ec in fe.entity_changes:
        if ec.action == "added":
            parts.append(f"Add {ec.entity_type.lower()} `{ec.entity_id.split('::')[-1]}`")
        elif ec.action == "removed":
            parts.append(f"Remove {ec.entity_type.lower()} `{ec.entity_id.split('::')[-1]}`")
        elif ec.action == "modified":
            changed_fields = ", ".join(ec.field_diffs.keys())
            parts.append(f"Modify `{ec.entity_id.split('::')[-1]}` ({changed_fields})")

    return "; ".join(parts) if parts else "No changes"


def _load_context_snippets(
    neighbor_ids: list[str],
    kg_entities: dict[str, Any],
    codebase_path: str,
    max_neighbors: int = 10,
) -> dict[str, str]:
    """Load code snippets for neighbor entities.

    Args:
        neighbor_ids: Entity IDs to load code for.
        kg_entities: Entity dict from the KG.
        codebase_path: Root path for resolving file paths.
        max_neighbors: Maximum neighbors to load context for.

    Returns:
        Dict mapping entity_id to code snippet.
    """
    snippets: dict[str, str] = {}
    root = Path(codebase_path)

    for eid in neighbor_ids[:max_neighbors]:
        if eid not in kg_entities:
            continue

        entity = kg_entities[eid]
        file_path = entity.get("file_path", "")
        line_number = entity.get("line_number", 0)
        end_line = entity.get("end_line")

        # Try to resolve file path
        candidate_paths = [
            Path(file_path),
            root / file_path,
        ]

        for fp in candidate_paths:
            if fp.is_file():
                try:
                    lines = fp.read_text(encoding="utf-8").splitlines()
                    start = max(0, line_number - 1)
                    end = end_line if end_line else min(start + 10, len(lines))
                    snippets[eid] = "\n".join(lines[start:end])
                except (OSError, UnicodeDecodeError):
                    snippets[eid] = "# Could not read file"
                break

    return snippets


def generate_edit_plan(
    change_spec: ChangeSpec,
    codebase_path: str,
    existing_kg: Optional[dict[str, Any]] = None,
) -> EditPlan:
    """Generate an edit plan from a ChangeSpec.

    Args:
        change_spec: The diff between existing and proposed KGs.
        codebase_path: Path to the codebase root directory.
        existing_kg: Optional existing KG dict for context loading.
            If provided, used to load code snippets for neighbor entities.

    Returns:
        An EditPlan with file-level operations, context, and warnings.
    """
    kg_entities = (existing_kg or {}).get("entities", {})
    warnings: list[str] = []

    # Infer file_path for added entities that have blank/empty paths
    for ec in change_spec.entity_changes:
        if ec.action == "added" and not ec.file_path:
            inferred = _infer_file_path(ec, change_spec, kg_entities)
            if inferred:
                ec.file_path = inferred
                warnings.append(
                    f"`{ec.entity_id}` has no file_path specified. "
                    f"Suggested: `{inferred}` (inferred from relationships). **Confirm?**"
                )
            else:
                warnings.append(
                    f"`{ec.entity_id}` has no file_path and none could be inferred. "
                    f"Please specify a target file."
                )

    # Group entity changes by file_path
    changes_by_file: dict[str, list[EntityChange]] = {}
    for ec in change_spec.entity_changes:
        fp = ec.file_path or "(unknown)"
        if fp not in changes_by_file:
            changes_by_file[fp] = []
        changes_by_file[fp].append(ec)

    # Build FileEdits
    file_edits: list[FileEdit] = []
    root = Path(codebase_path)

    for file_path, entity_changes in sorted(changes_by_file.items()):
        actions = {ec.action for ec in entity_changes}

        # Determine file-level action
        file_exists = (root / file_path).is_file() or Path(file_path).is_file()

        if not file_exists and all(a == "added" for a in actions):
            action = "create"
        elif all(a == "removed" for a in actions):
            action = "delete"
        else:
            action = "modify"

        # Collect all neighbor IDs across all changes in this file
        all_neighbor_ids: list[str] = []
        for ec in entity_changes:
            all_neighbor_ids.extend(ec.neighbor_ids)
        unique_neighbors = list(dict.fromkeys(all_neighbor_ids))  # dedupe, preserve order

        # Load context snippets
        context_snippets = {}
        if kg_entities:
            context_snippets = _load_context_snippets(
                unique_neighbors, kg_entities, codebase_path
            )

        fe = FileEdit(
            file_path=file_path,
            action=action,
            entity_changes=entity_changes,
            context_snippets=context_snippets,
        )
        fe.description = _describe_file_edit(fe)
        file_edits.append(fe)

    # Warn about removed entities that have incoming callers in existing KG
    if kg_entities:
        for ec in change_spec.entity_changes:
            if ec.action == "removed":
                # Check if any unchanged entity calls this one
                for neighbor_id in ec.neighbor_ids:
                    # If the neighbor is not also being removed, it might break
                    removed_ids = {
                        e.entity_id for e in change_spec.entity_changes
                        if e.action == "removed"
                    }
                    if neighbor_id not in removed_ids and neighbor_id in kg_entities:
                        warnings.append(
                            f"`{ec.entity_id}` is being removed but "
                            f"`{neighbor_id}` references it — this may break callers."
                        )
                        break  # One warning per removed entity is enough

    # Determine execution order: creates first, modifies next, deletes last
    creates = [fe.file_path for fe in file_edits if fe.action == "create"]
    modifies = [fe.file_path for fe in file_edits if fe.action == "modify"]
    deletes = [fe.file_path for fe in file_edits if fe.action == "delete"]
    execution_order = creates + modifies + deletes

    return EditPlan(
        change_spec_summary=change_spec.summary,
        codebase_path=codebase_path,
        file_edits=file_edits,
        execution_order=execution_order,
        warnings=warnings,
    )
