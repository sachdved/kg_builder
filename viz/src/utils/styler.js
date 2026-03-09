// Entity type colors (colorblind-friendly palette)
export const entityColors = {
  FILE: '#2E86AB',      // Blue
  MODULE: '#A23B72',    // Magenta
  CLASS: '#F18F01',     // Orange
  FUNCTION: '#C73E1D',  // Red-brown
  CONSTANT: '#6A994E',  // Green
  VARIABLE: '#588157',  // Darker green
  IMPORT: '#BC4B51',    // Red
  DECORATOR: '#3B528B'  // Navy
};

// Relationship type colors
export const relationshipColors = {
  CONTAINS: '#666666',   // Gray - structural
  CALLS: '#C73E1D',      // Red-brown - active
  INHERITS: '#F18F01',   // Orange - important
  IMPORTS: '#2E86AB',    // Blue - external
  INSTANTIATES: '#6A994E', // Green - creation
  DEFINES_IN: '#999999'  // Light gray - scope
};

// Node shape mapping by entity type
export const nodeShapes = {
  FILE: 'rectangle',
  MODULE: 'rounded-rectangle',
  CLASS: 'hexagon',
  FUNCTION: 'ellipse',
  CONSTANT: 'diamond',
  VARIABLE: 'circle',
  IMPORT: 'tag',
  DECORATOR: 'star'
};

// Node size by entity type (default radius)
export const nodeSizes = {
  FILE: 28,
  MODULE: 24,
  CLASS: 20,
  FUNCTION: 16,
  CONSTANT: 14,
  VARIABLE: 10,
  IMPORT: 14,
  DECORATOR: 12
};

// Relationship line styles
export const relationshipStyles = {
  CONTAINS: { lineWidth: 1, dash: 'solid', arrow: 'none' },
  CALLS: { lineWidth: 2, dash: 'solid', arrow: 'triangle' },
  INHERITS: { lineWidth: 3, dash: 'solid', arrow: 'triangle' },
  IMPORTS: { lineWidth: 1.5, dash: [6, 4], arrow: 'triangle' },
  INSTANTIATES: { lineWidth: 1.5, dash: [4, 3], arrow: 'triangle' },
  DEFINES_IN: { lineWidth: 1, dash: 'solid', arrow: 'none' }
};

// Get node color by type
export const getNodeColor = (type) => entityColors[type] || '#999999';

// Get node shape by type
export const getNodeType = (type) => nodeShapes[type] || 'circle';

// Get node size by type
export const getNodeSize = (type) => nodeSizes[type] || 14;

// Get edge color by relationship type
export const getEdgeColor = (type) => relationshipColors[type] || '#999999';

// Cytoscape.js style sheet for nodes and edges
export const generateStylesheet = () => [
  // Background
  {
    selector: 'background',
    style: {
      'background-color': '#fafafa'
    }
  },
  // Default node styles
  {
    selector: 'node',
    style: {
      'background-color': '#999999',
      shape: 'circle',
      width: 14,
      height: 14,
      'text-valign': 'center',
      'text-halign': 'center',
      'font-size': '8px',
      'text-outline-width': 1,
      'text-outline-color': '#ffffff'
    }
  },
  // Node styles by type
  ...Object.entries(nodeShapes).map(([type, shape]) => ({
    selector: `node[type="${type}"]`,
    style: {
      'background-color': entityColors[type],
      shape: shape,
      width: nodeSizes[type],
      height: nodeSizes[type]
    }
  })),
  // Selected nodes
  {
    selector: 'node:selected',
    style: {
      'border-width': 3,
      'border-color': '#333333'
    }
  },
  // Highlighted nodes (neighbors)
  {
    selector: 'node:highlighted',
    style: {
      'border-width': 2,
      'border-color': '#333333'
    }
  },
  // Dimmed nodes (filtered out)
  {
    selector: 'node:dimmed',
    style: {
      'background-opacity': 0.15,
      width: 6,
      height: 6
    }
  },
  // Default edge styles
  {
    selector: 'edge',
    style: {
      'line-color': '#999999',
      'target-arrow-color': '#999999',
      'curve-style': 'taxi',
      'taxi-direction': 'vertical',
      'taxi-turn': '0px',
      'line-style': 'solid',
      'width': 1,
      'z-index': 1
    }
  },
  // Edge styles by relationship type
  ...Object.entries(relationshipStyles).map(([type, style]) => ({
    selector: `edge[rel="${type}"]`,
    style: {
      'line-color': relationshipColors[type],
      'target-arrow-color': relationshipColors[type],
      'width': style.lineWidth,
      'line-style': style.dash === 'solid' ? 'solid' : 'dashed',
      'dash-pattern': Array.isArray(style.dash) ? style.dash : undefined,
      'target-arrow-shape': style.arrow
    }
  })),
  // Selected edges
  {
    selector: 'edge:selected',
    style: {
      'line-color': '#333333',
      'target-arrow-color': '#333333',
      'width': 3
    }
  },
  // Dimmed edges
  {
    selector: 'edge:dimmed',
    style: {
      'line-opacity': 0.15,
      'target-arrow-opacity': 0.15
    }
  }
];

// Legend data structure
export const getLegendItems = () => [
  // Entity types
  ...Object.entries(nodeShapes).map(([type, shape]) => ({
    category: 'Entities',
    type: type,
    color: entityColors[type],
    shape: shape
  })),
  // Relationship types
  ...Object.entries(relationshipStyles).map(([type, style]) => ({
    category: 'Relationships',
    type: type,
    color: relationshipColors[type],
    lineStyle: Array.isArray(style.dash) ? 'dashed' : 'solid',
    arrow: style.arrow !== 'none'
  }))
];
