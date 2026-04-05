import React from 'react';

const Toolbar = ({
  nodeCount,
  edgeCount,
  onZoomIn,
  onZoomOut,
  onResetView,
  onFitView,
  onLayoutChange,
  currentLayout,
  onFileUploadClick,
  onSaveJson,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  onAddEntityClick,
  onAddRelationshipClick,
  onDiffClick,
  diffActive,
  diffSummaryComponent,
}) => {
  return (
    <div className="toolbar">
      {/* File Operations */}
      <div className="toolbar-group">
        <button className="btn btn-file" onClick={onFileUploadClick} title="Upload JSON file">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
            <polyline points="17,8 12,3 7,8" />
            <line x1="12" y1="3" x2="12" y2="15" />
          </svg>
          Upload
        </button>
        <button className="btn btn-primary" onClick={onSaveJson} title="Download as JSON">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
            <polyline points="7,10 12,15 17,10" />
            <line x1="12" y1="15" x2="12" y2="3" />
          </svg>
          Save
        </button>
        <button
          className={`btn ${diffActive ? 'btn-active' : 'btn-primary'}`}
          onClick={onDiffClick}
          title="Compare changes (Diff Mode)"
          style={diffActive ? { backgroundColor: '#28a745', color: '#fff' } : {}}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 3v18M3 12h18" />
            <path d="M6 6l-3 3 3 3" />
            <path d="M18 6l3 3-3 3" />
          </svg>
          Diff
        </button>
      </div>

      {/* Diff summary badges */}
      {diffSummaryComponent}

      {/* Add Operations */}
      <div className="toolbar-group">
        <button
          className="btn btn-primary"
          onClick={onAddEntityClick}
          title="Add new entity (Ctrl+N)"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="16" />
            <line x1="8" y1="12" x2="16" y2="12" />
          </svg>
          Entity
        </button>
        <button
          className="btn btn-primary"
          onClick={onAddRelationshipClick}
          title="Add new relationship (Ctrl+E)"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="6" cy="12" r="4" />
            <circle cx="18" cy="12" r="4" />
            <line x1="10" y1="12" x2="14" y2="12" />
          </svg>
          Relation
        </button>
      </div>

      {/* Undo/Redo */}
      <div className="toolbar-group">
        <button
          className={`btn btn-icon ${canUndo ? '' : 'disabled'}`}
          onClick={onUndo}
          title={`Undo (Ctrl+Z) - ${!canUndo ? 'Nothing to undo' : ''}`}
          disabled={!canUndo}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M3,7v6h6" />
            <path d="M9,13a6,6,0,0,1,0-12h1a5.9,5.9,0,0,1,4.29,2L18,6" />
          </svg>
        </button>
        <button
          className={`btn btn-icon ${canRedo ? '' : 'disabled'}`}
          onClick={onRedo}
          title={`Redo (Ctrl+Y) - ${!canRedo ? 'Nothing to redo' : ''}`}
          disabled={!canRedo}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M21,7v6h-6" />
            <path d="M15,13a6,6,0,0,0,0-12h-1a5.9,5.9,0,0,0,-4.29,2L6,6" />
          </svg>
        </button>
      </div>

      {/* View Stats */}
      <div className="toolbar-group">
        <span className="stat-pill">
          <span className="count">{nodeCount}</span> nodes
        </span>
        <span className="stat-pill">
          <span className="count">{edgeCount}</span> edges
        </span>
      </div>

      {/* Layout Selector */}
      <div className="toolbar-group">
        <select
          className="btn"
          value={currentLayout}
          onChange={(e) => onLayoutChange(e.target.value)}
        >
          <option value="forceDirected">Force-Directed</option>
          <option value="hierarchical">Hierarchical</option>
          <option value="circular">Circular</option>
          <option value="grid">Grid</option>
        </select>
      </div>

      {/* Zoom Controls */}
      <div className="toolbar-group" style={{ marginRight: 'auto' }}>
        <button className="btn btn-icon" onClick={onZoomIn} title="Zoom In">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
            <line x1="11" y1="8" x2="11" y2="14" />
            <line x1="8" y1="11" x2="14" y2="11" />
          </svg>
        </button>
        <button className="btn btn-icon" onClick={onZoomOut} title="Zoom Out">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
            <line x1="8" y1="11" x2="14" y2="11" />
          </svg>
        </button>
        <button className="btn btn-icon" onClick={onFitView} title="Fit to View">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" />
          </svg>
        </button>
      </div>

      {/* Help */}
      <div className="toolbar-group">
        <button className="btn btn-icon" onClick={onResetView} title="Reset View (Home)">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
            <polyline points="9,22 9,12 15,12 15,22" />
          </svg>
        </button>
      </div>
    </div>
  );
};

export default Toolbar;
