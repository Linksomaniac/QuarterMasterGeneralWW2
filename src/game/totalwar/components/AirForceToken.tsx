import React from 'react';
import { Country, COUNTRY_COLORS, COUNTRY_TEXT_ON_BG } from '../../types';
import { MinorPower, MINOR_POWER_COLORS, MINOR_POWER_TEXT_ON_BG } from '../types';

interface AirForceTokenProps {
  country?: Country;
  minorPower?: MinorPower;
  x: number;
  y: number;
  size?: number;
  onClick?: () => void;
  highlighted?: boolean;
}

/**
 * AirForceToken — SVG plane silhouette token for air forces.
 * Renders at the given (x, y) position in SVG coordinates.
 */
export default function AirForceToken({
  country,
  minorPower,
  x,
  y,
  size = 24,
  onClick,
  highlighted = false,
}: AirForceTokenProps) {
  const bgColor = minorPower
    ? MINOR_POWER_COLORS[minorPower]
    : country
    ? COUNTRY_COLORS[country]
    : '#888';

  const textColor = minorPower
    ? MINOR_POWER_TEXT_ON_BG[minorPower]
    : country
    ? COUNTRY_TEXT_ON_BG[country]
    : '#FFF';

  const halfSize = size / 2;

  return (
    <g
      transform={`translate(${x - halfSize}, ${y - halfSize})`}
      onClick={onClick}
      style={{ cursor: onClick ? 'pointer' : 'default' }}
    >
      {/* Highlight glow */}
      {highlighted && (
        <circle
          cx={halfSize}
          cy={halfSize}
          r={halfSize + 4}
          fill="none"
          stroke="#FFD700"
          strokeWidth={2}
          opacity={0.8}
        >
          <animate
            attributeName="opacity"
            values="0.4;1;0.4"
            dur="1.5s"
            repeatCount="indefinite"
          />
        </circle>
      )}

      {/* Background circle */}
      <circle
        cx={halfSize}
        cy={halfSize}
        r={halfSize}
        fill={bgColor}
        stroke="#000"
        strokeWidth={1.5}
      />

      {/* Plane silhouette */}
      <g transform={`translate(${halfSize}, ${halfSize}) scale(${size / 40})`}>
        <path
          d="M0,-12 L3,-6 L12,-2 L12,0 L3,2 L2,8 L6,10 L6,12 L0,10 L-6,12 L-6,10 L-2,8 L-3,2 L-12,0 L-12,-2 L-3,-6 Z"
          fill={textColor}
          opacity={0.9}
        />
      </g>
    </g>
  );
}
