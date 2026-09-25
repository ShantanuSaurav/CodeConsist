/**
 * What a practice session may show a learner about the answer.
 *
 * Pure, so the rules can be tested without the modal. The one rule today: a
 * stage test - or anything taken as a test - never shows its answer. Not the
 * "Expected:" blanks, not the correct option, not the correct order, not the
 * worked solution. The C and C++ stage tests are fill-blank questions, so a
 * first wrong check used to print the answer and the retry then passed.
 */
import type { Challenge } from '@/types';
import type { PracticeMode } from './PracticeSessionProvider';

/**
 * Where a question is being answered. Mirrors the `context` field the solve
 * and activity routes will carry; `assessment` is placement and test-out.
 */
export type AnswerContext = 'lesson' | 'test' | 'review' | 'library' | 'assessment';

/** The context a practice-session mode puts its questions in. */
export function contextForMode(mode: PracticeMode): AnswerContext {
  return mode === 'test' ? 'test' : 'lesson';
}

/** Contexts that grade what the learner already knows, so they never give the answer away. */
const TEST_CONTEXTS: ReadonlySet<AnswerContext> = new Set<AnswerContext>(['test', 'assessment']);

/**
 * May a wrong answer be followed by the right one - the expected blanks, the
 * correct option, the correct order, the explanation?
 */
export function revealsAnswers(context: AnswerContext, challenge: Pick<Challenge, 'isStageTest'>): boolean {
  return !challenge.isStageTest && !TEST_CONTEXTS.has(context);
}

/** Failed runs before "Show me the solution" is offered on a code lesson. */
export const SOLUTION_AFTER_FAILED_RUNS = 2;

export interface RevealSolutionInput {
  challenge: Pick<Challenge, 'isStageTest' | 'solutionCode'>;
  context: AnswerContext;
  isCorrect: boolean;
  /** Runs so far on this challenge. */
  attempts: number;
}

/**
 * May the "Show me the solution" button appear? Only on a lesson that has a
 * solution, after the learner has genuinely tried and is still failing - and
 * never on a stage test or in a test context, whatever the attempt count.
 */
export function canRevealSolution({ challenge, context, isCorrect, attempts }: RevealSolutionInput): boolean {
  if (!revealsAnswers(context, challenge)) return false;
  return !isCorrect && attempts >= SOLUTION_AFTER_FAILED_RUNS && Boolean(challenge.solutionCode);
}
