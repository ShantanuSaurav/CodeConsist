/**
 * Every challenge type the app can render and grade, in one table.
 *
 * Adding a type is one definition file plus one line here; the practice
 * modal, the keyboard shortcuts and the answer helpers below all read the
 * table instead of switching on `challenge.type`. The `satisfies` clause makes
 * a missing entry a compile error the moment ChallengeType grows.
 */
import type { Challenge, ChallengeType } from '@/types';
import type { Answer } from '@/platform/grading-engine/answers';
import type { AnswerTypeDefinition, ChallengeTypeDefinition } from './types';
import { quiz, outputPrediction, multiSelect } from './options';
import { fillBlank } from './fillBlank';
import { pseudocodeOrder } from './pseudocodeOrder';
import { codeRunner, debug } from './code';

export const CHALLENGE_TYPES = {
  quiz,
  output_prediction: outputPrediction,
  multi_select: multiSelect,
  fill_blank: fillBlank,
  pseudocode_order: pseudocodeOrder,
  code_runner: codeRunner,
  debug
} as const satisfies Record<ChallengeType, ChallengeTypeDefinition>;

export function definitionFor(challenge: Pick<Challenge, 'type'>): ChallengeTypeDefinition {
  return CHALLENGE_TYPES[challenge.type];
}

export function isCodeChallenge(challenge: Pick<Challenge, 'type'>): boolean {
  return definitionFor(challenge).kind === 'code';
}

/** Header label for a challenge's type. */
export function typeLabel(challenge: Pick<Challenge, 'type'>): string {
  return definitionFor(challenge).label;
}

const answerDef = (challenge: Challenge): AnswerTypeDefinition | null => {
  const def = definitionFor(challenge);
  return def.kind === 'answer' ? def : null;
};

/* Answer helpers - the old switch statements, now table lookups. */

export function emptyAnswer(challenge: Challenge): Answer {
  return answerDef(challenge)?.emptyAnswer(challenge) ?? null;
}

export function isAnswerComplete(challenge: Challenge, answer: Answer): boolean {
  return answerDef(challenge)?.isComplete(challenge, answer) ?? false;
}

export function checkAnswer(challenge: Challenge, answer: Answer): boolean {
  return answerDef(challenge)?.check(challenge, answer) ?? false;
}

export function wrongPositions(challenge: Challenge, answer: Answer): number[] {
  return answerDef(challenge)?.wrongPositions(challenge, answer) ?? [];
}
