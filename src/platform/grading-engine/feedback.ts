/* ==========================================================================
   Feedback that teaches: the "why this is wrong" notes an author wrote for an
   option (`Challenge.optionFeedback`) or for a common wrong answer to a blank
   (`Blank.wrongAnswers`), picked out for what the learner actually answered.

   A wrong answer is explained without handing over the right one:
     - before the answer is revealed only the learner's own wrong picks get a
       note, and a note that would give the answer away (`feedbackLeaks`) is
       held back until the reveal;
     - a correct option's note ("why this is right") shows only once the
       answer is revealed (or the learner got it right).

   Pure and shared: the practice modal renders these, the admin pages and
   the content lint flag leaking notes with the same rule, and the server
   bundle carries it for the admin's warnings.
   ========================================================================== */
import type { Challenge, FeedbackNote } from '@/types';
import { checkBlank, normalizeBlank } from './grading';

export { wrongAnswerKeys } from './misses';

/** What the notes are read from. `type` is any string, so an admin row (typed loosely) can be checked too. */
type FeedbackChallenge = Pick<Challenge, 'title' | 'codeSnippet' | 'options' | 'correctIndex' | 'correctIndices' | 'optionFeedback' | 'blanks'> & {
  type: string;
};

/** The key of one note, for `feedbackLeaks`: `o<i>` for option i, `b<i>.<j>` for blank i's wrong answer j. */
export const optionNoteKey = (index: number): string => `o${index}`;
export const blankNoteKey = (blank: number, wrong: number): string => `b${blank}.${wrong}`;

function correctSetOf(c: FeedbackChallenge): Set<number> {
  if (c.type === 'multi_select') return new Set(c.correctIndices ?? []);
  return typeof c.correctIndex === 'number' ? new Set([c.correctIndex]) : new Set();
}

/**
 * Lower case, whitespace folded, quotes and punctuation that varies by
 * phrasing dropped - the same normalisation as the `hint-leak` rule in
 * scripts/lint-content.mjs, so "does this note contain the answer" means one
 * thing everywhere.
 */
