import React from 'react';
import { Flame } from 'lucide-react';

interface StreakFlameProps {
  /** Days in a row. */
  streak: number;
  /** The streak went up just now: the flame flares (not with reduced motion). */
  increased?: boolean;
  /** Icon size in px. */
  size?: number;
  /** Text beside the flame; the plain count when omitted. */
  label?: React.ReactNode;
  className?: string;
}

/**
 * The day streak as a flame and a number. Props only; the flare is a CSS
 * animation that `prefers-reduced-motion` switches off (components.css).
 */
export const StreakFlame: React.FC<StreakFlameProps> = ({ streak, increased = false, size = 18, label, className = '' }) => (
  <span
    className={`streak-flame ${streak > 0 ? 'is-lit' : ''} ${increased ? 'is-rising' : ''} ${className}`.replace(/\s+/g, ' ').trim()}
  >
    <Flame size={size} aria-hidden="true" />
    <span className="streak-flame-count">{label ?? streak}</span>
  </span>
);
