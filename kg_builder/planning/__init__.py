"""KG diffing and edit planning.

This submodule provides tools for comparing knowledge graphs and generating
structured edit plans:
- ChangeSpec: structured diff between two KGs
- EditPlan: file-level operations with code context
- round_trip: orchestration of full workflow
"""

from kg_builder.planning.kg_diff import (
    ChangeSpec,
    EntityChange,
    RelationshipChange,
    diff_knowledge_graphs,
    load_change_spec,
    save_change_spec,
)
from kg_builder.planning.agent_planner import (
    EditPlan,
    FileEdit,
    generate_edit_plan,
)
from kg_builder.planning.round_trip import run_round_trip

__all__ = [
    # Diff components
    "ChangeSpec",
    "EntityChange",
    "RelationshipChange",
    "diff_knowledge_graphs",
    "load_change_spec",
    "save_change_spec",
    # Edit planning
    "EditPlan",
    "FileEdit",
    "generate_edit_plan",
    # Orchestration
    "run_round_trip",
]
