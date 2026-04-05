/**
 * Knowledge Graph Diff Engine (JavaScript)
 *
 * Compares two KG JSON structures (base vs current/proposed) and produces
 * a structured diff. Used by the viz for coloring nodes/edges and exporting
 * change specs.
 */

/**
 * Compute diff between two KG JSON objects.
 * @param {Object} baseKG - The original/existing KG
 * @param {Object} proposedKG - The current/proposed KG (after edits or agent proposal)
 * @returns {Object} ChangeSpec-compatible diff object
 */
export function diffKnowledgeGraphs(baseKG, proposedKG) {
  const baseEntities = baseKG?.entities || {};
  const proposedEntities = proposedKG?.entities || {};
  const baseRels = baseKG?.relationships || [];
  const proposedRels = proposedKG?.relationships || [];

  const entityChanges = [];
  const relationshipChanges = [];

  const baseIds = new Set(Object.keys(baseEntities));
  const proposedIds = new Set(Object.keys(proposedEntities));

  // Added entities
  for (const eid of proposedIds) {
    if (!baseIds.has(eid)) {
      const entity = proposedEntities[eid];
      entityChanges.push({
        action: 'added',
        entity_id: eid,
        file_path: entity.file_path || '',
        entity_type: entity.type || '',
        before: null,
        after: entity,
        field_diffs: {},
        neighbor_ids: collectNeighborIds(eid, proposedRels),
      });
    }
  }

  // Removed entities
  for (const eid of baseIds) {
    if (!proposedIds.has(eid)) {
      const entity = baseEntities[eid];
      entityChanges.push({
        action: 'removed',
        entity_id: eid,
        file_path: entity.file_path || '',
        entity_type: entity.type || '',
        before: entity,
        after: null,
        field_diffs: {},
        neighbor_ids: collectNeighborIds(eid, baseRels),
      });
    }
  }

  // Modified entities
  for (const eid of baseIds) {
    if (proposedIds.has(eid)) {
      const fieldDiffs = diffEntityFields(baseEntities[eid], proposedEntities[eid]);
      if (Object.keys(fieldDiffs).length > 0) {
        entityChanges.push({
          action: 'modified',
          entity_id: eid,
          file_path: proposedEntities[eid].file_path || '',
          entity_type: proposedEntities[eid].type || '',
          before: baseEntities[eid],
          after: proposedEntities[eid],
          field_diffs: fieldDiffs,
          neighbor_ids: collectNeighborIds(eid, proposedRels),
        });
      }
    }
  }

  // Relationship diffing
  const baseRelKeys = new Map();
  for (const r of baseRels) {
    baseRelKeys.set(relKey(r), r);
  }
  const proposedRelKeys = new Map();
  for (const r of proposedRels) {
    proposedRelKeys.set(relKey(r), r);
  }

  for (const [key, rel] of proposedRelKeys) {
    if (!baseRelKeys.has(key)) {
      relationshipChanges.push({
        action: 'added',
        source_id: rel.source_id,
        target_id: rel.target_id,
        relationship_type: rel.type,
        relationship_data: rel,
      });
    }
  }

  for (const [key, rel] of baseRelKeys) {
    if (!proposedRelKeys.has(key)) {
      relationshipChanges.push({
        action: 'removed',
        source_id: rel.source_id,
        target_id: rel.target_id,
        relationship_type: rel.type,
        relationship_data: rel,
      });
    }
  }

  const summary = {
    entities_added: entityChanges.filter(e => e.action === 'added').length,
    entities_removed: entityChanges.filter(e => e.action === 'removed').length,
    entities_modified: entityChanges.filter(e => e.action === 'modified').length,
    relationships_added: relationshipChanges.filter(r => r.action === 'added').length,
    relationships_removed: relationshipChanges.filter(r => r.action === 'removed').length,
  };

  return {
    version: '1.0',
    timestamp: new Date().toISOString(),
    source_kg_hash: computeSimpleHash(baseKG),
    proposed_kg_hash: computeSimpleHash(proposedKG),
    summary,
    entity_changes: entityChanges,
    relationship_changes: relationshipChanges,
  };
}

/**
 * Classify elements for Cytoscape styling.
 * @param {Object} diff - Result of diffKnowledgeGraphs
 * @returns {Object} { addedIds, removedIds, modifiedIds, addedEdgeKeys, removedEdgeKeys }
 */
export function classifyElements(diff) {
  const addedIds = new Set();
  const removedIds = new Set();
  const modifiedIds = new Set();

  for (const ec of diff.entity_changes) {
    if (ec.action === 'added') addedIds.add(ec.entity_id);
    else if (ec.action === 'removed') removedIds.add(ec.entity_id);
    else if (ec.action === 'modified') modifiedIds.add(ec.entity_id);
  }

  const addedEdgeKeys = new Set();
  const removedEdgeKeys = new Set();

  for (const rc of diff.relationship_changes) {
    const key = `${rc.source_id}::${rc.target_id}::${rc.relationship_type}`;
    if (rc.action === 'added') addedEdgeKeys.add(key);
    else if (rc.action === 'removed') removedEdgeKeys.add(key);
  }

  return { addedIds, removedIds, modifiedIds, addedEdgeKeys, removedEdgeKeys };
}

/**
 * Check if a diff has any changes.
 */
export function hasDiffChanges(diff) {
  if (!diff) return false;
  const s = diff.summary;
  return (
    s.entities_added + s.entities_removed + s.entities_modified +
    s.relationships_added + s.relationships_removed
  ) > 0;
}

// --- Helpers ---

function relKey(rel) {
  return `${rel.source_id}::${rel.target_id}::${rel.type}`;
}

function diffEntityFields(existing, proposed) {
  const fields = ['name', 'type', 'file_path', 'line_number', 'end_line', 'properties'];
  const diffs = {};
  for (const f of fields) {
    const oldVal = existing[f];
    const newVal = proposed[f];
    if (JSON.stringify(oldVal) !== JSON.stringify(newVal)) {
      diffs[f] = [oldVal, newVal];
    }
  }
  return diffs;
}

function collectNeighborIds(entityId, relationships) {
  const neighbors = new Set();
  for (const rel of relationships) {
    if (rel.source_id === entityId) neighbors.add(rel.target_id);
    else if (rel.target_id === entityId) neighbors.add(rel.source_id);
  }
  return Array.from(neighbors).sort();
}

function computeSimpleHash(obj) {
  // Simple hash for browser use (not cryptographic)
  const str = JSON.stringify(obj, Object.keys(obj).sort());
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0;
  }
  return `hash:${Math.abs(hash).toString(16)}`;
}
