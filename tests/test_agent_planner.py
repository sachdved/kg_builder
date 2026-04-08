"""Tests for the agent planner module."""

import json
import tempfile
from pathlib import Path

import pytest

from kg_builder.planning.agent_planner import (
    EditPlan,
    FileEdit,
    generate_edit_plan,
    _infer_file_path,
    _describe_file_edit,
)
from kg_builder.planning.kg_diff import (
    ChangeSpec,
    EntityChange,
    RelationshipChange,
    diff_knowledge_graphs,
)


# --- Helpers ---


def _make_entity(eid, name, etype="FUNCTION", file_path="file_a.py", line_number=1, **extra):
    entity = {
        "id": eid,
        "name": name,
        "type": etype,
        "file_path": file_path,
        "line_number": line_number,
        "properties": {},
    }
    entity.update(extra)
    return entity


def _make_rel(source, target, rtype="CALLS", line_number=1):
    return {
        "source_id": source,
        "target_id": target,
        "type": rtype,
        "line_number": line_number,
    }


def _make_kg(entities=None, relationships=None):
    return {
        "entities": {e["id"]: e for e in (entities or [])},
        "relationships": relationships or [],
    }


# --- Tests ---


class TestPlanSingleAddition:
    def test_added_entity_creates_modify_plan(self):
        """Adding an entity to an existing file produces a 'modify' action."""
        existing = _make_kg([_make_entity("f.py::foo", "foo", file_path="f.py")])
        proposed = _make_kg([
            _make_entity("f.py::foo", "foo", file_path="f.py"),
            _make_entity("f.py::bar", "bar", etype="CLASS", file_path="f.py"),
        ])
        spec = diff_knowledge_graphs(existing, proposed)

        with tempfile.TemporaryDirectory() as tmpdir:
            # Create the file so it's detected as existing
            (Path(tmpdir) / "f.py").write_text("def foo(): pass\n")

            plan = generate_edit_plan(spec, tmpdir, existing)

        assert len(plan.file_edits) == 1
        assert plan.file_edits[0].action == "modify"
        assert plan.file_edits[0].file_path == "f.py"
        assert any(ec.action == "added" for ec in plan.file_edits[0].entity_changes)

    def test_added_entity_to_new_file_creates_create_plan(self):
        """Adding an entity to a non-existent file produces a 'create' action."""
        existing = _make_kg()
        proposed = _make_kg([
            _make_entity("new_file.py::Foo", "Foo", etype="CLASS", file_path="new_file.py"),
        ])
        spec = diff_knowledge_graphs(existing, proposed)

        with tempfile.TemporaryDirectory() as tmpdir:
            plan = generate_edit_plan(spec, tmpdir, existing)

        assert len(plan.file_edits) == 1
        assert plan.file_edits[0].action == "create"


class TestPlanModificationWithContext:
    def test_context_snippets_loaded_for_neighbors(self):
        """Modified entity's 1-hop neighbors should have code loaded."""
        with tempfile.TemporaryDirectory() as tmpdir:
            # Write a real file with code
            code = "def foo():\n    return 1\n\ndef bar():\n    return foo()\n"
            (Path(tmpdir) / "f.py").write_text(code)

            existing_entities = [
                _make_entity("f.py::foo", "foo", file_path="f.py", line_number=1, end_line=2),
                _make_entity("f.py::bar", "bar", file_path="f.py", line_number=4, end_line=5),
            ]
            existing = _make_kg(
                existing_entities,
                [_make_rel("f.py::bar", "f.py::foo", "CALLS")],
            )

            # Modify foo's type
            proposed_entities = [
                _make_entity("f.py::foo", "foo", file_path="f.py", line_number=1, end_line=2, etype="ASYNC_FUNCTION"),
                _make_entity("f.py::bar", "bar", file_path="f.py", line_number=4, end_line=5),
            ]
            proposed = _make_kg(
                proposed_entities,
                [_make_rel("f.py::bar", "f.py::foo", "CALLS")],
            )

            spec = diff_knowledge_graphs(existing, proposed)
            plan = generate_edit_plan(spec, tmpdir, existing)

            # The modified entity (foo) should have bar as a neighbor
            assert len(plan.file_edits) == 1
            fe = plan.file_edits[0]
            # Context should include at least the neighbor
            assert len(fe.context_snippets) > 0


