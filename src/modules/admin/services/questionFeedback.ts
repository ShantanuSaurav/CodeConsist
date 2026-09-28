/**
 * The question wizard's wrong-answer notes, and how it saves a built-in
 * question - pure, so the rules are tested without React
 * (__tests__/questionFeedback.test.ts).
 *
 *   - Notes stay lined up with the options (`alignNotes`) whatever rows move.
 *   - The same checks as the server's (server/custom-challenges.js), so the
 *     admin hears about a "wrong" answer the grader would accept at once.
 *   - A note that gives the answer away is a WARNING (it waits for the
 *     reveal), from the shared rule in grading-engine/feedback.ts.
 *   - A built-in question whose logic is untouched is saved through PATCH
 *     (`builtInPatch`): only the changed wording, XP, difficulty and notes are
 *     layered on, and the question stays live from source instead of being
 *     frozen as a "modified" copy.
 */
import type { Challenge } from '@/types';
import { feedbackLeaks } from '@/platform/grading-engine/feedback';
import type { AdminChallengeRow, BlankFeedback, QuestionInput, QuestionIssue, BlankWrongAnswer } from './adminApi';

/** The longest one note may be (the content schema's FEEDBACK_MAX). */
export const NOTE_MAX = 600;
/** Wrong answers with a note, per blank. */
export const MAX_WRONG_ANSWERS = 8;

const letter = (i: number) => String.fromCharCode(65 + i);

/** Same rule as the grader: whitespace collapsed; case ignored only for a single plain word. */
export function blankMatches(given: string, accepted: string): boolean {
  const norm = (s: string) => s.trim().replace(/\s+/g, ' ');
  const g = norm(given);
  const a = norm(accepted);
  return /^[a-z0-9_]+$/i.test(a) ? g.toLowerCase() === a.toLowerCase() : g === a;
}

/** One note per option: padded with '' or cut to `count`. */
export function alignNotes(notes: readonly string[] | undefined, count: number): string[] {
  return Array.from({ length: Math.max(0, count) }, (_, i) => notes?.[i] ?? '');
}

/** The wrong choices of a dropdown blank - one note row each (the answer fixed). */
export function wrongChoicesOf(blank: { answer: string; alternatives: string[]; choices: string[] }): string[] {
  const accepted = [blank.answer, ...blank.alternatives].filter((a) => a.trim());
  return blank.choices.filter((choice) => choice.trim() && !accepted.some((a) => blankMatches(choice, a)));
}

/** A blank's note rows as they will be saved: trimmed, only rows with both an answer and a note. */
export function savedWrongAnswers(rows: readonly BlankWrongAnswer[] | undefined): BlankWrongAnswer[] {
  return (rows ?? []).map((r) => ({ answer: r.answer.trim(), feedback: r.feedback.trim() })).filter((r) => r.answer && r.feedback);
}

const OPTION_TYPES = new Set(['quiz', 'multi_select', 'output_prediction']);

/**
 * The checks the server runs on notes (custom-challenges.js), in the form's
 * words: a note too long, a half-written row, a "wrong" answer the grader
 * accepts, one a dropdown cannot produce, a repeat, too many rows.
 */
export function feedbackIssues(q: QuestionInput): QuestionIssue[] {
  const out: QuestionIssue[] = [];
  if (OPTION_TYPES.has(q.type)) {
    alignNotes(q.optionFeedback, (q.options ?? []).length).forEach((note, i) => {
      if (note.trim().length > NOTE_MAX) out.push({ path: `optionFeedback.${i}`, message: `The note on option ${letter(i)} is too long (max ${NOTE_MAX} characters).` });
    });
  }
  if (q.type === 'fill_blank') {
    (q.blanks ?? []).forEach((blank, i) => {
      const rows = blank.wrongAnswers ?? [];
      if (savedWrongAnswers(rows).length > MAX_WRONG_ANSWERS) out.push({ path: `blanks.${i}.wrongAnswers`, message: `Blank ${i + 1}: at most ${MAX_WRONG_ANSWERS} wrong answers.` });
      const accepted = [blank.answer, ...blank.alternatives].filter((a) => a.trim());
      const seen: string[] = [];
      rows.forEach((row, j) => {
        const path = `blanks.${i}.wrongAnswers.${j}`;
        const answer = row.answer.trim();
        const feedback = row.feedback.trim();
        if (!answer && !feedback) return;
        if (!answer) {
          out.push({ path, message: `Blank ${i + 1}: write the wrong answer this note is for, or remove the row.` });
          return;
        }
        // A dropdown's rows are its wrong choices: one left without a note simply has none.
        if (!feedback) {
          if (!blank.choices.length) out.push({ path, message: `Blank ${i + 1}: write why "${answer}" is wrong, or remove the row.` });
          return;
        }
        if (accepted.some((a) => blankMatches(answer, a))) {
          out.push({ path, message: `Blank ${i + 1}: "${answer}" is an accepted answer, so it cannot be a wrong answer.` });
        } else if (blank.choices.length && !blank.choices.some((c) => blankMatches(answer, c) || blankMatches(c, answer))) {
          out.push({ path, message: `Blank ${i + 1}: "${answer}" is not one of its dropdown choices, so no learner can give it.` });
        }
        if (seen.some((s) => blankMatches(answer, s))) out.push({ path, message: `Blank ${i + 1}: "${answer}" is listed twice.` });
        seen.push(answer);
        if (feedback.length > NOTE_MAX) out.push({ path, message: `Blank ${i + 1}: the note for "${answer}" is too long (max ${NOTE_MAX} characters).` });
      });
    });
  }
  return out;
}

