"""Tests for the KG diff engine."""

import json
import pytest

from kg_builder.kg_diff import (
    ChangeSpec,
    EntityChange,
    RelationshipChange,
    diff_knowledge_graphs,
    _compute_kg_hash,
    _diff_entity_fields,
    _collect_neighbor_ids,
)


# --- Fixtures ---


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


class TestDiffIdenticalGraphs:
    def test_empty_graphs(self):
        spec = diff_knowledge_graphs(_make_kg(), _make_kg())
        assert spec.summary["entities_added"] == 0
        assert spec.summary["entities_removed"] == 0
        assert spec.summary["entities_modified"] == 0
        assert spec.summary["relationships_added"] == 0
        assert spec.summary["relationships_removed"] == 0
        assert len(spec.entity_changes) == 0
        assert len(spec.relationship_changes) == 0

    def test_identical_nonempty_graphs(self):
        entities = [_make_entity("a::foo", "foo"), _make_entity("a::bar", "bar")]
        rels = [_make_rel("a::foo", "a::bar")]
        kg = _make_kg(entities, rels)
        spec = diff_knowledge_graphs(kg, kg)
        assert len(spec.entity_changes) == 0
        assert len(spec.relationship_changes) == 0


class TestEntityDiffs:
    def test_added_entity(self):
        existing = _make_kg([_make_entity("a::foo", "foo")])
        proposed = _make_kg([
            _make_entity("a::foo", "foo"),
            _make_entity("a::bar", "bar", etype="CLASS"),
        ])
        spec = diff_knowledge_graphs(existing, proposed)
        assert spec.summary["entities_added"] == 1
        assert spec.summary["entities_removed"] == 0
        added = [ec for ec in spec.entity_changes if ec.action == "added"]
        assert len(added) == 1
        assert added[0].entity_id == "a::bar"
        assert added[0].entity_type == "CLASS"
        assert added[0].before is None
        assert added[0].after is not None

    def test_removed_entity(self):
        existing = _make_kg([
            _make_entity("a::foo", "foo"),
            _make_entity("a::bar", "bar"),
        ])
        proposed = _make_kg([_make_entity("a::foo", "foo")])
        spec = diff_knowledge_graphs(existing, proposed)
        assert spec.summary["entities_removed"] == 1
        removed = [ec for ec in spec.entity_changes if ec.action == "removed"]
        assert len(removed) == 1
        assert removed[0].entity_id == "a::bar"
        assert removed[0].after is None
        assert removed[0].before is not None

    def test_modified_entity_type_change(self):
        existing = _make_kg([_make_entity("a::foo", "foo", etype="FUNCTION")])
        proposed = _make_kg([_make_entity("a::foo", "foo", etype="ASYNC_FUNCTION")])
        spec = diff_knowledge_graphs(existing, proposed)
        assert spec.summary["entities_modified"] == 1
        mod = spec.entity_changes[0]
        assert mod.action == "modified"
        assert "type" in mod.field_diffs
        assert mod.field_diffs["type"] == ("FUNCTION", "ASYNC_FUNCTION")

    def test_modified_entity_properties_change(self):
        e1 = _make_entity("a::foo", "foo", properties={"args": ["x"]})
        e2 = _make_entity("a::foo", "foo", properties={"args": ["x", "y"]})
        spec = diff_knowledge_graphs(_make_kg([e1]), _make_kg([e2]))
        assert spec.summary["entities_modified"] == 1
        assert "properties" in spec.entity_changes[0].field_diffs

    def test_unchanged_entity_not_in_diff(self):
        e = _make_entity("a::foo", "foo")
        spec = diff_knowledge_graphs(_make_kg([e]), _make_kg([e]))
        assert len(spec.entity_changes) == 0

    def test_entity_rename_shows_as_remove_plus_add(self):
        """ID change = remove old + add new (IDs are the matching key)."""
        existing = _make_kg([_make_entity("a::old_name", "old_name")])
        proposed = _make_kg([_make_entity("a::new_name", "new_name")])
        spec = diff_knowledge_graphs(existing, proposed)
        assert spec.summary["entities_removed"] == 1
        assert spec.summary["entities_added"] == 1


