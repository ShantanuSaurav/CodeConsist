import React from 'react';
import { Link } from 'react-router-dom';
import { GenericSection } from './GenericSection';
import type { SectionProps } from './GenericSection';

/**
 * Answer feedback & retries: the generic fields, with what the numbers mean
 * for one question at the values being edited, and the way to the notes
 * themselves (written per question on the Answer feedback page).
 */
export const FeedbackSection: React.FC<SectionProps> = (props) => {
  const feedback = props.draft.feedback;
  const quiz = feedback.attemptsBeforeReveal.practice.quiz;
  const learn = feedback.attemptsBeforeReveal.learn;
  const rounds = feedback.requeue.enabled ? feedback.requeue.maxRounds : 0;
  const tries = (n: number) => `${n} ${n === 1 ? 'try' : 'tries'}`;
  return (
    <div>
      <p className="text-sm text-fg-secondary mb-4" data-testid="feedback-example">
        {`A four-option quiz in Practice mode shows its answer after ${tries(Math.min(quiz, 3))}, in Learn mode after ${tries(Math.min(learn, 3))}. `}
        {rounds > 0
          ? `A question whose answer was shown comes back at the end of the unit, at most ${rounds === 1 ? 'once' : `${rounds} times`}, and then pays at most ${feedback.requeue.maxScoreAfterReveal.practice}% of its XP in Practice mode (${feedback.requeue.maxScoreAfterReveal.learn}% in Learn mode).`
          : 'Missed questions do not come back within the unit; they stay unsolved until the learner returns.'}{' '}
        <Link to="/admin/feedback" className="link-btn">
          Write the wrong-answer notes
        </Link>
      </p>
      <GenericSection {...props} />
    </div>
  );
};
