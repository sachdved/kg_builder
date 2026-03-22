import React, { useState, useRef, useCallback, useEffect, useMemo } from 'react';

// Components
import GraphContainer from './components/GraphContainer';
import Sidebar from './components/Sidebar';
import SearchBar from './components/SearchBar';
import FilterPanel from './components/FilterPanel';
import Toolbar from './components/Toolbar';
import Legend from './components/Legend';
import ContextMenu from './components/ContextMenu';
import ConfirmationDialog from './components/ConfirmationDialog';
import NewNodeModal from './components/NewNodeModal';
import NewEdgeModal from './components/NewEdgeModal';
import FocusPanel from './components/FocusPanel';

// Utils
import { parseKGToElements, getKGStats } from './utils/kgParser';
import { entityColors, relationshipColors, nodeShapes } from './utils/styler';
import { resetStyling, applyLayout } from './utils/graphHelpers';
import { getFocusStats, getNodeNeighborsByDirection } from './utils/neighborTraversal';
import {
  createUndoRedoState,
  saveToHistory,
  undo as performUndo,
  redo as performRedo,
  canUndo,
  canRedo,
  cloneKGData
} from './utils/undoRedo';

const App = () => {
  // Data state
  const [kgData, setKgData] = useState(null);
  const [nodes, setNodes] = useState([]);
  const [edges, setEdges] = useState([]);
  const [totalNodesCount, setTotalNodesCount] = useState(0);
  const [stats, setStats] = useState({ totalEntities: 0, totalRelationships: 0 });

  // UI state
  const [selectedElement, setSelectedElement] = useState(null);
  const [highlightedNodes, setHighlightedNodes] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [currentLayout, setCurrentLayout] = useState('forceDirected');
  const [isLoading, setIsLoading] = useState(false);

  // Filter state - start with all entity types enabled
  const [selectedEntityTypes, setSelectedEntityTypes] = useState(
    new Set(['FILE', 'MODULE', 'CLASS', 'FUNCTION', 'CONSTANT', 'VARIABLE', 'IMPORT', 'DECORATOR'])
  );
  const [selectedRelationshipTypes, setSelectedRelationshipTypes] = useState(
    new Set(['CONTAINS', 'CALLS', 'INHERITS', 'IMPORTS', 'INSTANTIATES', 'DEFINES_IN'])
  );

  // Undo/Redo state
  const [undoRedoState, setUndoRedoState] = useState(() => createUndoRedoState());

  // Context menu state
  const [contextMenu, setContextMenu] = useState({
    visible: false,
    x: 0,
    y: 0,
    element: null
  });

  // Confirmation dialog state
  const [confirmationDialog, setConfirmationDialog] = useState({
    isOpen: false,
    title: '',
    message: '',
    onConfirm: null
  });

  // Modal states
  const [showNewNodeModal, setShowNewNodeModal] = useState(false);
  const [showNewEdgeModal, setShowNewEdgeModal] = useState(false);

  // Focus mode state
  const [focusMode, setFocusMode] = useState(false);
  const [focusedNodeId, setFocusedNodeId] = useState(null);
  const [focusDepth, setFocusDepth] = useState(1);
  const [focusDirection, setFocusDirection] = useState('both'); // 'both' | 'incoming' | 'outgoing'
  const focusedNodeNameRef = useRef('');

  // Cytoscape instance ref (accessible from GraphContainer via forwardRef if needed)
  const cyInstanceRef = useRef(null);

  // Initialize undo state when kgData changes
  useEffect(() => {
    if (kgData && !undoRedoState.current) {
      setUndoRedoState(createUndoRedoState(kgData));
    }
  }, [kgData]);

  // Handle file upload
  const handleFileUpload = useCallback((event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsLoading(true);
    setSelectedElement(null);
    setHighlightedNodes([]);

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const json = JSON.parse(e.target.result);
        setKgData(json);

        // Initialize undo/redo state with this data
        setUndoRedoState({
          history: [],
          future: [],
          current: cloneKGData(json)
        });

        // Parse into graph elements
        const { nodes: parsedNodes, edges: parsedEdges } = parseKGToElements(json);

        // Limit initial rendering for performance
        const maxNodes = 5000;
        const limitedNodes = parsedNodes.slice(0, maxNodes);
        const nodeIds = new Set(limitedNodes.map(n => n.data.id));

        // Only include edges where both endpoints are in the limited set
        const limitedEdges = parsedEdges.filter(
          e => nodeIds.has(e.data.source) && nodeIds.has(e.data.target)
        );

        setTotalNodesCount(parsedNodes.length); // Track total nodes for focus mode stats
        setNodes(limitedNodes);
        setTotalNodesCount(parsedNodes.length); // Track total before limiting
        setEdges(limitedEdges);
        setStats(getKGStats(json));

        // Show warning if data was truncated
        if (parsedNodes.length > maxNodes) {
          console.warn(`Limited to ${maxNodes} nodes for performance (${parsedNodes.length} total)`);
        }

        setIsLoading(false);
      } catch (error) {
        console.error('Error parsing JSON file:', error);
        alert('Error parsing JSON file. Please ensure it is valid KG format.');
        setIsLoading(false);
      }
    };
    reader.onerror = () => {
      console.error('Error reading file');
      alert('Error reading file');
      setIsLoading(false);
    };
    reader.readAsText(file);

    // Reset the input so the same file can be selected again
    event.target.value = '';
  }, []);

  // Handle element click
  const handleElementClick = useCallback((element) => {
    setSelectedElement(element);

    // Highlight neighbors on click
    if (cyInstanceRef.current && element.isNode()) {
      resetStyling(cyInstanceRef.current);
      cyInstanceRef.current.elements().unselect();
      element.select();

      const node = element;
      const neighbors = node.neighborhood();

      // Get node + neighbor IDs for highlighting
      const ids = [node.id(), ...neighbors.map(n => n.id())];
      setHighlightedNodes(ids);
    } else {
      setHighlightedNodes([]);
    }
  }, []);

  // Handle right-click for context menu
  const handleRightClick = useCallback((contextInfo) => {
    const { element, x, y } = contextInfo;

    // Calculate correct position relative to viewport
    setContextMenu({
      visible: true,
      x: x || (event ? event.clientX : 0),
      y: y || (event ? event.clientY : 0),
      element: element
    });
  }, []);

  const closeContextMenu = useCallback(() => {
    setContextMenu({ visible: false, x: 0, y: 0, element: null });
  }, []);

  // Handle context menu selection
  const handleContextMenuSelect = useCallback((action) => {
    if (action === 'delete' && contextMenu.element) {
      const element = contextMenu.element;
      const isNode = element.isNode();
      const id = element.id();
      const name = isNode ? (kgData?.entities[id]?.name || id) : id;

      // Ask for confirmation before deletion
      setConfirmationDialog({
        isOpen: true,
        title: `Delete ${isNode ? 'Entity' : 'Relationship'}`,
        message: `Are you sure you want to delete "${name}"?`,
        onConfirm: () => {
          handleDeleteElement(element);
        }
      });
    }
    closeContextMenu();
  }, [contextMenu, kgData]);

  // Handle deletion of element
  const handleDeleteElement = useCallback((element) => {
    if (!kgData) return;

    const isNode = element.isNode();
    const id = element.id();

    // Save to history before modification
    const newKgData = cloneKGData(kgData);

    if (isNode) {
      // Remove the node and all its connected edges
      delete newKgData.entities[id];

      // Remove edges involving this node
      newKgData.relationships = newKgData.relationships.filter(
        rel => rel.source_id !== id && rel.target_id !== id
      );
    } else {
      // Remove just the edge
      newKgData.relationships = newKgData.relationships.filter(rel => {
        const edgeId = `${rel.source_id}::${rel.target_id}::${rel.type}`;
        return edgeId !== id;
      });
    }

    // Update undo/redo state
    setUndoRedoState(prev => saveToHistory(prev, newKgData));
    setKgData(newKgData);

    // Re-parse the graph elements
    const { nodes: parsedNodes, edges: parsedEdges } = parseKGToElements(newKgData);

    // Apply filtering
    const limitedNodes = parsedNodes.filter(n => selectedEntityTypes.has(n.data.type));
    const nodeIds = new Set(limitedNodes.map(n => n.data.id));
    const limitedEdges = parsedEdges.filter(
      e => nodeIds.has(e.data.source) && nodeIds.has(e.data.target)
    );

    setNodes(limitedNodes);
    setEdges(limitedEdges);
    setStats(getKGStats(newKgData));

    // Deselect
    setSelectedElement(null);
    setHighlightedNodes([]);
  }, [kgData, selectedEntityTypes]);

  // Handle search results
  const handleSearchResults = useCallback((query) => {
    setSearchQuery(query);

    if (!kgData || !cyInstanceRef.current) return;

    if (!query.trim()) {
      setHighlightedNodes([]);
      resetStyling(cyInstanceRef.current);
      cyInstanceRef.current.elements().unselect();
      return;
    }

    // Find matching entities - simplified for now
    const results = [];
    const lowerQuery = query.toLowerCase();

    Object.entries(kgData.entities).forEach(([id, entity]) => {
      if (
        entity.name?.toLowerCase().includes(lowerQuery) ||
        entity.file_path?.toLowerCase().includes(lowerQuery)
      ) {
        results.push(id);
      }
    });

    setHighlightedNodes(results.slice(0, 50)); // Limit for performance
  }, [kgData]);

  // Handle entity selection from search
  const handleSelectEntity = useCallback((entityId) => {
    if (!cyInstanceRef.current) return;

    const cy = cyInstanceRef.current;
    const node = cy.$(`node[id="${entityId}"]`);

    if (node.length > 0) {
      resetStyling(cy);
      cy.elements().unselect();
      node.select();

      // Center view on selected node
      const bounds = node.boundingBox();
      cy.pan({
        render: true,
        duration: 300,
        level: cy.zoom(),
        x: bounds.x1 + bounds.width / 2,
        y: bounds.y1 + bounds.height / 2
      });

      setSelectedElement(node);

      // Highlight neighbors
      const neighbors = node.neighborhood();
      setHighlightedNodes([node.id(), ...neighbors.map(n => n.id())]);

      // Enter focus mode and get node name
      setFocusedNodeId(entityId);
      setFocusMode(true);
      const entityData = kgData?.entities?.[entityId];
      focusedNodeNameRef.current = entityData?.name || entityId;
    }
  }, [kgData]);

  // Handle entering focus mode for a specific entity
  const handleEnterFocusMode = useCallback((entityId) => {
    if (!cyInstanceRef.current) return;

    const cy = cyInstanceRef.current;
    const node = cy.$(`node[id="${entityId}"]`);

    if (node.length > 0) {
      setFocusedNodeId(entityId);
      setFocusMode(true);
      setFocusDepth(1); // Reset to default depth

      const entityData = kgData?.entities?.[entityId];
      focusedNodeNameRef.current = entityData?.name || entityId;

      // Highlight the focused node
      resetStyling(cy);
      cy.elements().unselect();
      node.select();
      setSelectedElement(node);

      // Fit view to focus area
      setTimeout(() => {
        cy.fit({
          padding: 50,
          duration: 300,
          ele: node
        });
      }, 100);
    }
  }, [kgData]);

  // Handle exiting focus mode
  const handleExitFocusMode = useCallback(() => {
    setFocusMode(false);
    setFocusedNodeId(null);
    setFocusDirection('both'); // Reset direction to default
    setHighlightedNodes([]);
    focusedNodeNameRef.current = '';

    if (cyInstanceRef.current) {
      resetStyling(cyInstanceRef.current);
      cyInstanceRef.current.elements().unselect();
      setSelectedElement(null);

      // Optionally zoom out to show full graph
      cyInstanceRef.current.fit({
        padding: 50,
        duration: 300
      });
    }
  }, []);

  // Toggle entity type filter
  const handleToggleEntityType = useCallback((type) => {
    setSelectedEntityTypes(prev => {
      const next = new Set(prev);
      if (next.has(type)) {
        next.delete(type);
      } else {
        next.add(type);
      }
      return next;
    });
  }, []);

  // Toggle relationship type filter (not fully implemented in MVP)
  const handleToggleRelationshipType = useCallback((type) => {
    setSelectedRelationshipTypes(prev => {
      const next = new Set(prev);
      if (next.has(type)) {
        next.delete(type);
      } else {
        next.add(type);
      }
      return next;
    });
  }, []);

  // Reset all filters
  const handleResetFilters = useCallback(() => {
    setSelectedEntityTypes(new Set([
      'FILE', 'MODULE', 'CLASS', 'FUNCTION', 'CONSTANT', 'VARIABLE', 'IMPORT', 'DECORATOR'
    ]));
    setSelectedRelationshipTypes(new Set([
      'CONTAINS', 'CALLS', 'INHERITS', 'IMPORTS', 'INSTANTIATES', 'DEFINES_IN'
    ]));
  }, []);

  // Layout change handler
  const handleLayoutChange = useCallback((layoutName) => {
    setCurrentLayout(layoutName);

    if (cyInstanceRef.current) {
      applyLayout(cyInstanceRef.current, layoutName);
    }
  }, []);

  // Zoom controls
  const handleZoomIn = useCallback(() => {
    cyInstanceRef.current?.zoom({
      render: true,
      duration: 200,
      level: cyInstanceRef.current.zoom() * 1.3
    });
  }, []);

  const handleZoomOut = useCallback(() => {
    cyInstanceRef.current?.zoom({
      render: true,
      duration: 200,
      level: cyInstanceRef.current.zoom() / 1.3
    });
  }, []);

  // Reset view
  const handleResetView = useCallback(() => {
    if (cyInstanceRef.current) {
      resetStyling(cyInstanceRef.current);
      cyInstanceRef.current.elements().unselect();
      setSelectedElement(null);
      setHighlightedNodes([]);
      setSearchQuery('');

      cyInstanceRef.current.zoom({
        render: true,
        duration: 300,
        level: 1
      });
      cyInstanceRef.current.pan({
        render: true,
        duration: 300,
        x: 0,
        y: 0
      });
    }
  }, []);

  // Fit to view
  const handleFitView = useCallback(() => {
    if (cyInstanceRef.current) {
      cyInstanceRef.current.fit({
        padding: 50,
        duration: 300
      });
    }
  }, []);

  // File input handler
  const handleFileInputChange = useCallback((e) => {
    handleFileUpload(e);
  }, [handleFileUpload]);

  // Generate a unique ID for new entities
  const generateUniqueId = useCallback(() => {
    const existingIds = kgData ? Object.keys(kgData.entities) : [];
    let id = 'new-entity';
    let counter = 1;
    while (existingIds.includes(id)) {
      id = `new-entity-${counter}`;
      counter++;
    }
    return id;
  }, [kgData]);

  // Handle adding new entity
  const handleAddEntity = useCallback((entityData) => {
    if (!kgData) {
      alert('Please load a knowledge graph file first.');
      return;
    }

    // Save to history before modification
    const newKgData = cloneKGData(kgData);

    // Add the new entity
    newKgData.entities[entityData.id] = {
      id: entityData.id,
      name: entityData.name,
      type: entityData.type,
      file_path: entityData.file_path,
      line_number: entityData.line_number || 0,
      properties: {}
    };

    // Update undo/redo state
    setUndoRedoState(prev => saveToHistory(prev, newKgData));
    setKgData(newKgData);

    // Re-parse the graph elements
    const { nodes: parsedNodes, edges: parsedEdges } = parseKGToElements(newKgData);

    // Apply filtering
    const limitedNodes = parsedNodes.filter(n => selectedEntityTypes.has(n.data.type));
    const nodeIds = new Set(limitedNodes.map(n => n.data.id));
    const limitedEdges = parsedEdges.filter(
      e => nodeIds.has(e.data.source) && nodeIds.has(e.data.target)
    );

    setNodes(limitedNodes);
    setEdges(limitedEdges);
    setStats(getKGStats(newKgData));

    // Focus on the new node
    const newNode = limitedNodes.find(n => n.data.id === entityData.id);
    if (newNode && cyInstanceRef.current) {
      setTimeout(() => {
        const cy = cyInstanceRef.current;
        const element = cy.$(`node[id="${entityData.id}"]`);
        if (element.length > 0) {
          resetStyling(cy);
          cy.elements().unselect();
          element.select();
          setSelectedElement(element);
          const bounds = element.boundingBox();
          cy.pan({
            render: true,
            duration: 300,
            level: cy.zoom(),
            x: bounds.x1 + bounds.width / 2,
            y: bounds.y1 + bounds.height / 2
          });
        }
      }, 100);
    }

    setShowNewNodeModal(false);
  }, [kgData, selectedEntityTypes]);

  // Handle adding new relationship
  const handleAddRelationship = useCallback((relData) => {
    if (!kgData) {
      alert('Please load a knowledge graph file first.');
      return;
    }

    // Check if both entities exist
    if (!kgData.entities[relData.source_id] || !kgData.entities[relData.target_id]) {
      alert('Source or target entity not found.');
      return;
    }

    // Save to history before modification
    const newKgData = cloneKGData(kgData);

    // Generate unique edge ID
    const edgeId = `${relData.source_id}::${relData.target_id}::${relData.type}`;

    // Add the new relationship
    newKgData.relationships.push({
      source_id: relData.source_id,
      target_id: relData.target_id,
      type: relData.type,
      line_number: relData.line_number || 0
    });

    // Update undo/redo state
    setUndoRedoState(prev => saveToHistory(prev, newKgData));
    setKgData(newKgData);

    // Re-parse the graph elements
    const { nodes: parsedNodes, edges: parsedEdges } = parseKGToElements(newKgData);

    // Apply filtering
    const limitedNodes = parsedNodes.filter(n => selectedEntityTypes.has(n.data.type));
    const nodeIds = new Set(limitedNodes.map(n => n.data.id));
    const limitedEdges = parsedEdges.filter(
      e => nodeIds.has(e.data.source) && nodeIds.has(e.data.target)
    );

    setNodes(limitedNodes);
    setEdges(limitedEdges);
    setStats(getKGStats(newKgData));

    setShowNewEdgeModal(false);
  }, [kgData, selectedEntityTypes]);

  // Handle updating entity
  const handleUpdateEntity = useCallback((updatedEntity) => {
    if (!kgData || !selectedElement) return;

    const entityId = selectedElement.id();

    // Save to history before modification
    const newKgData = cloneKGData(kgData);

    // Check if ID is changing - need to remove old and add new
    if (updatedEntity.id !== entityId) {
      // Remove old entity
      delete newKgData.entities[entityId];

      // Update relationships that reference this entity
      newKgData.relationships = newKgData.relationships.map(rel => {
        if (rel.source_id === entityId) {
          return { ...rel, source_id: updatedEntity.id };
        }
        if (rel.target_id === entityId) {
          return { ...rel, target_id: updatedEntity.id };
        }
        return rel;
      });

      // Add new entity with updated ID
      newKgData.entities[updatedEntity.id] = {
        ...updatedEntity,
        properties: updatedEntity.properties || {}
      };
    } else {
      // Just update the existing entity
      newKgData.entities[entityId] = {
        ...newKgData.entities[entityId],
        ...updatedEntity,
        id: entityId // Preserve original ID
      };
    }

    // Update undo/redo state
    setUndoRedoState(prev => saveToHistory(prev, newKgData));
    setKgData(newKgData);

    // Re-parse the graph elements
    const { nodes: parsedNodes, edges: parsedEdges } = parseKGToElements(newKgData);

    // Apply filtering
    const limitedNodes = parsedNodes.filter(n => selectedEntityTypes.has(n.data.type));
    const nodeIds = new Set(limitedNodes.map(n => n.data.id));
    const limitedEdges = parsedEdges.filter(
      e => nodeIds.has(e.data.source) && nodeIds.has(e.data.target)
    );

    setNodes(limitedNodes);
    setEdges(limitedEdges);
    setStats(getKGStats(newKgData));

    // Update selected element to reference new ID if it changed
    if (updatedEntity.id !== entityId && cyInstanceRef.current) {
      const cy = cyInstanceRef.current;
      const newNode = cy.$(`node[id="${updatedEntity.id}"]`);
      if (newNode.length > 0) {
        setSelectedElement(newNode[0]);
      } else {
        setSelectedElement(null);
      }
    }
  }, [kgData, selectedElement, selectedEntityTypes]);

  // Handle save/export JSON
  const handleSaveJson = useCallback(() => {
    if (!kgData) {
      alert('No knowledge graph loaded to save.');
      return;
    }

    // Generate timestamp for filename
    const now = new Date();
    const timestamp = now.toISOString().replace(/[:.]/g, '-').slice(0, -5);
    const filename = `kg_export_${timestamp}.json`;

    // Create JSON string with proper formatting
    const jsonString = JSON.stringify(kgData, null, 2);

    // Create blob and download link
    const blob = new Blob([jsonString], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    console.log(`Saved knowledge graph as ${filename}`);
  }, [kgData]);

  // Undo handler
  const handleUndo = useCallback(() => {
    if (!canUndo(undoRedoState)) return;

    const newState = performUndo(undoRedoState);
    setUndoRedoState(newState);
    setKgData(newState.current);

    // Re-parse graph elements
    if (newState.current) {
      const { nodes: parsedNodes, edges: parsedEdges } = parseKGToElements(newState.current);
      const limitedNodes = parsedNodes.filter(n => selectedEntityTypes.has(n.data.type));
      const nodeIds = new Set(limitedNodes.map(n => n.data.id));
      const limitedEdges = parsedEdges.filter(
        e => nodeIds.has(e.data.source) && nodeIds.has(e.data.target)
      );

      setNodes(limitedNodes);
      setEdges(limitedEdges);
      setStats(getKGStats(newState.current));
      setSelectedElement(null);
      setHighlightedNodes([]);
    } else {
      // Clear the graph
      setNodes([]);
      setEdges([]);
      setStats({ totalEntities: 0, totalRelationships: 0 });
      setSelectedElement(null);
      setHighlightedNodes([]);
    }
  }, [undoRedoState, selectedEntityTypes]);

  // Redo handler
  const handleRedo = useCallback(() => {
    if (!canRedo(undoRedoState)) return;

    const newState = performRedo(undoRedoState);
    setUndoRedoState(newState);
    setKgData(newState.current);

    // Re-parse graph elements
    if (newState.current) {
      const { nodes: parsedNodes, edges: parsedEdges } = parseKGToElements(newState.current);
      const limitedNodes = parsedNodes.filter(n => selectedEntityTypes.has(n.data.type));
      const nodeIds = new Set(limitedNodes.map(n => n.data.id));
      const limitedEdges = parsedEdges.filter(
        e => nodeIds.has(e.data.source) && nodeIds.has(e.data.target)
      );

      setNodes(limitedNodes);
      setEdges(limitedEdges);
      setStats(getKGStats(newState.current));
    } else {
      // Clear the graph
      setNodes([]);
      setEdges([]);
      setStats({ totalEntities: 0, totalRelationships: 0 });
    }
  }, [undoRedoState, selectedEntityTypes]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e) => {
      // Only trigger if not in an input field
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') {
        return;
      }

      // Ctrl+Z or Cmd+Z for undo
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        handleUndo();
      }

      // Ctrl+Y or Cmd+Y for redo, or Ctrl+Shift+Z
      if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) {
        e.preventDefault();
        handleRedo();
      }

      // Ctrl+N for new entity
      if ((e.ctrlKey || e.metaKey) && e.key === 'n') {
        e.preventDefault();
        setShowNewNodeModal(true);
      }

      // Ctrl+E for new edge
      if ((e.ctrlKey || e.metaKey) && e.key === 'e') {
        e.preventDefault();
        setShowNewEdgeModal(true);
      }

      // Delete key for selected element
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selectedElement) {
          const isNode = selectedElement.isNode();
          const id = selectedElement.id();
          const name = isNode ? (kgData?.entities[id]?.name || id) : id;

          setConfirmationDialog({
            isOpen: true,
            title: `Delete ${isNode ? 'Entity' : 'Relationship'}`,
            message: `Are you sure you want to delete "${name}"?`,
            onConfirm: () => {
              handleDeleteElement(selectedElement);
            }
          });
        }
      }

      // Escape key to close context menu and modals
      if (e.key === 'Escape') {
        setContextMenu({ visible: false, x: 0, y: 0, element: null });
        setShowNewNodeModal(false);
        setShowNewEdgeModal(false);

        // Exit focus mode on escape
        if (focusMode) {
          handleExitFocusMode();
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleUndo, handleRedo, selectedElement, kgData, focusMode, handleExitFocusMode]);

  // Expose cy instance for use in event handlers
  useEffect(() => {
    if (cyInstanceRef.current?.current) {
      cyInstanceRef.current.cy = cyInstanceRef.current.current;
    }
  });

  // Calculate visible node and edge count based on focus mode
  const visibleCountInfo = useMemo(() => {
    if (!focusMode || !focusedNodeId || nodes.length === 0) {
      return {
        visibleNodes: nodes.length,
        visibleEdges: edges.length,
        totalNodes: totalNodesCount,
        totalEdges: edges.length,
        indegree: 0,
        outdegree: 0,
        incomingNeighborCount: 0,
        outgoingNeighborCount: 0
      };
    }

    const stats = getFocusStats(nodes, edges, focusedNodeId, focusDepth, focusDirection);

    // Get direct neighbor counts for the focused node (1-hop)
    const neighbors = getNodeNeighborsByDirection(nodes, edges, focusedNodeId);
    const indegree = neighbors.incoming.length;
    const outdegree = neighbors.outgoing.length;

    // Count how many of those are visible based on direction filter
    let incomingNeighborCount = 0;
    let outgoingNeighborCount = 0;

    if (focusDirection === 'both' || focusDirection === 'incoming') {
      incomingNeighborCount = indegree;
    }
    if (focusDirection === 'both' || focusDirection === 'outgoing') {
      outgoingNeighborCount = outdegree;
    }

    return {
      visibleNodes: stats.visibleNodes,
      visibleEdges: stats.visibleEdges,
      totalNodes: stats.totalNodes,
      totalEdges: stats.totalEdges,
      indegree,
      outdegree,
      incomingNeighborCount,
      outgoingNeighborCount
    };
  }, [focusMode, focusedNodeId, focusDepth, focusDirection, nodes, edges, totalNodesCount]);

  return (
    <div className="app-container">
      {/* Header */}
      <header className="app-header">
        <h1>Knowledge Graph Visualizer</h1>
        <SearchBar
          kgData={kgData}
          onSearch={handleSearchResults}
          onSelectEntity={handleSelectEntity}
          onClose={handleResetView}
        />
      </header>

      {/* Toolbar */}
      <Toolbar
        nodeCount={visibleCountInfo.visibleNodes}
        edgeCount={visibleCountInfo.visibleEdges}
        onZoomIn={handleZoomIn}
        onZoomOut={handleZoomOut}
        onResetView={handleResetView}
        onFitView={handleFitView}
        onLayoutChange={handleLayoutChange}
        currentLayout={currentLayout}
        onFileUploadClick={() => document.getElementById('file-input').click()}
        onSaveJson={handleSaveJson}
        canUndo={canUndo(undoRedoState)}
        canRedo={canRedo(undoRedoState)}
        onUndo={handleUndo}
        onRedo={handleRedo}
        onAddEntityClick={() => setShowNewNodeModal(true)}
        onAddRelationshipClick={() => setShowNewEdgeModal(true)}
      />

      <input
        id="file-input"
        type="file"
        className="file-input"
        accept=".json,application/json"
        onChange={handleFileInputChange}
      />

      {/* Main Content */}
      <main className="app-content">
        {/* Sidebar with Filters and Details */}
        <SidebarWrapper>
          <FilterPanel
            kgStats={stats}
            selectedEntityTypes={selectedEntityTypes}
            selectedRelationshipTypes={selectedRelationshipTypes}
            onToggleEntityType={handleToggleEntityType}
            onToggleRelationshipType={handleToggleRelationshipType}
            onResetFilters={handleResetFilters}
          />
        </SidebarWrapper>

        {/* Graph Visualization */}
        <GraphContainer
          nodes={nodes}
          edges={edges}
          selectedElement={selectedElement}
          highlightedNodes={highlightedNodes}
          filteredTypes={selectedEntityTypes}
          searchTerm={searchQuery}
          onElementClick={handleElementClick}
          onRightClick={handleRightClick}
          layout={currentLayout}
          isLoading={isLoading}
          focusMode={focusMode}
          focusedNodeId={focusedNodeId}
          focusDepth={focusDepth}
          focusDirection={focusDirection}
        />

        {/* Details Sidebar */}
        {selectedElement && (
          <DetailsSidebar
            selectedElement={selectedElement}
            kgData={kgData}
            onClose={() => setSelectedElement(null)}
            onUpdateEntity={handleUpdateEntity}
          />
        )}

        {/* Legend */}
        <Legend visible={true} />

        {/* Context Menu */}
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          visible={contextMenu.visible}
          onSelect={handleContextMenuSelect}
          onClose={closeContextMenu}
        />

        {/* Confirmation Dialog */}
        <ConfirmationDialog
          isOpen={confirmationDialog.isOpen}
          title={confirmationDialog.title}
          message={confirmationDialog.message}
          onConfirm={confirmationDialog.onConfirm}
          onClose={() => setConfirmationDialog({ isOpen: false, title: '', message: '', onConfirm: null })}
        />

        {/* New Node Modal */}
        <NewNodeModal
          isOpen={showNewNodeModal}
          onClose={() => setShowNewNodeModal(false)}
          onAdd={handleAddEntity}
        />

        {/* New Edge Modal */}
        <NewEdgeModal
          isOpen={showNewEdgeModal}
          onClose={() => setShowNewEdgeModal(false)}
          onAdd={handleAddRelationship}
          entities={kgData?.entities || {}}
        />

        {/* Focus Panel - shows when in focus mode */}
        <FocusPanel
          focusMode={focusMode}
          focusedNodeId={focusedNodeId}
          focusedNodeName={focusedNodeNameRef.current}
          focusDepth={focusDepth}
          setFocusDepth={setFocusDepth}
          focusDirection={focusDirection}
          setFocusDirection={setFocusDirection}
          visibleNodesCount={visibleCountInfo.visibleNodes}
          totalNodesCount={visibleCountInfo.totalNodes}
          indegree={visibleCountInfo.indegree}
          outdegree={visibleCountInfo.outdegree}
          incomingNeighborCount={visibleCountInfo.incomingNeighborCount}
          outgoingNeighborCount={visibleCountInfo.outgoingNeighborCount}
          onExit={handleExitFocusMode}
        />
      </main>
    </div>
  );
};