class TestRelationshipDiffs:
    def test_added_relationship(self):
        entities = [_make_entity("a::foo", "foo"), _make_entity("a::bar", "bar")]
        existing = _make_kg(entities, [])
        proposed = _make_kg(entities, [_make_rel("a::foo", "a::bar", "CALLS")])
        spec = diff_knowledge_graphs(existing, proposed)
        assert spec.summary["relationships_added"] == 1
        assert spec.relationship_changes[0].action == "added"
        assert spec.relationship_changes[0].source_id == "a::foo"
        assert spec.relationship_changes[0].target_id == "a::bar"

    def test_removed_relationship(self):
        entities = [_make_entity("a::foo", "foo"), _make_entity("a::bar", "bar")]
        existing = _make_kg(entities, [_make_rel("a::foo", "a::bar", "CALLS")])
        proposed = _make_kg(entities, [])
        spec = diff_knowledge_graphs(existing, proposed)
        assert spec.summary["relationships_removed"] == 1
        assert spec.relationship_changes[0].action == "removed"

    def test_unchanged_relationship_not_in_diff(self):
        entities = [_make_entity("a::foo", "foo"), _make_entity("a::bar", "bar")]
        rels = [_make_rel("a::foo", "a::bar")]
        kg = _make_kg(entities, rels)
        spec = diff_knowledge_graphs(kg, kg)
        assert len(spec.relationship_changes) == 0


class TestNeighborCollection:
    def test_added_entity_gets_neighbors_from_proposed(self):
        existing = _make_kg([_make_entity("a::foo", "foo")])
        proposed = _make_kg(
            [_make_entity("a::foo", "foo"), _make_entity("a::bar", "bar")],
            [_make_rel("a::bar", "a::foo", "CALLS")],
        )
        spec = diff_knowledge_graphs(existing, proposed)
        added = [ec for ec in spec.entity_changes if ec.action == "added"][0]
        assert "a::foo" in added.neighbor_ids

    def test_removed_entity_gets_neighbors_from_existing(self):
        existing = _make_kg(
            [_make_entity("a::foo", "foo"), _make_entity("a::bar", "bar")],
            [_make_rel("a::foo", "a::bar", "CALLS")],
        )
        proposed = _make_kg([_make_entity("a::foo", "foo")])
        spec = diff_knowledge_graphs(existing, proposed)
        removed = [ec for ec in spec.entity_changes if ec.action == "removed"][0]
        assert "a::foo" in removed.neighbor_ids

    def test_modified_entity_gets_neighbors_from_proposed(self):
        e1 = _make_entity("a::foo", "foo", etype="FUNCTION")
        e2 = _make_entity("a::foo", "foo", etype="ASYNC_FUNCTION")
        neighbor = _make_entity("a::bar", "bar")
        rel = _make_rel("a::foo", "a::bar", "CALLS")
        spec = diff_knowledge_graphs(
            _make_kg([e1, neighbor], [rel]),
            _make_kg([e2, neighbor], [rel]),
        )
        modified = spec.entity_changes[0]
        assert "a::bar" in modified.neighbor_ids


