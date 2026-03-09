# Knowledge Graph Visualizer - Plan

## Overview
Interactive knowledge graph visualization tool with full editing capabilities for kg_builder JSON format.

## Priority Features (P0 Critical)

### 1. Add Nodes/Edges
- **Status**: Complete
- **Location**: Toolbar buttons + modals
- **Features**:
  - "Add Entity" button opens NewNodeModal with form fields: id, name, type, file_path, line_number
  - "Add Relationship" button opens NewEdgeModal with dropdowns for source/target selection
  - Entity type selection dropdown (FILE, MODULE, CLASS, FUNCTION, CONSTANT, VARIABLE, IMPORT, DECORATOR)
  - Required field validation with error messages
  - Keyboard shortcuts: Ctrl+N for new entity, Ctrl+E for new relationship

### 2. Edit Node Properties
- **Status**: Complete
- **Location**: Sidebar details panel + EntityForm component
- **Features**:
  - Convert static inspection panel to editable form with "Edit" button
  - Fields: id, name, type, file_path, line_number, description/docstring
  - Live form validation with inline error messages
  - Visual indicator ("Editing mode active") when editing
  - Save/Cancel buttons at bottom of form

### 3. Delete Nodes/Edges
- **Status**: Complete
- **Location**: Right-click context menu + keyboard delete
- **Features**:
  - Right-click on any node/edge shows context menu with "Delete" option
  - Confirmation dialog before deletion with entity name displayed
  - Node deletion removes associated edges automatically
  - Edge deletion only removes the specific relationship
  - Keyboard shortcut: Delete key for selected element

### 4. Export/Save KG JSON
- **Status**: Complete
- **Location**: Toolbar "Save" button
- **Features**:
  - Download current graph state as valid kg_builder JSON format
  - Structure: `{ entities: { <id>: {...} }, relationships: [{...}] }`
  - Filename with timestamp: `kg_export_YYYY-MM-DD-HH-mm-ss.json`
  - Properly formatted JSON with indentation

### 5. Undo/Redo (P1)
- **Status**: Complete
- **Location**: Toolbar buttons + keyboard shortcuts
- **Features**:
  - Change history stack with max 50 states (to prevent memory issues)
  - Ctrl+Z for undo, Ctrl+Y or Ctrl+Shift+Z for redo
  - Visual indicators: buttons show disabled state when no actions available
  - History cleared on new edits (redo stack)

## Technical Implementation

### Files Created/Modified
- `src/components/NewNodeModal.jsx` - Modal for adding entities
- `src/components/NewEdgeModal.jsx` - Modal for adding relationships
- `src/components/EntityForm.jsx` - Editable form for entity properties
- `src/components/ContextMenu.jsx` - Right-click context menu
- `src/components/ConfirmationDialog.jsx` - Delete confirmation dialog
- `src/utils/undoRedo.js` - Undo/redo history management
- `src/styles/index.css` - Added modal, form, and context menu styles
- `src/App.jsx` - Main app with all editing handlers
- `src/components/Sidebar.jsx` - Updated with EntityForm integration
- `src/components/Toolbar.jsx` - Added new buttons for editing features
- `src/components/GraphContainer.jsx` - Added right-click context menu support

### Data Flow
```
User Action -> App Handler -> saveToHistory(kgData) -> modifyKgData() -> setUndoRedoState()
         -> parseKGToElements() -> update nodes/edges state -> GraphContainer re-renders
```

### Keyboard Shortcuts
| Shortcut | Action |
|----------|--------|
| Ctrl+N | New Entity |
| Ctrl+E | New Relationship |
| Ctrl+Z | Undo |
| Ctrl+Y / Ctrl+Shift+Z | Redo |
| Delete | Delete selected element |
| Escape | Close modals/menus |

## Testing Checklist
- [ ] Upload biopython_kg_subset.json
- [ ] Add new entity via modal
- [ ] Add relationship between existing nodes
- [ ] Edit entity properties in sidebar
- [ ] Delete node (verify edges removed)
- [ ] Delete edge only
- [ ] Undo/Redo operations
- [ ] Export/save JSON and verify format
- [ ] Keyboard shortcuts work
- [ ] Confirmation dialogs appear
- [ ] Right-click context menu positioning

## Performance Considerations
- Limited initial rendering to 5000 nodes for performance
- History stack capped at 50 states
- Modals prevent accidental data loss with cancel options
- Graph re-parsed after each edit (consider optimization for large graphs)

## Future Enhancements (P2/P3)
- Batch add/delete operations
- Drag-and-drop edge creation between nodes
- Auto-layout after edits
- Conflict resolution for duplicate IDs
- Import from external JSON files mid-session
- Export as image (PNG/SVG)
- RDF/Turtle format export
