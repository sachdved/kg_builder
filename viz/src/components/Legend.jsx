import React from 'react';
import { entityColors, relationshipColors, nodeShapes } from '../utils/styler';

const Legend = ({ visible }) => {
  if (!visible) return null;

  const entityTypes = Object.keys(nodeShapes);
  const relationshipTypes = ['CONTAINS', 'CALLS', 'INHERITS', 'IMPORTS', 'INSTANTIATES', 'DEFINES_IN'];

  // Helper to build polygon points string without nested template literals
  const makePoints = (...coords) => coords.join(' ');

  const getShapeElement = (shape, color) => {
    const size = 16;
    const halfSize = size / 2;

    switch (shape) {
      case 'rectangle':
        return (
          <svg width={size} height={size}>
            <rect x="2" y="4" width={size - 4} height={size - 8} fill={color} />
          </svg>
        );
      case 'rounded-rectangle':
        return (
          <svg width={size} height={size}>
            <rect x="2" y="3" width={size - 4} height={size - 6} rx="2" fill={color} />
          </svg>
        );
      case 'hexagon':
        return (
          <svg width={size} height={size}>
            <polygon points={makePoints(halfSize + ',2', size - 1 + ',' + halfSize, halfSize + ',' + (size - 2), '2,' + halfSize)} fill={color} />
          </svg>
        );
      case 'ellipse':
        return (
          <svg width={size} height={size}>
            <ellipse cx={halfSize} cy={halfSize} rx={(size-4)/2} ry={(size-8)/2} fill={color} />
          </svg>
        );
      case 'diamond':
        return (
          <svg width={size} height={size}>
            <polygon points={makePoints(halfSize + ',2', size - 1 + ',' + halfSize, halfSize + ',' + (size - 2), '2,' + halfSize)} fill={color} />
          </svg>
        );
      case 'circle':
        return (
          <svg width={size} height={size}>
            <circle cx={halfSize} cy={halfSize} r={(size-4)/2} fill={color} />
          </svg>
        );
      case 'tag':
        const tagPath = 'M' + (2) + ',' + (halfSize) + ' L' + (size - 3) + ',2 V' + (halfSize + 6) + ' H' + (halfSize + 6) + ' V' + (size - 3) + ' H2 Z';
        return (
          <svg width={size} height={size}>
            <path d={tagPath} fill={color} />
          </svg>
        );
      case 'star':
        const starPoints = makePoints(
          halfSize + ',2',
          (size * 0.8) + ',' + (size * 0.4),
          (size - 1) + ',' + halfSize,
          (size * 0.8) + ',' + (size * 0.6),
          halfSize + ',' + (size - 2),
          (size * 0.2) + ',' + (size * 0.6),
          '2,' + halfSize,
          (size * 0.2) + ',' + (size * 0.4)
        );
        return (
          <svg width={size} height={size}>
            <polygon points={starPoints} fill={color} />
          </svg>
        );
      default:
        return (
          <svg width={size} height={size}>
            <circle cx={halfSize} cy={halfSize} r={(size-4)/2} fill={color} />
          </svg>
        );
    }
  };

  const getLineStyleElement = (type, color) => {
    const width = 30;
    const height = 16;
    const halfH = height / 2;
    const isDashed = type === 'IMPORTS' || type === 'INSTANTIATES';
    const hasArrow = type !== 'CONTAINS' && type !== 'DEFINES_IN';
    const arrowPoints = makePoints(
      (width - 16) + ',' + (halfH - 4),
      (width - 4) + ',' + halfH,
      (width - 16) + ',' + (halfH + 4)
    );

    return (
      <svg width={width} height={height}>
        <line
          x1="2"
          y1={halfH}
          x2={hasArrow ? width - 18 : width - 4}
          y2={halfH}
          stroke={color}
          strokeWidth="2"
          strokeDasharray={isDashed ? "4,3" : undefined}
        />
        {hasArrow && (
          <polygon points={arrowPoints} fill={color} />
        )}
      </svg>
    );
  };

  return (
    <div className="legend">
      <div className="legend-category">
        <div className="legend-title">Entity Types</div>
        <div className="legend-items">
          {entityTypes.map((type) => (
            <div key={type} className="legend-item">
              <div className="legend-shape">
                {getShapeElement(nodeShapes[type], entityColors[type])}
              </div>
              <span>{type}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="legend-category">
        <div className="legend-title">Relationships</div>
        <div className="legend-items" style={{ flexDirection: 'column' }}>
          {relationshipTypes.map((type) => (
            <div key={type} className="legend-item">
              <div className="legend-shape">{getLineStyleElement(type, relationshipColors[type])}</div>
              <span>{type}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default Legend;
