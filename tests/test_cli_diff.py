"""Tests for CLI diff and plan subcommands."""

import json
import subprocess
import sys
import tempfile
from pathlib import Path

import pytest


def run_cli(*args):
    """Run the kg_builder CLI and return (returncode, stdout, stderr)."""
    result = subprocess.run(
        [sys.executable, "-m", "kg_builder.cli", *args],
        capture_output=True,
        text=True,
    )
    return result.returncode, result.stdout, result.stderr


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


@pytest.fixture
def kg_pair(tmp_path):
    """Create a pair of KG JSON files (existing + proposed) in a temp dir."""
    existing = _make_kg([
        _make_entity("f.py::foo", "foo"),
        _make_entity("f.py::bar", "bar"),
    ], [
        {"source_id": "f.py::foo", "target_id": "f.py::bar", "type": "CALLS", "line_number": 1},
    ])
    proposed = _make_kg([
        _make_entity("f.py::foo", "foo", etype="ASYNC_FUNCTION"),
        _make_entity("f.py::baz", "baz", etype="CLASS"),
    ], [
        {"source_id": "f.py::foo", "target_id": "f.py::baz", "type": "CALLS", "line_number": 1},
    ])

    existing_path = tmp_path / "existing.json"
    proposed_path = tmp_path / "proposed.json"
    existing_path.write_text(json.dumps(existing, indent=2))
    proposed_path.write_text(json.dumps(proposed, indent=2))

    return existing_path, proposed_path


class TestCliDiff:
    def test_diff_outputs_json(self, kg_pair):
        existing_path, proposed_path = kg_pair
        rc, stdout, stderr = run_cli("diff", str(existing_path), str(proposed_path))
        assert rc == 0
        spec = json.loads(stdout)
        assert spec["version"] == "1.0"
        assert spec["summary"]["entities_added"] == 1  # baz
        assert spec["summary"]["entities_removed"] == 1  # bar
        assert spec["summary"]["entities_modified"] == 1  # foo type change

    def test_diff_output_file(self, kg_pair, tmp_path):
        existing_path, proposed_path = kg_pair
        output_path = tmp_path / "change_spec.json"
        rc, stdout, stderr = run_cli(
            "diff", str(existing_path), str(proposed_path),
            "--output", str(output_path),
        )
        assert rc == 0
        assert output_path.is_file()
        spec = json.loads(output_path.read_text())
        assert "entity_changes" in spec

    def test_diff_summary_only(self, kg_pair):
        existing_path, proposed_path = kg_pair
        rc, stdout, stderr = run_cli(
            "diff", str(existing_path), str(proposed_path), "--summary-only",
        )
        assert rc == 0
        assert "entities_added: 1" in stdout
        assert "entities_removed: 1" in stdout

    def test_diff_missing_file(self, tmp_path):
        rc, stdout, stderr = run_cli("diff", str(tmp_path / "nope.json"), str(tmp_path / "also_nope.json"))
        assert rc != 0
        assert "not found" in stderr.lower() or "error" in stderr.lower()


class TestCliPlan:
    def test_plan_markdown_output(self, kg_pair, tmp_path):
        existing_path, proposed_path = kg_pair

        # First generate change spec
        spec_path = tmp_path / "spec.json"
        run_cli("diff", str(existing_path), str(proposed_path), "--output", str(spec_path))

        # Create a dummy codebase dir with the file
        codebase = tmp_path / "codebase"
        codebase.mkdir()
        (codebase / "f.py").write_text("def foo(): pass\ndef bar(): pass\n")

        rc, stdout, stderr = run_cli(
            "plan", str(spec_path),
            "--codebase", str(codebase),
            "--existing-kg", str(existing_path),
        )
        assert rc == 0
        assert "Edit Plan" in stdout

    def test_plan_json_output(self, kg_pair, tmp_path):
        existing_path, proposed_path = kg_pair
        spec_path = tmp_path / "spec.json"
        run_cli("diff", str(existing_path), str(proposed_path), "--output", str(spec_path))

        codebase = tmp_path / "codebase"
        codebase.mkdir()
        (codebase / "f.py").write_text("pass\n")

        rc, stdout, stderr = run_cli(
            "plan", str(spec_path),
            "--codebase", str(codebase),
            "--format", "json",
        )
        assert rc == 0
        data = json.loads(stdout)
        assert "file_edits" in data

    def test_plan_output_file(self, kg_pair, tmp_path):
        existing_path, proposed_path = kg_pair
        spec_path = tmp_path / "spec.json"
        run_cli("diff", str(existing_path), str(proposed_path), "--output", str(spec_path))

        codebase = tmp_path / "codebase"
        codebase.mkdir()
        (codebase / "f.py").write_text("pass\n")

        output_path = tmp_path / "plan.md"
        rc, stdout, stderr = run_cli(
            "plan", str(spec_path),
            "--codebase", str(codebase),
            "--output", str(output_path),
        )
        assert rc == 0
        assert output_path.is_file()
        assert "Edit Plan" in output_path.read_text()


class TestCliBuildBackwardsCompat:
    def test_bare_path_defaults_to_build(self, tmp_path):
        """kg_builder <path> should work without 'build' subcommand."""
        py_file = tmp_path / "hello.py"
        py_file.write_text("def hello(): pass\n")

        rc, stdout, stderr = run_cli(str(tmp_path))
        assert rc == 0
        kg = json.loads(stdout)
        assert "entities" in kg
        assert "relationships" in kg

    def test_build_subcommand(self, tmp_path):
        py_file = tmp_path / "hello.py"
        py_file.write_text("class Foo: pass\n")

        rc, stdout, stderr = run_cli("build", str(tmp_path))
        assert rc == 0
        kg = json.loads(stdout)
        assert len(kg["entities"]) > 0
