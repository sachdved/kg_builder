"""Generate an edit plan from a KG change specification.

This tool takes a ChangeSpec (JSON file or dict) and a codebase path,
and produces a structured edit plan showing which files to create/modify/delete
with 1-hop neighbor code context.
"""

import json
from typing import Any, Optional

from kg_builder.tools import register_tool


@register_tool("kg_generate_plan")
def kg_generate_plan(
    change_spec_path: str,
    codebase_path: str,
    existing_kg_path: Optional[str] = None,
) -> dict[str, Any]:
    """Generate an edit plan from a change spec file.

    Args:
        change_spec_path: Path to the ChangeSpec JSON file.
        codebase_path: Path to the codebase root directory.
        existing_kg_path: Optional path to the existing KG JSON file
            (for loading neighbor code context).

    Returns:
        {
            "success": bool,
            "plan": dict (EditPlan),
            "file_count": int,
            "total_changes": int,
            "warnings": list[str],
            "markdown": str (human-readable plan)
        }
    """
    try:
        from kg_builder.planning.agent_planner import generate_edit_plan
        from kg_builder.planning.kg_diff import ChangeSpec

        # Load change spec
        with open(change_spec_path, "r", encoding="utf-8") as f:
            spec = ChangeSpec.from_json(f.read())

        # Optionally load existing KG for context
        existing_kg = None
        if existing_kg_path:
            with open(existing_kg_path, "r", encoding="utf-8") as f:
                existing_kg = json.load(f)

        # Generate the plan
        plan = generate_edit_plan(spec, codebase_path, existing_kg)

        return {
            "success": True,
            "plan": plan.to_dict(),
            "file_count": len(plan.file_edits),
            "total_changes": sum(len(fe.entity_changes) for fe in plan.file_edits),
            "warnings": plan.warnings,
            "markdown": plan.to_markdown(),
        }

    except Exception as e:
        return {
            "success": False,
            "error": str(e),
            "plan": {},
            "file_count": 0,
            "total_changes": 0,
            "warnings": [],
            "markdown": "",
        }
