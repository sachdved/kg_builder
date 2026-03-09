import React, { useState } from 'react';
import { entityColors, nodeShapes } from '../utils/styler';
import EntityForm from './EntityForm';

const Sidebar = ({ selectedElement, kgData, onClose, onEditEntity, onUpdateEntity }) => {
  const [isEditing, setIsEditing] = useState(false);

  if (!selectedElement || !kgData?.entities) {
    return (
      <aside className="sidebar">
        <div className="sidebar-empty">
          <p>Click on a node to view details</p>
          <p className="mt-sm">Right-click to access context menu</p>
        </div>
      </aside>
    );
  }

  const entityType = selectedElement.isNode() ? 'node' : 'edge';
  const entityId = selectedElement.id();
  const entityData = kgData.entities[entityId];

  // Node details with edit mode
  if (entityType === 'node' && entityData) {
    return (
      <EntityDetailsSidebar
        entity={entityData}
        kgData={kgData}
        isEditing={isEditing}
        setIsEditing={setIsEditing}
        onUpdateEntity={onUpdateEntity}
        onClose={() => onClose?.()}
      />
    );
  }

  // Edge details
  if (entityType === 'edge') {
    return <EdgeDetailsSidebar edge={selectedElement} kgData={kgData} onClose={() => onClose?.()} />;
  }

  return <div className="sidebar"><div className="sidebar-empty">Unknown element</div></div>;
};

const EntityDetailsSidebar = ({ entity, kgData, isEditing, setIsEditing, onUpdateEntity, onClose }) => {
  const connections = getConnections(entity.id, kgData);

  if (isEditing) {
    return (
      <aside className="sidebar">
        <div className="sidebar-header">
          <h2>Edit Entity</h2>
        </div>
        <div className="sidebar-content">
          <EntityForm
            entity={entity}
            editing={true}
            onSave={(updatedEntity) => {
              onUpdateEntity(updatedEntity);
              setIsEditing(false);
            }}
            onCancel={() => setIsEditing(false)}
          />
        </div>
      </aside>
    );
  }

  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <h2>Entity Details</h2>
        <button className="btn btn-primary" onClick={() => setIsEditing(true)}>
          Edit
        </button>
      </div>

      <div className="sidebar-content">
        <div className="entity-detail">
          <div className="entity-detail-header">
            <span
              className="entity-type-badge"
              style={{ backgroundColor: entityColors[entity.type] }}
            >
              {entity.type}
            </span>
            <span className="entity-name">{escapeHtml(entity.name)}</span>
          </div>

          <p className="entity-file-path">
            {entity.file_path}
            {entity.line_number && `:L${entity.line_number}`}
          </p>

          {entity.properties?.description && (
            <div className="entity-docstring">
              <strong>Description:</strong>
              <br />
              {escapeHtml(entity.properties.description)}
            </div>
          )}

          <div className="entity-stats">
            <div className="stat-item">
              <div className="stat-value">{connections.incoming}</div>
              <div className="stat-label">Incoming</div>
            </div>
            <div className="stat-item">
              <div className="stat-value">{connections.outgoing}</div>
              <div className="stat-label">Outgoing</div>
            </div>
          </div>

          {connections.incoming > 0 && (
            <div className="entity-connections connection-group">
              <div className="connection-header">Incoming Relationships</div>
              <ul className="connection-list">
                {connections.incomingList.slice(0, 10).map((conn, idx) => (
                  <li key={idx} className="connection-item">
                    <span style={{ color: entityColors[conn.type] || '#666' }}>
                      {conn.type}: {escapeHtml(conn.source)}
                    </span>
                  </li>
                ))}
                {connections.incomingList.length > 10 && (
                  <li className="connection-item">
                    ... and {connections.incomingList.length - 10} more
                  </li>
                )}
              </ul>
            </div>
          )}

          {connections.outgoing > 0 && (
            <div className="entity-connections connection-group">
              <div className="connection-header">Outgoing Relationships</div>
              <ul className="connection-list">
                {connections.outgoingList.slice(0, 10).map((conn, idx) => (
                  <li key={idx} className="connection-item">
                    <span style={{ color: entityColors[conn.type] || '#666' }}>
                      {conn.type}: {escapeHtml(conn.target)}
                    </span>
                  </li>
                ))}
                {connections.outgoingList.length > 10 && (
                  <li className="connection-item">
                    ... and {connections.outgoingList.length - 10} more
                  </li>
                )}
              </ul>
            </div>
          )}

          {Object.keys(entity.properties || {}).length > 0 && (
            <div className="entity-connections connection-group">
              <div className="connection-header">Properties</div>
              <ul className="connection-list" style={{ maxHeight: '200px' }}>
                {Object.entries(entity.properties).map(([key, value]) => (
                  <li key={key} className="connection-item">
                    <strong>{escapeHtml(key)}:</strong>{' '}
                    {typeof value === 'string' ? escapeHtml(value) : JSON.stringify(value)}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </aside>
  );
};

const EdgeDetailsSidebar = ({ edge, kgData, onClose }) => {
  const sourceId = edge.data('source');
  const targetId = edge.data('target');
  const relType = edge.data('rel');
  const sourceEntity = kgData.entities[sourceId];
  const targetEntity = kgData.entities[targetId];

  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <h2>Relationship Details</h2>
      </div>

      <div className="sidebar-content">
        <div className="entity-detail">
          <div className="entity-detail-header">
            <span
              className="entity-type-badge"
              style={{ backgroundColor: entityColors[relType] || '#999' }}
            >
              {relType}
            </span>
          </div>

          <div className="mt-md">
            <p><strong>From:</strong></p>
            <p className="entity-name">{escapeHtml(sourceEntity?.name || sourceId)}</p>
            <p className="entity-file-path">{sourceEntity?.file_path}</p>
          </div>

          <div className="mt-md">
            <p><strong>To:</strong></p>
            <p className="entity-name">{escapeHtml(targetEntity?.name || targetId)}</p>
            <p className="entity-file-path">{targetEntity?.file_path}</p>
          </div>

          {edge.data('lineNumber') && (
            <div className="mt-md">
              <p><strong>Line:</strong> {edge.data('lineNumber')}</p>
            </div>
          )}
        </div>
      </div>
    </aside>
  );
};

const getConnections = (entityId, kgData) => {
  if (!kgData?.relationships) {
    return { incoming: 0, outgoing: 0, incomingList: [], outgoingList: [] };
  }

  const incoming = [];
  const outgoing = [];

  kgData.relationships.forEach(rel => {
    if (rel.target_id === entityId) {
      const sourceEntity = kgData.entities[rel.source_id];
      incoming.push({
        type: rel.type,
        source: sourceEntity?.name || rel.source_id
      });
    }
    if (rel.source_id === entityId) {
      const targetEntity = kgData.entities[rel.target_id];
      outgoing.push({
        type: rel.type,
        target: targetEntity?.name || rel.target_id
      });
    }
  });

  return {
    incoming: incoming.length,
    outgoing: outgoing.length,
    incomingList: incoming,
    outgoingList: outgoing
  };
};

const escapeHtml = (text) => {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
};

export default Sidebar;
