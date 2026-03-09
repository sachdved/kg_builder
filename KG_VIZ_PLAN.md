# Knowledge Graph Visualization Tool - Specification Document

## Executive Summary

This document specifies a web-based knowledge graph visualization tool designed to handle large-scale code knowledge graphs (10k+ entities, 50k+ relationships). The tool will enable users to explore, analyze, and edit knowledge graphs extracted from Python codebases.

---

## 1. Data Structure Analysis

### 1.1 Entity Schema

The KG builder outputs entities with the following structure:

```json
{
  "id": "/home/sachdved/Documents/biopython/Bio/File.py::as_handle",
  "name": "as_handle",
  "type": "FUNCTION",
  "file_path": "Bio/File.py",
  "line_number": 29,
  "properties": {
    "description": "...",
    "decorators": ["contextlib.contextmanager"],
    "args": [...],
    "return_type": null
  }
}
```

**Entity Fields:**
| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Unique identifier (full path with optional qualifier) |
| `name` | string | Human-readable display name |
| `type` | enum | Entity classification (see below) |
| `file_path` | string | Relative path to source file |
| `line_number` | integer | Line number in source file |
| `properties` | object | Type-specific metadata |

**Entity Types:**
| Type | Count (Biopython) | Description |
|------|------------------|-------------|
| `MODULE` | 293 | Python files/modules |
| `CLASS` | 613 | Class definitions |
| `FUNCTION` | 4,624 | Function/method definitions |
| `VARIABLE` | 10,749 | Variable declarations |
| `CONSTANT` | 386 | Constant values (uppercase naming) |
| `IMPORT` | 1,814 | Import statements |

**Type-Specific Properties:**
- **FUNCTION**: `description`, `decorators[]`, `args[]`, `return_type`
- **CLASS**: `description`, `decorators[]`, `bases[]` (inheritance)
- **IMPORT**: `description`, `original_name`, `module`
- **MODULE/CONSTANT/VARIABLE**: `description`

### 1.2 Relationship Schema

Relationships are stored as a flat list:

```json
{
  "source_id": "Bio/File.py::as_handle",
  "target_id": "open",
  "type": "CALLS",
  "line_number": 72
}
```

**Relationship Fields:**
| Field | Type | Description |
|-------|------|-------------|
| `source_id` | string | Key in entities object (abbreviated path) |
| `target_id` | string | Entity identifier (may be external/unknown) |
| `type` | enum | Relationship classification |
| `line_number` | integer | Where relationship occurs in source |

**Relationship Types:**
| Type | Count | Description | Direction |
|------|-------|-------------|-----------|
| `CONTAINS` | 51,944 | Parent contains child element | Module → Elements |
| `DEFINES_IN` | 14,615 | Function defines local variable | Function → Local Var |
| `CALLS` | 23,882 | Function calls another function | Function → Function |
| `INSTANTIATES` | 5,396 | Creates instance of class | Code → Class |
| `IMPORTS` | 1,869 | Module imports entity | Module → Import |
| `INHERITS` | 416 | Class inherits from base | Class → Base Class |

### 1.3 Key Observations

1. **ID Mismatch**: Relationship keys use abbreviated paths (`Bio/File.py`) while entity IDs use full paths
2. **External References**: Some target_ids point to entities not in the graph (e.g., built-in `open`, `ValueError`)
3. **High Node Degree**: MODULE and FUNCTION types have many outgoing relationships
4. **Hierarchical Structure**: CONTAINS relationships form a natural tree structure

---

## 2. User Requirements & Use Cases

### 2.1 Primary Users

- **Code Reviewers**: Understanding dependencies before making changes
- **New Developers**: Learning codebase structure and navigation
- **Technical Leads**: Assessing architectural decisions
- **Refactoring Engineers**: Impact analysis for modifications

### 2.2 Core Use Cases

