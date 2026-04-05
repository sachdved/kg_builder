/**
 * Knowledge Graph Diff Engine (JavaScript)
 *
 * Compares two KG JSON structures (base vs current/proposed) and produces
 * a structured diff. Used by the viz for coloring nodes/edges and exporting
 * change specs.
 *
 * Optimized for large graphs (1000+ entities, 5000+ relationships).
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

  const baseIds = new Set(Object.keys(baseEntities));
  const proposedIds = new Set(Object.keys(proposedEntities));

  // Pre-build neighbor index for changed entities (avoids O(changes * rels) scan)
  // We'll populate lazily only for entities that actually changed.
  const proposedNeighborIndex = buildNeighborIndex(proposedRels);
  const baseNeighborIndex = buildNeighborIndex(baseRels);

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
        neighbor_ids: proposedNeighborIndex.get(eid) || [],
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
        neighbor_ids: baseNeighborIndex.get(eid) || [],
      });
    }
  }

  // Modified entities — only compare entities that exist in both
  for (const eid of baseIds) {
    if (proposedIds.has(eid)) {
      const fieldDiffs = diffEntityFields(baseEntities[eid], proposedEntities[eid]);
      if (fieldDiffs) {
        entityChanges.push({
          action: 'modified',
          entity_id: eid,
          file_path: proposedEntities[eid].file_path || '',
          entity_type: proposedEntities[eid].type || '',
          before: baseEntities[eid],
          after: proposedEntities[eid],
          field_diffs: fieldDiffs,
          neighbor_ids: proposedNeighborIndex.get(eid) || [],
        });
      }
    }
  }

  // Relationship diffing using string key sets
  const baseRelKeySet = new Set();
  const baseRelByKey = new Map();
  for (const r of baseRels) {
    const key = relKey(r);
    baseRelKeySet.add(key);
    baseRelByKey.set(key, r);
  }

  const proposedRelKeySet = new Set();
  const proposedRelByKey = new Map();
  for (const r of proposedRels) {
    const key = relKey(r);
    proposedRelKeySet.add(key);
    proposedRelByKey.set(key, r);
  }

  const relationshipChanges = [];

  for (const key of proposedRelKeySet) {
    if (!baseRelKeySet.has(key)) {
      const rel = proposedRelByKey.get(key);
      relationshipChanges.push({
        action: 'added',
        source_id: rel.source_id,
        target_id: rel.target_id,
        relationship_type: rel.type,
        relationship_data: rel,
      });
    }
  }

  for (const key of baseRelKeySet) {
    if (!proposedRelKeySet.has(key)) {
      const rel = baseRelByKey.get(key);
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
    source_kg_hash: '',  // Skip expensive hash for viz use
    proposed_kg_hash: '',
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

/**
 * Build a Map from entity_id → sorted neighbor IDs, in a single pass over relationships.
 */
function buildNeighborIndex(relationships) {
  const index = new Map();
  for (const rel of relationships) {
    if (!index.has(rel.source_id)) index.set(rel.source_id, new Set());
    if (!index.has(rel.target_id)) index.set(rel.target_id, new Set());
    index.get(rel.source_id).add(rel.target_id);
    index.get(rel.target_id).add(rel.source_id);
  }
  // Convert Sets to sorted arrays
  const result = new Map();
  for (const [eid, neighbors] of index) {
    result.set(eid, Array.from(neighbors).sort());
  }
  return result;
}

/**
 * Compare two entity dicts field by field.
 * Returns diffs object if any fields differ, or null if identical.
 * Avoids JSON.stringify for primitive fields.
 */
function diffEntityFields(existing, proposed) {
  let hasDiff = false;
  const diffs = {};

  // Fast path: compare primitives directly
  const primitiveFields = ['name', 'type', 'file_path', 'line_number', 'end_line'];
  for (const f of primitiveFields) {
    const oldVal = existing[f];
    const newVal = proposed[f];
    if (oldVal !== newVal) {
      diffs[f] = [oldVal, newVal];
      hasDiff = true;
    }
  }

  // Only JSON.stringify for properties (the one complex field)
  const oldProps = existing.properties;
  const newProps = proposed.properties;
  if (oldProps !== newProps) {
    // Quick check: both null/undefined
    if (!oldProps && !newProps) {
      // no diff
    } else if (!oldProps || !newProps) {
      diffs.properties = [oldProps, newProps];
      hasDiff = true;
    } else {
      // Compare keys count first (fast rejection)
      const oldKeys = Object.keys(oldProps);
      const newKeys = Object.keys(newProps);
      if (oldKeys.length !== newKeys.length) {
        diffs.properties = [oldProps, newProps];
        hasDiff = true;
      } else {
        // Only stringify if key counts match (rare case needs deep compare)
        const oldStr = JSON.stringify(oldProps);
        const newStr = JSON.stringify(newProps);
        if (oldStr !== newStr) {
          diffs.properties = [oldProps, newProps];
          hasDiff = true;
        }
      }
    }
  }

  return hasDiff ? diffs : null;
}
