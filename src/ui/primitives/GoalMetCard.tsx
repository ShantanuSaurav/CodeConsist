import React, { useEffect, useRef } from 'react';
import { Target } from 'lucide-react';

interface GoalMetCardProps {
  title: string;
  body: string;
  /** Bonus XP the goal paid, shown as "+10 XP"; nothing when 0. */
  bonusXp?: number;
  moreLabel: string;
  doneLabel: string;
  /** Keep going (the card goes away). */
  onMore: () => void;
  /** Stop for today (the lesson closes). */
  onDone: () => void;
  /** Move the keyboard to "One more" when the card appears. */
  autoFocus?: boolean;
  className?: string;
}

/**
 * "Daily goal met - one more?": shown in a lesson the moment the goal is
 * met. Every word comes in as a prop (the admin's reminder copy). Props only.
 */
export const GoalMetCard: React.FC<GoalMetCardProps> = ({ title, body, bonusXp = 0, moreLabel, doneLabel, onMore, onDone, autoFocus = false, className = '' }) => {
  const moreRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (autoFocus) moreRef.current?.focus({ preventScroll: true });
  }, [autoFocus]);
  return (
    <div className={`goal-met-card ${className}`.trim()} role="status">
      <span className="goal-met-icon" aria-hidden="true">
        <Target size={18} />
      </span>
      <div className="goal-met-text">
        <div className="goal-met-title">
          {title}
          {bonusXp > 0 && <span className="goal-met-bonus">+{bonusXp} XP</span>}
        </div>
        {body && <p className="goal-met-body">{body}</p>}
      </div>
      <div className="goal-met-actions">
        <button type="button" className="btn btn-secondary" onClick={onDone}>
          {doneLabel}
        </button>
        <button ref={moreRef} type="button" className="btn btn-primary" onClick={onMore}>
          {moreLabel}
        </button>
      </div>
    </div>
  );
};
