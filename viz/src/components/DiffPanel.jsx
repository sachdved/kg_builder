import React, { useRef } from 'react';

const DiffPanel = ({
  isOpen,
  onClose,
  diffResult,
  showDiffColors,
  onToggleDiffColors,
  onLoadProposal,
  onExportChangeSpec,
  onResetToBase,
  hasBaseKg,
}) => {
  const fileInputRef = useRef(null);

  if (!isOpen) return null;

  const summary = diffResult?.summary || {};
  const entityChanges = diffResult?.entity_changes || [];
  const relChanges = diffResult?.relationship_changes || [];
  const hasChanges = entityChanges.length > 0 || relChanges.length > 0;

  const handleFileSelect = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const json = JSON.parse(ev.target.result);
        onLoadProposal(json);
      } catch (err) {
        alert('Error parsing JSON file: ' + err.message);
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  return (
    <div
      style={{
        position: 'absolute',
        top: '48px',
        right: '16px',
        width: '320px',
        maxHeight: 'calc(100vh - 80px)',
        backgroundColor: '#fff',
        borderRadius: '8px',
        boxShadow: '0 4px 20px rgba(0,0,0,0.15)',
        zIndex: 1000,
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* Header */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '12px 16px',
          borderBottom: '1px solid #e0e0e0',
          backgroundColor: '#f8f9fa',
        }}
      >
        <h3 style={{ margin: 0, fontSize: '0.9rem', fontWeight: 600 }}>Diff Mode</h3>
        <button
          onClick={onClose}
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            fontSize: '1.2rem',
            color: '#666',
            padding: '0 4px',
          }}
        >
          &times;
        </button>
      </div>

      {/* Content */}
      <div style={{ padding: '12px 16px', overflowY: 'auto', flex: 1 }}>
        {/* Load agent proposal */}
        <div style={{ marginBottom: '12px' }}>
          <button
            className="btn btn-primary"
            onClick={() => fileInputRef.current?.click()}
            style={{ width: '100%', marginBottom: '6px' }}
          >
            Load Agent Proposal
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".json"
            onChange={handleFileSelect}
            style={{ display: 'none' }}
          />
          <p style={{ fontSize: '0.72rem', color: '#888', margin: '4px 0 0' }}>
            Upload a proposed KG JSON from an agent, or just edit nodes manually.
          </p>
        </div>

        {/* Diff toggle */}
        <div style={{ marginBottom: '12px' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '0.85rem' }}>
            <input
              type="checkbox"
              checked={showDiffColors}
              onChange={onToggleDiffColors}
            />
            Show diff coloring
          </label>
        </div>

        {/* Summary */}
        {hasChanges ? (
          <div style={{ marginBottom: '12px' }}>
            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '8px' }}>
              {summary.entities_added > 0 && (
                <span style={{ padding: '2px 8px', borderRadius: '12px', fontSize: '0.78rem', fontWeight: 600, backgroundColor: '#d4edda', color: '#155724' }}>
                  +{summary.entities_added} added
                </span>
              )}
              {summary.entities_modified > 0 && (
                <span style={{ padding: '2px 8px', borderRadius: '12px', fontSize: '0.78rem', fontWeight: 600, backgroundColor: '#fff3cd', color: '#856404' }}>
                  ~{summary.entities_modified} modified
                </span>
              )}
              {summary.entities_removed > 0 && (
                <span style={{ padding: '2px 8px', borderRadius: '12px', fontSize: '0.78rem', fontWeight: 600, backgroundColor: '#f8d7da', color: '#721c24' }}>
                  -{summary.entities_removed} removed
                </span>
              )}
            </div>
            {(summary.relationships_added > 0 || summary.relationships_removed > 0) && (
              <p style={{ fontSize: '0.75rem', color: '#666', margin: '0 0 8px' }}>
                Relationships: +{summary.relationships_added || 0} / -{summary.relationships_removed || 0}
              </p>
            )}
          </div>
        ) : hasBaseKg ? (
          <p style={{ fontSize: '0.8rem', color: '#888', fontStyle: 'italic', marginBottom: '12px' }}>
            No changes detected. Edit nodes or load an agent proposal.
          </p>
        ) : (
          <p style={{ fontSize: '0.8rem', color: '#888', fontStyle: 'italic', marginBottom: '12px' }}>
            Upload a base KG first, then make edits or load a proposal.
          </p>
        )}

        {/* Change list */}
        {entityChanges.length > 0 && (
          <div style={{ marginBottom: '12px' }}>
            <h4 style={{ fontSize: '0.8rem', fontWeight: 600, margin: '0 0 6px', color: '#333' }}>Entity Changes</h4>
            <ul style={{ listStyle: 'none', padding: 0, margin: 0, maxHeight: '200px', overflowY: 'auto' }}>
              {entityChanges.slice(0, 50).map((ec, i) => (
                <li
                  key={i}
                  style={{
                    padding: '4px 8px',
                    marginBottom: '2px',
                    borderRadius: '4px',
                    fontSize: '0.75rem',
                    backgroundColor:
                      ec.action === 'added' ? '#d4edda' :
                      ec.action === 'removed' ? '#f8d7da' :
                      '#fff3cd',
                    color:
                      ec.action === 'added' ? '#155724' :
                      ec.action === 'removed' ? '#721c24' :
                      '#856404',
                  }}
                >
                  <strong>{ec.action.toUpperCase()}</strong>{' '}
                  {ec.entity_id.split('::').pop()} ({ec.entity_type})
                </li>
              ))}
              {entityChanges.length > 50 && (
                <li style={{ padding: '4px 8px', fontSize: '0.75rem', color: '#666' }}>
                  ... and {entityChanges.length - 50} more
                </li>
              )}
            </ul>
          </div>
        )}

        {/* Actions */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '8px' }}>
          {hasChanges && (
            <button
              className="btn btn-primary"
              onClick={onExportChangeSpec}
              style={{ width: '100%' }}
            >
              Export Change Spec
            </button>
          )}
          {hasBaseKg && (
            <button
              className="btn"
              onClick={onResetToBase}
              style={{ width: '100%', fontSize: '0.8rem' }}
            >
              Reset to Base KG
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default DiffPanel;
