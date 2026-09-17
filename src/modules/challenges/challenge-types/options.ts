import type { ChallengeType } from '@/types';
import { sameSet } from '@/platform/grading-engine/grading';
import { OptionsChallenge } from './OptionsChallenge';
import type { AnswerTypeDefinition } from './types';

/** Single choice: quiz and "predict the output" share a renderer and a grader. */
const single = (type: ChallengeType, label: string): AnswerTypeDefinition => ({
  type,
  kind: 'answer',
  label,
  wide: false,
  rendersSnippet: false,
  supportsNumberKeys: true,
  Renderer: OptionsChallenge,
  emptyAnswer: () => null,
  isComplete: (_c, answer) => typeof answer === 'number',
  check: (c, answer) => answer === c.correctIndex,
  wrongPositions: () => []
});

export const quiz = single('quiz', 'Multiple choice');
export const outputPrediction = single('output_prediction', 'Predict the output');

export const multiSelect: AnswerTypeDefinition = {
  type: 'multi_select',
  kind: 'answer',
  label: 'Select all that apply',
  wide: false,
  rendersSnippet: false,
  supportsNumberKeys: true,
  Renderer: OptionsChallenge,
  emptyAnswer: () => [] as number[],
  isComplete: (_c, answer) => Array.isArray(answer) && answer.length > 0,
  check: (c, answer) => Array.isArray(answer) && sameSet(answer as number[], c.correctIndices ?? []),
  wrongPositions: () => []
};
