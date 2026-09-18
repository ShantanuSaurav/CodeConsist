/**
 * Shared helpers for capturing answers: the Answer shape and the seeded
 * shuffles that decide what a learner sees. The per-type rules (is it
 * complete, is it right) live with each type in
 * modules/challenges/challenge-types and are dispatched through its registry.
 *
 * Client-side checking is for instant feedback, not trust. When signed in the
 * submitted answer goes with the solve and POST /api/progress/solve re-checks
 * it before paying any XP; a disagreement is a 422 and the local award is
 * rolled back.
 */
import { Challenge } from '@/types';

/** One shape per challenge type: index, index list, blank strings, or line order. */
export type Answer = number | number[] | string[] | null;

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