| Priority | Use Case | Description |
|----------|----------|-------------|
| P0 | **Graph Exploration** | Navigate through entities and relationships interactively |
| P0 | **Search & Filter** | Find specific entities by name, type, or file |
| P0 | **Detail Inspection** | View entity properties including source code context |
| P1 | **Subgraph Focus** | Isolate and analyze portions of the graph |
| P1 | **Dependency Analysis** | Trace call chains and dependencies |
| P1 | **File Navigation** | Jump between related files/modules |
| P2 | **Graph Editing** | Add/remove entities and relationships |
| P2 | **Comparison View** | Compare different versions of the KG |
| P2 | **Export/Share** | Export visualizations or subgraphs |

### 2.3 User Stories

1. "As a developer, I want to click on a function and see all functions it calls so I can understand its dependencies."
2. "As a reviewer, I want to filter the graph to show only a specific module's contents before code review."
3. "As a maintainer, I want to search for 'authentication' and see all related entities across the codebase."
4. "As a refactorer, I want to trace the impact of changing a class by finding all INSTANTIATES and INHERITS relationships."

---

## 3. Technical Architecture

### 3.1 System Overview

```
┌─────────────────────────────────────────────────────────────┐
│                     React Application                       │
│  ┌──────────────┐  ┌──────────────┐  ┌─────────────────┐   │
│  │ Graph Canvas │  │  Sidebar     │  │   Top Toolbar   │   │
│  │  (Viewport)  │  │  (Panels)    │  │  (Controls)     │   │
│  └──────────────┘  └──────────────┘  └─────────────────┘   │
└─────────────────────────────────────────────────────────────┘
                          │
        ┌─────────────────┼─────────────────┐
        ▼                 ▼                 ▼
┌───────────────┐  ┌──────────────┐  ┌─────────────────┐
│   Graph       │  │   Entity     │  │   Graph         │
│   Engine      │  │   Store      │  │   State         │
│   (WebGL)     │  │   (IndexedDB)│  │   Management    │
└───────────────┘  └──────────────┘  └─────────────────┘
```

### 3.2 Component Architecture

#### 3.2.1 Graph Engine Layer
- **Rendering**: WebGL-based graph rendering for performance
- **Physics Simulation**: Force-directed layout with stabilization
- **Selection & Interaction**: Hit detection, drag/pan/zoom
- **LOD System**: Level-of-detail rendering based on zoom

#### 3.2.2 Data Layer
- **Entity Store**: IndexedDB for large datasets
- **Relationship Index**: Adjacency lists for efficient traversal
- **Search Index**: Full-text search capability
- **Cache Management**: LRU cache for frequently accessed data

#### 3.2.3 UI Layer
- **Canvas Component**: Main visualization area
- **Sidebar Panels**: Entity details, search results, filters
- **Toolbar**: Global actions and view controls
- **Context Menus**: Right-click contextual actions

### 3.3 Performance Strategy

| Challenge | Solution | Target |
|-----------|----------|--------|
| Large datasets (27MB JSON) | Lazy loading + IndexedDB | <5s initial load |
| 18k+ node rendering | WebGL virtualization | 60fps interaction |
| Complex physics simulation | Worker threads + subsampling | Responsive dragging |
| Search performance | Pre-built indexes | <100ms query time |
| Memory management | Object pooling + pruning | <500MB RAM usage |

---

## 4. Feature Prioritization

### 4.1 MVP (Phase 1) - Core Functionality

**Must Have:**

1. **Graph Rendering**
   - Force-directed layout with D3.js or similar
   - Zoom and pan navigation
   - Node/edge coloring by type
   - Basic collision handling

2. **Entity Details Panel**
   - Display selected entity's properties
   - Show incoming/outgoing relationships
   - Source code snippet (if available)

3. **Search & Filter**
   - Search by name/text
   - Filter by entity type
   - Filter by file path

4. **Basic Navigation**
   - Click to select and focus
   - Double-click to center
   - Keyboard shortcuts (Escape, arrows)

5. **Graph Loading**
   - Load JSON files up to 50MB
   - Progress indicator during loading
   - Error handling for malformed data

### 4.2 Phase 2 - Enhanced Exploration

**Should Have:**

1. **Advanced Navigation**
   - Expand/collapse subgraphs on demand
   - "Go to definition" navigation
   - Breadcrumb trail for deep navigation

