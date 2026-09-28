import React from 'react';
import { GenericSection } from './GenericSection';
import type { SectionProps } from './GenericSection';

const days = (n: number) => `${n} ${n === 1 ? 'day' : 'days'}`;

/**
 * Practice sessions: the generic fields, with what the schedule and the XP
 * mean at the values being edited - how far apart a question comes back,
 * where a missed one drops to, and the most a day of Practice can pay.
 */
export const ReviewSection: React.FC<SectionProps> = (props) => {
  const review = props.draft.review;
  const intervals = Array.isArray(review.intervalsDays) ? review.intervalsDays : [];
  const boxAt = (box: number) => intervals[Math.min(Math.max(0, box), Math.max(0, intervals.length - 1))];
  const reset = boxAt(review.wrongResetsToBox);
  const firstTry = boxAt(review.initialBox.clean);
  return (
    <div>
      <p className="text-sm text-fg-secondary mb-4" data-testid="review-example">
        {review.enabled
          ? `Each clean answer spaces a question further out (${intervals.map((n) => days(n)).join(', ')}); a lesson solved first try is first due ${firstTry !== undefined ? `after ${days(firstTry)}` : 'soon'}, and a missed question comes back ${reset !== undefined ? `after ${days(reset)}` : 'soon'}. A session holds ${review.sessionSize.min}-${review.sessionSize.max} questions, pays ${review.xp.correctFirstTry} XP for a clean answer (${review.xp.correctAfterMiss} XP after a miss) and at most ${review.xp.dailyCap} XP a day.`
          : 'Practice sessions are off: learners see no Practice card, row or button.'}
      </p>
      <GenericSection {...props} />
    </div>
  );
};
