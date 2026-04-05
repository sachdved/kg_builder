import React, { useState, useRef, useCallback, useEffect, useMemo } from 'react';

// Components
import GraphContainer from './components/GraphContainer';
import SearchBar from './components/SearchBar';
import FilterPanel from './components/FilterPanel';
import Toolbar from './components/Toolbar';
import Legend from './components/Legend';
import ContextMenu from './components/ContextMenu';
import ConfirmationDialog from './components/ConfirmationDialog';
import NewNodeModal from './components/NewNodeModal';
import NewEdgeModal from './components/NewEdgeModal';
import DiffPanel from './components/DiffPanel';
import DiffSummary from './components/DiffSummary';

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
import { diffKnowledgeGraphs, classifyElements, hasDiffChanges } from './utils/kgDiff';

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

  // Diff mode state
  const [baseKgData, setBaseKgData] = useState(null);
  const [showDiffPanel, setShowDiffPanel] = useState(false);
  const [showDiffColors, setShowDiffColors] = useState(true);

  // Focus mode state
  const [focusMode, setFocusMode] = useState(false);
  const [focusedNodeId, setFocusedNodeId] = useState(null);
  const [focusDepth, setFocusDepth] = useState(1);
  const [focusDirection, setFocusDirection] = useState('both'); // 'both' | 'incoming' | 'outgoing'
  const focusedNodeNameRef = useRef('');

  // Cytoscape instance ref (populated via onCyInit callback from GraphContainer)
  const cyInstanceRef = useRef(null);

  // Callback to receive the Cytoscape instance from GraphContainer
  const handleCyInit = useCallback((cy) => {
    cyInstanceRef.current = cy;
  }, []);

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

        // Snapshot as base KG for diff mode
        setBaseKgData(cloneKGData(json));

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

        setTotalNodesCount(parsedNodes.length); // Track total before limiting
        setNodes(limitedNodes);
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

  // Diff computation (recomputed whenever kgData or baseKgData change)
  const diffResult = useMemo(() => {
    if (!baseKgData || !kgData) return null;
    return diffKnowledgeGraphs(baseKgData, kgData);
  }, [baseKgData, kgData]);

  const diffClassification = useMemo(() => {
    if (!diffResult || !hasDiffChanges(diffResult)) return null;
    return classifyElements(diffResult);
  }, [diffResult]);

  // Apply diff_status data to nodes and edges for Cytoscape styling
  const diffAwareNodes = useMemo(() => {
    if (!showDiffColors || !diffClassification) return nodes;

    const { addedIds, removedIds, modifiedIds } = diffClassification;

    // Existing nodes get diff_status
    const annotated = nodes.map(n => {
      const id = n.data.id;
      let diffStatus = null;
      if (addedIds.has(id)) diffStatus = 'added';
      else if (modifiedIds.has(id)) diffStatus = 'modified';

      if (diffStatus) {
        return { ...n, data: { ...n.data, diff_status: diffStatus } };
      }
      return n;
    });

    // Add ghost nodes for removed entities
    if (baseKgData) {
      for (const eid of removedIds) {
        const entity = baseKgData.entities[eid];
        if (entity) {
          annotated.push({
            data: {
              id: eid,
              name: entity.name,
              type: entity.type,
              filePath: entity.file_path,
              lineNumber: entity.line_number,
              diff_status: 'removed',
            }
          });
        }
      }
    }

    return annotated;
  }, [nodes, showDiffColors, diffClassification, baseKgData]);

  const diffAwareEdges = useMemo(() => {
    if (!showDiffColors || !diffClassification) return edges;

    const { addedEdgeKeys, removedEdgeKeys } = diffClassification;

    const annotated = edges.map(e => {
      const key = e.data.id;
      let diffStatus = null;
      if (addedEdgeKeys.has(key)) diffStatus = 'added';

      if (diffStatus) {
        return { ...e, data: { ...e.data, diff_status: diffStatus } };
      }
      return e;
    });

    // Add ghost edges for removed relationships
    if (baseKgData) {
      for (const key of removedEdgeKeys) {
        const [source, target, type] = key.split('::');
        annotated.push({
          data: {
            id: key,
            source,
            target,
            rel: type,
            diff_status: 'removed',
          }
        });
      }
    }

    return annotated;
  }, [edges, showDiffColors, diffClassification, baseKgData]);

  // Load an agent proposal as the new kgData (base stays the same)
  const handleLoadProposal = useCallback((proposalKg) => {
    setKgData(proposalKg);

    // Initialize undo/redo from proposal
    setUndoRedoState({
      history: [],
      future: [],
      current: cloneKGData(proposalKg)
    });

    // Re-parse
    const { nodes: parsedNodes, edges: parsedEdges } = parseKGToElements(proposalKg);
    const limitedNodes = parsedNodes.filter(n => selectedEntityTypes.has(n.data.type));
    const nodeIds = new Set(limitedNodes.map(n => n.data.id));
    const limitedEdges = parsedEdges.filter(
      e => nodeIds.has(e.data.source) && nodeIds.has(e.data.target)
    );

    setTotalNodesCount(parsedNodes.length);
    setNodes(limitedNodes);
    setEdges(limitedEdges);
    setStats(getKGStats(proposalKg));
    setSelectedElement(null);
    setHighlightedNodes([]);
    setShowDiffColors(true);
  }, [selectedEntityTypes]);

  // Export change spec as JSON download
  const handleExportChangeSpec = useCallback(() => {
    if (!diffResult || !hasDiffChanges(diffResult)) {
      alert('No changes to export.');
      return;
    }

    const jsonString = JSON.stringify(diffResult, null, 2);
    const blob = new Blob([jsonString], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const now = new Date();
    const timestamp = now.toISOString().replace(/[:.]/g, '-').slice(0, -5);
    a.href = url;
    a.download = `change_spec_${timestamp}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [diffResult]);

  // Reset current KG back to base
  const handleResetToBase = useCallback(() => {
    if (!baseKgData) return;

    const restored = cloneKGData(baseKgData);
    setKgData(restored);
    setUndoRedoState({
      history: [],
      future: [],
      current: cloneKGData(restored)
    });

    const { nodes: parsedNodes, edges: parsedEdges } = parseKGToElements(restored);
    const limitedNodes = parsedNodes.filter(n => selectedEntityTypes.has(n.data.type));
    const nodeIds = new Set(limitedNodes.map(n => n.data.id));
    const limitedEdges = parsedEdges.filter(
      e => nodeIds.has(e.data.source) && nodeIds.has(e.data.target)
    );

    setTotalNodesCount(parsedNodes.length);
    setNodes(limitedNodes);
    setEdges(limitedEdges);
    setStats(getKGStats(restored));
    setSelectedElement(null);
    setHighlightedNodes([]);
  }, [baseKgData, selectedEntityTypes]);

  // Handle element click — enter focus mode for nodes
  const handleElementClick = useCallback((element) => {
    setSelectedElement(element);

    if (element.isNode()) {
      const entityId = element.id();
      setFocusedNodeId(entityId);
      setFocusMode(true);

      const entityData = kgData?.entities?.[entityId];
      focusedNodeNameRef.current = entityData?.name || entityId;

      if (cyInstanceRef.current) {
        resetStyling(cyInstanceRef.current);
        cyInstanceRef.current.elements().unselect();
        element.select();
      }
    } else {
      setHighlightedNodes([]);
    }
  }, [kgData]);

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

  // Handle entity selection from search — enters focus mode
  const handleSelectEntity = useCallback((entityId) => {
    if (!cyInstanceRef.current) return;

    const cy = cyInstanceRef.current;
    const node = cy.$(`node[id="${entityId}"]`);

    if (node.length > 0) {
      resetStyling(cy);
      cy.elements().unselect();
      node.select();

      setSelectedElement(node);
      setFocusedNodeId(entityId);
      setFocusMode(true);

      const entityData = kgData?.entities?.[entityId];
      focusedNodeNameRef.current = entityData?.name || entityId;
    }
  }, [kgData]);

  // Handle exiting focus mode
  const handleExitFocusMode = useCallback(() => {
    setFocusMode(false);
    setFocusedNodeId(null);
    setFocusDepth(1);
    setFocusDirection('both');
    setHighlightedNodes([]);
    setSelectedElement(null);
    focusedNodeNameRef.current = '';

    if (cyInstanceRef.current) {
      resetStyling(cyInstanceRef.current);
      cyInstanceRef.current.elements().unselect();

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

    // Also exit focus mode to restore the full graph
    setFocusMode(false);
    setFocusedNodeId(null);
    setFocusDepth(1);
    setFocusDirection('both');
    setSelectedElement(null);
    setHighlightedNodes([]);
    focusedNodeNameRef.current = '';

    if (cyInstanceRef.current) {
      resetStyling(cyInstanceRef.current);
      cyInstanceRef.current.elements().unselect();
      cyInstanceRef.current.fit({ padding: 50, duration: 300 });
    }
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
    // Exit focus mode
    setFocusMode(false);
    setFocusedNodeId(null);
    setFocusDepth(1);
    setFocusDirection('both');
    setSelectedElement(null);
    setHighlightedNodes([]);
    setSearchQuery('');
    focusedNodeNameRef.current = '';

    if (cyInstanceRef.current) {
      resetStyling(cyInstanceRef.current);
      cyInstanceRef.current.elements().unselect();

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
        onDiffClick={() => setShowDiffPanel(prev => !prev)}
        diffActive={showDiffPanel}
        diffSummaryComponent={
          <DiffSummary
            diffResult={diffResult}
            visible={showDiffColors && hasDiffChanges(diffResult)}
          />
        }
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
        {/* Left Sidebar: Filters */}
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
          nodes={diffAwareNodes}
          edges={diffAwareEdges}
          selectedElement={selectedElement}
          highlightedNodes={highlightedNodes}
          filteredTypes={selectedEntityTypes}
          searchTerm={searchQuery}
          onElementClick={handleElementClick}
          onCyInit={handleCyInit}
          onBackgroundClick={handleExitFocusMode}
          onRightClick={handleRightClick}
          layout={currentLayout}
          isLoading={isLoading}
          focusMode={focusMode}
          focusedNodeId={focusedNodeId}
          focusDepth={focusDepth}
          focusDirection={focusDirection}
        />

        {/* Right Sidebar: unified details + focus controls */}
        {focusMode && selectedElement && selectedElement.isNode && selectedElement.isNode() && (
          <DetailFocusSidebar
            selectedElement={selectedElement}
            kgData={kgData}
            focusDepth={focusDepth}
            setFocusDepth={setFocusDepth}
            focusDirection={focusDirection}
            setFocusDirection={setFocusDirection}
            visibleCountInfo={visibleCountInfo}
            onClose={handleExitFocusMode}
            onUpdateEntity={handleUpdateEntity}
          />
        )}

        {/* Legend */}
        <Legend visible={true} />

        {/* Diff Panel */}
        <DiffPanel
          isOpen={showDiffPanel}
          onClose={() => setShowDiffPanel(false)}
          diffResult={diffResult}
          showDiffColors={showDiffColors}
          onToggleDiffColors={() => setShowDiffColors(prev => !prev)}
          onLoadProposal={handleLoadProposal}
          onExportChangeSpec={handleExportChangeSpec}
          onResetToBase={handleResetToBase}
          hasBaseKg={!!baseKgData}
        />

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

// Unified right sidebar: entity details + focus/neighbor controls
const DetailFocusSidebar = ({
  selectedElement,
  kgData,
  focusDepth,
  setFocusDepth,
  focusDirection,
  setFocusDirection,
  visibleCountInfo,
  onClose,
  onUpdateEntity,
}) => {
  const entityId = selectedElement.id();
  const entityData = kgData?.entities?.[entityId];

  if (!entityData) return null;

  const connections = getConnections(entityId, kgData);

  return (
    <aside className="sidebar" style={{ borderLeft: '1px solid var(--border-color)', borderRight: 'none' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 16px', borderBottom: '1px solid var(--border-color)' }}>
        <h2 style={{ fontSize: '1rem', margin: 0 }}>Entity Details</h2>
        <button
          className="btn btn-icon"
          onClick={onClose}
          style={{ width: '24px', height: '24px', padding: 0 }}
          title="Close and show full graph"
        >
          &times;
        </button>
      </div>

      <div className="sidebar-content">
        {/* Entity info */}
        <div className="entity-detail">
          <div className="entity-detail-header">
            <span
              className="entity-type-badge"
              style={{ backgroundColor: entityColors[entityData.type] }}
            >
              {entityData.type}
            </span>
            <span className="entity-name">{escapeHtml(entityData.name)}</span>
          </div>

          <p className="entity-file-path">
            {entityData.file_path}
            {entityData.line_number ? `:L${entityData.line_number}` : ''}
          </p>

          {entityData.properties?.description && (
            <div className="entity-docstring">
              {escapeHtml(entityData.properties.description)}
            </div>
          )}
        </div>

        {/* Neighbor depth control */}
        <div style={{ marginBottom: '16px', padding: '12px', backgroundColor: '#f0f7ff', borderRadius: '6px' }}>
          <label htmlFor="focus-depth" style={{ fontSize: '0.8rem', fontWeight: 600, color: '#333', display: 'block', marginBottom: '6px' }}>
            Neighbor Depth (k hops):
          </label>
          <select
            id="focus-depth"
            value={focusDepth}
            onChange={(e) => setFocusDepth(parseInt(e.target.value, 10))}
            style={{
              width: '100%',
              padding: '6px 8px',
              borderRadius: '4px',
              border: '1px solid #ccc',
              fontSize: '0.85rem'
            }}
          >
            <option value={1}>1 hop (direct neighbors)</option>
            <option value={2}>2 hops</option>
            <option value={3}>3 hops</option>
            <option value={4}>4 hops</option>
            <option value={5}>5 hops</option>
          </select>

          <label htmlFor="focus-direction" style={{ fontSize: '0.8rem', fontWeight: 600, color: '#333', display: 'block', marginTop: '10px', marginBottom: '6px' }}>
            Direction:
          </label>
          <select
            id="focus-direction"
            value={focusDirection}
            onChange={(e) => setFocusDirection(e.target.value)}
            style={{
              width: '100%',
              padding: '6px 8px',
              borderRadius: '4px',
              border: '1px solid #ccc',
              fontSize: '0.85rem'
            }}
          >
            <option value="both">Both Directions</option>
            <option value="incoming">Incoming Only (Dependents)</option>
            <option value="outgoing">Outgoing Only (Dependencies)</option>
          </select>

          <p style={{ fontSize: '0.75rem', color: '#666', marginTop: '8px' }}>
            Showing {visibleCountInfo.visibleNodes} of {visibleCountInfo.totalNodes} nodes
          </p>
        </div>

        {/* Degree stats */}
        <div style={{ display: 'flex', gap: '12px', marginBottom: '16px' }}>
          <div style={{ flex: 1, padding: '8px', backgroundColor: '#e8f5e9', borderRadius: '4px', textAlign: 'center' }}>
            <p style={{ fontSize: '0.7rem', color: '#2e7d32', margin: 0 }}>Incoming</p>
            <p style={{ fontSize: '1.1rem', fontWeight: 600, color: '#1b5e20', margin: 0 }}>{visibleCountInfo.indegree}</p>
          </div>
          <div style={{ flex: 1, padding: '8px', backgroundColor: '#fff3e0', borderRadius: '4px', textAlign: 'center' }}>
            <p style={{ fontSize: '0.7rem', color: '#ef6c00', margin: 0 }}>Outgoing</p>
            <p style={{ fontSize: '1.1rem', fontWeight: 600, color: '#e65100', margin: 0 }}>{visibleCountInfo.outdegree}</p>
          </div>
        </div>

        {/* Incoming relationships */}
        {connections.incoming > 0 && (
          <div className="connection-group">
            <div className="connection-header">Incoming Relationships</div>
            <ul className="connection-list">
              {connections.incomingList.slice(0, 10).map((conn, idx) => (
                <li key={idx} className="connection-item">
                  <span style={{ color: entityColors[conn.type] || '#666' }}>
                    {conn.type}: {escapeHtml(conn.source)}
                  </span>
                </li>
              ))}
              {connections.incomingList.length > 10 && (
                <li className="connection-item">... and {connections.incomingList.length - 10} more</li>
              )}
            </ul>
          </div>
        )}

        {/* Outgoing relationships */}
        {connections.outgoing > 0 && (
          <div className="connection-group">
            <div className="connection-header">Outgoing Relationships</div>
            <ul className="connection-list">
              {connections.outgoingList.slice(0, 10).map((conn, idx) => (
                <li key={idx} className="connection-item">
                  <span style={{ color: entityColors[conn.type] || '#666' }}>
                    {conn.type}: {escapeHtml(conn.target)}
                  </span>
                </li>
              ))}
              {connections.outgoingList.length > 10 && (
                <li className="connection-item">... and {connections.outgoingList.length - 10} more</li>
              )}
            </ul>
          </div>
        )}

        {/* Properties */}
        {Object.keys(entityData.properties || {}).length > 0 && (
          <div className="connection-group">
            <div className="connection-header">Properties</div>
            <ul className="connection-list" style={{ maxHeight: '200px' }}>
              {Object.entries(entityData.properties).map(([key, value]) => (
                <li key={key} className="connection-item">
                  <strong>{escapeHtml(key)}:</strong>{' '}
                  {typeof value === 'string' ? escapeHtml(value) : JSON.stringify(value)}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </aside>
  );
};

const getConnections = (entityId, kgData) => {
  if (!kgData?.relationships) {
    return { incoming: 0, outgoing: 0, incomingList: [], outgoingList: [] };
  }

  const incoming = [];
  const outgoing = [];

  kgData.relationships.forEach(rel => {
    if (rel.target_id === entityId) {
      const sourceEntity = kgData.entities[rel.source_id];
      incoming.push({ type: rel.type, source: sourceEntity?.name || rel.source_id });
    }
    if (rel.source_id === entityId) {
      const targetEntity = kgData.entities[rel.target_id];
      outgoing.push({ type: rel.type, target: targetEntity?.name || rel.target_id });
    }
  });

  return { incoming: incoming.length, outgoing: outgoing.length, incomingList: incoming, outgoingList: outgoing };
};

const escapeHtml = (text) => {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
};

export default App;
