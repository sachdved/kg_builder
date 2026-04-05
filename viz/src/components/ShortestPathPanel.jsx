import React, { useState, useMemo } from 'react';

const ShortestPathPanel = ({
  isOpen,
  onClose,
  kgData,
  onFindPath,
  pathResult,
  onClearPath,
}) => {
  const [sourceQuery, setSourceQuery] = useState('');
  const [targetQuery, setTargetQuery] = useState('');
  const [selectedSource, setSelectedSource] = useState(null);
  const [selectedTarget, setSelectedTarget] = useState(null);

  const searchEntities = (query) => {
    if (!kgData || !query.trim()) return [];
    const lower = query.toLowerCase();
    return Object.entries(kgData.entities)
      .filter(([id, e]) =>
        e.name?.toLowerCase().includes(lower) ||
        id.toLowerCase().includes(lower)
      )
      .slice(0, 8)
      .map(([id, e]) => ({ id, name: e.name, type: e.type, file: e.file_path }));
  };

  const sourceResults = useMemo(() => searchEntities(sourceQuery), [sourceQuery, kgData]);
  const targetResults = useMemo(() => searchEntities(targetQuery), [targetQuery, kgData]);

  if (!isOpen) return null;

  const handleFind = () => {
    if (selectedSource && selectedTarget) {
      onFindPath(selectedSource, selectedTarget);
    }
  };

  return (
    <div style={{
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
    }}>
      {/* Header */}
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        padding: '12px 16px', borderBottom: '1px solid #e0e0e0', backgroundColor: '#f8f9fa',
      }}>
        <h3 style={{ margin: 0, fontSize: '0.9rem', fontWeight: 600 }}>Shortest Path</h3>
        <button onClick={onClose} style={{
          background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.2rem', color: '#666', padding: '0 4px',
        }}>&times;</button>
      </div>

      {/* Content */}
      <div style={{ padding: '12px 16px', overflowY: 'auto', flex: 1 }}>
        {/* Source */}
        <div style={{ marginBottom: '12px' }}>
          <label style={{ fontSize: '0.8rem', fontWeight: 600, display: 'block', marginBottom: '4px' }}>From:</label>
          <input
            type="text"
            value={sourceQuery}
            onChange={(e) => { setSourceQuery(e.target.value); setSelectedSource(null); }}
            placeholder="Search entity..."
            style={{ width: '100%', padding: '6px 8px', borderRadius: '4px', border: '1px solid #ccc', fontSize: '0.85rem', boxSizing: 'border-box' }}
          />
          {selectedSource && (
            <div style={{ fontSize: '0.75rem', color: '#155724', backgroundColor: '#d4edda', padding: '4px 8px', borderRadius: '4px', marginTop: '4px' }}>
              {kgData.entities[selectedSource]?.name || selectedSource}
            </div>
          )}
          {!selectedSource && sourceResults.length > 0 && (
            <ul style={{ listStyle: 'none', padding: 0, margin: '4px 0 0', maxHeight: '120px', overflowY: 'auto', border: '1px solid #eee', borderRadius: '4px' }}>
              {sourceResults.map(r => (
                <li key={r.id}
                  onClick={() => { setSelectedSource(r.id); setSourceQuery(r.name); }}
                  style={{ padding: '4px 8px', fontSize: '0.75rem', cursor: 'pointer', borderBottom: '1px solid #f0f0f0' }}
                  onMouseEnter={(e) => e.target.style.backgroundColor = '#f0f7ff'}
                  onMouseLeave={(e) => e.target.style.backgroundColor = 'transparent'}
                >
                  <strong>{r.name}</strong> <span style={{ color: '#888' }}>({r.type})</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Target */}
        <div style={{ marginBottom: '12px' }}>
          <label style={{ fontSize: '0.8rem', fontWeight: 600, display: 'block', marginBottom: '4px' }}>To:</label>
          <input
            type="text"
            value={targetQuery}
            onChange={(e) => { setTargetQuery(e.target.value); setSelectedTarget(null); }}
            placeholder="Search entity..."
            style={{ width: '100%', padding: '6px 8px', borderRadius: '4px', border: '1px solid #ccc', fontSize: '0.85rem', boxSizing: 'border-box' }}
          />
          {selectedTarget && (
            <div style={{ fontSize: '0.75rem', color: '#155724', backgroundColor: '#d4edda', padding: '4px 8px', borderRadius: '4px', marginTop: '4px' }}>
              {kgData.entities[selectedTarget]?.name || selectedTarget}
            </div>
          )}
          {!selectedTarget && targetResults.length > 0 && (
            <ul style={{ listStyle: 'none', padding: 0, margin: '4px 0 0', maxHeight: '120px', overflowY: 'auto', border: '1px solid #eee', borderRadius: '4px' }}>
              {targetResults.map(r => (
                <li key={r.id}
                  onClick={() => { setSelectedTarget(r.id); setTargetQuery(r.name); }}
                  style={{ padding: '4px 8px', fontSize: '0.75rem', cursor: 'pointer', borderBottom: '1px solid #f0f0f0' }}
                  onMouseEnter={(e) => e.target.style.backgroundColor = '#f0f7ff'}
                  onMouseLeave={(e) => e.target.style.backgroundColor = 'transparent'}
                >
                  <strong>{r.name}</strong> <span style={{ color: '#888' }}>({r.type})</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Find button */}
        <button
          className="btn btn-primary"
          onClick={handleFind}
          disabled={!selectedSource || !selectedTarget}
          style={{ width: '100%', marginBottom: '8px' }}
        >
          Find Path
        </button>

        {/* Result */}
        {pathResult && (
          <div style={{ marginTop: '8px' }}>
            {pathResult.found ? (
              <>
                <p style={{ fontSize: '0.8rem', fontWeight: 600, margin: '0 0 6px', color: '#155724' }}>
                  Path found ({pathResult.hops} hop{pathResult.hops !== 1 ? 's' : ''})
                </p>
                <ol style={{ padding: '0 0 0 20px', margin: 0, fontSize: '0.75rem' }}>
                  {pathResult.steps.map((step, i) => (
                    <li key={i} style={{ marginBottom: '3px' }}>
                      {step.type === 'node' ? (
                        <span><strong>{step.name}</strong> <span style={{ color: '#888' }}>({step.entityType})</span></span>
                      ) : (
                        <span style={{ color: '#666' }}>--{step.relType}--&gt;</span>
                      )}
                    </li>
                  ))}
                </ol>
              </>
            ) : (
              <p style={{ fontSize: '0.8rem', color: '#721c24', margin: 0 }}>
                No path found between these entities.
              </p>
            )}
            <button className="btn" onClick={onClearPath} style={{ width: '100%', marginTop: '8px', fontSize: '0.8rem' }}>
              Clear Path
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default ShortestPathPanel;