2. **Visual Enhancements**
   - Custom node shapes per type
   - Arrow styling per relationship type
   - Edge bundling for dense areas
   - Highlight paths between nodes

3. **Subgraph Management**
   - Save named subgraph views
   - Comparison of different views
   - Export subgraphs to new KG files

4. **Performance Optimization**
   - Clustering/aggregation at low zoom
   - Edge sampling for very dense graphs
   - Caching of rendered tiles

### 4.3 Phase 3 - Editing & Analysis

**Could Have:**

1. **Graph Editing**
   - Add/remove entities and relationships
   - Drag-to-connect functionality
   - Edit entity properties inline

2. **Analysis Tools**
   - Centrality metrics display
   - Connected components analysis
   - Cycle detection
   - Call graph depth visualization

3. **Code Integration**
   - Source file side-by-side view
   - Jump to source in IDE integration
   - Syntax highlighting for code snippets

4. **Collaboration Features**
   - Share visualization URL with state
   - Annotations on graph elements
   - Comparison with other KG versions

---

## 5. UI/UX Design Considerations

### 5.1 Layout Principles

```
┌───────────────────────────────────────────────────────────────┐
│  [Logo]  [Load] [Search Box..................]  [Filter ▼][?] │
├───────────────────────────────────────────────────────────────┤
│                                                              │
│                     ┌─────────────┐                         │
│                    (◉)           (●)                        │
│                   /   │ \         / \                       │
│                  (○)--(□)───────>(△)                        │
│                   \               │                         │
│                    ◯-------------◯                          │
│                                                              │
│          [Drag to pan • Scroll to zoom • Click to select]    │
│                                                              │
├───────────────────────────────────────────────────────────────┤
│  Entity Details: [MODULE] Bio/File.py                      │◉│
│  ────────────────────────────────────────────────────────────│◉│
│  Description: Code for more fancy file handles...         │◉│
│                                                          │◉│
│  Relationships:                                          │◉│
│    → CONTAINS (45)                                      │◉│
│    → IMPORTS (8)                                        │◉│
│                                                              │◉│
└───────────────────────────────────────────────────────────────┘
```

### 5.2 Node Visual Design

| Entity Type | Color | Shape | Icon |
|-------------|-------|-------|------|
| MODULE | #4A90D9 | Square | 📁 |
| CLASS | #E87C03 | Diamond | ◎ |
| FUNCTION | #6BBD6B | Circle | ⚬ |
| VARIABLE | #A052A0 | Hexagon | ○ |
| CONSTANT | #9F0505 | Pentagon (filled) | ◆ |
| IMPORT | #1E8449 | Parallelogram | 📥 |

### 5.3 Edge Visual Design

| Relationship Type | Color | Style | Arrow |
|-------------------|-------|-------|-------|
| CONTAINS | #666666 | Solid | ✓ |
| CALLS | #0066CC | Solid curved | ✓ |
| DEFINES_IN | #999999 | Dashed | ✓ |
| INSTANTIATES | #FF8C00 | Solid | ◇ |
| IMPORTS | #32CD32 | Double line | ✓ |
| INHERITS | #FF1493 | Solid (thick) | △ |

### 5.4 Interaction Patterns

**Zoom Levels & Rendering Strategy:**

| Zoom Level | Nodes Shown | Clustering | Edge Visibility |
|------------|-------------|------------|-----------------|
| < 0.2x | All nodes aggregated | Full module clusters | None |
| 0.2-0.5x | Module level only | Expanded modules | High-level only |
| 0.5-1.0x | Function/class level | Per-class clusters | Type-based filtering |
| 1.0-2.0x | Detailed view | No clustering | All edges |
| > 2.0x | Focus mode | Disabled | All + labels |

**Keyboard Shortcuts:**
```
Space + Drag    Pan canvas
Scroll/Wheel    Zoom in/out
F               Focus on selection
H               Hide selection
S               Show all
/               Open search
Esc             Deselect / Exit focus
Arrow keys      Nudge selection
Ctrl+Click      Multi-select
Delete          Remove (edit mode)
```

---

## 6. Technology Recommendations

### 6.1 Core Stack

