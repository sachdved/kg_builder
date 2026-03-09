import React, { useState } from 'react';

const NewNodeModal = ({ isOpen, onClose, onAdd }) => {
  const [formData, setFormData] = useState({
    id: '',
    name: '',
    type: 'FUNCTION',
    file_path: '',
    line_number: ''
  });
  const [errors, setErrors] = useState({});

  const entityTypes = [
    { value: 'FILE', label: 'File' },
    { value: 'MODULE', label: 'Module' },
    { value: 'CLASS', label: 'Class' },
    { value: 'FUNCTION', label: 'Function' },
    { value: 'CONSTANT', label: 'Constant' },
    { value: 'VARIABLE', label: 'Variable' },
    { value: 'IMPORT', label: 'Import' },
    { value: 'DECORATOR', label: 'Decorator' }
  ];

  const resetForm = () => {
    setFormData({
      id: '',
      name: '',
      type: 'FUNCTION',
      file_path: '',
      line_number: ''
    });
    setErrors({});
  };

  const handleClose = () => {
    resetForm();
    onClose();
  };

  const validate = () => {
    const newErrors = {};

    if (!formData.id.trim()) {
      newErrors.id = 'ID is required';
    }
    if (!formData.name.trim()) {
      newErrors.name = 'Name is required';
    }
    if (!formData.file_path.trim()) {
      newErrors.file_path = 'File path is required';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = (e) => {
    e.preventDefault();

    if (!validate()) return;

    onAdd({
      id: formData.id.trim(),
      name: formData.name.trim(),
      type: formData.type,
      file_path: formData.file_path.trim(),
      line_number: formData.line_number ? parseInt(formData.line_number, 10) : 0
    });

    resetForm();
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
    if (errors[name]) {
      setErrors(prev => ({ ...prev, [name]: null }));
    }
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={handleClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Add New Entity</h2>
          <button className="btn btn-icon" onClick={handleClose}>&times;</button>
        </div>

        <form onSubmit={handleSubmit} className="modal-body">
          <div className="form-group">
            <label htmlFor="new-node-id">Entity ID *</label>
            <input
              type="text"
              id="new-node-id"
              name="id"
              value={formData.id}
              onChange={handleChange}
              className={`form-input ${errors.id ? 'error' : ''}`}
              placeholder="Unique identifier (e.g., module::function)"
            />
            {errors.id && <span className="error-message">{errors.id}</span>}
          </div>

          <div className="form-group">
            <label htmlFor="new-node-name">Display Name *</label>
            <input
              type="text"
              id="new-node-name"
              name="name"
              value={formData.name}
              onChange={handleChange}
              className={`form-input ${errors.name ? 'error' : ''}`}
              placeholder="Name shown in visualization"
            />
            {errors.name && <span className="error-message">{errors.name}</span>}
          </div>

          <div className="form-group">
            <label htmlFor="new-node-type">Entity Type *</label>
            <select
              id="new-node-type"
              name="type"
              value={formData.type}
              onChange={handleChange}
              className="form-input"
            >
              {entityTypes.map(option => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          <div className="form-group">
            <label htmlFor="new-node-file-path">File Path *</label>
            <input
              type="text"
              id="new-node-file-path"
              name="file_path"
              value={formData.file_path}
              onChange={handleChange}
              className={`form-input ${errors.file_path ? 'error' : ''}`}
              placeholder="Path to source file"
            />
            {errors.file_path && <span className="error-message">{errors.file_path}</span>}
          </div>

          <div className="form-group">
            <label htmlFor="new-node-line-number">Line Number</label>
            <input
              type="number"
              id="new-node-line-number"
              name="line_number"
              value={formData.line_number}
              onChange={handleChange}
              className="form-input"
              placeholder="Optional line number"
              min="0"
            />
          </div>

          <div className="modal-footer">
            <button type="button" className="btn" onClick={handleClose}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary">
              Add Entity
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default NewNodeModal;
