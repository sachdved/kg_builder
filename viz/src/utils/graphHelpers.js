/**
 * Graph manipulation helpers for Cytoscape.js
 */

/**
 * Find shortest path between two nodes using BFS
 * @param {Object} cy - Cytoscape instance
 * @param {string} sourceId - Source node ID
 * @param {string} targetId - Target node ID
 * @returns {Array|null} - Array of elements in the path, or null if no path
 */
export const findShortestPath = (cy, sourceId, targetId) => {
  if (!sourceId || !targetId) return null;

  try {
    const nodes = cy.$(`node[id="${sourceId}"]`);
    const startNode = nodes.length > 0 ? nodes[0] : null;

    if (!startNode) return null;

    return startNode.shortestPath({
      targetSelector: `node[id="${targetId}"]`,
      directed: false,
      weight: () => 1 // Equal weight for all edges
    });
  } catch (error) {
    console.error('Error finding shortest path:', error);
    return null;
  }
};

/**
 * Get connected components in the graph
 * @param {Object} cy - Cytoscape instance
 * @returns {Array} - Array of node groups representing connected components
 */
export const getConnectedComponents = (cy) => {
  try {
    return cy.components();
  } catch (error) {
    console.error('Error getting connected components:', error);
    return [];
  }
};

/**
 * Highlight path nodes and edges, dim others
 * @param {Object} cy - Cytoscape instance
 * @param {Array} pathElements - Array of elements in the path
 */
export const highlightPath = (cy, pathElements) => {
  if (!pathElements || pathElements.length === 0) return;

  const pathIds = new Set(pathElements.map(el => el.id()));

  // Dim all non-path nodes/edges
  cy.elements().forEach(el => {
    if (!pathIds.has(el.id())) {
      el.style('background-opacity', 0.15);
      el.style('line-opacity', 0.15);
      el.style('target-arrow-opacity', 0.15);
    }
  });

  // Highlight path elements
  cy.$(pathElements.map(el => `[id="${el.id()}"]`)).forEach(el => {
    if (el.isNode()) {
      el.style('background-opacity', 1);
      el.style('border-width', 3);
      el.style('border-color', '#333333');
    } else {
      el.style('line-opacity', 1);
      el.style('target-arrow-opacity', 1);
      el.style('width', 3);
    }
  });
};

/**
 * Reset all styling to normal (undo highlighting/dimming)
 * @param {Object} cy - Cytoscape instance
 */
export const resetStyling = (cy) => {
  cy.elements().style({
    'background-opacity': 1,
    'line-opacity': 1,
    'target-arrow-opacity': 1,
    'border-width': 0
  });
};

/**
 * Focus on a node by centering and highlighting neighbors
 * @param {Object} cy - Cytoscape instance
 * @param {string} nodeId - Node ID to focus on
 */
export const focusOnNode = (cy, nodeId) => {
  const node = cy.$(`node[id="${nodeId}"]`);

  if (node.length === 0) return;

  // Dim all nodes
  cy.nodes().style('background-opacity', 0.15);
  cy.edges().style({
    'line-opacity': 0.15,
    'target-arrow-opacity': 0.15
  });

  // Reset selected node and neighbors
  node.style('background-opacity', 1);

  // Highlight neighbors (1-hop)
  const neighbors = node.neighborhood();
  neighbors.forEach(neighbor => {
    neighbor.style('background-opacity', 1);
  });

  // Highlight edges connected to the focused node
  node.connectedEdges().style({
    'line-opacity': 1,
    'target-arrow-opacity': 1
  });

  // Center on the node
  const bounds = node.union(node.neighborhood());
  cy.fit(bounds, 50);
};

/**
 * Check if a node has children (CONTAINS relationships)
 * @param {Object} cy - Cytoscape instance
 * @param {string} nodeId - Node ID to check
 * @returns {number} - Number of children
 */
export const getChildrenCount = (cy, nodeId) => {
  try {
    const node = cy.$(`node[id="${nodeId}"]`);
    if (node.length === 0) return 0;

    const edges = node.outgoers('edge').filter(e => e.data('rel') === 'CONTAINS');
    return edges.length;
  } catch (error) {
    console.error('Error getting children count:', error);
    return 0;
  }
};

/**
 * Expand/collapse a node's children in compound layout
 * @param {Object} cy - Cytoscape instance
 * @param {string} nodeId - Node ID to expand/collapse
 */
export const toggleNode = (cy, nodeId) => {
  try {
    const node = cy.$(`node[id="${nodeId}"]`);
    if (node.length === 0) return;

    if (node.collapsed()) {
      node.expand({ animate: true });
    } else {
      node.collapse({ animate: true });
    }
  } catch (error) {
    console.error('Error toggling node:', error);
  }
};

/**
 * Get degree statistics for a node
 * @param {Object} cy - Cytoscape instance
 * @param {string} nodeId - Node ID
 * @returns {Object} - { inDegree, outDegree, totalDegree }
 */
export const getNodeDegree = (cy, nodeId) => {
  try {
    const node = cy.$(`node[id="${nodeId}"]`);
    if (node.length === 0) return { inDegree: 0, outDegree: 0, totalDegree: 0 };

    const incoming = node.edgesWithTargets().length;
    const outgoing = node.edgesWithSources().length;

    return {
      inDegree: incoming,
      outDegree: outgoing,
      totalDegree: incoming + outgoing
    };
  } catch (error) {
    console.error('Error getting node degree:', error);
    return { inDegree: 0, outDegree: 0, totalDegree: 0 };
  }
};

/**
 * Layout configurations for different layouts
 */
export const layoutConfigs = {
  forceDirected: {
    name: 'fcose', // Compound Force Directed
    animate: true,
    readyThreshold: 1
  },
  hierarchical: {
    name: 'dagre',
    rankDir: 'TB', // Top to bottom
    animate: true
  },
  circular: {
    name: 'circle',
    animate: true,
    minRadius: 100,
    maxRadius: 500
  },
  grid: {
    name: 'grid',
    rows: null, // Auto-detect
    columns: null, // Auto-detect
    directEdges: true,
    animate: true
  }
};

/**
 * Apply a specific layout to the graph
 * @param {Object} cy - Cytoscape instance
 * @param {string} layoutName - Name of the layout to apply
 */
export const applyLayout = (cy, layoutName = 'forceDirected') => {
  const config = layoutConfigs[layoutName];
  if (!config) return;

  try {
    cy.layout(config).run();
  } catch (error) {
    console.error(`Error applying ${layoutName} layout:`, error);
  }
};
