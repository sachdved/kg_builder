import React, { useState } from 'react';

const NewEdgeModal = ({ isOpen, onClose, onAdd, entities }) => {
  const [formData, setFormData] = useState({
    source_id: '',
    target_id: '',
    type: 'CALLS',
    line_number: ''
  });
  const [errors, setErrors] = useState({});

  // Filter and sort entities for the dropdowns
  const entityOptions = React.useMemo(() => {
    if (!entities) return [];
    return Object.entries(entities)
      .map(([id, entity]) => ({
        id: entity.id || id,
        name: `${entity.name} (${entity.type})`,
        type: entity.type
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [entities]);

  const relationshipTypes = [
    { value: 'CONTAINS', label: 'Contains' },
    { value: 'CALLS', label: 'Calls' },
    { value: 'INHERITS', label: 'Inherits' },
    { value: 'IMPORTS', label: 'Imports' },
    { value: 'INSTANTIATES', label: 'Instantiates' },
    { value: 'DEFINES_IN', label: 'Defines In' }
  ];

  const resetForm = () => {
    setFormData({
      source_id: '',
      target_id: '',
      type: 'CALLS',
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

    if (!formData.source_id) {
      newErrors.source_id = 'Source entity is required';
    }
    if (!formData.target_id) {
      newErrors.target_id = 'Target entity is required';
    }
    if (formData.source_id === formData.target_id) {
      newErrors.target_id = 'Source and target must be different';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = (e) => {
    e.preventDefault();

    if (!validate()) return;

    onAdd({
      source_id: formData.source_id,
      target_id: formData.target_id,
      type: formData.type,
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

  // Prevent adding self-relationships by disabling target selection equal to source
  const filteredTargets = entityOptions.filter(e => e.id !== formData.source_id);

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={handleClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Add New Relationship</h2>
          <button className="btn btn-icon" onClick={handleClose}>&times;</button>
        </div>

        <form onSubmit={handleSubmit} className="modal-body">
          <div className="form-group">
            <label htmlFor="new-edge-source">Source Entity *</label>
            <select
              id="new-edge-source"
              name="source_id"
              value={formData.source_id}
              onChange={handleChange}
              className={`form-input ${errors.source_id ? 'error' : ''}`}
            >
              <option value="">Select source entity...</option>
              {entityOptions.map(entity => (
                <option key={entity.id} value={entity.id}>
                  {entity.name}
                </option>
              ))}
            </select>
            {errors.source_id && <span className="error-message">{errors.source_id}</span>}
          </div>

          <div className="form-group">
            <label htmlFor="new-edge-target">Target Entity *</label>
            <select
              id="new-edge-target"
              name="target_id"
              value={formData.target_id}
              onChange={handleChange}
              className={`form-input ${errors.target_id ? 'error' : ''}`}
            >
              <option value="">Select target entity...</option>
              {filteredTargets.map(entity => (
                <option key={entity.id} value={entity.id}>
                  {entity.name}
                </option>
              ))}
            </select>
            {errors.target_id && <span className="error-message">{errors.target_id}</span>}
          </div>

          <div className="form-group">
            <label htmlFor="new-edge-type">Relationship Type *</label>
            <select
              id="new-edge-type"
              name="type"
              value={formData.type}
              onChange={handleChange}
              className="form-input"
            >
              {relationshipTypes.map(option => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          <div className="form-group">
            <label htmlFor="new-edge-line-number">Line Number</label>
            <input
              type="number"
              id="new-edge-line-number"
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
              Add Relationship
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default NewEdgeModal;
