/**
 * Client-side answer checking for the non-code challenge types.
 *
 * This is for instant feedback, not trust. When signed in, the submitted
 * answer is sent with the solve and POST /api/progress/solve re-checks it with
 * the same rules before paying any XP; a disagreement is a 422 and the local
 * award is rolled back. (For a while the comment here claimed that and the
 * server did no such thing - see the git history.)
 */
import { Challenge } from '../types';
import { checkBlank, sameSet } from './grading';

/** One shape per challenge type: index, index list, blank strings, or line order. */
export type Answer = number | number[] | string[] | null;

export function emptyAnswer(challenge: Challenge): Answer {
  switch (challenge.type) {
    case 'multi_select':
      return [] as number[];
    case 'fill_blank':
      return (challenge.blanks ?? []).map(() => '');
    case 'pseudocode_order':
      return shuffleLines(challenge);
    default:
      return null;
  }
}

export function isAnswerComplete(challenge: Challenge, answer: Answer): boolean {
  switch (challenge.type) {
    case 'quiz':
    case 'output_prediction':
      return typeof answer === 'number';
    case 'multi_select':
      return Array.isArray(answer) && answer.length > 0;
    case 'fill_blank':
      return Array.isArray(answer) && (answer as string[]).every((v) => String(v).trim().length > 0);
    case 'pseudocode_order':
      return Array.isArray(answer) && answer.length === (challenge.pseudocodeLines ?? []).length;
    default:
      return false;
  }
}

export function checkAnswer(challenge: Challenge, answer: Answer): boolean {
  switch (challenge.type) {
    case 'quiz':
    case 'output_prediction':
      return answer === challenge.correctIndex;

    case 'multi_select':
      return Array.isArray(answer) && sameSet(answer as number[], challenge.correctIndices ?? []);

    case 'fill_blank': {
      const blanks = challenge.blanks ?? [];
      const given = (answer as string[]) ?? [];
      return (
        given.length === blanks.length &&
        blanks.every((b, i) => checkBlank(String(given[i] ?? ''), b.answer, b.alternatives ?? []))
      );
    }

    case 'pseudocode_order': {
      const correct = challenge.pseudocodeLines ?? [];
      const given = (answer as string[]) ?? [];
      return given.length === correct.length && given.every((line, i) => line === correct[i]);
    }

    default:
      return false;
  }
}

/** Which blanks or lines are wrong, so feedback can point at them. */
export function wrongPositions(challenge: Challenge, answer: Answer): number[] {
  if (challenge.type === 'fill_blank') {
    const blanks = challenge.blanks ?? [];
    const given = (answer as string[]) ?? [];
    return blanks
      .map((b, i) => (checkBlank(String(given[i] ?? ''), b.answer, b.alternatives ?? []) ? -1 : i))
      .filter((i) => i >= 0);
  }
  if (challenge.type === 'pseudocode_order') {
    const correct = challenge.pseudocodeLines ?? [];
    const given = (answer as string[]) ?? [];
    return given.map((line, i) => (line === correct[i] ? -1 : i)).filter((i) => i >= 0);
  }
  return [];
}

/* ---------------------------------------------------------------- shuffling */

/** xmur3 - a tiny string hash, so a challenge always shuffles the same way. */
function seedFrom(text: string): () => number {
  let h = 1779033703 ^ text.length;
  for (let i = 0; i < text.length; i++) {
    h = Math.imul(h ^ text.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return () => {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  };
}

/**
 * Shuffle a challenge's pseudocode lines.
 *
 * Deterministic per challenge id so the order does not jump around between
 * renders, and guaranteed not to hand back the correct order.
 */
export function shuffleLines(challenge: Challenge): string[] {
  const lines = [...(challenge.pseudocodeLines ?? [])];
  if (lines.length < 2) return lines;

  const random = seedFrom(challenge.id);
  for (let i = lines.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [lines[i], lines[j]] = [lines[j], lines[i]];
  }

  // A shuffle that happens to be the identity would give the answer away.
  const unchanged = lines.every((line, i) => line === challenge.pseudocodeLines?.[i]);
  if (unchanged) lines.push(lines.shift() as string);

  return lines;
}

/**
 * The order to DISPLAY a challenge's options in, as original indices.
 *
 * Authors overwhelmingly write the correct answer first - across this bank 87%
 * of single-answer challenges had it at index 0, which makes "always pick A" a
 * winning strategy. Shuffling at render time fixes every challenge at once and
 * keeps working for content added later.
 *
 * Only the presentation moves: answers are still stored and graded as original
 * indices, so `checkAnswer` and the server's verification need no knowledge of it.
 * The permutation is seeded from the challenge id, so it is stable across
 * re-renders and identical for every learner.
 */
export function optionOrder(challenge: Challenge): number[] {
  const count = challenge.options?.length ?? 0;
  const order = Array.from({ length: count }, (_, i) => i);
  if (count < 2) return order;

  const random = seedFrom(`${challenge.id}:options`);
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  return order;
}

/**
 * Display order for one blank's choice chips. Same reasoning as optionOrder:
 * authors put the answer first (92% of blanks in this bank), and the dropdown
 * rendered them verbatim, so "pick the first entry" solved most of them.
 * Choices are compared by TEXT, so no index mapping is needed - only the order
 * moves. Seeded per blank so it is stable and identical for every learner.
 */
export function choiceOrder(challenge: Challenge, blankIndex: number, choices: string[]): string[] {
  if (choices.length < 2) return choices;
  const order = choices.slice();
  const random = seedFrom(`${challenge.id}:blank:${blankIndex}`);
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  return order;
}

export function moveItem<T>(items: T[], from: number, to: number): T[] {
  if (from === to || from < 0 || to < 0 || from >= items.length || to >= items.length) return items;
  const next = [...items];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
}
