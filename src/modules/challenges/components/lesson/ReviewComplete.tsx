import React, { useEffect, useRef } from 'react';
import { Check, Dumbbell, Target } from 'lucide-react';
import { StreakFlame } from '@/ui';

/**
 * The end of a Practice session: the review XP it paid (or that today's
 * Practice XP limit is reached), how many questions were right first time,
 * the streak, and what to do next ("Practice again" when more are waiting,
 * "Back to the path").
 *
 * Every figure comes in as a prop; PracticeModal works them out from the run.
 */
export interface ReviewCompleteProps {
  /** Review XP paid in the session, the session bonus and any goal bonus included. */
  xp: number;
  /** Questions answered right in the session, of the questions it held. */
  correct: number;
  total: number;
  /** Right on the first try with no hint. */
  firstTry: number;
  /** Today's Practice XP limit was reached during (or before) the session. */
  capped: boolean;
  /** The session bonus it paid (0 when none). */
  bonusXp: number;
  streak: { before: number; after: number };
  /** "5-day streak" (`celebrations.copy.streakUp`), shown when the streak went up. */
  streakLine: string;
  /** "Daily goal met +10 XP" when an answer in the session met it. */
  goalLine?: string | null;
  /** Kept on this device for now (a guest, or offline): the server prices it on the next sync. */
  pendingSync: boolean;
  /** Once, on arrival: confetti and the sound, as the caller's settings allow. */
  onEnter?: () => void;
  actions: React.ReactNode;
}

const ReviewComplete: React.FC<ReviewCompleteProps> = ({
  xp,
  correct,
  total,
  firstTry,
  capped,
  bonusXp,
  streak,
  streakLine,
  goalLine = null,
  pendingSync,
  onEnter,
  actions
}) => {
  const entered = useRef(false);
  useEffect(() => {
    if (entered.current) return;
    entered.current = true;
    onEnter?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const streakUp = streak.after > streak.before;
  const accuracy = total > 0 ? Math.round((firstTry / total) * 100) : null;
  const xpLine = xp > 0 ? `+${xp} XP` : capped ? 'Daily Practice XP limit reached' : 'No XP this time';
  const summary = [
    'Practice complete.',
    `${correct} of ${total} right.`,
    xp > 0 ? `${xp} XP earned.` : capped ? 'Daily Practice XP limit reached.' : '',
    streakUp ? `${streakLine}.` : '',
    goalLine ? `${goalLine}.` : '',
    pendingSync ? 'Saved on this device, will sync.' : ''
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div className="celebration-view unit-complete review-complete">
      <p className="sr-only" role="status">
        {summary}
      </p>
      <div className="celebration-icon" aria-hidden="true">
        <Dumbbell size={20} />
      </div>
      <h2 className="celebration-title">Practice complete</h2>
      <p className="unit-complete-xp" aria-hidden="true">
        {xpLine}
      </p>
      {bonusXp > 0 && (
        <p className="unit-complete-perfect">
          <Check size={14} aria-hidden="true" /> Every question right: +{bonusXp} XP bonus
        </p>
      )}
      {xp > 0 && capped && <p className="unit-complete-retry">That is today's Practice XP limit. Practising more still counts for your streak.</p>}
      {goalLine ? (
        <p className="unit-complete-perfect is-goal">
          <Target size={14} aria-hidden="true" /> {goalLine}
        </p>
      ) : null}

      <div className="celebration-stats" aria-hidden="true">
        <div className="celebration-stat-box">
          <strong>
            {correct}/{total}
          </strong>
          <span>Right</span>
        </div>
        <div className="celebration-stat-box">
          <strong>{accuracy === null ? '—' : `${accuracy}%`}</strong>
          <span>First try</span>
        </div>
        <div className="celebration-stat-box">
          <strong>
            <StreakFlame streak={streak.after} increased={streakUp} size={16} />
          </strong>
          <span>{streakUp ? streakLine : 'Day streak'}</span>
        </div>
      </div>

      {pendingSync && <p className="unit-complete-sync">Saved on this device, will sync.</p>}

      <div className="celebration-actions">{actions}</div>
    </div>
  );
};

export default ReviewComplete;
