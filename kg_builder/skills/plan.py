"""Plan skill — generate and display an edit plan from a change spec.

Usage: /plan <change_spec.json> --codebase <path> [--existing-kg <path>] [--format markdown|json]
"""

import json

from kg_builder.skills import register_skill
from kg_builder.skills.base import BaseSkill


@register_skill("plan")
class PlanSkill(BaseSkill):
    """Generate and display an edit plan from a KG change specification.

    Reads a ChangeSpec JSON file, generates an edit plan showing which
    files to create/modify/delete with context, and displays it.
    """

    def run(self) -> str:
        from kg_builder.planning.agent_planner import generate_edit_plan
        from kg_builder.planning.kg_diff import ChangeSpec

        # Get arguments
        spec_path = self.get_arg("target") or self.get_arg("entity_name")
        if not spec_path:
            return "Error: Please provide the path to a change_spec.json file.\nUsage: /plan <change_spec.json> --codebase <path>"

        codebase_path = self.get_arg("codebase", ".")
        existing_kg_path = self.get_arg("existing_kg")
        output_format = self.get_arg("format", "markdown")

        # Load change spec
        try:
            with open(spec_path, "r", encoding="utf-8") as f:
                spec = ChangeSpec.from_json(f.read())
        except (OSError, json.JSONDecodeError) as e:
            return f"Error loading change spec: {e}"

        # Load existing KG if provided
        existing_kg = None
        if existing_kg_path:
            try:
                with open(existing_kg_path, "r", encoding="utf-8") as f:
                    existing_kg = json.load(f)
            except (OSError, json.JSONDecodeError) as e:
                return f"Error loading existing KG: {e}"

        # Generate plan
        plan = generate_edit_plan(spec, codebase_path, existing_kg)

        # Store structured data for programmatic access
        self.result_data = plan.to_dict()

        if output_format == "json":
            return plan.to_json()
        else:
            return plan.to_markdown()
