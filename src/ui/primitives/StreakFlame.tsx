import React from 'react';
import { Flame, Snowflake } from 'lucide-react';

/** How the streak stands today: counted, alive but not counted yet late in the day, kept by a freeze, or none. */
export type StreakFlameState = 'active' | 'atRisk' | 'frozen' | 'none';

interface StreakFlameProps {
  /** Days in a row. */
  streak: number;
  /** The streak went up just now: the flame flares (not with reduced motion). */
  increased?: boolean;
  /**
   * How it stands today; lit whenever there is a streak when left out.
   * 'frozen' shows a snowflake (a freeze covered the last missed day).
   */
  state?: StreakFlameState;
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
export const StreakFlame: React.FC<StreakFlameProps> = ({ streak, increased = false, state, size = 18, label, className = '' }) => {
  const shown: StreakFlameState = state ?? (streak > 0 ? 'active' : 'none');
  return (
    <span
      className={`streak-flame ${streak > 0 && shown !== 'none' ? 'is-lit' : ''} is-${shown} ${increased ? 'is-rising' : ''} ${className}`
        .replace(/\s+/g, ' ')
        .trim()}
    >
      {shown === 'frozen' ? <Snowflake size={size} aria-hidden="true" /> : <Flame size={size} aria-hidden="true" />}
      <span className="streak-flame-count">{label ?? streak}</span>
    </span>
  );
};
