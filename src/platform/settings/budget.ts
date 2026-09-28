/* ==========================================================================
   How many wrong answers a question allows before its answer is shown, and
   the other per-answer rules of the `feedback` settings section.

   Pure and shared: the practice modal decides with these when to reveal an
   answer and requeue the question, and the server caps the score of a
   question solved after its answer was shown with `revealCap` - so the XP a
   learner sees first is the XP the server pays.
   ========================================================================== */
import type { ActivityContext, Challenge, LearningMode } from '@/types';
import type { AnswerChallengeType, FeedbackNoteContext, FeedbackSettings, ReviewSettings } from './types';

/**
 * The defaults. Single-choice kinds allow two tries (the second wrong one
 * shows the answer); the kinds with more to get right allow three. Learn mode
 * explains straight away.
 */
export const DEFAULT_FEEDBACK_SETTINGS: FeedbackSettings = {
  attemptsBeforeReveal: {
    practice: { quiz: 2, output_prediction: 2, multi_select: 3, fill_blank: 3, pseudocode_order: 3 },
    learn: 1
  },
  showWrongAnswerNotes: { learn: true, practice: true, review: true },
  stageTestWrongAnswerNotes: false,
  // What session/rules.ts's SOLUTION_AFTER_FAILED_RUNS was.
  solutionAfterFailedRuns: 2,
  learnOpensReading: true,
  requeue: {
    enabled: true,
    maxRounds: 2,
    maxScoreAfterReveal: { learn: 80, practice: 60 }
  }
};

/** The kinds with an attempt budget, in admin display order. */
export const ANSWER_CHALLENGE_TYPES: AnswerChallengeType[] = ['quiz', 'output_prediction', 'multi_select', 'fill_blank', 'pseudocode_order'];

/** Contexts that grade what the learner already knows: no budget, the answer is never shown. */
const TEST_CONTEXTS: ReadonlySet<string> = new Set(['test', 'assessment']);

/** The settings the budget reads: the feedback section, and the Practice-session (review) one. */
export interface BudgetSettings {
  feedback: FeedbackSettings;
  /** The Practice-session rules: `review.attemptsBeforeReveal` (default 1). */
  review: Pick<ReviewSettings, 'attemptsBeforeReveal'>;
}

type BudgetChallenge = Pick<Challenge, 'type' | 'options' | 'blanks' | 'isStageTest'>;

function wholeAtLeastOne(value: unknown, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) && n >= 1 ? Math.floor(n) : fallback;
}

/**
 * How many wrong answers this question allows before the answer is shown -
 * the answer shows WITH the last one. `Infinity` means never: a stage test,
 * a test or assessment context, and code questions (they offer their
 * solution after failed runs instead, `solutionAfterFailedRuns`).
 *
 *   - Learn mode: `attemptsBeforeReveal.learn` (1 - explain straight away).
 *   - Practice mode (or no choice yet): the per-kind number.
 *   - A Practice session (review): `review.attemptsBeforeReveal` (default 1).
 *   - A single-choice question never allows more than its options minus one,
 *     so the last option left is never a free answer; one dropdown blank
 *     likewise allows at most its choices minus one.
 *   - Always at least 1.
 */
export function effectiveAttemptBudget(
  challenge: BudgetChallenge,
  context: ActivityContext,
  learningMode: LearningMode | null,
  settings: BudgetSettings
): number {
  if (challenge.isStageTest || TEST_CONTEXTS.has(context)) return Infinity;
  const type = challenge.type as AnswerChallengeType;
  if (!ANSWER_CHALLENGE_TYPES.includes(type)) return Infinity;

  const rules = settings.feedback.attemptsBeforeReveal;
  let budget =
    context === 'review'
      ? wholeAtLeastOne(settings.review.attemptsBeforeReveal, 1)
      : learningMode === 'learn'
        ? wholeAtLeastOne(rules.learn, 1)
        : wholeAtLeastOne(rules.practice[type], 3);

  if (type === 'quiz' || type === 'output_prediction') {
    budget = Math.min(budget, (challenge.options?.length ?? 2) - 1);
  } else if (type === 'fill_blank') {
    const blanks = challenge.blanks ?? [];
    const only = blanks.length === 1 ? blanks[0] : null;
    if (only?.choices && only.choices.length >= 2) budget = Math.min(budget, only.choices.length - 1);
  }
  return Math.max(1, budget);
}

/** Which switch of `showWrongAnswerNotes` applies: a Practice session, else the learning mode. */
export function noteContextFor(context: ActivityContext, learningMode: LearningMode | null): FeedbackNoteContext {
  if (context === 'review') return 'review';
  return learningMode === 'learn' ? 'learn' : 'practice';
}

/**
 * May a wrong answer's note ("why this is wrong") be shown? On an
 * answer-graded stage test only with `stageTestWrongAnswerNotes` - and even
 * then the right answer itself never is.
 */
export function wrongAnswerNotesAllowed(
  challenge: Pick<Challenge, 'isStageTest'>,
  context: ActivityContext,
  learningMode: LearningMode | null,
  feedback: FeedbackSettings
): boolean {
  if (challenge.isStageTest || TEST_CONTEXTS.has(context)) return feedback.stageTestWrongAnswerNotes;
  return feedback.showWrongAnswerNotes[noteContextFor(context, learningMode)] !== false;
}

/**
 * The highest score a question solved after its answer was shown can get,
 * by learning mode (no choice counts as Practice, the stricter one). The
 * server applies the same cap (server/progress-rules.js), so the optimistic
 * XP matches what is paid.
 */
export function revealCap(learningMode: LearningMode | null | undefined, feedback: FeedbackSettings): number {
  const caps = feedback.requeue.maxScoreAfterReveal;
  const cap = Number(learningMode === 'learn' ? caps.learn : caps.practice);
  return Number.isFinite(cap) ? Math.max(0, Math.min(100, cap)) : 100;
}
