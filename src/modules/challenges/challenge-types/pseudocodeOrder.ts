import { shuffleLines } from '@/platform/grading-engine/answers';
import { PseudocodeOrderChallenge } from './PseudocodeOrderChallenge';
import type { AnswerTypeDefinition } from './types';

export const pseudocodeOrder: AnswerTypeDefinition = {
  type: 'pseudocode_order',
  kind: 'answer',
  label: 'Order the steps',
  wide: false,
  rendersSnippet: false,
  supportsNumberKeys: false,
  Renderer: PseudocodeOrderChallenge,
  // Starts scrambled - deterministically per challenge, never in the right order.
  emptyAnswer: (c) => shuffleLines(c),
  isComplete: (c, answer) => Array.isArray(answer) && answer.length === (c.pseudocodeLines ?? []).length,
  check: (c, answer) => {
    const correct = c.pseudocodeLines ?? [];
    const given = (answer as string[]) ?? [];
    return given.length === correct.length && given.every((line, i) => line === correct[i]);
  },
  wrongPositions: (c, answer) => {
    const correct = c.pseudocodeLines ?? [];
    const given = (answer as string[]) ?? [];
    return given.map((line, i) => (line === correct[i] ? -1 : i)).filter((i) => i >= 0);
  }
};
