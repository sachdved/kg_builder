/**
 * Multi-hop neighbor traversal utilities for Cytoscape.js graphs
 */

/**
 * Find all entities within N hops of a given node using BFS with direction support
 * @param {Object} cy - Cytoscape instance
 * @param {string} nodeId - Starting node ID
 * @param {number} maxHops - Maximum depth (default: 1)
 * @param {('both' | 'incoming' | 'outgoing')} direction - Direction of traversal
 * @returns {Set} Set of entity IDs within range
 */
export function getNodesWithinHopsDirected(cy, nodeId, maxHops = 1, direction = 'both') {
  const visited = new Set([nodeId]);
  let currentIds = [nodeId];

  for (let hop = 0; hop < maxHops; hop++) {
    const nextIds = [];

    currentIds.forEach(currentId => {
      const node = cy.$(`node[id="${currentId}"]`);
      if (node.length === 0) return;

      let neighbors = [];
      if (direction === 'both' || direction === 'outgoing') {
        // Outgoing: nodes this node points TO
        const outgoingEdges = cy.edges().filter(e => e.data('source') === currentId);
        outgoingEdges.forEach(edge => {
          const targetId = edge.data('target');
          if (!visited.has(targetId)) {
            neighbors.push({ id: targetId, direction: 'outgoing' });
          }
        });
      }
      if (direction === 'both' || direction === 'incoming') {
        // Incoming: nodes that point TO this node
        const incomingEdges = cy.edges().filter(e => e.data('target') === currentId);
        incomingEdges.forEach(edge => {
          const sourceId = edge.data('source');
          if (!visited.has(sourceId)) {
            neighbors.push({ id: sourceId, direction: 'incoming' });
          }
        });
      }

      // Deduplicate by ID (node could be both incoming and outgoing)
      const seenIds = new Set();
      neighbors.forEach(({ id, direction: dir }) => {
        if (!seenIds.has(id)) {
          seenIds.add(id);
          visited.add(id);
          nextIds.push({ id, direction: dir });
        }
      });
    });

    currentIds = nextIds.map(n => n.id);
    if (currentIds.length === 0) break;
  }

  return visited;
}

/**
 * Find all entities within N hops of a given node using BFS (undirected - for backward compatibility)
 * @param {Object} cy - Cytoscape instance
 * @param {string} nodeId - Starting node ID
 * @param {number} maxHops - Maximum depth (default: 1)
 * @returns {Set} Set of entity IDs within range
 */
export function getNodesWithinHops(cy, nodeId, maxHops = 1) {
  return getNodesWithinHopsDirected(cy, nodeId, maxHops, 'both');
}

/**
 * Get edges connecting a set of nodes to each other
 * @param {Object} cy - Cytoscape instance
 * @param {Set|Array} nodeIds - Set or array of node IDs
 * @returns {Set} Set of edge IDs that connect visible nodes
 */
export function getEdgesForNodes(cy, nodeIds) {
  const nodeIdSet = new Set(nodeIds);
  const edgeIds = new Set();

  cy.edges().forEach(edge => {
    const sourceId = edge.data('source');
    const targetId = edge.data('target');
    if (nodeIdSet.has(sourceId) && nodeIdSet.has(targetId)) {
      edgeIds.add(edge.id());
    }
  });

  return edgeIds;
}

/**
 * Get direct neighbors of a node separated by direction
 * @param {Array} allNodes - Array of all node objects (Cytoscape format)
 * @param {Array} allEdges - Array of all edge objects (Cytoscape format)
 * @param {string} nodeId - The node ID to get neighbors for
 * @returns {{ incoming: string[], outgoing: string[] }} Incoming and outgoing neighbor IDs
 */
export function getNodeNeighborsByDirection(allNodes, allEdges, nodeId) {
  const incoming = [];
  const outgoing = [];

  allEdges.forEach(edge => {
    if (edge.data.source === nodeId) {
      // Outgoing: this node points TO target
      if (!outgoing.includes(edge.data.target)) {
        outgoing.push(edge.data.target);
      }
    }
    if (edge.data.target === nodeId) {
      // Incoming: source points TO this node
      if (!incoming.includes(edge.data.source)) {
        incoming.push(edge.data.source);
      }
    }
  });

  return { incoming, outgoing };
}

/**
 * Get filtered nodes and edges for focus mode with direction support
 * @param {Array} allNodes - Array of all node objects (Cytoscape format)
 * @param {Array} allEdges - Array of all edge objects (Cytoscape format)
 * @param {string} focusedNodeId - ID of the focused node
 * @param {number} focusDepth - Depth of traversal (1, 2, or 3)
 * @param {'both' | 'incoming' | 'outgoing'} direction - Direction of traversal
 * @returns {{nodes: Array, edges: Array}} Filtered nodes and edges
 */
