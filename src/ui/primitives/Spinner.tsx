import React from 'react';

interface SpinnerProps {
  /** Diameter in px. */
  size?: number;
  /** What is loading, read out by screen readers. */
  label?: string;
  className?: string;
}

/**
 * A busy ring in the current text colour - Button's `loading` ring, at any
 * size. A status region, so the label is announced.
 */
export const Spinner: React.FC<SpinnerProps> = ({ size = 16, label = 'Loading', className = '' }) => (
  <span role="status" className={`inline-flex ${className}`.trim()}>
    <span className="spinner" style={{ width: size, height: size }} aria-hidden="true" />
    <span className="sr-only">{label}</span>
  </span>
);
