import React, { useState, useEffect } from 'react';
import { entityColors, nodeShapes, relationshipColors } from '../utils/styler';

const EditSidebar = ({ selectedElement, kgData, onUpdateEntity, onDeleteEntity, onClose }) => {
  const [isEditing, setIsEditing] = useState(false);
  const [formData, setFormData] = useState({});

  useEffect(() => {
    if (selectedElement && kgData) {
      const entityId = selectedElement.id();
      const entity = kgData.entities[entityId];

      if (entity) {
        setFormData({
          id: entity.id || '',
          name: entity.name || '',
          type: entity.type || 'VARIABLE',
          file_path: entity.file_path || '',
          line_number: entity.line_number || 0,
          docstring: entity.properties?.description || '',
          properties: { ...entity.properties }
        });
      } else if (selectedElement.isNode()) {
        const data = selectedElement.data();
        setFormData({
          id: data.id || '',
          name: data.name || '',
          type: data.type || 'VARIABLE',
          file_path: data.filePath || '',
          line_number: data.lineNumber || 0,
          docstring: data.docstring || '',
          properties: {}
        });
      }
    }
  }, [selectedElement, kgData]);

  if (!selectedElement) {
    return (
      <aside className="sidebar">
        <div className="sidebar-empty">
          <p>Select a node to edit</p>
        </div>
      </aside>
    );
  }

  const entityType = selectedElement.isNode() ? 'node' : 'edge';

  // Entity Editor for nodes
  if (entityType === 'node') {
    return (
      <EntityForm
        formData={formData}
        isEditing={isEditing}
        setFormData={setFormData}
        setIsEditing={setIsEditing}
        onToggleEdit={() => setIsEditing(!isEditing)}
        onSave={() => onUpdateEntity(formData, selectedElement.id())}
        onDelete={() => onDeleteEntity(selectedElement.id(), true)}
        onClose={onClose}
      />
    );
  }

  // Edge details (read-only for now)
  return (
    <EdgeDetailsView edge={selectedElement} kgData={kgData} onClose={onClose} />
  );
};

const EntityForm = ({ formData, isEditing, setFormData, setIsEditing, onToggleEdit, onSave, onDelete, onClose }) => {
  const entityTypes = Object.keys(nodeShapes);

  const handleChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handlePropertiesChange = (key, value) => {
    setFormData(prev => ({
      ...prev,
      properties: {
        ...prev.properties,
        [key]: value
      }
    }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    onSave();
    setIsEditing(false);
  };

  return (
    <aside className="sidebar">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 16px' }}>
        <h2 style={{ fontSize: '1rem', margin: 0, display: 'flex', gap: '8px', alignItems: 'center' }}>
          {isEditing && (
            <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#F18F01' }} />
          )}
          Entity Editor
        </h2>
        <div style={{ display: 'flex', gap: '4px' }}>
          <button className="btn" onClick={onClose} style={{ padding: '4px 8px' }}>
            &times;
          </button>
        </div>
      </div>

      {isEditing ? (
        <form onSubmit={handleSubmit} className="sidebar-content">
          <div style={{ marginBottom: '12px' }}>
            <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 500, marginBottom: '4px' }}>
              ID <span style={{ color: '#C73E1D' }}>*</span>
            </label>
            <input
              type="text"
              value={formData.id}
              onChange={(e) => handleChange('id', e.target.value)}
              style={{ width: '100%', padding: '6px 8px', borderRadius: '4px', border: '1px solid #e0e0e0' }}
              required
            />
          </div>

          <div style={{ marginBottom: '12px' }}>
            <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 500, marginBottom: '4px' }}>
              Name <span style={{ color: '#C73E1D' }}>*</span>
            </label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => handleChange('name', e.target.value)}
              style={{ width: '100%', padding: '6px 8px', borderRadius: '4px', border: '1px solid #e0e0e0' }}
              required
            />
          </div>

          <div style={{ marginBottom: '12px' }}>
            <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 500, marginBottom: '4px' }}>
              Type <span style={{ color: '#C73E1D' }}>*</span>
            </label>
            <select
              value={formData.type}
              onChange={(e) => handleChange('type', e.target.value)}
              style={{ width: '100%', padding: '6px 8px', borderRadius: '4px', border: '1px solid #e0e0e0' }}
              required
            >
              {entityTypes.map(type => (
                <option key={type} value={type}>{type}</option>
              ))}
            </select>
          </div>

          <div style={{ marginBottom: '12px' }}>
            <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 500, marginBottom: '4px' }}>
              File Path <span style={{ color: '#C73E1D' }}>*</span>
            </label>
            <input
              type="text"
              value={formData.file_path}
              onChange={(e) => handleChange('file_path', e.target.value)}
              style={{ width: '100%', padding: '6px 8px', borderRadius: '4px', border: '1px solid #e0e0e0' }}
              required
            />
          </div>

          <div style={{ marginBottom: '12px' }}>
            <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 500, marginBottom: '4px' }}>
              Line Number
            </label>
            <input
              type="number"
              value={formData.line_number || ''}
              onChange={(e) => handleChange('line_number', parseInt(e.target.value) || 0)}
              style={{ width: '100%', padding: '6px 8px', borderRadius: '4px', border: '1px solid #e0e0e0' }}
              min="0"
            />
          </div>

          <div style={{ marginBottom: '12px' }}>
            <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 500, marginBottom: '4px' }}>
              Docstring / Description
            </label>
            <textarea
              value={formData.docstring || ''}
              onChange={(e) => handleChange('docstring', e.target.value)}
              style={{ width: '100%', padding: '6px 8px', borderRadius: '4px', border: '1px solid #e0e0e0', minHeight: '60px', fontFamily: 'inherit' }}
            />
          </div>

          <div style={{ marginBottom: '12px' }}>
            <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 500, marginBottom: '4px' }}>
              Properties (JSON)
            </label>
            <textarea
              value={JSON.stringify(formData.properties || {}, null, 2)}
              onChange={(e) => {
                try {
                  const parsed = JSON.parse(e.target.value);
                  setFormData(prev => ({ ...prev, properties: parsed }));
                } catch {
                  // Ignore invalid JSON until user finishes typing
                }
              }}
              style={{ width: '100%', padding: '6px 8px', borderRadius: '4px', border: '1px solid #e0e0e0', minHeight: '80px', fontFamily: 'monospace', fontSize: '0.8rem' }}
            />
          </div>

          <div style={{ display: 'flex', gap: '8px', marginTop: '16px' }}>
            <button type="submit" className="btn" style={{ backgroundColor: '#2E86AB', color: 'white', border: 'none', flex: 1 }}>
              Save Changes
            </button>
            <button
              type="button"
              className="btn"
              onClick={() => setIsEditing(false)}
              style={{ flex: 1 }}
            >
              Cancel
            </button>
          </div>

          <div style={{ borderTop: '1px solid #e0e0e0', marginTop: '16px', paddingTop: '12px' }}>
            <button
              type="button"
              className="btn"
              onClick={onDelete}
              style={{ width: '100%', backgroundColor: '#C73E1D', color: 'white', border: 'none' }}
            >
              Delete Entity
            </button>
          </div>
        </form>
      ) : (
        <EntityPreview formData={formData} onEdit={onToggleEdit} onDelete={onDelete} />
      )}
    </aside>
  );
};