| Layer | Recommended | Alternative | Rationale |
|-------|-------------|-------------|-----------|
| Framework | **React 18** | Vue 3 | Strong ecosystem, hooks for graph state |
| Graph Rendering | **D3-force + SVG** | Cytoscape.js | Fine-grained control, good at scale |
| High-Perf Alternative | **ZenoGraph / Visx** | — | WebGL acceleration built-in |
| State Management | **Zustand** | Redux Toolkit | Minimal boilerplate, fast updates |
| Data Storage | **IndexedDB (Dexie.js)** | LocalStorage | Handles large datasets efficiently |
| Search | **Flexsearch** | MiniSearch | Full-text with fuzzy matching |
| Build Tool | **Vite** | Webpack | Fast HMR, great DX |
| UI Components | **Headless UI + Tailwind** | Chakra UI | Accessible, flexible styling |

### 6.2 Why D3-force for MVP?

D3.js with force-directed simulation:
- ✅ Battle-tested at scale (10k+ nodes achievable)
- ✅ Highly customizable physics parameters
- ✅ Excellent documentation and community
- ✅ Smooth animations and transitions
- ⚠️ Requires optimization for very large graphs

**Optimization Techniques:**
1. Use `d3.forceSimulation` with fixed positions for inactive areas
2. Implement LOD: show only N closest nodes to viewport
3. Pre-compute cluster centers for collapsed groups
4. Use requestAnimationFrame for smooth rendering
5. Offload physics computation to Web Worker

### 6.3 Alternative High-Performance Options

For datasets exceeding 50k nodes:

| Library | Strengths | Weaknesses |
|---------|-----------|------------|
| **ZenoGraph** | WebGL, 1M+ nodes | Less customizable |
| **Visx (Airbnb)** | React-native, performant | Smaller community |
| **Klay.js** | Layout algorithms | Heavier bundle |
| **nx-graphviz** | Graphviz layouts | Static only |

---

## 7. Performance Requirements

### 7.1 Metrics

| Metric | Target | Measurement Method |
|--------|--------|-------------------|
| Initial load time (27MB) | <5s | First meaningful render |
| Search response time | <100ms | Query to results display |
| Interaction frame rate | >30fps (60fps ideal) | While dragging nodes |
| Memory footprint | <500MB | Chrome DevTools Performance |
| Bundle size | <200KB gzipped | Production build |

### 7.2 Scaling Strategy

```
                    Nodes in Graph
    ┌────────────────────────────────────────┐
    │         <5k      5k-15k     >15k       │
    ├────────────────────────────────────────┤
    │ Rendering   Full        LOD tiles  WebGL│
    │ Layout      Force-all   Cluster+Force Hybrid│
    │ Edges       All         Sampled/Hidden Batching│
    └────────────────────────────────────────┘
```

**LOD Implementation:**
- Level 0: Show clusters (modules as single nodes)
- Level 1: Expand clicked clusters to show classes/functions
- Level 2: Full detail for selected area only
- Dynamic edge pruning based on zoom level

### 7.3 Indexing Strategy

```typescript
// Entity Index: O(1) lookup by ID
const entityIndex = Map<string, Entity>

// Adjacency Lists: Fast neighbor traversal
const outgoingEdges = Map<string, Edge[]>
const incomingEdges = Map<string, Edge[]>

// Inverted Index: Full-text search
const searchIndex = {
  nameTerms: Map<string, Set<EntityId>>,
  descTerms: Map<string, Set<EntityId>>,
  fileTerms: Map<string, Set<EntityId>>
}

// File Path Tree: Hierarchical navigation
const fileTree = {
  Bio: {
    File.py: [EntityId, ...],
    SeqIO: {...}
  }
}
```

---

## 8. Implementation Roadmap

### Phase 1: MVP (4-6 weeks)

| Week | Tasks |
|------|-------|
| 1 | Project setup, JSON parsing, basic data model |
| 2 | D3 force-directed layout implementation |
| 3 | Entity detail panel, search functionality |
| 4 | Type-based filtering, zoom/pan controls |
| 5 | Performance optimization (LOD basics) |
| 6 | Testing, documentation, polish |