class TestPlanDeletionWithWarnings:
    def test_removed_entity_with_callers_warns(self):
        """Removing an entity that is referenced by others should generate a warning."""
        entities = [
            _make_entity("f.py::foo", "foo", file_path="f.py"),
            _make_entity("f.py::bar", "bar", file_path="f.py"),
        ]
        rels = [_make_rel("f.py::bar", "f.py::foo", "CALLS")]

        existing = _make_kg(entities, rels)
        # Remove foo, keep bar
        proposed = _make_kg(
            [_make_entity("f.py::bar", "bar", file_path="f.py")],
            [],
        )

        spec = diff_knowledge_graphs(existing, proposed)

        with tempfile.TemporaryDirectory() as tmpdir:
            (Path(tmpdir) / "f.py").write_text("pass\n")
            plan = generate_edit_plan(spec, tmpdir, existing)

        # Should have a warning about bar referencing removed foo
        assert any("f.py::bar" in w for w in plan.warnings)


class TestExecutionOrder:
    def test_creates_before_modifies_before_deletes(self):
        """Execution order should be: create files, then modify, then delete."""
        existing = _make_kg([
            _make_entity("a.py::A", "A", file_path="a.py"),
            _make_entity("b.py::B", "B", file_path="b.py"),
        ])
        proposed = _make_kg([
            # a.py modified (type change)
            _make_entity("a.py::A", "A", etype="CLASS", file_path="a.py"),
            # b.py removed (all entities gone)
            # c.py created (new entity)
            _make_entity("c.py::C", "C", file_path="c.py"),
        ])

        spec = diff_knowledge_graphs(existing, proposed)

        with tempfile.TemporaryDirectory() as tmpdir:
            (Path(tmpdir) / "a.py").write_text("pass\n")
            (Path(tmpdir) / "b.py").write_text("pass\n")
            plan = generate_edit_plan(spec, tmpdir, existing)

        # c.py (create) should come before a.py (modify) before b.py (delete)
        assert plan.execution_order.index("c.py") < plan.execution_order.index("a.py")
        assert plan.execution_order.index("a.py") < plan.execution_order.index("b.py")


class TestInferFilePath:
    def test_infer_from_contains_edge(self):
        """New entity with CONTAINS edge from existing file gets that file's path."""
        existing = _make_kg([
            _make_entity("f.py", "f.py", etype="FILE", file_path="src/f.py"),
        ])
        proposed = _make_kg([
            _make_entity("f.py", "f.py", etype="FILE", file_path="src/f.py"),
            _make_entity("f.py::NewFunc", "NewFunc", file_path=""),
        ], [
            _make_rel("f.py", "f.py::NewFunc", "CONTAINS"),
        ])

        spec = diff_knowledge_graphs(existing, proposed)

        with tempfile.TemporaryDirectory() as tmpdir:
            plan = generate_edit_plan(spec, tmpdir, existing)

        added = [ec for fe in plan.file_edits for ec in fe.entity_changes if ec.action == "added"]
        assert len(added) == 1
        # The file_path should have been inferred
        assert added[0].file_path == "src/f.py"
        # Should have a warning about inference
        assert any("Suggested" in w for w in plan.warnings)


class TestMarkdownOutput:
    def test_markdown_format(self):
        """to_markdown() should produce readable plan text."""
        existing = _make_kg([_make_entity("f.py::foo", "foo", file_path="f.py")])
        proposed = _make_kg([
            _make_entity("f.py::foo", "foo", file_path="f.py", etype="ASYNC_FUNCTION"),
        ])
        spec = diff_knowledge_graphs(existing, proposed)

        with tempfile.TemporaryDirectory() as tmpdir:
            (Path(tmpdir) / "f.py").write_text("def foo(): pass\n")
            plan = generate_edit_plan(spec, tmpdir, existing)

        md = plan.to_markdown()
        assert "## Edit Plan" in md
        assert "MODIFY" in md or "MODIFIED" in md
        assert "f.py" in md

    def test_json_round_trip(self):
        """EditPlan should survive JSON serialization."""
        existing = _make_kg([_make_entity("f.py::foo", "foo", file_path="f.py")])
        proposed = _make_kg([
            _make_entity("f.py::foo", "foo", file_path="f.py", etype="CLASS"),
        ])
        spec = diff_knowledge_graphs(existing, proposed)

        with tempfile.TemporaryDirectory() as tmpdir:
            (Path(tmpdir) / "f.py").write_text("pass\n")
            plan = generate_edit_plan(spec, tmpdir, existing)

        json_str = plan.to_json()
        data = json.loads(json_str)
        assert "file_edits" in data
        assert "execution_order" in data
        assert "warnings" in data
