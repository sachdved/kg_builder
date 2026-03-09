import React, { useEffect, useRef, useMemo, useCallback, useState } from 'react';
import cytoscape from 'cytoscape';
import dagre from 'cytoscape-dagre';
import fcose from 'cytoscape-fcose';

// Register extensions
cytoscape.use(dagre);
cytoscape.use(fcose);

import { generateStylesheet } from '../utils/styler';
import { applyLayout, resetStyling, focusOnNode } from '../utils/graphHelpers';

const GraphContainer = ({
  nodes,
  edges,
  selectedElement,
  highlightedNodes,
  filteredTypes,
  searchTerm,
  onElementClick,
  layout = 'forceDirected',
  isLoading = false,
  onRightClick
}) => {
  const containerRef = useRef(null);
  const cyRef = useRef(null);

  // Initialize Cytoscape instance
  useEffect(() => {
    if (!containerRef.current) return;

    // Clean up any existing instance
    if (cyRef.current) {
      cyRef.current.destroy();
    }

    // Create new Cytoscape instance
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
      zoomingEnabled: true,
      userZoomingEnabled: true,
      userPanningEnabled: true
    });

    cyRef.current = cy;

    // Handle clicks
    cy.on('tap', 'node, edge', (evt) => {
      const target = evt.target;
      onElementClick(target);
    });

    // Handle right-click for context menu
    cy.on('cxttap', (evt) => {
      if (!onRightClick) return;

      // Prevent default context menu
      evt.preventDefault();
      evt.stopPropagation();

      const target = evt.target;
      if (target.isNode() || target.isEdge()) {
        // Get screen coordinates for the click position
        const renderedPos = target.renderedPosition();
        const containerRect = containerRef.current.getBoundingClientRect();

        onRightClick({
          element: target,
          x: containerRect.left + renderedPos.x + (containerRect.width / cy.zoom() * cy.pan().x),
          y: containerRect.top + renderedPos.y + (containerRect.height / cy.zoom() * cy.pan().y)
        });
      }
    });

    // Handle double-click for focus
    cy.on('cxttap', 'node', (evt) => {
      // Right-click is handled above, so this won't trigger for nodes
    });

    // Handle tap to deselect on background
    cy.on('tap', (evt) => {
      if (evt.target === cy) {
        // Clicked on background - don't deselect, just handle in parent
      }
    });

    return () => {
      if (cyRef.current) {
        cy.destroy();
        cyRef.current = null;
      }
    };
  }, [onElementClick, onRightClick]);

  // Update graph elements
  useEffect(() => {
    if (!cyRef.current || isLoading) return;

    const cy = cyRef.current;

    // Add nodes and edges
    cy.add({ group: 'nodes', data: {} }); // Placeholder to keep instance alive
    cy.elements().remove(); // Clear existing elements

    // Prepare node data with filter status
    const filteredNodeIds = new Set(
      nodes
        .filter(n => filteredTypes.has(n.data.type))
        .map(n => n.data.id)
    );

    // Add all nodes (will be styled based on filter)
    cy.add(
      nodes.map(node => ({
        group: 'nodes',
        data: { ...node.data, dimmed: !filteredNodeIds.has(node.data.id) }
      }))
    );

    // Add edges that connect visible nodes
    const visibleEdgeData = [];
    edges.forEach(edge => {
      const sourceVisible = filteredNodeIds.has(edge.data.source);
      const targetVisible = filteredNodeIds.has(edge.data.target);
      const dimmed = !sourceVisible || !targetVisible;

      // Always add edge but mark as dimmed if needed
      visibleEdgeData.push({ ...edge, data: { ...edge.data, dimmed } });
    });
    cy.add(visibleEdgeData);

    // Apply styling based on filter state
    cy.nodes().forEach(node => {
      if (node.data('dimmed')) {
        node.addClass('dimmed');
      } else {
        node.removeClass('dimmed');
      }
    });

    cy.edges().forEach(edge => {
      if (edge.data('dimmed')) {
        edge.addClass('dimmed');
      } else {
        edge.removeClass('dimmed');
      }
    });

    // Apply layout
    applyLayout(cy, layout);
  }, [nodes, edges, filteredTypes, layout, isLoading]);

  // Highlight nodes on search match
  useEffect(() => {
    if (!cyRef.current) return;

    resetStyling(cyRef.current);
    cyRef.current.elements().unselect();

    if (highlightedNodes.length > 0) {
      const ids = highlightedNodes.map(id => `[id="${id}"]`);
      cyRef.current.$(ids.join(',')).forEach(el => {
        if (el.isNode()) {
          el.style({
            'background-opacity': 1,
            'border-width': 3,
            'border-color': '#333333'
          });
        }
      });
    }
  }, [highlightedNodes]);

  // Handle selection sync from outside
  useEffect(() => {
    if (!cyRef.current || !selectedElement) return;

    const cy = cyRef.current;
    cy.elements().unselect();

    try {
      const elem = cy.$(`[id="${selectedElement.id}"]`);
      if (elem.length > 0) {
        elem.select();
      }
    } catch (e) {
      // Element might not exist anymore
    }
  }, [selectedElement]);

  return (
    <div className="graph-container">
      {isLoading && (
        <div className="loading-overlay">
          <div className="loading-spinner" />
          <div className="loading-text">Loading graph...</div>
        </div>
      )}
      {!isLoading && nodes.length === 0 && !isLoading && (
        <div className="empty-state">
          <div className="empty-state-icon">📊</div>
          <div className="empty-state-title">No data loaded</div>
          <div className="empty-state-text">
            Upload a knowledge graph JSON file to begin visualization
          </div>
        </div>
      )}
      <div ref={containerRef} className="cy" />
    </div>
  );
};

export default GraphContainer;
