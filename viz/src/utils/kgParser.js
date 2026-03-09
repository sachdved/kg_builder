/**
 * Parse KG JSON data into Cytoscape.js elements format
 */

// Entity type mapping - normalize various possible values
const entityTypeMap = {
  FILE: 'FILE',
  MODULE: 'MODULE',
  CLASS: 'CLASS',
  FUNCTION: 'FUNCTION',
  CONSTANT: 'CONSTANT',
  VARIABLE: 'VARIABLE',
  IMPORT: 'IMPORT',
  DECORATOR: 'DECORATOR'
};

// Relationship type mapping
const relationshipTypeMap = {
  CONTAINS: 'CONTAINS',
  CALLS: 'CALLS',
  INHERITS: 'INHERITS',
  IMPORTS: 'IMPORTS',
  INSTANTIATES: 'INSTANTIATES',
  DEFINES_IN: 'DEFINES_IN'
};

/**
 * Convert KG JSON data to Cytoscape elements
 * @param {Object} kgData - Knowledge graph JSON data
 * @returns {Object} - { nodes, edges } in Cytoscape format
 */
export const parseKGToElements = (kgData) => {
  if (!kgData || !kgData.entities) {
    console.error('Invalid KG data format');
    return { nodes: [], edges: [] };
  }

  const nodes = [];
  const edges = [];
  const entityLookup = new Map();

  // Parse entities into nodes
  Object.values(kgData.entities).forEach((entity) => {
    const nodeType = entityTypeMap[entity.type] || 'VARIABLE';
    const node = {
      data: {
        id: entity.id,
        name: entity.name,
        type: nodeType,
        filePath: entity.file_path || '',
        lineNumber: entity.line_number || 0,
        docstring: entity.properties?.description || '',
        ...entity.properties
      }
    };
    nodes.push(node);
    entityLookup.set(entity.id, node);
  });

  // Parse relationships into edges
  if (kgData.relationships && Array.isArray(kgData.relationships)) {
    kgData.relationships.forEach((rel) => {
      // Skip self-loops for better visualization
      if (rel.source_id === rel.target_id) return;

      const relationshipType = relationshipTypeMap[rel.type] || 'CONTAINS';
      const edge = {
        data: {
          id: `${rel.source_id}::${rel.target_id}::${rel.type}`,
          source: rel.source_id,
          target: rel.target_id,
          rel: relationshipType,
          lineNumber: rel.line_number || 0
        }
      };

      // Only add edge if both source and target nodes exist
      if (entityLookup.has(rel.source_id) && entityLookup.has(rel.target_id)) {
        edges.push(edge);
      }
    });
  }

  return { nodes, edges };
};

/**
 * Get statistics about the knowledge graph
 * @param {Object} kgData - Knowledge graph JSON data
 * @returns {Object} - Statistics object
 */
export const getKGStats = (kgData) => {
  if (!kgData || !kgData.entities) {
    return { totalEntities: 0, totalRelationships: 0, entityTypes: {}, relationshipTypes: {} };
  }

  const entityCount = Object.keys(kgData.entities).length;
  const relationshipCount = kgData.relationships?.length || 0;

  // Count entities by type
  const entityTypeCounts = {};
  Object.values(kgData.entities).forEach((entity) => {
    const type = entity.type || 'UNKNOWN';
    entityTypeCounts[type] = (entityTypeCounts[type] || 0) + 1;
  });

  // Count relationships by type
  const relationshipTypeCounts = {};
  kgData.relationships?.forEach((rel) => {
    const type = rel.type || 'UNKNOWN';
    relationshipTypeCounts[type] = (relationshipTypeCounts[type] || 0) + 1;
  });

  return {
    totalEntities: entityCount,
    totalRelationships: relationshipCount,
    entityTypes: entityTypeCounts,
    relationshipTypes: relationshipTypeCounts
  };
};

/**
 * Search for entities by name or properties
 * @param {Object} kgData - Knowledge graph JSON data
 * @param {string} query - Search query
 * @returns {Array} - Array of matching entity IDs
 */
export const searchEntities = (kgData, query) => {
  if (!query || !kgData?.entities) return [];

  const lowerQuery = query.toLowerCase();
  const results = [];

  Object.values(kgData.entities).forEach((entity) => {
    const nameMatch = entity.name?.toLowerCase().includes(lowerQuery);
    const idMatch = entity.id?.toLowerCase().includes(lowerQuery);
    const fileMatch = entity.file_path?.toLowerCase().includes(lowerQuery);
    const docMatch = entity.properties?.description?.toLowerCase().includes(lowerQuery);

    if (nameMatch || idMatch || fileMatch || docMatch) {
      results.push(entity.id);
    }
  });

  return results.slice(0, 100); // Limit to first 100 results for performance
};

/**
 * Filter entities by type
 * @param {Set} selectedTypes - Set of entity types to include
 * @returns {Function} - Predicate function for filtering
 */
export const filterByEntityTypes = (selectedTypes) => {
  if (!selectedTypes || selectedTypes.size === 0) return () => true;

  return (node) => selectedTypes.has(node.data().type);
};

/**
 * Get connected neighbors of a node
 * @param {Object} cy - Cytoscape instance
 * @param {Object} node - Cytoscape node element
 * @returns {Object} - { incoming: [], outgoing: [] }
 */
export const getNeighbors = (cy, node) => {
  if (!node || !cy) return { incoming: [], outgoing: [] };

  const incoming = node.edgesWithSources().filter(e => e.data('target') === node.id());
  const outgoing = node.edgesWithTargets().filter(e => e.data('source') === node.id());

  return {
    incoming,
    outgoing
  };
};