// Wrapper to combine filters and enable/disable sidebar
const SidebarWrapper = ({ children }) => {
  return (
    <div className="sidebar" style={{ maxWidth: '300px', width: '300px' }}>
      {children}
    </div>
  );
};

// Separate component for details to enable conditional rendering
const DetailsSidebar = ({ selectedElement, kgData, onClose, onUpdateEntity }) => {
  return (
    <aside className="sidebar">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 16px' }}>
        <h2 style={{ fontSize: '1rem', margin: 0 }}>Details</h2>
        <button
          className="btn btn-icon"
          onClick={onClose}
          style={{ width: '24px', height: '24px', padding: 0 }}
        >
          &times;
        </button>
      </div>

      {selectedElement.isNode() ? (
        <Sidebar
          selectedElement={selectedElement}
          kgData={kgData}
          onClose={() => onClose()}
          onUpdateEntity={onUpdateEntity}
        />
      ) : (
        <EdgeDetails edgeData={selectedElement.data()} kgData={kgData} />
      )}
    </aside>
  );
};

const EdgeDetails = ({ edgeData, kgData }) => {
  if (!edgeData) return null;

  const sourceEntity = kgData?.entities?.[edgeData.source];
  const targetEntity = kgData?.entities?.[edgeData.target];

  return (
    <div className="sidebar-content">
      <span
        style={{
          display: 'inline-block',
          padding: '2px 8px',
          fontSize: '0.7rem',
          fontWeight: 600,
          borderRadius: '4px',
          backgroundColor: relationshipColors[edgeData.rel] || '#999',
          color: '#fff'
        }}
      >
        {edgeData.rel}
      </span>

      <div style={{ marginTop: '16px' }}>
        <p style={{ fontSize: '0.8rem', color: '#666' }}>From:</p>
        <p style={{ fontWeight: 500, marginBottom: '12px' }}>{escapeHtml(sourceEntity?.name || edgeData.source)}</p>

        <p style={{ fontSize: '0.8rem', color: '#666' }}>To:</p>
        <p style={{ fontWeight: 500 }}>{escapeHtml(targetEntity?.name || edgeData.target)}</p>

        {edgeData.lineNumber && (
          <p style={{ marginTop: '12px', fontSize: '0.85rem', color: '#666' }}>
            Line: {edgeData.lineNumber}
          </p>
        )}
      </div>
    </div>
  );
};

const escapeHtml = (text) => {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
};

export default App;
