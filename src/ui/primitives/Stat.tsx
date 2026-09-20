import React from 'react';

interface StatProps {
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
  className?: string;
}

/** Label / figure / footnote. Lay several out in a row with dividers - not one card each. */
export const Stat: React.FC<StatProps> = ({ label, value, hint, className = '' }) => (
  <div className={`stat ${className}`.trim()}>
    <span className="stat-label">{label}</span>
    <span className="stat-value">{value}</span>
    {hint && <span className="stat-hint">{hint}</span>}
  </div>
);
