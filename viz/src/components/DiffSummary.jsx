import React from 'react';

/**
 * Inline toolbar indicator showing diff stats as colored badges.
 * Only visible when diff mode is active and there are changes.
 */
const DiffSummary = ({ diffResult, visible }) => {
  if (!visible || !diffResult) return null;

  const s = diffResult.summary || {};
  const total = (s.entities_added || 0) + (s.entities_removed || 0) + (s.entities_modified || 0);

  if (total === 0) return null;

  return (
    <div className="toolbar-group" style={{ gap: '3px' }}>
      {s.entities_added > 0 && (
        <span style={{
          padding: '1px 6px',
          borderRadius: '10px',
          fontSize: '0.72rem',
          fontWeight: 600,
          backgroundColor: '#d4edda',
          color: '#155724',
        }}>
          +{s.entities_added}
        </span>
      )}
      {s.entities_modified > 0 && (
        <span style={{
          padding: '1px 6px',
          borderRadius: '10px',
          fontSize: '0.72rem',
          fontWeight: 600,
          backgroundColor: '#fff3cd',
          color: '#856404',
        }}>
          ~{s.entities_modified}
        </span>
      )}
      {s.entities_removed > 0 && (
        <span style={{
          padding: '1px 6px',
          borderRadius: '10px',
          fontSize: '0.72rem',
          fontWeight: 600,
          backgroundColor: '#f8d7da',
          color: '#721c24',
        }}>
          -{s.entities_removed}
        </span>
      )}
    </div>
  );
};

export default DiffSummary;
