"""Knowledge graph diffing engine.

Compares two KG JSON structures (existing vs proposed) and produces
a structured ChangeSpec describing what entities and relationships
were added, removed, or modified.
"""

import hashlib
import json
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Optional


@dataclass
class EntityChange:
    """A single entity-level change between two knowledge graphs.

    Attributes:
        action: One of "added", "removed", "modified".
        entity_id: The entity ID (from proposed KG for added/modified, existing for removed).
        file_path: File path where this entity lives.
        entity_type: The entity type string (e.g. "FUNCTION", "CLASS").
        before: Full entity dict snapshot from existing KG (None for "added").
        after: Full entity dict snapshot from proposed KG (None for "removed").
        field_diffs: For "modified" entities, maps field names to (old, new) tuples.
        neighbor_ids: 1-hop neighbor entity IDs for context loading.
    """

    action: str
    entity_id: str
    file_path: str
    entity_type: str
    before: Optional[dict[str, Any]] = None
    after: Optional[dict[str, Any]] = None
    field_diffs: dict[str, tuple] = field(default_factory=dict)
    neighbor_ids: list[str] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        return {
            "action": self.action,
            "entity_id": self.entity_id,
            "file_path": self.file_path,
            "entity_type": self.entity_type,
            "before": self.before,
            "after": self.after,
            "field_diffs": {k: list(v) for k, v in self.field_diffs.items()},
            "neighbor_ids": self.neighbor_ids,
        }

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> "EntityChange":
        return cls(
            action=data["action"],
            entity_id=data["entity_id"],
            file_path=data["file_path"],
            entity_type=data["entity_type"],
            before=data.get("before"),
            after=data.get("after"),
            field_diffs={k: tuple(v) for k, v in data.get("field_diffs", {}).items()},
            neighbor_ids=data.get("neighbor_ids", []),
        )


@dataclass
class RelationshipChange:
    """A single relationship-level change between two knowledge graphs.

    Attributes:
        action: One of "added", "removed".
        source_id: Source entity ID.
        target_id: Target entity ID.
        relationship_type: The relationship type string (e.g. "CALLS", "INHERITS").
        relationship_data: Full relationship dict.
    """

    action: str
    source_id: str
    target_id: str
    relationship_type: str
    relationship_data: dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        return {
            "action": self.action,
            "source_id": self.source_id,
            "target_id": self.target_id,
            "relationship_type": self.relationship_type,
            "relationship_data": self.relationship_data,
        }

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> "RelationshipChange":
        return cls(
            action=data["action"],
            source_id=data["source_id"],
            target_id=data["target_id"],
            relationship_type=data["relationship_type"],
            relationship_data=data.get("relationship_data", {}),
        )


@dataclass
class ChangeSpec:
    """Complete diff between two knowledge graphs.

    Attributes:
        timestamp: ISO 8601 timestamp of when the diff was computed.
        source_kg_hash: SHA256 hash of the existing KG JSON.
        proposed_kg_hash: SHA256 hash of the proposed KG JSON.
        entity_changes: List of entity-level changes.
        relationship_changes: List of relationship-level changes.
        summary: Counts of each change type.
    """

    timestamp: str
    source_kg_hash: str
    proposed_kg_hash: str
    entity_changes: list[EntityChange] = field(default_factory=list)
    relationship_changes: list[RelationshipChange] = field(default_factory=list)
    summary: dict[str, int] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        return {
            "version": "1.0",
            "timestamp": self.timestamp,
            "source_kg_hash": self.source_kg_hash,
            "proposed_kg_hash": self.proposed_kg_hash,
            "summary": self.summary,
            "entity_changes": [ec.to_dict() for ec in self.entity_changes],
            "relationship_changes": [rc.to_dict() for rc in self.relationship_changes],
        }

    def to_json(self) -> str:
        return json.dumps(self.to_dict(), indent=2)

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> "ChangeSpec":
        return cls(
            timestamp=data["timestamp"],
            source_kg_hash=data["source_kg_hash"],
            proposed_kg_hash=data["proposed_kg_hash"],
            entity_changes=[EntityChange.from_dict(ec) for ec in data.get("entity_changes", [])],
            relationship_changes=[RelationshipChange.from_dict(rc) for rc in data.get("relationship_changes", [])],
            summary=data.get("summary", {}),
        )

    @classmethod
    def from_json(cls, json_str: str) -> "ChangeSpec":
        return cls.from_dict(json.loads(json_str))


def _compute_kg_hash(kg_dict: dict[str, Any]) -> str:
    """Compute a deterministic SHA256 hash of a KG dict."""
    canonical = json.dumps(kg_dict, sort_keys=True, separators=(",", ":"))
    return f"sha256:{hashlib.sha256(canonical.encode()).hexdigest()}"


def _diff_entity_fields(
    existing_entity: dict[str, Any], proposed_entity: dict[str, Any]
) -> dict[str, tuple]:
    """Compare two entity dicts field by field.

    Returns a dict mapping field names to (old_value, new_value) for fields
    that differ. Only compares semantically meaningful fields.
    """
    compare_fields = ["name", "type", "file_path", "line_number", "end_line", "properties"]
    diffs = {}
    for f in compare_fields:
        old_val = existing_entity.get(f)
        new_val = proposed_entity.get(f)
        if old_val != new_val:
            diffs[f] = (old_val, new_val)
    return diffs