const EntityPreview = ({ formData, onEdit, onDelete }) => {
  return (
    <div className="sidebar-content">
      <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
        <span
          style={{
            display: 'inline-block',
            padding: '2px 8px',
            fontSize: '0.7rem',
            fontWeight: 600,
            borderRadius: '4px',
            backgroundColor: entityColors[formData.type] || '#999',
            color: '#fff'
          }}
        >
          {formData.type}
        </span>
      </div>

      <h3 style={{ fontSize: '1rem', marginBottom: '8px' }}>
        {escapeHtml(formData.name)}
      </h3>

      <p style={{ fontSize: '0.85rem', color: '#666', fontFamily: 'monospace', wordBreak: 'break-all', marginBottom: '12px' }}>
        {escapeHtml(formData.id)}
      </p>

      <p style={{ fontSize: '0.85rem', color: '#666', fontFamily: 'monospace', wordBreak: 'break-all', marginBottom: '8px' }}>
        {escapeHtml(formData.file_path)}
        {formData.line_number > 0 && `:L${formData.line_number}`}
      </p>

      {formData.docstring && (
        <div style={{ background: '#f5f5f5', padding: '8px', borderRadius: '4px', fontSize: '0.85rem', marginBottom: '12px' }}>
          <strong>Description:</strong>
          <br />
          {escapeHtml(formData.docstring)}
        </div>
      )}

      {Object.keys(formData.properties || {}).length > 0 && (
        <div style={{ marginBottom: '16px' }}>
          <h4 style={{ fontSize: '0.85rem', color: '#666', marginBottom: '8px' }}>Properties</h4>
          <ul style={{ fontSize: '0.85rem', paddingLeft: '16px' }}>
            {Object.entries(formData.properties).map(([key, value]) => (
              <li key={key} style={{ marginBottom: '4px' }}>
                <strong>{escapeHtml(key)}:</strong> {typeof value === 'string' ? escapeHtml(value) : JSON.stringify(value)}
              </li>
            ))}
          </ul>
        </div>
      )}

      <button className="btn" onClick={onEdit} style={{ width: '100%', marginBottom: '8px' }}>
        Edit Entity
      </button>
      <button
        className="btn"
        onClick={onDelete}
        style={{ width: '100%', backgroundColor: '#C73E1D', color: 'white', border: 'none' }}
      >
        Delete Entity
      </button>
    </div>
  );
};

const EdgeDetailsView = ({ edge, kgData, onClose }) => {
  const sourceId = edge.data('source');
  const targetId = edge.data('target');
  const relType = edge.data('rel');
  const sourceEntity = kgData?.entities?.[sourceId];
  const targetEntity = kgData?.entities?.[targetId];

  return (
    <aside className="sidebar">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 16px' }}>
        <h2 style={{ fontSize: '1rem', margin: 0 }}>Relationship Details</h2>
        <button className="btn" onClick={onClose} style={{ width: '24px', height: '24px', padding: 0 }}>&times;</button>
      </div>

      <div className="sidebar-content">
        <span
          style={{
            display: 'inline-block',
            padding: '2px 8px',
            fontSize: '0.7rem',
            fontWeight: 600,
            borderRadius: '4px',
            backgroundColor: relationshipColors[relType] || '#999',
            color: '#fff'
          }}
        >
          {relType}
        </span>

        <div style={{ marginTop: '16px' }}>
          <p style={{ fontSize: '0.8rem', color: '#666' }}>From:</p>
          <p style={{ fontWeight: 500, marginBottom: '12px' }}>{escapeHtml(sourceEntity?.name || sourceId)}</p>

          <p style={{ fontSize: '0.8rem', color: '#666' }}>To:</p>
          <p style={{ fontWeight: 500 }}>{escapeHtml(targetEntity?.name || targetId)}</p>
        </div>

        <button className="btn" onClick={onClose} style={{ width: '100%', marginTop: '16px' }}>
          Close
        </button>
      </div>
    </aside>
  );
};

const escapeHtml = (text) => {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
};

export default EditSidebar;
