import React from 'react';
import { Check, RotateCcw, X } from 'lucide-react';

/**
 * The line under a checked answer: right or not, what it paid, and - once
 * the answer is known - why. A wrong answer before the last try only says
 * "have another look" (the note under the learner's own pick says why that
 * one is wrong); the explanation, which gives the answer away, waits until
 * the answer is shown. A stage test never explains a wrong answer.
 *
 * Announced to screen readers (role="status") every time it changes.
 */
export interface FeedbackBannerProps {
  isCorrect: boolean;
  /** Correct, but a code lesson took too many tries or hints to count: retry it. */
  failedPassScore: number | null;
  passScore: number;
  /** Correct, but an answer took too much help on its first pass: it comes back at the end. */
  belowPassRequeue: boolean;
  firstTry: boolean;
  /** What the solve paid, once known (the server's figure when it answered). */
  awarded: { xp: number; score: number } | null;
  /** The question was solved on an earlier visit (it pays nothing again). */
  alreadySolved: boolean;
  xpReward: number;
  uiPreview: boolean;
  /** The answer is shown now (tries used up). */
  revealed: boolean;
  /** What happens to a revealed question: it comes back at the end of the unit, or later. */
  revealedNext: 'requeue' | 'later' | null;
  /** What the run is called where a missed question comes back: a unit, or a Practice session. */
  runLabel?: 'unit' | 'session';
  /**
   * A Practice session (review): what the answer paid instead of a solve's
   * score - its XP, or that today's Practice XP limit is reached.
   */
  practice?: { xp: number; capped: boolean; pending?: boolean } | null;
  /** Wrong answers still allowed before the answer is shown (Infinity: no limit). */
  triesLeft: number;
  /** May the explanation show for a wrong answer at all (never on a test)? */
  mayExplain: boolean;
  /** Code lessons: explain after a failed run (Learn mode, or from the second run). */
  explainCodeFailure: boolean;
  learnMode: boolean;
  /** The single option the learner picked, for "You answered ...". */
  pickedText: string | null;
  explanation: string;
}

export const FeedbackBanner: React.FC<FeedbackBannerProps> = ({
  isCorrect,
  failedPassScore,
  passScore,
  belowPassRequeue,
  firstTry,
  awarded,
  alreadySolved,
  xpReward,
  uiPreview,
  revealed,
  revealedNext,
  runLabel = 'unit',
  practice = null,
  triesLeft,
  mayExplain,
  explainCodeFailure,
  learnMode,
  pickedText,
  explanation
}) => {
  const heading = isCorrect
    ? failedPassScore !== null
      ? 'Correct, but not passed.'
      : belowPassRequeue
        ? 'Correct - with a lot of help.'
        : firstTry
          ? 'Correct, first try!'
          : 'Correct!'
    : revealed
      ? 'Not quite - here is the answer.'
      : 'Not quite.';

  let body: React.ReactNode;
  if (failedPassScore !== null) {
    body = <span>That took too many tries or hints to count. The lesson is not marked done - retry it for a fresh attempt.</span>;
  } else if (belowPassRequeue) {
    body = <span>That took too many tries or hints to count yet, so this question comes back at the end of the unit for one more go.</span>;
  } else if (isCorrect) {
    body = <span>{explanation}</span>;
  } else if (mayExplain && (revealed || explainCodeFailure)) {
    body = (
      <>
        {learnMode && pickedText && <span>You answered "{pickedText}". </span>}
        <span>{explanation}</span>
        {revealed && revealedNext === 'requeue' && <span className="feedback-next"> This question comes back at the end of the {runLabel}.</span>}
        {revealed && revealedNext === 'later' && <span className="feedback-next"> It will be waiting for you next time.</span>}
      </>
    );
  } else {
    body = (
      <span>
        Have another look.
        {Number.isFinite(triesLeft) && triesLeft > 0 && mayExplain ? ` ${triesLeft === 1 ? 'One more try' : `${triesLeft} more tries`} before the answer is shown.` : ''}
      </span>
    );
  }

  return (
    <div className={`feedback-banner ${isCorrect ? 'correct' : 'incorrect'}`} role="status">
      <span className="feedback-icon" aria-hidden="true">
        {isCorrect ? belowPassRequeue ? <RotateCcw size={12} strokeWidth={3} /> : <Check size={12} strokeWidth={3} /> : <X size={12} strokeWidth={3} />}
      </span>
      <div className="feedback-content">
        <div className="feedback-heading-row">
          <strong>{heading}</strong>
          {isCorrect && failedPassScore !== null && (
            <div className="feedback-points-cluster">
              <span className="feedback-score-pill">
                Score: {failedPassScore}% · pass mark {passScore}%
              </span>
            </div>
          )}
          {isCorrect && failedPassScore === null && !belowPassRequeue && practice && (
            <div className="feedback-points-cluster">
              {practice.pending ? null : practice.xp > 0 ? (
                <span className="feedback-xp-pill">+{practice.xp} XP</span>
              ) : (
                <span className="feedback-score-pill is-subtle">{practice.capped ? 'Daily Practice XP limit reached' : 'Practised today already'}</span>
              )}
            </div>
          )}
          {isCorrect && failedPassScore === null && !belowPassRequeue && !practice && (
            <div className="feedback-points-cluster">
              {awarded && awarded.xp > 0 ? (
                <>
                  <span className="feedback-xp-pill">+{awarded.xp} XP</span>
                  <span className="feedback-score-pill">Score: {awarded.score}%</span>
                </>
              ) : alreadySolved ? (
                <span className="feedback-score-pill is-subtle">Solved before · Practice complete</span>
              ) : awarded ? (
                <span className="feedback-score-pill">Score: {awarded.score}%</span>
              ) : (
                <span className="feedback-xp-pill">+{xpReward} XP</span>
              )}
              {uiPreview && <span className="feedback-assessment-pill">Frontend Assessment</span>}
            </div>
          )}
        </div>
        {body}
      </div>
    </div>
  );
};
