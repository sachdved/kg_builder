# Editing Patterns for Knowledge Graph Visualizer

## Entity Editing Flow

### Adding an Entity
```javascript
const handleAddEntity = (entityData) => {
  // 1. Clone current data to history
  const newKgData = cloneKGData(kgData);

  // 2. Add entity with required fields
  newKgData.entities[entityData.id] = {
    id: entityData.id,
    name: entityData.name,
    type: entityData.type,
    file_path: entityData.file_path,
    line_number: entityData.line_number || 0,
    properties: {}
  };

  // 3. Update undo/redo state
  setUndoRedoState(prev => saveToHistory(prev, newKgData));
  setKgData(newKgData);

  // 4. Re-parse to Cytoscape elements
  const { nodes, edges } = parseKGToElements(newKgData);
  setNodes(nodes.filter(n => selectedEntityTypes.has(n.data.type)));
  setEdges(edges);

  // 5. Focus on new node
  setTimeout(() => focusOnNode(cy, entityData.id), 100);
};
```

### Updating an Entity
```javascript
const handleUpdateEntity = (updatedEntity) => {
  const entityId = selectedElement.id();
  const newKgData = cloneKGData(kgData);

  // Handle ID change (need to update relationships too)
  if (updatedEntity.id !== entityId) {
    delete newKgData.entities[entityId];
    newKgData.relationships = newKgData.relationships.map(rel => ({
      ...rel,
      source_id: rel.source_id === entityId ? updatedEntity.id : rel.source_id,
      target_id: rel.target_id === entityId ? updatedEntity.id : rel.target_id
    }));
    newKgData.entities[updatedEntity.id] = { ...updatedEntity };
  } else {
    // Simple update
    newKgData.entities[entityId] = { ...newKgData.entities[entityId], ...updatedEntity };
  }

  saveToHistory(undoRedoState, newKgData);
  setKgData(newKgData);
  // Re-parse...
};
```

### Deleting a Node
```javascript
const handleDeleteNode = (nodeId) => {
  const newKgData = cloneKGData(kgData);

  // Remove the node
  delete newKgData.entities[nodeId];

  // Remove all connected edges
  newKgData.relationships = newKgData.relationships.filter(
    rel => rel.source_id !== nodeId && rel.target_id !== nodeId
  );

  saveToHistory(undoRedoState, newKgData);
  setKgData(newKgData);
  // Re-parse...
};
```

## Validation Rules

### Required Fields for Entities
- `id` - Unique identifier (string)
- `name` - Display name (string)
- `type` - Must be one of: FILE, MODULE, CLASS, FUNCTION, CONSTANT, VARIABLE, IMPORT, DECORATOR
- `file_path` - Source file path (string)

### Required Fields for Relationships
- `source_id` - Must exist in entities
- `target_id` - Must exist in entities and not equal to source_id
- `type` - One of: CONTAINS, CALLS, INHERITS, IMPORTS, INSTANTIATES, DEFINES_IN

## Edge ID Convention
Edge IDs are generated as: `${source_id}::${target_id}::${rel_type}`

This ensures uniqueness for edges between same nodes with different relationship types.

## Filter Integration Pattern
```javascript
// Always filter nodes by selectedEntityTypes after any edit
const filteredNodes = parsedNodes.filter(n => selectedEntityTypes.has(n.data.type));
const nodeIds = new Set(filteredNodes.map(n => n.data.id));
const filteredEdges = parsedEdges.filter(
  e => nodeIds.has(e.data.source) && nodeIds.has(e.data.target)
);
```

## Cytoscape.js Integration Notes

### Right-Click for Context Menu
```javascript
cy.on('cxttap', (evt) => {
  evt.preventDefault();
  const target = evt.target;
  if (target.isNode() || target.isEdge()) {
    const renderedPos = target.renderedPosition();
    // Convert to screen coordinates for menu positioning
    onRightClick({ element: target, x: ..., y: ... });
  }
});
```

### Styling Updates After Selection
```javascript
// Reset all styling before highlighting
resetStyling(cy);
cy.elements().unselect();

// Select and highlight node + neighbors
node.select();
node.neighborhood().forEach(n => n.addClass('highlighted'));
```
