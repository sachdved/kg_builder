import React, { useState } from 'react';
import { entityColors } from '../utils/styler';

const AddNodeModal = ({ isOpen, onClose, onSave }) => {
  const [formData, setFormData] = useState({
    id: '',
    name: '',
    type: 'FUNCTION',
    file_path: '',
    line_number: 0,
    description: ''
  });
  const [errors, setErrors] = useState({});

  // Reset form when modal opens
  const resetForm = () => {
    setFormData({
      id: '',
      name: '',
      type: 'FUNCTION',
      file_path: '',
      line_number: 0,
      description: ''
    });
    setErrors({});
  };

  const validate = () => {
    const newErrors = {};

    if (!formData.id?.trim()) {
      newErrors.id = 'ID is required';
    }
    if (!formData.name?.trim()) {
      newErrors.name = 'Name is required';
    }
    if (!formData.file_path?.trim()) {
      newErrors.file_path = 'File path is required';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
    if (errors[name]) {
      setErrors(prev => ({ ...prev, [name]: null }));
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!validate()) return;

    onSave({
      id: formData.id.trim(),
      name: formData.name.trim(),
      type: formData.type,
      file_path: formData.file_path.trim(),
      line_number: Number(formData.line_number) || 0,
      properties: {
        description: formData.description
      }
    });

    resetForm();
  };

  if (!isOpen) return null;

  const entityTypes = [
    'FILE', 'MODULE', 'CLASS', 'FUNCTION', 'CONSTANT',
    'VARIABLE', 'IMPORT', 'DECORATOR'
  ];

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Add New Entity</h2>
          <button className="btn btn-icon" onClick={onClose} style={{ width: '24px', height: '24px' }}>
            &times;
          </button>
        </div>

        <form onSubmit={handleSubmit} className="modal-form">
          {/* ID Field */}
          <div className="form-group">
            <label htmlFor="id">ID *</label>
            <input
              type="text"
              id="id"
              name="id"
              value={formData.id}
              onChange={handleChange}
              className={`form-input ${errors.id ? 'error' : ''}`}
              placeholder="Unique entity identifier"
            />
            {errors.id && <span className="error-message">{errors.id}</span>}
          </div>

          {/* Name Field */}
          <div className="form-group">
            <label htmlFor="name">Display Name *</label>
            <input
              type="text"
              id="name"
              name="name"
              value={formData.name}
              onChange={handleChange}
              className={`form-input ${errors.name ? 'error' : ''}`}
              placeholder="Entity display name"
            />
            {errors.name && <span className="error-message">{errors.name}</span>}
          </div>

          {/* Type Field */}
          <div className="form-group">
            <label htmlFor="type">Entity Type *</label>
            <select
              id="type"
              name="type"
              value={formData.type}
              onChange={handleChange}
              className="form-input"
            >
              {entityTypes.map(type => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </select>
          </div>

          {/* File Path Field */}
          <div className="form-group">
            <label htmlFor="file_path">File Path *</label>
            <input
              type="text"
              id="file_path"
              name="file_path"
              value={formData.file_path}
              onChange={handleChange}
              className={`form-input ${errors.file_path ? 'error' : ''}`}
              placeholder="Path to source file"
            />
            {errors.file_path && <span className="error-message">{errors.file_path}</span>}
          </div>

          {/* Line Number Field */}
          <div className="form-group">
            <label htmlFor="line_number">Line Number</label>
            <input
              type="number"
              id="line_number"
              name="line_number"
              value={formData.line_number}
              onChange={handleChange}
              className="form-input"
              placeholder="0"
              min="0"
            />
          </div>

          {/* Description Field */}
          <div className="form-group">
            <label htmlFor="description">Description</label>
            <textarea
              id="description"
              name="description"
              value={formData.description}
              onChange={handleChange}
              className="form-textarea"
              placeholder="Entity description or docstring"
              rows="3"
            />
          </div>

          {/* Action Buttons */}
          <div className="modal-actions">
            <button type="button" className="btn" onClick={onClose}>
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

export default AddNodeModal;
