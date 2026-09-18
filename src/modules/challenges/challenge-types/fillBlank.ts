import { checkBlank } from '@/platform/grading-engine/grading';
import { FillBlankChallenge } from './FillBlankChallenge';
import type { AnswerTypeDefinition } from './types';

export const fillBlank: AnswerTypeDefinition = {
  type: 'fill_blank',
  kind: 'answer',
  label: 'Fill in the blanks',
  wide: false,
  // The inputs live inside the snippet, so the renderer draws it.
  rendersSnippet: true,
  supportsNumberKeys: false,
  Renderer: FillBlankChallenge,
  emptyAnswer: (c) => (c.blanks ?? []).map(() => ''),
  isComplete: (_c, answer) => Array.isArray(answer) && (answer as string[]).every((v) => String(v).trim().length > 0),
  check: (c, answer) => {
    const blanks = c.blanks ?? [];
    const given = (answer as string[]) ?? [];
    return (
      given.length === blanks.length &&
      blanks.every((b, i) => checkBlank(String(given[i] ?? ''), b.answer, b.alternatives ?? []))
    );
  },
  wrongPositions: (c, answer) => {
    const blanks = c.blanks ?? [];
    const given = (answer as string[]) ?? [];
    return blanks
      .map((b, i) => (checkBlank(String(given[i] ?? ''), b.answer, b.alternatives ?? []) ? -1 : i))
      .filter((i) => i >= 0);
  }
};