def _collect_neighbor_ids(entity_id: str, relationships: list[dict[str, Any]]) -> list[str]:
    """Collect 1-hop neighbor entity IDs from a relationship list."""
    neighbors = set()
    for rel in relationships:
        if rel.get("source_id") == entity_id:
            neighbors.add(rel["target_id"])
        elif rel.get("target_id") == entity_id:
            neighbors.add(rel["source_id"])
    return sorted(neighbors)


def _rel_key(rel: dict[str, Any]) -> tuple[str, str, str]:
    """Canonical key for a relationship: (source_id, target_id, type)."""
    return (rel["source_id"], rel["target_id"], rel["type"])


def diff_knowledge_graphs(
    existing: dict[str, Any], proposed: dict[str, Any]
) -> ChangeSpec:
    """Compare two KG JSON dicts and produce a ChangeSpec.

    Args:
        existing: The current KG dict with "entities" and "relationships" keys.
        proposed: The proposed KG dict with the same structure.

    Returns:
        A ChangeSpec describing all differences.
    """
    existing_entities = existing.get("entities", {})
    proposed_entities = proposed.get("entities", {})
    existing_rels = existing.get("relationships", [])
    proposed_rels = proposed.get("relationships", [])

    entity_changes: list[EntityChange] = []
    relationship_changes: list[RelationshipChange] = []

    existing_ids = set(existing_entities.keys())
    proposed_ids = set(proposed_entities.keys())

    # Added entities (in proposed but not existing)
    for eid in sorted(proposed_ids - existing_ids):
        entity = proposed_entities[eid]
        entity_changes.append(EntityChange(
            action="added",
            entity_id=eid,
            file_path=entity.get("file_path", ""),
            entity_type=entity.get("type", ""),
            before=None,
            after=entity,
            field_diffs={},
            neighbor_ids=_collect_neighbor_ids(eid, proposed_rels),
        ))

    # Removed entities (in existing but not proposed)
    for eid in sorted(existing_ids - proposed_ids):
        entity = existing_entities[eid]
        entity_changes.append(EntityChange(
            action="removed",
            entity_id=eid,
            file_path=entity.get("file_path", ""),
            entity_type=entity.get("type", ""),
            before=entity,
            after=None,
            field_diffs={},
            neighbor_ids=_collect_neighbor_ids(eid, existing_rels),
        ))

    # Modified entities (in both, but fields differ)
    for eid in sorted(existing_ids & proposed_ids):
        field_diffs = _diff_entity_fields(existing_entities[eid], proposed_entities[eid])
        if field_diffs:
            proposed_entity = proposed_entities[eid]
            entity_changes.append(EntityChange(
                action="modified",
                entity_id=eid,
                file_path=proposed_entity.get("file_path", ""),
                entity_type=proposed_entity.get("type", ""),
                before=existing_entities[eid],
                after=proposed_entity,
                field_diffs=field_diffs,
                neighbor_ids=_collect_neighbor_ids(eid, proposed_rels),
            ))

    # Relationship diffing
    existing_rel_keys = {_rel_key(r): r for r in existing_rels}
    proposed_rel_keys = {_rel_key(r): r for r in proposed_rels}

    existing_key_set = set(existing_rel_keys.keys())
    proposed_key_set = set(proposed_rel_keys.keys())

    # Added relationships
    for key in sorted(proposed_key_set - existing_key_set):
        rel = proposed_rel_keys[key]
        relationship_changes.append(RelationshipChange(
            action="added",
            source_id=key[0],
            target_id=key[1],
            relationship_type=key[2],
            relationship_data=rel,
        ))

    # Removed relationships
    for key in sorted(existing_key_set - proposed_key_set):
        rel = existing_rel_keys[key]
        relationship_changes.append(RelationshipChange(
            action="removed",
            source_id=key[0],
            target_id=key[1],
            relationship_type=key[2],
            relationship_data=rel,
        ))

    # Summary
    summary = {
        "entities_added": sum(1 for ec in entity_changes if ec.action == "added"),
        "entities_removed": sum(1 for ec in entity_changes if ec.action == "removed"),
        "entities_modified": sum(1 for ec in entity_changes if ec.action == "modified"),
        "relationships_added": sum(1 for rc in relationship_changes if rc.action == "added"),
        "relationships_removed": sum(1 for rc in relationship_changes if rc.action == "removed"),
    }

    return ChangeSpec(
        timestamp=datetime.now(timezone.utc).isoformat(),
        source_kg_hash=_compute_kg_hash(existing),
        proposed_kg_hash=_compute_kg_hash(proposed),
        entity_changes=entity_changes,
        relationship_changes=relationship_changes,
        summary=summary,
    )


def load_change_spec(path: str) -> ChangeSpec:
    """Load a ChangeSpec from a JSON file."""
    with open(path, "r") as f:
        return ChangeSpec.from_json(f.read())


def save_change_spec(spec: ChangeSpec, path: str) -> None:
    """Write a ChangeSpec to a JSON file."""
    with open(path, "w") as f:
        f.write(spec.to_json())