/** The question as learners would get it, notes included - for the leak check. */
function asChallenge(q: QuestionInput): Pick<Challenge, 'type' | 'title' | 'codeSnippet' | 'options' | 'correctIndex' | 'correctIndices' | 'optionFeedback' | 'blanks'> {
  return {
    type: q.type,
    title: q.title,
    codeSnippet: q.codeSnippet,
    options: q.options,
    correctIndex: q.correctIndex,
    correctIndices: q.correctIndices,
    optionFeedback: OPTION_TYPES.has(q.type) ? alignNotes(q.optionFeedback, (q.options ?? []).length) : undefined,
    blanks: (q.blanks ?? []).map((b) => ({ answer: b.answer, alternatives: b.alternatives, choices: b.choices, wrongAnswers: savedWrongAnswers(b.wrongAnswers) }))
  };
}

/**
 * Notes that give the answer away, by form path. Saved all the same: a
 * leaking note is held back until the answer is shown.
 */
export function leakWarnings(q: QuestionInput): Record<string, string> {
  const out: Record<string, string> = {};
  const challenge = asChallenge(q);
  for (const key of feedbackLeaks(challenge)) {
    const option = /^o(\d+)$/.exec(key);
    if (option) out[`optionFeedback.${option[1]}`] = 'This note contains the right answer, so learners see it only once the answer is shown.';
    const blank = /^b(\d+)\.(\d+)$/.exec(key);
    if (blank) {
      // Map back to the row in the form (rows without a note are not saved).
      const saved = challenge.blanks?.[Number(blank[1])]?.wrongAnswers?.[Number(blank[2])];
      const j = (q.blanks?.[Number(blank[1])]?.wrongAnswers ?? []).findIndex((r) => r.answer.trim() === saved?.answer);
      out[`blanks.${blank[1]}.wrongAnswers.${Math.max(0, j)}`] = 'This note names the right answer, so learners see it only once the answer is shown.';
    }
  }
  return out;
}

/* ------------------------------------------------ saving a built-in question */

const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

/** What decides whether an answer is right, and what the question shows to answer - never layered on. */
function logicOf(q: QuestionInput) {
  return {
    stageId: q.stageId,
    type: q.type,
    language: q.language,
    codeSnippet: q.codeSnippet ?? '',
    options: q.options ?? [],
    correctIndex: q.correctIndex ?? null,
    correctIndices: q.correctIndices ?? [],
    blanks: (q.blanks ?? []).map((b) => [b.answer, b.alternatives, b.choices]),
    pseudocodeLines: q.pseudocodeLines ?? [],
    starterCode: q.starterCode ?? '',
    entryFunction: q.entryFunction ?? '',
    solutionCode: q.solutionCode ?? '',
    testCases: q.testCases ?? [],
    uiPreview: Boolean(q.uiPreview),
    examples: q.examples ?? [],
    constraints: q.constraints ?? []
  };
}

/** The notes of the form, as the notes routes take them. */
function notesOf(q: QuestionInput): { optionFeedback: string[]; blankFeedback: BlankFeedback[] } {
  return {
    optionFeedback: alignNotes(q.optionFeedback, (q.options ?? []).length).map((n) => n.trim()),
    blankFeedback: (q.blanks ?? []).map((b) => ({ wrongAnswers: savedWrongAnswers(b.wrongAnswers) }))
  };
}

export type BuiltInPatch = Partial<{
  title: string | null;
  prompt: string | null;
  explanation: string | null;
  hints: string[] | null;
  tags: string[] | null;
  xpReward: number | null;
  difficulty: 'easy' | 'medium' | 'hard' | null;
  optionFeedback: string[] | null;
  blankFeedback: BlankFeedback[] | null;
}>;

/**
 * How to save a built-in question the admin has not rewritten the logic of:
 * the PATCH body - each changed field, or `null` where it is back to the
 * source's value - or null when the logic (options, answers, code, tests...)
 * changed and the question has to be saved as a replacement (PUT) instead.
 * `initial` is the form as it opened; `row` carries the source's own values.
 */
export function builtInPatch(q: QuestionInput, initial: QuestionInput, row: Pick<AdminChallengeRow, 'original'>): BuiltInPatch | null {
  if (!same(logicOf(q), logicOf(initial))) return null;
  const patch: BuiltInPatch = {};
  const original = row.original;
  const text = (key: 'title' | 'prompt' | 'explanation') => {
    const value = q[key].trim();
    if (value === initial[key].trim()) return;
    patch[key] = value === original[key].trim() ? null : value;
  };
  text('title');
  text('prompt');
  text('explanation');
  const list = (key: 'hints' | 'tags') => {
    const value = q[key].map((s) => s.trim()).filter(Boolean);
    if (same(value, initial[key].map((s) => s.trim()).filter(Boolean))) return;
    patch[key] = same(value, original[key] ?? []) ? null : value;
  };
  list('hints');
  list('tags');
  if (q.xpReward !== initial.xpReward) patch.xpReward = q.xpReward === original.xpReward ? null : q.xpReward;
  if (q.difficulty !== initial.difficulty) patch.difficulty = q.difficulty === original.difficulty ? null : q.difficulty;

  const notes = notesOf(q);
  const before = notesOf(initial);
  if (OPTION_TYPES.has(q.type) && !same(notes.optionFeedback, before.optionFeedback)) {
    patch.optionFeedback = notes.optionFeedback.some(Boolean) ? notes.optionFeedback : null;
  }
  if (q.type === 'fill_blank' && !same(notes.blankFeedback, before.blankFeedback)) {
    patch.blankFeedback = notes.blankFeedback.some((b) => b.wrongAnswers.length) ? notes.blankFeedback : null;
  }
  return patch;
}
