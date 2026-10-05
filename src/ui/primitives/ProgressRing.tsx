import React from 'react';

interface ProgressRingProps {
  /** Progress so far, in the same unit as `max`. */
  value: number;
  max: number;
  /** Outer size in px. */
  size?: number;
  /** Ring thickness in px. */
  stroke?: number;
  /** What the ring measures, for screen readers ("35 of 100 XP today"). */
  label: string;
  /** Shown in the middle (a number, an icon). */
  children?: React.ReactNode;
  className?: string;
  tone?: 'accent' | 'success' | 'warning';
  /** A soft accent glow, for the ring that is "current". */
  glow?: boolean;
}

/**
 * A circular progress meter. Props only; the fill eases with a CSS
 * transition, which `prefers-reduced-motion` turns off (components.css).
 */
export const ProgressRing: React.FC<ProgressRingProps> = ({ value, max, size = 44, stroke = 4, label, children, className = '', tone = 'accent', glow = false }) => {
  const safeMax = max > 0 ? max : 1;
  const fraction = Math.max(0, Math.min(1, (Number(value) || 0) / safeMax));
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  return (
    <span
      className={`progress-ring tone-${tone} ${glow ? 'is-glow' : ''} ${className}`.replace(/\s+/g, ' ').trim()}
      style={{ width: size, height: size }}
      role="img"
      aria-label={label}
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
        <circle className="progress-ring-track" cx={size / 2} cy={size / 2} r={radius} strokeWidth={stroke} fill="none" />
        <circle
          className="progress-ring-fill"
          cx={size / 2}
          cy={size / 2}
          r={radius}
          strokeWidth={stroke}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - fraction)}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </svg>
      {children !== undefined && <span className="progress-ring-center">{children}</span>}
    </span>
  );
};
