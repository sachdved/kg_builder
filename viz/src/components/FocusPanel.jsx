import React from 'react';

/**
 * FocusPanel - Sidebar panel for focus mode controls
 * Shows when focusMode is active and allows users to:
 * - See which node is currently focused
 * - Adjust the depth of neighbor traversal
 * - Filter by edge direction (incoming, outgoing, or both)
 * - View indegree/outdegree statistics
 * - Exit focus mode
 */
const FocusPanel = ({
  focusMode,
  focusedNodeId,
  focusedNodeName,
  focusDepth,
  setFocusDepth,
  focusDirection,
  setFocusDirection,
  visibleNodesCount,
  totalNodesCount,
  indegree,
  outdegree,
  incomingNeighborCount,
  outgoingNeighborCount,
  onExit
}) => {
  if (!focusMode) return null;

  return (
    <div className="sidebar">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 16px' }}>
        <h2 style={{ fontSize: '1rem', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span>🔍</span> Focus Mode
        </h2>
        <button
          className="btn btn-icon"
          onClick={onExit}
          style={{ width: '24px', height: '24px', padding: 0 }}
          title="Exit focus mode"
        >
          &times;
        </button>
      </div>

      <div className="sidebar-content">
        {/* Focused node info */}
        <div style={{ marginBottom: '20px' }}>
          <p style={{ fontSize: '0.8rem', color: '#666', margin: 0 }}>Focused Entity:</p>
          <p style={{
            fontWeight: 500,
            margin: '4px 0 0 0',
            padding: '8px',
            backgroundColor: '#f0f7ff',
            borderRadius: '4px'
          }}>
            {focusedNodeName || focusedNodeId}
          </p>
        </div>

        {/* Direction selector */}
        <div style={{ marginBottom: '20px' }}>
          <label htmlFor="focus-direction" style={{ fontSize: '0.8rem', color: '#666' }}>
            Neighbor Direction:
          </label>
          <select
            id="focus-direction"
            value={focusDirection}
            onChange={(e) => setFocusDirection(e.target.value)}
            style={{
              width: '100%',
              padding: '8px',
              marginTop: '4px',
              borderRadius: '4px',
              border: '1px solid #ccc',
              fontSize: '0.9rem'
            }}
          >
            <option value="both">Both Directions</option>
            <option value="incoming">Incoming Only (Dependents)</option>
            <option value="outgoing">Outgoing Only (Dependencies)</option>
          </select>
        </div>

        {/* Depth selector */}
        <div style={{ marginBottom: '20px' }}>
          <label htmlFor="focus-depth" style={{ fontSize: '0.8rem', color: '#666' }}>
            Neighbor Depth:
          </label>
          <select
            id="focus-depth"
            value={focusDepth}
            onChange={(e) => setFocusDepth(parseInt(e.target.value, 10))}
            style={{
              width: '100%',
              padding: '8px',
              marginTop: '4px',
              borderRadius: '4px',
              border: '1px solid #ccc',
              fontSize: '0.9rem'
            }}
          >
            <option value={1}>1 hop (direct neighbors)</option>
            <option value={2}>2 hops</option>
            <option value={3}>3 hops</option>
            <option value={4}>4 hops</option>
            <option value={5}>5 hops</option>
          </select>
        </div>

        {/* Indegree/Outdegree stats */}
        <div style={{ marginBottom: '20px' }}>
          <p style={{ fontSize: '0.8rem', color: '#666', margin: 0 }}>Edge Counts:</p>
          <div style={{
            display: 'flex',
            gap: '12px',
            marginTop: '4px'
          }}>
            <div style={{
              flex: 1,
              padding: '8px',
              backgroundColor: '#e8f5e9',
              borderRadius: '4px',
              textAlign: 'center'
            }}>
              <p style={{ fontSize: '0.7rem', color: '#2e7d32', margin: 0 }}>Incoming</p>
              <p style={{ fontSize: '1.1rem', fontWeight: 600, color: '#1b5e20', margin: 0 }}>{indegree}</p>
            </div>
            <div style={{
              flex: 1,
              padding: '8px',
              backgroundColor: '#fff3e0',
              borderRadius: '4px',
              textAlign: 'center'
            }}>
              <p style={{ fontSize: '0.7rem', color: '#ef6c00', margin: 0 }}>Outgoing</p>
              <p style={{ fontSize: '1.1rem', fontWeight: 600, color: '#e65100', margin: 0 }}>{outdegree}</p>
            </div>
          </div>
        </div>

        {/* Direction-specific neighbor counts */}
        {focusDirection === 'both' && (
          <div style={{ marginBottom: '20px' }}>
            <p style={{ fontSize: '0.8rem', color: '#666', margin: 0 }}>Neighbor Breakdown:</p>
            <div style={{
              display: 'flex',
              gap: '8px',
              marginTop: '4px'
            }}>
              <span style={{
                fontSize: '0.85rem',
                padding: '4px 8px',
                backgroundColor: '#e3f2fd',
                borderRadius: '4px'
              }}>
                ← {incomingNeighborCount} incoming
              </span>
              <span style={{
                fontSize: '0.85rem',
                padding: '4px 8px',
                backgroundColor: '#fce4ec',
                borderRadius: '4px'
              }}>
                {outgoingNeighborCount} outgoing →
              </span>
            </div>
          </div>
        )}

        {/* Visibility Stats */}
        <div style={{ marginBottom: '20px' }}>
          <p style={{ fontSize: '0.8rem', color: '#666', margin: 0 }}>Visibility:</p>
          <p style={{
            fontSize: '0.9rem',
            margin: '4px 0',
            padding: '8px',
            backgroundColor: '#f5f5f5',
            borderRadius: '4px'
          }}>
            Showing {visibleNodesCount} of {totalNodesCount} nodes
          </p>
        </div>

        {/* Help text */}
        <div style={{
          fontSize: '0.8rem',
          color: '#666',
          padding: '12px',
          backgroundColor: '#fff9e6',
          borderRadius: '4px',
          marginBottom: '16px'
        }}>
          {focusDirection === 'both' && (
            <span>Tip: Adjust direction to focus on dependencies (outgoing) or dependents (incoming). Use depth control for more neighbors.</span>
          )}
          {focusDirection === 'incoming' && (
            <span>Show only entities that point TO this node. Useful for finding what depends on this entity.</span>
          )}
          {focusDirection === 'outgoing' && (
            <span>Show only entities this node points TO. Useful for understanding dependencies and call relationships.</span>
          )}
        </div>

        {/* Exit button */}
        <button
          className="btn btn-secondary"
          onClick={onExit}
          style={{ width: '100%', padding: '10px' }}
        >
          Exit Focus Mode
        </button>
      </div>
    </div>
  );
};

export default FocusPanel;