class TestChangeSpecSerialization:
    def test_round_trip_json(self):
        entities = [
            _make_entity("a::foo", "foo"),
            _make_entity("a::bar", "bar", etype="CLASS"),
        ]
        existing = _make_kg([entities[0]])
        proposed = _make_kg(entities, [_make_rel("a::foo", "a::bar", "INHERITS")])

        spec = diff_knowledge_graphs(existing, proposed)
        json_str = spec.to_json()

        restored = ChangeSpec.from_json(json_str)
        assert restored.source_kg_hash == spec.source_kg_hash
        assert restored.proposed_kg_hash == spec.proposed_kg_hash
        assert len(restored.entity_changes) == len(spec.entity_changes)
        assert len(restored.relationship_changes) == len(spec.relationship_changes)
        assert restored.summary == spec.summary

        # Verify entity change fidelity
        for orig, rest in zip(spec.entity_changes, restored.entity_changes):
            assert orig.action == rest.action
            assert orig.entity_id == rest.entity_id
            assert orig.field_diffs == rest.field_diffs

    def test_round_trip_dict(self):
        spec = diff_knowledge_graphs(_make_kg(), _make_kg())
        d = spec.to_dict()
        assert d["version"] == "1.0"
        restored = ChangeSpec.from_dict(d)
        assert restored.timestamp == spec.timestamp


class TestComplexScenario:
    def test_multiple_changes(self):
        """Multiple adds, removes, modifies, and relationship changes at once."""
        existing = _make_kg(
            entities=[
                _make_entity("f::A", "A", etype="CLASS", file_path="f.py"),
                _make_entity("f::B", "B", etype="FUNCTION", file_path="f.py"),
                _make_entity("f::C", "C", etype="FUNCTION", file_path="f.py"),
            ],
            relationships=[
                _make_rel("f::A", "f::B", "CONTAINS"),
                _make_rel("f::B", "f::C", "CALLS"),
            ],
        )
        proposed = _make_kg(
            entities=[
                # A stays but type changes
                _make_entity("f::A", "A", etype="MODULE", file_path="f.py"),
                # B removed
                # C stays unchanged
                _make_entity("f::C", "C", etype="FUNCTION", file_path="f.py"),
                # D added
                _make_entity("f::D", "D", etype="FUNCTION", file_path="f.py"),
            ],
            relationships=[
                # A->B removed (B is gone)
                # B->C removed (B is gone)
                # New: A->D
                _make_rel("f::A", "f::D", "CONTAINS"),
                # New: D->C
                _make_rel("f::D", "f::C", "CALLS"),
            ],
        )

        spec = diff_knowledge_graphs(existing, proposed)
        assert spec.summary["entities_added"] == 1  # D
        assert spec.summary["entities_removed"] == 1  # B
        assert spec.summary["entities_modified"] == 1  # A (type change)
        assert spec.summary["relationships_added"] == 2  # A->D, D->C
        assert spec.summary["relationships_removed"] == 2  # A->B, B->C

        # Verify specifics
        actions = {ec.entity_id: ec.action for ec in spec.entity_changes}
        assert actions["f::D"] == "added"
        assert actions["f::B"] == "removed"
        assert actions["f::A"] == "modified"


class TestHelpers:
    def test_compute_kg_hash_deterministic(self):
        kg = _make_kg([_make_entity("a", "a")])
        assert _compute_kg_hash(kg) == _compute_kg_hash(kg)

    def test_compute_kg_hash_differs_for_different_kgs(self):
        kg1 = _make_kg([_make_entity("a", "a")])
        kg2 = _make_kg([_make_entity("b", "b")])
        assert _compute_kg_hash(kg1) != _compute_kg_hash(kg2)

    def test_diff_entity_fields_no_diff(self):
        e = _make_entity("a", "a")
        assert _diff_entity_fields(e, e) == {}

    def test_diff_entity_fields_detects_changes(self):
        e1 = _make_entity("a", "a", etype="FUNCTION")
        e2 = _make_entity("a", "a", etype="CLASS")
        diffs = _diff_entity_fields(e1, e2)
        assert "type" in diffs
        assert diffs["type"] == ("FUNCTION", "CLASS")

    def test_collect_neighbor_ids(self):
        rels = [
            _make_rel("a", "b"),
            _make_rel("c", "a"),
            _make_rel("d", "e"),  # unrelated
        ]
        neighbors = _collect_neighbor_ids("a", rels)
        assert "b" in neighbors
        assert "c" in neighbors
        assert "d" not in neighbors
        assert "e" not in neighbors