export function getFocusedElements(allNodes, allEdges, focusedNodeId, focusDepth = 1, direction = 'both') {
  console.log('[getFocusedElements] DEBUG:', {
    allNodesCount: allNodes.length,
    allEdgesCount: allEdges.length,
    focusedNodeId,
    focusDepth,
    direction
  });

  // Create adjacency list for BFS traversal with direction support
  const outgoingAdjacency = new Map(); // nodeId -> [targetId, ...]
  const incomingAdjacency = new Map(); // nodeId -> [sourceId, ...]

  // Initialize all nodes in both adjacency maps
  allNodes.forEach(node => {
    if (!outgoingAdjacency.has(node.data.id)) {
      outgoingAdjacency.set(node.data.id, []);
    }
    if (!incomingAdjacency.has(node.data.id)) {
      incomingAdjacency.set(node.data.id, []);
    }
  });

  console.log('[getFocusedElements] Adjacency initialized:', outgoingAdjacency.size, 'nodes');

  // Build directed adjacency lists
  allEdges.forEach(edge => {
    const source = edge.data.source;
    const target = edge.data.target;

    if (outgoingAdjacency.has(source) && outgoingAdjacency.has(target)) {
      outgoingAdjacency.get(source).push(target);
    }
    if (incomingAdjacency.has(target) && incomingAdjacency.has(source)) {
      incomingAdjacency.get(target).push(source);
    }
  });

  // Perform BFS with direction awareness to find nodes within focusDepth hops
  const visited = new Set();
  const queue = [{ nodeId: focusedNodeId, depth: 0 }];
  visited.add(focusedNodeId);

  while (queue.length > 0) {
    const { nodeId, depth } = queue.shift();

    if (depth >= focusDepth) continue;

    // Get neighbors based on direction
    let neighborIds = [];

    if (direction === 'both' || direction === 'outgoing') {
      const outNeighbors = outgoingAdjacency.get(nodeId) || [];
      neighborIds = [...neighborIds, ...outNeighbors];
    }

    if (direction === 'both' || direction === 'incoming') {
      const inNeighbors = incomingAdjacency.get(nodeId) || [];
      neighborIds = [...neighborIds, ...inNeighbors];
    }

    for (const neighborId of neighborIds) {
      if (!visited.has(neighborId)) {
        visited.add(neighborId);
        queue.push({ nodeId: neighborId, depth: depth + 1 });
      }
    }
  }

  // Convert to arrays for filter operation compatibility
  const nodeIdsArray = Array.from(visited);
  const nodeIdSet = new Set(nodeIdsArray);

  // Filter nodes by ID (preserving all node properties)
  const filteredNodes = allNodes.filter(node => nodeIdSet.has(node.data.id));

  // Filter edges where both endpoints are in the visited set
  const filteredEdges = allEdges.filter(edge =>
    nodeIdSet.has(edge.data.source) && nodeIdSet.has(edge.data.target)
  );

  console.log('[getFocusedElements] Result:', {
    visibleNodes: filteredNodes.length,
    visibleEdges: filteredEdges.length,
    visitedIds: Array.from(visited)
  });

  return {
    nodes: filteredNodes,
    edges: filteredEdges
  };
}

/**
 * Check if a node exists in the graph
 * @param {Array} nodes - Array of all node objects
 * @param {string} nodeId - Node ID to check
 * @returns {boolean} True if node exists
 */
export function nodeExists(nodes, nodeId) {
  return nodes.some(node => node.data.id === nodeId);
}

/**
 * Get the count of reachable nodes within N hops
 * @param {Array} allNodes - Array of all node objects
 * @param {Array} allEdges - Array of all edge objects
 * @param {string} focusedNodeId - ID of the focused node
 * @param {number} focusDepth - Depth of traversal
 * @param {'both' | 'incoming' | 'outgoing'} direction - Direction of traversal (default: 'both')
 * @returns {{totalNodes: number, totalEdges: number, visibleNodes: number, visibleEdges: number}}
 */
export function getFocusStats(allNodes, allEdges, focusedNodeId, focusDepth = 1, direction = 'both') {
  const result = getFocusedElements(allNodes, allEdges, focusedNodeId, focusDepth, direction);
  return {
    totalNodes: allNodes.length,
    totalEdges: allEdges.length,
    visibleNodes: result.nodes.length,
    visibleEdges: result.edges.length
  };
}

/**
 * Get filtered nodes and edges for focus mode (alias for backward compatibility)
 * @param {Array} allNodes - Array of all node objects (Cytoscape format)
 * @param {Array} allEdges - Array of all edge objects (Cytoscape format)
 * @param {string} focusedNodeId - ID of the focused node
 * @param {number} focusDepth - Depth of traversal (1, 2, or 3)
 * @returns {{nodes: Array, edges: Array}} Filtered nodes and edges
 */
export function getFilteredElements(allNodes, allEdges, focusedNodeId, focusDepth = 1) {
  return getFocusedElements(allNodes, allEdges, focusedNodeId, focusDepth, 'both');
}

