import React from 'react';

const ConfirmationDialog = ({ isOpen, onClose, onConfirm, title, message, confirmText = 'Delete', confirmStyle = 'error' }) => {
  if (!isOpen) return null;

  const handleClose = () => {
    onClose();
  };

  const handleConfirm = () => {
    onConfirm();
    handleClose();
  };

  const getConfirmClass = () => {
    if (confirmStyle === 'error') return 'btn-error';
    return 'btn-primary';
  };

  return (
    <div className="confirmation-dialog" onClick={handleClose}>
      <div className="confirmation-dialog-content" onClick={(e) => e.stopPropagation()}>
        <h3 className="confirmation-dialog-title">{title}</h3>
        <p className="confirmation-dialog-message">{message}</p>
        <div className="modal-footer">
          <button className="btn" onClick={handleClose}>
            Cancel
          </button>
          <button className={`btn ${getConfirmClass()}`} onClick={handleConfirm}>
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ConfirmationDialog;
