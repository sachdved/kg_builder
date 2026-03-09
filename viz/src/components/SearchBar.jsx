import React, { useState, useRef, useEffect, useCallback } from 'react';
import { entityColors } from '../utils/styler';
import { searchEntities } from '../utils/kgParser';

const SearchBar = ({ kgData, onSearch, onSelectEntity, onClose }) => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const inputRef = useRef(null);

  // Debounced search
  useEffect(() => {
    const timer = setTimeout(() => {
      if (query.trim()) {
        const found = searchEntities(kgData, query);
        setResults(found);
        setSelectedIndex(-1);
        onSearch(query);
      } else {
        setResults([]);
        onSearch('');
      }
    }, 200);

    return () => clearTimeout(timer);
  }, [query, kgData, onSearch]);

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (!results.length) return;

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex(prev => (prev + 1) % results.length);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex(prev => (prev - 1 + results.length) % results.length);
      } else if (e.key === 'Enter') {
        if (selectedIndex >= 0 && results[selectedIndex]) {
          handleSelect(results[selectedIndex]);
        }
      } else if (e.key === 'Escape') {
        inputRef.current?.blur();
        onClose?.();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [results, selectedIndex, onSelectEntity, onClose]);

  const handleSelect = useCallback((entityId) => {
    setQuery(entityId.split('/').pop() || entityId);
    setResults([]);
    onSelectEntity?.(entityId);
    if (inputRef.current) inputRef.current.blur();
  }, [onSelectEntity]);

  const clearSearch = (e) => {
    e.stopPropagation();
    setQuery('');
    setResults([]);
    onSearch('');
    onClose?.();
  };

  // Show results dropdown when query has text and results exist
  const showDropdown = query.trim() && results.length > 0;

  return (
    <div className="search-input-wrapper">
      <span className="search-icon">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="11" cy="11" r="8" />
          <path d="M21 21l-4.35-4.35" />
        </svg>
      </span>
      <input
        ref={inputRef}
        type="text"
        className="search-input"
        placeholder="Search entities..."
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onFocus={() => showDropdown && onClose?.()} // Keep dropdown visible on focus
      />
      {query && (
        <button
          className="btn"
          style={{
            position: 'absolute',
            right: 8,
            top: '50%',
            transform: 'translateY(-50%)',
            padding: '4px 8px',
            width: '24px',
            height: '24px'
          }}
          onClick={clearSearch}
        >
          &times;
        </button>
      )}

      {showDropdown && (
        <div className="search-results">
          {results.length === 0 ? (
            <div className="no-results">No results found</div>
          ) : (
            results.slice(0, 20).map((entityId, index) => {
              const entity = kgData?.entities?.[entityId];
              if (!entity) return null;

              return (
                <div
                  key={entityId}
                  className={`search-result-item ${index === selectedIndex ? 'selected' : ''}`}
                  onMouseDown={() => handleSelect(entityId)}
                >
                  <div
                    className="result-type-indicator"
                    style={{ backgroundColor: entityColors[entity.type] }}
                  />
                  <span className="result-name">{escapeHtml(entity.name)}</span>
                  <span className="result-path">{escapeHtml(entity.file_path || '')}</span>
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
};

const escapeHtml = (text) => {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
};

export default SearchBar;