### Phase 2: Enhanced Exploration (3-4 weeks)

| Week | Tasks |
|------|-------|
| 7 | Subgraph expansion/collapse UI |
| 8 | Path highlighting, visual enhancements |
| 9 | Named views, save/load graph states |
| 10 | Advanced search, fuzzy matching |

### Phase 3: Editing & Analysis (4-6 weeks)

| Week | Tasks |
|------|-------|
| 11-12 | Graph editing mode, add/remove entities |
| 13 | Analysis metrics (centrality, components) |
| 14 | Source code integration |
| 15 | Export features, collaboration prep |
| 16 | Final testing and optimization |

---

## 9. File Structure Proposal

```
kg-visualization/
├── src/
│   ├── components/
│   │   ├── GraphCanvas/           # Main visualization component
│   │   │   ├── Canvas.tsx
│   │   │   ├── NodeRenderer.tsx
│   │   │   └── EdgeRenderer.tsx
│   │   ├── Sidebar/               # Details and search panels
│   │   │   ├── DetailsPanel.tsx
│   │   │   ├── SearchPanel.tsx
│   │   │   └── FilterPanel.tsx
│   │   ├── Toolbar/               # Global controls
│   │   │   ├── ZoomControls.tsx
│   │   │   └── ViewActions.tsx
│   │   └── Common/                # Reusable UI components
│   ├── hooks/                     # Custom React hooks
│   │   ├── useGraphData.ts
│   │   ├── useZoomPan.ts
│   │   └── useSelection.ts
│   ├── store/                     # State management
│   │   ├── graphStore.ts
│   │   └── uiStore.ts
│   ├── utils/
│   │   ├── kgParser.ts            # JSON parsing
│   │   ├── graphLayout.ts         # D3 simulation setup
│   │   ├── searchIndex.ts         # Search functionality
│   │   └── colorSchemes.ts        # Visual styling
│   ├── types/                     # TypeScript definitions
│   │   ├── entity.ts
│   │   ├── relationship.ts
│   │   └── graph.ts
│   ├── App.tsx
│   └── main.tsx
├── public/
│   └── index.html
├── vite.config.ts
├── package.json
└── README.md
```

---

## 10. Data Model (TypeScript)

```typescript
// Entity definitions
interface KGEntity {
  id: string;
  name: string;
  type: EntityType;
  file_path: string;
  line_number: number;
  properties: Record<string, unknown>;
}

type EntityType =
  | 'MODULE'
  | 'CLASS'
  | 'FUNCTION'
  | 'VARIABLE'
  | 'CONSTANT'
  | 'IMPORT';

// Function-specific properties
interface FunctionProperties {
  description?: string;
  decorators?: string[];
  args?: { name: string; kind: string }[];
  return_type?: string | null;
}

// Class-specific properties
interface ClassProperties {
  description?: string;
  decorators?: string[];
  bases?: string[];
}

// Relationship definition
interface KGRelationship {
  source_id: string;
  target_id: string;
  type: RelationshipType;
  line_number: number;
}

type RelationshipType =
  | 'CONTAINS'
  | 'CALLS'
  | 'DEFINES_IN'
  | 'INSTANTIATES'
  | 'IMPORTS'
  | 'INHERITS';

// Full KG data structure
interface KnowledgeGraph {
  entities: Record<string, KGEntity>;
  relationships: KGRelationship[];
}

// Runtime graph state
interface GraphState {
  zoom: number;
  pan: { x: number; y: number };
  selectedIds: Set<string>;
  hiddenIds: Set<string>;
  collapsedClusters: Set<string>;
  hoveredId: string | null;
  focusMode: boolean;
}

// Node for rendering (computed)
interface RenderNode extends KGEntity {
  x: number;
  y: number;
  vx: number;
  vy: number;
  fixed?: boolean;
  clusterId?: string;
}

// Edge for rendering (computed)
interface RenderEdge {
  source: RenderNode | string;
  target: RenderNode | string;
  type: RelationshipType;
  line_number: number;
}
```

---

## 11. Testing Strategy

### 11.1 Unit Tests
- Data parsing and validation
- Graph layout calculations
- Search index construction
- Selection/interaction logic

