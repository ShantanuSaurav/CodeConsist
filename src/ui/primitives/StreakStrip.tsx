import React from 'react';

/** What one day of the streak was. The same states as the habits engine's `streakStrip`. */
export type StreakStripState = 'active' | 'frozen' | 'repaired' | 'missed' | 'today' | 'none';

export interface StreakStripDay {
  /** yyyy-mm-dd */
  day: string;
  state: StreakStripState;
}

const WORDS: Record<StreakStripState, string> = {
  active: 'practiced',
  frozen: 'covered by a streak freeze',
  repaired: 'repaired',
  missed: 'missed',
  today: 'today, not practiced yet',
  none: 'before your first lesson'
};

interface StreakStripProps {
  days: StreakStripDay[];
  /** How a day is written in the tooltips and the summary; the key itself when left out. */
  formatDay?: (day: string) => string;
  /** Square size in px. */
  size?: number;
  /** Show the legend under the strip. */
  legend?: boolean;
  className?: string;
}

/**
 * The last days of a streak as a row of squares: practiced, covered by a
 * freeze, repaired, missed, today. Screen readers get one summary sentence;
 * each square has a tooltip. Props only.
 */
export const StreakStrip: React.FC<StreakStripProps> = ({ days, formatDay = (d) => d, size = 14, legend = false, className = '' }) => {
  const count = (state: StreakStripState) => days.filter((d) => d.state === state).length;
  const summary = [
    `${count('active')} of the last ${days.length} days practiced`,
    count('frozen') ? `${count('frozen')} covered by a freeze` : '',
    count('repaired') ? `${count('repaired')} repaired` : '',
    count('missed') ? `${count('missed')} missed` : ''
  ]
    .filter(Boolean)
    .join(', ');
  return (
    <div className={`streak-strip ${className}`.trim()}>
      <div className="streak-strip-row" role="img" aria-label={`${summary}.`}>
        {days.map((d) => (
          <span
            key={d.day}
            className={`streak-strip-cell is-${d.state}`}
            style={{ width: size, height: size }}
            title={`${formatDay(d.day)}: ${WORDS[d.state]}`}
          />
        ))}
      </div>
      {legend && (
        <div className="streak-strip-legend" aria-hidden="true">
          {(['active', 'frozen', 'repaired', 'missed'] as const).map((state) => (
            <span key={state}>
              <span className={`streak-strip-cell is-${state}`} style={{ width: 10, height: 10 }} /> {state === 'active' ? 'Practiced' : state === 'frozen' ? 'Freeze' : state === 'repaired' ? 'Repaired' : 'Missed'}
            </span>
          ))}
        </div>
      )}
    </div>
  );
};
