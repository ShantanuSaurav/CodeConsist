import React from 'react';

interface ProgressBarProps {
  /** 0-100. Clamped. */
  value: number;
  tone?: 'accent' | 'success' | 'info' | 'neutral';
  size?: 'sm' | 'md';
  label?: string;
  /** The id of a visible heading that names the bar, in place of `label`. */
  labelledBy?: string;
  className?: string;
}

/** A single bar. Pair it with a "12 / 15" figure rather than a percentage when the count is what matters. */
export const ProgressBar: React.FC<ProgressBarProps> = ({ value, tone = 'accent', size = 'md', label, labelledBy, className = '' }) => {
  const pct = Math.max(0, Math.min(100, Math.round(value)));
  return (
    <span
      className={`progress ${size === 'sm' ? 'progress-sm' : ''} ${className}`.replace(/\s+/g, ' ').trim()}
      role="progressbar"
      aria-valuenow={pct}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label}
      aria-labelledby={labelledBy}
    >
      <span className={`progress-fill ${tone === 'accent' ? '' : `is-${tone}`}`.trim()} style={{ width: `${pct}%` }} />
    </span>
  );
};
