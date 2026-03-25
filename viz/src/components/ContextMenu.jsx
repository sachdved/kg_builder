import React, { useEffect } from 'react';

const ContextMenu = ({ x, y, visible, onSelect, onClose }) => {
  useEffect(() => {
    if (!visible) return;

    const handleOutsideClick = (e) => {
      // Don't close if clicking on the menu itself
      if (e.target.closest('.context-menu')) return;
      onClose();
    };

    const handleEscape = (e) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('mousedown', handleOutsideClick);
    document.addEventListener('keydown', handleEscape);

    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [visible, onClose]);

  if (!visible) return null;

  return (
    <div
      className="context-menu"
      style={{
        left: `${x}px`,
        top: `${y}px`,
        display: visible ? 'block' : 'none'
      }}
    >
      <button className="context-menu-item" onClick={() => onSelect('delete')}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <polyline points="3,6 5,6 21,6" />
          <path d="M19,6v14a2,2,0,0,1,-2,2H7a2,2,0,0,1,-2,-2V6m3,0V4a2,2,0,0,1,2,-2h4a2,2,0,0,1,2,2v2" />
        </svg>
        Delete
      </button>
    </div>
  );
};

export default ContextMenu;