export function normalizeForLeak(text: unknown): string {
  return String(text ?? '')
    .toLowerCase()
    .replace(/[`"'’]/g, '')
    .replace(/[^a-z0-9_$.+\-*/%<>=!&|[\]() ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Does `text` contain `word` as a whole word (case-sensitive: these are code identifiers)? */
function namesWord(text: string, word: string): boolean {
  return new RegExp(`(^|[^A-Za-z0-9_])${escapeRegExp(word)}([^A-Za-z0-9_]|$)`).test(text);
}

/** Is this note giving an option question's answer away? It quotes a correct option (8+ characters, normalised). */
export function optionNoteLeaks(c: FeedbackChallenge, note: string): boolean {
  const text = normalizeForLeak(note);
  if (!text) return false;
  for (const index of correctSetOf(c)) {
    const option = normalizeForLeak(c.options?.[index]);
    if (option.length >= 8 && text.includes(option)) return true;
  }
  return false;
}

/**
 * Is this note giving a blank's answer away? It names an answer (3+
 * characters) as a whole word - unless that word is already on screen in the
 * title or the code, where a note cannot avoid the vocabulary the exercise
 * is written in (the same exception as `hint-leak`).
 */
export function blankNoteLeaks(c: FeedbackChallenge, note: string): boolean {
  const text = String(note ?? '');
  if (!text.trim()) return false;
  const onScreen = `${c.title ?? ''} ${c.codeSnippet ?? ''}`;
  for (const blank of c.blanks ?? []) {
    for (const answer of [blank.answer, ...(blank.alternatives ?? [])]) {
      const word = normalizeBlank(String(answer ?? ''));
      if (word.length < 3 || namesWord(onScreen, word)) continue;
      if (namesWord(text, word)) return true;
    }
  }
  return false;
}

/**
 * The notes that would give the answer away, by key (`optionNoteKey`,
 * `blankNoteKey`). Only notes on WRONG answers count: a correct option's
 * note is shown only once the answer is revealed anyway.
 */
export function feedbackLeaks(c: FeedbackChallenge): Set<string> {
  const leaks = new Set<string>();
  const correct = correctSetOf(c);
  (c.optionFeedback ?? []).forEach((note, index) => {
    if (!correct.has(index) && optionNoteLeaks(c, note)) leaks.add(optionNoteKey(index));
  });
  (c.blanks ?? []).forEach((blank, b) => {
    (blank.wrongAnswers ?? []).forEach((wrong, w) => {
      if (blankNoteLeaks(c, wrong.feedback)) leaks.add(blankNoteKey(b, w));
    });
  });
  return leaks;
}

/**
 * Notes for the options in `selected` (ORIGINAL indices - the learner's
 * picks, and on single choice also the options already ruled out). A wrong
 * pick's note shows now unless it leaks; a correct option's note, and every
 * correct option's note once `reveal` is set, only with the reveal.
 */
export function optionNotes(c: FeedbackChallenge, selected: readonly number[], reveal: boolean, leaks: Set<string> = feedbackLeaks(c)): FeedbackNote[] {
  const notes = c.optionFeedback ?? [];
  const count = c.options?.length ?? 0;
  const correct = correctSetOf(c);
  const picked = new Set(selected.filter((i) => Number.isInteger(i) && i >= 0 && i < count));
  const out: FeedbackNote[] = [];
  for (let index = 0; index < count; index++) {
    const text = String(notes[index] ?? '').trim();
    if (!text) continue;
    if (correct.has(index)) {
      if (reveal) out.push({ position: index, text, kind: 'right', leaks: false });
    } else if (picked.has(index)) {
      const leaking = leaks.has(optionNoteKey(index));
      if (!leaking || reveal) out.push({ position: index, text, kind: 'wrong', leaks: leaking });
    }
  }
  return out;
}

/**
 * Notes for the blanks the learner got wrong with an answer the author
 * anticipated. Matched like the grader matches an answer (`checkBlank`:
 * whitespace folded, case ignored for a single plain word). A leaking note
 * waits for the reveal.
 */
export function blankNotes(c: FeedbackChallenge, values: readonly unknown[], reveal: boolean, leaks: Set<string> = feedbackLeaks(c)): FeedbackNote[] {
  const out: FeedbackNote[] = [];
  (c.blanks ?? []).forEach((blank, b) => {
    const value = String(values[b] ?? '');
    if (!normalizeBlank(value) || checkBlank(value, blank.answer, blank.alternatives ?? [])) return;
    const w = (blank.wrongAnswers ?? []).findIndex((wrong) => checkBlank(value, wrong.answer));
    if (w < 0) return;
    const text = String(blank.wrongAnswers?.[w]?.feedback ?? '').trim();
    if (!text) return;
    const leaking = leaks.has(blankNoteKey(b, w));
    if (!leaking || reveal) out.push({ position: b, text, kind: 'wrong', leaks: leaking });
  });
  return out;
}

/** How much of a question's bank of notes is written: for the admin's coverage and the content lint. */
export function feedbackCoverage(c: FeedbackChallenge): { eligible: boolean; hasNotes: boolean; notes: number } {
  if (c.type === 'quiz' || c.type === 'output_prediction' || c.type === 'multi_select') {
    const notes = (c.optionFeedback ?? []).filter((n) => String(n ?? '').trim()).length;
    return { eligible: true, hasNotes: notes > 0, notes };
  }
  if (c.type === 'fill_blank') {
    const notes = (c.blanks ?? []).reduce((sum, b) => sum + (b.wrongAnswers ?? []).filter((w) => String(w.feedback ?? '').trim()).length, 0);
    return { eligible: true, hasNotes: notes > 0, notes };
  }
  return { eligible: false, hasNotes: false, notes: 0 };
}