### 11.2 Integration Tests
- Component interactions
- State management flows
- Performance under load

### 11.3 E2E Tests (Playwright)
- Full user workflows
- Keyboard navigation
- Drag and drop operations

### 11.4 Performance Benchmarks
```typescript
// Benchmark suite
bench('render 5000 nodes', () => {
  const nodes = generateTestGraph(5000);
  measureTime(() => renderGraph(nodes));
});

bench('search in 20k entities', () => {
  const graph = loadTestKG('large_test.json');
  const start = Date.now();
  searchEntities(graph, 'authentication');
  const elapsed = Date.now() - start;
  expect(elapsed).toBeLessThan(100);
});
```

---

## 12. Known Challenges & Mitigations

| Challenge | Risk Level | Mitigation |
|-----------|------------|------------|
| Browser memory limits with 50k+ nodes | High | Progressive loading, virtualization |
| "Hairball" effect in dense graphs | Medium | Edge bundling, clustering, filtering |
| Slow initial load for large files | Medium | Web Worker parsing, streaming JSON |
| Complex physics simulation lag | Medium | Fixed positions, reduced force types |
| Text label collisions | Low | Collision detection, hide on overlap |

---

## 13. Success Criteria

### MVP Definition of Done:

- [ ] Loads biopython_kg_subset.json without errors
- [ ] Renders all 18k entities and 98k relationships
- [ ] User can search for "SeqRecord" and find the class
- [ ] Clicking a node shows its details panel
- [ ] Zoom/pan feels responsive (no jank)
- [ ] Type filters work correctly
- [ ] Documentation covers basic usage

### Quality Gates:

- Code coverage > 80%
- ESLint/Prettier passing
- Bundle size < 200KB gzipped
- Lighthouse performance score > 80

---

## 14. Appendix A: Example Interaction Flow

```
1. User loads KG file
   ↓
2. Graph renders at module-level view (clustering on)
   ↓
3. User types "SeqRecord" in search
   ↓
4. Search highlights matching entity in sidebar
   ↓
5. User clicks result, graph centers on Bio/SeqIO.py
   ↓
6. User zooms into module cluster
   ↓
7. SeqRecord class expands, showing methods
   ↓
8. User holds Shift, clicks multiple methods
   ↓
9. Details panel shows all selected methods
   ↓
10. User hovers over a CALLS edge
    ↓
11. Related function is highlighted
```

---

## 15. Appendix B: Color Palette Specification

### Entity Type Colors (Material Design)

```typescript
const entityColors = {
  MODULE: '#4A90D9',      // Blue 700
  CLASS: '#E87C03',       // Orange 700
  FUNCTION: '#6BBD6B',    // Green 500
  VARIABLE: '#A052A0',    // Purple 700
  CONSTANT: '#9F0505',    // Red 800
  IMPORT: '#1E8449',      // Material Green 600
};

const edgeColors = {
  CONTAINS: '#666666',     // Grey 700
  CALLS: '#0066CC',        // Blue 600
  DEFINES_IN: '#999999',   // Grey 500
  INSTANTIATES: '#FF8C00', // Dark Orange
  IMPORTS: '#32CD32',      // Lime Green
  INHERITS: '#FF1493',     // Deep Pink
};
```

### Accessibility Considerations

- Minimum contrast ratio 4.5:1 for WCAG AA compliance
- Shape differentiation in addition to color
- Tooltips with text labels for all elements
- Keyboard-only navigation support

---

## Document Version History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2024-03-08 | Research Manager | Initial specification |

---

## References for Implementation Agent

1. **D3.js Force Simulation**: https://d3js.org/d3-force/
2. **Visx Graph Components**: https://airbnb.io/visx/graph
3. **Cytoscape.js**: https://js.cytoscape.org/
4. **Force-Directed Layout Optimization**: Consider using `d3-fle` for physics improvements

**Key Implementation Notes:**
- Start with the subset file to validate approach before scaling
- Implement LOD early; it's critical for large graphs
- Use Web Workers for JSON parsing to keep main thread responsive
- Cache computed values (adjacency lists, search index) for performance
