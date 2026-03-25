# Knowledge Graph Visualization Patterns & Conventions

## Cytoscape.js Setup

### Essential Extensions for KG Visualization
```javascript
import cytoscape from 'cytoscape';
import dagre from 'cytoscape-dagre';  // Hierarchical layouts
import fcose from 'cytoscape-fcose';  // Compound force-directed

cytoscape.use(dagre);
cytoscape.use(fcose);
```

### Recommended Initial Configuration
```javascript
const cy = cytoscape({
  container: containerRef.current,
  elements: [],
  style: generateStylesheet(),
  layout: { name: 'null' },
  zoom: 1,
  pan: { x: 0, y: 0 },
  minZoom: 0.05,
  maxZoom: 10,
  wheelSensitivity: 0.2,
  boxSelectionEnabled: true,
  desktopPanningEnabled: true,
  zoomingEnabled: true
});
```

## Styling Patterns

### Color Palette (colorblind-friendly)
See `src/utils/styler.js` - uses designed palette with distinct colors for each entity type.

### Node Size Guidelines
- FILE: 28px | MODULE: 24px | CLASS: 20px
- FUNCTION: 16px | CONSTANT: 14px | VARIABLE: 10px

## Performance Patterns

### Large Graph Handling
```javascript
const maxNodes = 5000; // Limit for performance
const limitedNodes = parsedNodes.slice(0, maxNodes);
const nodeIds = new Set(limitedNodes.map(n => n.data.id));
const limitedEdges = parsedEdges.filter(
  e => nodeIds.has(e.data.source) && nodeIds.has(e.data.target)
);
```

### Filtered Rendering (dim instead of remove)
Keep all elements but apply dimmed class to hidden ones - allows smooth transitions.

## Common Pitfalls

1. **Cytoscape $() selector**: Must use `cy.$()` not `cy$()`
2. **Template literals in JSX**: Avoid nested `${}` inside template strings for attributes
3. **Duplicate object keys**: Ensure unique keys in Cytoscape config objects
4. **useEffect cleanup**: Always destroy Cytoscape instance on unmount

## File Paths (Absolute)
- Base: `/home/sachdved/Documents/kg_builder/viz/`
- Source: `/home/sachdved/Documents/kg_builder/viz/src/`
- Sample data: `/home/sachdved/Documents/kg_builder/output/biopython_kg_subset.json`

## Direction-Aware Focus Mode (2026-03-22)

### Three Traversal Modes (`focusDirection` prop)
- `'both'` - Bidirectional (default, undirected behavior)
- `'incoming'` - Dependents (nodes pointing TO focused node)
- `'outgoing'` - Dependencies (nodes focused node points TO)

### Key Functions (neighborTraversal.js)
```javascript
// Filter nodes/edges by depth and direction
getFocusedElements(nodes, edges, nodeId, depth, direction = 'both')

// Get direct neighbor IDs separated by direction
getNodeNeighborsByDirection(nodes, edges, nodeId) // Returns { incoming: [], outgoing: [] }

// Stats with direction support
getFocusStats(nodes, edges, nodeId, depth, direction = 'both')
```

### State Pattern (App.jsx)
```javascript
const [focusDirection, setFocusDirection] = useState('both');
const visibleCountInfo = useMemo(() => {
  const neighbors = getNodeNeighborsByDirection(nodes, edges, focusedNodeId);
  return { indegree: neighbors.incoming.length, outdegree: neighbors.outgoing.length, ... };
}, [...]);
```

### Prop Flow
`App.jsx` → `GraphContainer(focusDirection)` → `getFocusedElements(direction)`
`App.jsx` → `FocusPanel(setFocusDirection, indegree, outdegree, ...)`

## Direction-Aware Neighbor Filtering

### FocusDirection State Pattern
```javascript
// In App.jsx
const [focusDirection, setFocusDirection] = useState('both'); // 'both' | 'incoming' | 'outgoing'

// Pass to components
<GraphContainer focusDirection={focusDirection} />
<FocusPanel focusDirection={focusDirection} setFocusDirection={setFocusDirection} />
```

### Traversal Functions (neighborTraversal.js)
- `getNodesWithinHopsDirected(cy, nodeId, maxHops, direction)` - Cytoscape-based BFS
- `getFocusedElements(nodes, edges, focusedNodeId, depth, direction)` - Array-based filtering
- `getNodeNeighborsByDirection(nodes, edges, nodeId)` - Returns `{ incoming: [], outgoing: [] }`
- `getFocusStats(nodes, edges, focusedNodeId, depth, direction)` - Includes all counts

### Direction Semantics
- `'both'` (default): Bidirectional traversal, shows all neighbors (undirected graph)
- `'incoming'`: Shows only nodes that point TO the focused node (dependents/parents)
- `'outgoing'`: Shows only nodes the focused node points TO (dependencies/children)

### Degree Statistics Calculation
```javascript
const neighbors = getNodeNeighborsByDirection(nodes, edges, focusedNodeId);
const indegree = neighbors.incoming.length;  // Incoming edges count
const outdegree = neighbors.outgoing.length; // Outgoing edges count
```

## Common Pitfalls (Extended)

5. **Direction-aware filtering**: Use `focusDirection` prop throughout the chain
6. **Backward compatibility**: Default `direction='both'` maintains undirected behavior
