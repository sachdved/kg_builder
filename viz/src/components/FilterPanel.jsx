import React from 'react';
import { entityColors, relationshipColors } from '../utils/styler';

const FilterPanel = ({
  kgStats,
  selectedEntityTypes,
  selectedRelationshipTypes,
  onToggleEntityType,
  onToggleRelationshipType,
  onResetFilters
}) => {
  const allEntityTypes = ['FILE', 'MODULE', 'CLASS', 'FUNCTION', 'CONSTANT', 'VARIABLE', 'IMPORT', 'DECORATOR'];
  const allRelationshipTypes = ['CONTAINS', 'CALLS', 'INHERITS', 'IMPORTS', 'INSTANTIATES', 'DEFINES_IN'];

  return (
    <div className="filter-panel">
      {/* Entity Type Filters */}
      <div className="filter-section">
        <div className="filter-title">Entity Types</div>
        <div className="filter-checkboxes">
          {allEntityTypes.map((type) => {
            const count = kgStats?.entityTypes?.[type] || 0;
            const isChecked = selectedEntityTypes.has(type);

            return (
              <label key={type} className="filter-item" onClick={() => onToggleEntityType(type)}>
                <div className={`filter-checkbox ${isChecked ? 'checked' : ''}`} />
                <span
                  className="filter-label"
                  style={{ color: entityColors[type] }}
                >
                  {type}
                </span>
                <span className="filter-count">({count})</span>
              </label>
            );
          })}
        </div>
      </div>

      {/* Relationship Type Filters */}
      <div className="filter-section">
        <div className="filter-title">Relationship Types</div>
        <div className="filter-checkboxes">
          {allRelationshipTypes.map((type) => {
            const count = kgStats?.relationshipTypes?.[type] || 0;
            const isChecked = selectedRelationshipTypes.has(type);

            return (
              <label key={type} className="filter-item" onClick={() => onToggleRelationshipType(type)}>
                <div className={`filter-checkbox ${isChecked ? 'checked' : ''}`} />
                <span
                  className="filter-label"
                  style={{ color: relationshipColors[type] }}
                >
                  {type}
                </span>
                <span className="filter-count">({count})</span>
              </label>
            );
          })}
        </div>
      </div>

      {/* Reset Button */}
      <div className="filter-section" style={{ display: 'flex', justifyContent: 'center' }}>
        <button className="btn" onClick={onResetFilters}>
          Reset All Filters
        </button>
      </div>
    </div>
  );
};

export default FilterPanel;
