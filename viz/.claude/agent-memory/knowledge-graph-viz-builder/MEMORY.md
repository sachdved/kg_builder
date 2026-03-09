# Knowledge Graph Visualizer - Key Patterns

## Project Structure
- `/home/sachdved/Documents/kg_builder/viz` - Main project directory
- `src/components/` - React components (GraphContainer, Toolbar, Sidebar, modals)
- `src/utils/` - Utility modules (kgParser, styler, graphHelpers, undoRedo)
- Uses Cytoscape.js for graph rendering with fcose and dagre layouts

## Key Components
- **GraphContainer** - Cytoscape.js wrapper with layout/filter support
- **Sidebar** - Entity details view with editing capability
- **EntityForm** - Editable form for entity properties (id, name, type, file_path, line_number, description)
- **NewNodeModal** - Add new entities via modal dialog
- **NewEdgeModal** - Add relationships between existing entities
- **ContextMenu** - Right-click menu with delete option
- **ConfirmationDialog** - Delete confirmation before action

## Editing Architecture
All edits follow this pattern:
1. `saveToHistory(prevState, newData)` - Clone current state to history
2. Modify kgData (add/update/delete entity or relationship)
3. `parseKGToElements(kgData)` - Re-convert to Cytoscape elements
4. Update nodes/edges state for re-render

## KG JSON Format
```json
{
  "entities": {
    "<id>": {
      "id": "...",
      "name": "...",
      "type": "FILE|MODULE|CLASS|FUNCTION|CONSTANT|VARIABLE|IMPORT|DECORATOR",
      "file_path": "...",
      "line_number": 0,
      "properties": { "description": "..." }
    }
  },
  "relationships": [
    {
      "source_id": "...",
      "target_id": "...",
      "type": "CONTAINS|CALLS|INHERITS|IMPORTS|INSTANTIATES|DEFINES_IN",
      "line_number": 0
    }
  ]
}
```

## Styling Conventions
- Colorblind-friendly palette in `src/utils/styler.js`
- Entity colors: FILE(blue), MODULE(magenta), CLASS(orange), FUNCTION(red-brown)
- Shapes: hexagon for CLASS, ellipse for FUNCTION, diamond for CONSTANT, etc.

## Keyboard Shortcuts
- Ctrl+N: New entity
- Ctrl+E: New relationship
- Ctrl+Z: Undo
- Ctrl+Y/Ctrl+Shift+Z: Redo
- Delete: Remove selected element
- Escape: Close modals/menus

See `patterns.md` for detailed editing patterns and `debugging.md` for common issues.
