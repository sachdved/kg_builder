"""Round-trip orchestration for KG-mediated agentic coding.

Orchestrates the full workflow:
    1. Build or load existing KG from codebase
    2. Load proposed KG from JSON
    3. Compute diff (ChangeSpec)
    4. Generate edit plan
    5. Optionally format for agent consumption
"""

import json
from pathlib import Path
from typing import Any, Optional

from kg_builder.planning.agent_planner import EditPlan, generate_edit_plan
from kg_builder.planning.kg_diff import ChangeSpec, diff_knowledge_graphs


def run_round_trip(
    codebase_path: str,
    proposed_kg_path: str,
    existing_kg_path: Optional[str] = None,
    exclude_patterns: Optional[list[str]] = None,
    dry_run: bool = True,
) -> dict[str, Any]:
    """Execute the full round-trip workflow.

    Args:
        codebase_path: Path to the codebase root directory.
        proposed_kg_path: Path to the proposed KG JSON file.
        existing_kg_path: Path to an existing KG JSON file.
            If None, builds from codebase.
        exclude_patterns: Glob patterns to exclude when building KG.
        dry_run: If True, only generate the plan without executing.

    Returns:
        {
            "success": bool,
            "change_spec": dict (ChangeSpec),
            "edit_plan": dict (EditPlan),
            "markdown_plan": str,
            "summary": dict,
            "warnings": list[str],
            "error": str | None,
        }
    """
    try:
        # Step 1: Load or build existing KG
        if existing_kg_path:
            with open(existing_kg_path, "r", encoding="utf-8") as f:
                existing_kg = json.load(f)
        else:
            from kg_builder import build_knowledge_graph
            kg = build_knowledge_graph(
                codebase_path, exclude_patterns=exclude_patterns
            )
            existing_kg = kg.to_dict()

        # Step 2: Load proposed KG
        with open(proposed_kg_path, "r", encoding="utf-8") as f:
            proposed_kg = json.load(f)

        # Step 3: Compute diff
        change_spec = diff_knowledge_graphs(existing_kg, proposed_kg)

        if not any([
            change_spec.summary.get("entities_added", 0),
            change_spec.summary.get("entities_removed", 0),
            change_spec.summary.get("entities_modified", 0),
            change_spec.summary.get("relationships_added", 0),
            change_spec.summary.get("relationships_removed", 0),
        ]):
            return {
                "success": True,
                "change_spec": change_spec.to_dict(),
                "edit_plan": {},
                "markdown_plan": "No changes detected between existing and proposed KG.",
                "summary": change_spec.summary,
                "warnings": [],
                "error": None,
            }

        # Step 4: Generate edit plan
        edit_plan = generate_edit_plan(change_spec, codebase_path, existing_kg)

        return {
            "success": True,
            "change_spec": change_spec.to_dict(),
            "edit_plan": edit_plan.to_dict(),
            "markdown_plan": edit_plan.to_markdown(),
            "summary": change_spec.summary,
            "warnings": edit_plan.warnings,
            "error": None,
        }

    except Exception as e:
        return {
            "success": False,
            "change_spec": {},
            "edit_plan": {},
            "markdown_plan": "",
            "summary": {},
            "warnings": [],
            "error": str(e),
        }
