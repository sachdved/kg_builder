# Knowledge Graph Visualizer

An interactive visualization tool for exploring Python knowledge graphs extracted by `kg_builder`. Built with React and Cytoscape.js.

## Features (MVP - Phase 1)

### Core Visualization
- **Force-Directed Layout**: Interactive physics-based graph rendering
- **Multiple Layout Options**: Switch between Force-Directed, Hierarchical, Circular, and Grid layouts
- **Pan & Zoom**: Mouse wheel to zoom, drag canvas to pan
- **Entity Type Encoding**: Visual distinction for all 8 entity types (FILE, MODULE, CLASS, FUNCTION, CONSTANT, VARIABLE, IMPORT, DECORATOR)
- **Relationship Styling**: Distinct line styles for 6 relationship types (CONTAINS, CALLS, INHERITS, IMPORTS, INSTANTIATES, DEFINES_IN)

### Interaction
- **Click to Inspect**: Click any node or edge to view detailed information in the sidebar
- **Search by Name**: Real-time search across entity names and file paths
- **Type Filtering**: Show/hide specific entity types via checkbox filters
- **Keyboard Navigation**: Arrow keys navigate search results, Enter to select, Escape to close

## Installation

### Prerequisites
- Node.js 18+ and npm/yarn

### Setup
```bash
cd kg_builder/viz
npm install
```

### Development
```bash
npm run dev
```
Opens at http://localhost:3000

### Production Build
```bash
npm run build
npm run preview
```

## Usage

### Loading Data
1. Click "Upload JSON" button in the toolbar
2. Select a knowledge graph JSON file (e.g., `biopython_kg_subset.json`)
3. The graph will load with automatic force-directed layout

### Navigation
- **Zoom**: Mouse wheel or +/- buttons
- **Pan**: Click and drag on the canvas
- **Fit to View**: Click the expand icon in toolbar
- **Reset View**: Click home icon or press Home key

### Exploring Entities
1. **Search**: Type in the search bar at top - results appear as you type
2. **Filter**: Use checkboxes on the left to show/hide entity types
3. **Inspect**: Click any node to see details in the right sidebar
4. **Focus**: Right-click a node to focus and dim others

### Legend Reference

#### Entity Types (Shapes & Colors)
| Type | Shape | Color |
|------|-------|-------|
| FILE | Rectangle | Blue (#2E86AB) |
| MODULE | Rounded Rect | Magenta (#A23B72) |
| CLASS | Hexagon | Orange (#F18F01) |
| FUNCTION | Ellipse | Red-brown (#C73E1D) |
| CONSTANT | Diamond | Green (#6A994E) |
| VARIABLE | Circle | Dark Green (#588157) |
| IMPORT | Tag | Red (#BC4B51) |
| DECORATOR | Star | Navy (#3B528B) |

#### Relationship Types (Line Styles)
| Type | Style | Arrow |
|------|-------|-------|
| CONTAINS | Solid, thin | None |
| CALLS | Solid, medium | Triangle |
| INHERITS | Solid, thick | Triangle |
| IMPORTS | Dashed | Triangle |
| INSTANTIATES | Dotted | Triangle |
| DEFINES_IN | Solid, thin | None |

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| Home | Reset view to center |
| +/- | Zoom in/out |
| Arrow Up/Down | Navigate search results |
| Enter | Select highlighted search result |
| Escape | Clear selection, close panels |

## Performance Notes

- Graphs with 10,000+ nodes may experience slower initial layout
- The tool limits rendering to 5,000 nodes for performance (configurable in `App.jsx`)
- Use filters to reduce visible elements during exploration
- Consider using hierarchical layout for large codebases

## File Structure

```
viz/
├── src/
│   ├── main.jsx              # React entry point
│   ├── App.jsx               # Main application component
│   ├── components/           # UI Components
│   │   ├── GraphContainer.jsx # Cytoscape.js wrapper
│   │   ├── Sidebar.jsx        # Entity detail panel
│   │   ├── SearchBar.jsx      # Search interface
│   │   ├── FilterPanel.jsx    # Type filters
│   │   ├── Toolbar.jsx        # Zoom/layout controls
│   │   └── Legend.jsx         # Entity type legend
│   ├── utils/                # Utility functions
│   │   ├── kgParser.js       # JSON to graph conversion
│   │   ├── graphHelpers.js   # Graph manipulation
│   │   └── styler.js         # Styling configuration
│   └── styles/               # CSS files
│       └── index.css         # Global styles
├── public/                   # Static assets
├── package.json              # Dependencies
├── vite.config.js            # Vite configuration
└── README.md                 # This file
```

## Data Format

The tool expects JSON files with this structure:

```json
{
  "entities": {
    "<entity_id>": {
      "id": "string",        // Unique identifier
      "name": "string",      // Display name
      "type": "string",      // One of 8 entity types
      "file_path": "string", // Source location
      "line_number": number, // Definition line
      "properties": {}       // Additional metadata
    }
  },
  "relationships": [
    {
      "source_id": "string",
      "target_id": "string",
      "type": "string",      // One of 6 relationship types
      "line_number": number
    }
  ]
}
```

## Contributing

This is an MVP (Phase 1). Planned features for future phases:
- Phase 2: Node expansion/collapse, double-click focus mode, keyboard navigation improvements
- Phase 3: Path finding, circular dependency detection, image export

## License

MIT
