"""Tests for the round-trip orchestration workflow."""

import json
import tempfile
from pathlib import Path

import pytest

from kg_builder.planning.round_trip import run_round_trip


def _make_entity(eid, name, etype="FUNCTION", file_path="f.py", line_number=1):
    return {
        "id": eid,
        "name": name,
        "type": etype,
        "file_path": file_path,
        "line_number": line_number,
        "properties": {},
    }


def _make_kg(entities=None, relationships=None):
    return {
        "entities": {e["id"]: e for e in (entities or [])},
        "relationships": relationships or [],
    }


class TestRoundTrip:
    def test_dry_run_with_existing_kg(self, tmp_path):
        """Full round trip with pre-built existing KG."""
        existing = _make_kg([
            _make_entity("f.py::foo", "foo"),
            _make_entity("f.py::bar", "bar"),
        ])
        proposed = _make_kg([
            _make_entity("f.py::foo", "foo", etype="ASYNC_FUNCTION"),
            _make_entity("f.py::baz", "baz", etype="CLASS"),
        ])

        existing_path = tmp_path / "existing.json"
        proposed_path = tmp_path / "proposed.json"
        existing_path.write_text(json.dumps(existing))
        proposed_path.write_text(json.dumps(proposed))

        # Create codebase with the file
        (tmp_path / "f.py").write_text("def foo(): pass\ndef bar(): pass\n")

        result = run_round_trip(
            codebase_path=str(tmp_path),
            proposed_kg_path=str(proposed_path),
            existing_kg_path=str(existing_path),
            dry_run=True,
        )

        assert result["success"] is True
        assert result["error"] is None
        assert result["summary"]["entities_added"] == 1
        assert result["summary"]["entities_removed"] == 1
        assert result["summary"]["entities_modified"] == 1
        assert "Edit Plan" in result["markdown_plan"]
        assert len(result["edit_plan"]["file_edits"]) > 0

    def test_no_changes_returns_empty_plan(self, tmp_path):
        """Identical KGs produce no changes."""
        kg = _make_kg([_make_entity("f.py::foo", "foo")])

        existing_path = tmp_path / "existing.json"
        proposed_path = tmp_path / "proposed.json"
        existing_path.write_text(json.dumps(kg))
        proposed_path.write_text(json.dumps(kg))

        (tmp_path / "f.py").write_text("def foo(): pass\n")

        result = run_round_trip(
            codebase_path=str(tmp_path),
            proposed_kg_path=str(proposed_path),
            existing_kg_path=str(existing_path),
        )

        assert result["success"] is True
        assert "No changes" in result["markdown_plan"]
        assert result["edit_plan"] == {}

    def test_builds_kg_from_codebase_when_no_existing(self, tmp_path):
        """When no existing KG path provided, builds from codebase."""
        # Create a simple Python file
        (tmp_path / "hello.py").write_text("def hello():\n    return 'world'\n")

        # Proposed adds a new function
        proposed = _make_kg([
            _make_entity("hello.py::hello", "hello", file_path=str(tmp_path / "hello.py")),
            _make_entity("hello.py::goodbye", "goodbye", file_path=str(tmp_path / "hello.py")),
        ])
        proposed_path = tmp_path / "proposed.json"
        proposed_path.write_text(json.dumps(proposed))

        result = run_round_trip(
            codebase_path=str(tmp_path),
            proposed_kg_path=str(proposed_path),
            existing_kg_path=None,
        )

        assert result["success"] is True
        # The auto-built KG will have different entity IDs than our simple proposed,
        # so there will be changes (the exact counts depend on parsing)
        assert result["change_spec"] != {}

    def test_invalid_proposed_path(self, tmp_path):
        """Non-existent proposed KG file returns error."""
        existing = _make_kg([_make_entity("f.py::foo", "foo")])
        existing_path = tmp_path / "existing.json"
        existing_path.write_text(json.dumps(existing))

        result = run_round_trip(
            codebase_path=str(tmp_path),
            proposed_kg_path=str(tmp_path / "nonexistent.json"),
            existing_kg_path=str(existing_path),
        )

        assert result["success"] is False
        assert result["error"] is not None

    def test_warnings_propagated(self, tmp_path):
        """Warnings from the planner are included in round-trip result."""
        existing = _make_kg(
            [
                _make_entity("f.py::foo", "foo"),
                _make_entity("f.py::bar", "bar"),
            ],
            [{"source_id": "f.py::bar", "target_id": "f.py::foo", "type": "CALLS", "line_number": 1}],
        )
        # Remove foo (bar still calls it)
        proposed = _make_kg([_make_entity("f.py::bar", "bar")])

        existing_path = tmp_path / "existing.json"
        proposed_path = tmp_path / "proposed.json"
        existing_path.write_text(json.dumps(existing))
        proposed_path.write_text(json.dumps(proposed))

        (tmp_path / "f.py").write_text("def foo(): pass\ndef bar(): foo()\n")

        result = run_round_trip(
            codebase_path=str(tmp_path),
            proposed_kg_path=str(proposed_path),
            existing_kg_path=str(existing_path),
        )

        assert result["success"] is True
        # Should warn about bar referencing removed foo
        assert any("bar" in w for w in result["warnings"])
