import React, { useState, useEffect } from 'react';
import { entityColors, nodeShapes } from '../utils/styler';

const EntityForm = ({ entity, onSave, onCancel, editing }) => {
  const [formData, setFormData] = useState({
    id: '',
    name: '',
    type: 'FUNCTION',
    file_path: '',
    line_number: 0,
    description: ''
  });
  const [errors, setErrors] = useState({});

  useEffect(() => {
    if (entity) {
      // Map the entity data to form fields
      setFormData({
        id: entity.id || '',
        name: entity.name || '',
        type: entity.type || 'FUNCTION',
        file_path: entity.filePath || entity.file_path || '',
        line_number: entity.lineNumber || entity.line_number || 0,
        description: entity.docstring || entity.description || ''
      });
    }
  }, [entity]);

  const validate = () => {
    const newErrors = {};

    if (!formData.id?.trim()) {
      newErrors.id = 'ID is required';
    }
    if (!formData.name?.trim()) {
      newErrors.name = 'Name is required';
    }
    if (!formData.type) {
      newErrors.type = 'Type is required';
    }
    if (!formData.file_path?.trim()) {
      newErrors.file_path = 'File path is required';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
    // Clear error when user starts typing
    if (errors[name]) {
      setErrors(prev => ({ ...prev, [name]: null }));
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!validate()) return;

    // Transform form data back to entity format
    const updatedEntity = {
      id: formData.id.trim(),
      name: formData.name.trim(),
      type: formData.type,
      file_path: formData.file_path.trim(),
      line_number: Number(formData.line_number) || 0,
      properties: {
        description: formData.description
      }
    };

    onSave(updatedEntity);
  };

  const entityTypes = [
    'FILE', 'MODULE', 'CLASS', 'FUNCTION', 'CONSTANT',
    'VARIABLE', 'IMPORT', 'DECORATOR'
  ];

  return (
    <form className="entity-form" onSubmit={handleSubmit}>
      {editing && (
        <div className="editing-indicator">Editing mode active</div>
      )}

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
        <label htmlFor="name">Name *</label>
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
        <label htmlFor="type">Type *</label>
        <select
          id="type"
          name="type"
          value={formData.type}
          onChange={handleChange}
          className={`form-input ${errors.type ? 'error' : ''}`}
        >
          {entityTypes.map(type => (
            <option key={type} value={type}>
              {type}
            </option>
          ))}
        </select>
        {errors.type && <span className="error-message">{errors.type}</span>}
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

      {/* Description/Docstring Field */}
      <div className="form-group">
        <label htmlFor="description">Description / Docstring</label>
        <textarea
          id="description"
          name="description"
          value={formData.description}
          onChange={handleChange}
          className="form-textarea"
          placeholder="Entity description or docstring"
          rows="4"
        />
      </div>

      {/* Action Buttons */}
      <div className="form-actions">
        <button type="submit" className="btn btn-primary">
          Save Changes
        </button>
        <button type="button" className="btn" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
};

export default EntityForm;
