import React from 'react';

interface BadgeTierChipProps {
  tierName: string;
  /** 0-based tier: picks the colour (bronze, silver, gold, platinum, diamond, then the last again). */
  tierIndex: number;
  size?: 'sm' | 'md';
  className?: string;
}

/** A small tier label ("Silver") in the tier's colour. Props only. */
export const BadgeTierChip: React.FC<BadgeTierChipProps> = ({ tierName, tierIndex, size = 'sm', className = '' }) => {
  if (!tierName) return null;
  const tier = Math.max(0, Math.min(4, Math.floor(tierIndex)));
  return <span className={`badge-tier-chip tier-${tier} size-${size} ${className}`.trim()}>{tierName}</span>;
};
