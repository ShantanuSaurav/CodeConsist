import React from 'react';

interface StatProps {
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
  /** 'sm' sets a smaller figure, for a row too dense for the full size. */
  size?: 'sm' | 'md';
  className?: string;
}

/** Label / figure / footnote. Lay several out in a row with dividers - not one card each. */
export const Stat: React.FC<StatProps> = ({ label, value, hint, size = 'md', className = '' }) => (
  <div className={`stat ${size === 'sm' ? 'stat-sm' : ''} ${className}`.replace(/\s+/g, ' ').trim()}>
    <span className="stat-label">{label}</span>
    <span className="stat-value">{value}</span>
    {hint && <span className="stat-hint">{hint}</span>}
  </div>
);
