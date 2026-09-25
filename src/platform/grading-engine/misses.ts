/* ==========================================================================
   Wrong answers, reduced to something small and safe to store.

   A miss is kept as indices and short text only: which option was picked,
   which blanks were typed (cut to a length cap), which order the lines were
   put in, or how many tests a run passed. Code itself is never stored - the
   drafts store already holds a learner's code.

   Pure, shared by the browser (to record a miss) and the server (to accept
   or re-check one), so both reduce an answer the same way.
   ========================================================================== */
import type { Challenge, MissAnswer, MissSummary } from '@/types';
import { gradeAnswer, normalizeBlank, sameSet } from './grading';

type MissChallenge = Pick<Challenge, 'type' | 'options' | 'correctIndex' | 'correctIndices' | 'blanks' | 'pseudocodeLines' | 'testCases'>;

/** Code challenges are graded by running tests; their misses are pass counts. */
export function isCodeChallengeType(type: string): boolean {
  return type === 'code_runner' || type === 'debug';
}

function isIndex(value: unknown, length: number): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value < length;
}

function asObject(raw: unknown): Record<string, unknown> | null {
  return raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : null;
}

/**
 * Reduce a submitted answer - the raw shape the practice modal holds (an
 * option index, a list of indices, the blank strings, the lines in the
 * learner's order, or `{ passed, total }` for a code run) or an
 * already-reduced `MissAnswer` - to a `MissAnswer`. Null when it does not fit
 * the challenge (an index out of range, a line that is not one of its lines,
 * a pass count that is not a failure...), which the caller drops.
 */
export function normalizeMissAnswer(challenge: MissChallenge, raw: unknown, maxChars = 200): MissAnswer | null {
  const obj = asObject(raw);
  const cap = Math.max(1, Math.floor(maxChars));

  switch (challenge.type) {
    case 'quiz':
    case 'output_prediction': {
      const count = challenge.options?.length ?? 0;
      const index = obj ? (obj.kind === 'choice' ? obj.index : undefined) : raw;
      return isIndex(index, count) ? { kind: 'choice', index } : null;
    }

    case 'multi_select': {
      const count = challenge.options?.length ?? 0;
      const list = obj ? (obj.kind === 'multi' ? obj.indices : undefined) : raw;
      if (!Array.isArray(list) || list.length === 0 || list.length > count) return null;
      if (!list.every((i) => isIndex(i, count))) return null;
      const indices = [...new Set(list as number[])].sort((a, b) => a - b);
      return indices.length === list.length ? { kind: 'multi', indices } : null;
    }

    case 'fill_blank': {
      const blanks = challenge.blanks ?? [];
      const list = obj ? (obj.kind === 'blanks' ? obj.values : undefined) : raw;
      if (!Array.isArray(list) || list.length !== blanks.length || blanks.length === 0) return null;
      if (!list.every((v) => typeof v === 'string' || typeof v === 'number')) return null;
      return { kind: 'blanks', values: list.map((v) => normalizeBlank(String(v)).slice(0, cap)) };
    }

    case 'pseudocode_order': {
      const lines = challenge.pseudocodeLines ?? [];
      if (lines.length === 0) return null;
      let order: number[] | null = null;
      if (obj) {
        if (obj.kind === 'order' && Array.isArray(obj.lines) && obj.lines.every((i) => isIndex(i, lines.length))) order = obj.lines as number[];
      } else if (Array.isArray(raw) && raw.every((line) => typeof line === 'string')) {
        // The learner's order as text: map each line to its position in the
        // correct order. Duplicate lines take the first unused position.
        const used = new Set<number>();
        order = [];
        for (const line of raw as string[]) {
          const at = lines.findIndex((candidate, i) => candidate === line && !used.has(i));
          if (at === -1) return null;
          used.add(at);
          order.push(at);
        }
      }
      if (!order || order.length !== lines.length || new Set(order).size !== order.length) return null;
      return { kind: 'order', lines: [...order] };
    }

    case 'code_runner':
    case 'debug': {
      if (!obj) return null;
      if (obj.kind !== undefined && obj.kind !== 'code') return null;
      const passed = obj.passed;
      const total = obj.total;
      const cases = challenge.testCases?.length ?? 0;
      if (typeof passed !== 'number' || typeof total !== 'number' || !Number.isInteger(passed) || !Number.isInteger(total)) return null;
      // A miss is a failed run: at least one test failed, and there are no
      // more tests than the challenge has.
      if (passed < 0 || passed >= total || total > cases) return null;
      return { kind: 'code', passed, total };
    }

    default:
      return null;
  }
}

/**
 * The raw answer a `MissAnswer` stands for, in the shape `gradeAnswer`
 * takes - so the server can re-grade a stored miss. Null for code.
 */
export function rawAnswerFromMiss(challenge: MissChallenge, answer: MissAnswer | null): unknown {
  if (!answer) return null;
  switch (answer.kind) {
    case 'choice':
      return answer.index;
    case 'multi':
      return [...answer.indices];
    case 'blanks':
      return [...answer.values];
    case 'order':
      return answer.lines.map((i) => (challenge.pseudocodeLines ?? [])[i]);
    default:
      return null;
  }
}

/**
 * Keys that name WHAT was wrong, so the admin can see the most common wrong
 * answers across learners:
 *   `o<i>`         a single wrong option
 *   `o<i>.<j>…`    a wrong combination on a select-all question
 *   `b<i>:<text>`  a wrong value in blank i (lower-cased, whitespace folded)
 *   `order`        the lines in a wrong order
 * Code misses have no key - the pass count is all there is.
 */
export function wrongAnswerKeys(challenge: MissChallenge, answer: MissAnswer | null): string[] {
  if (!answer) return [];
  switch (answer.kind) {
    case 'choice':
      return answer.index === challenge.correctIndex ? [] : [`o${answer.index}`];
    case 'multi':
      return [`o${answer.indices.join('.')}`];
    case 'blanks': {
      const keys: string[] = [];
      (challenge.blanks ?? []).forEach((blank, i) => {
        const value = answer.values[i] ?? '';
        const accepted = [blank.answer, ...(blank.alternatives ?? [])].map((a) => normalizeBlank(a).toLowerCase());
        const given = normalizeBlank(value).toLowerCase();
        if (!accepted.includes(given)) keys.push(`b${i}:${given.slice(0, 40)}`);
      });
      return keys;
    }
    case 'order':
      return ['order'];
    default:
      return [];
  }
}

const INDEX = '(?:0|[1-9]\\d*)';
const CHOICE_KEY = new RegExp(`^o(${INDEX})$`);
const COMBINATION_KEY = new RegExp(`^o${INDEX}(?:\\.${INDEX})*$`);
const BLANK_KEY = new RegExp(`^b(${INDEX}):([\\s\\S]*)$`);
/** How much of a typed blank `wrongAnswerKeys` keeps in a key. */
const BLANK_KEY_CHARS = 40;

/**
 * Could `wrongAnswerKeys` have written `key` for a WRONG answer to this
 * challenge? The option (or combination) must exist and not be the correct
 * one; the blank must exist, and its text must be in the key's own form and
 * not an accepted answer; `order` only fits an ordering question. The server
 * re-checks the wrong-answer counts a browser sends in a merge with this.
 */
export function validWrongKey(challenge: MissChallenge, key: string): boolean {
  if (typeof key !== 'string' || key.length === 0 || key.length > 80) return false;
  switch (challenge.type) {
    case 'quiz':
    case 'output_prediction': {
      const match = CHOICE_KEY.exec(key);
      if (!match) return false;
      const index = Number(match[1]);
      return index < (challenge.options?.length ?? 0) && index !== challenge.correctIndex;
    }

    case 'multi_select': {
      if (!COMBINATION_KEY.test(key)) return false;
      const indices = key.slice(1).split('.').map(Number);
      const count = challenge.options?.length ?? 0;
      // Written from a normalized answer: in range, ascending, no repeats.
      if (!indices.every((i, n) => i < count && (n === 0 || i > indices[n - 1]))) return false;
      return !sameSet(indices, challenge.correctIndices ?? []);
    }

    case 'fill_blank': {
      const match = BLANK_KEY.exec(key);
      if (!match) return false;
      const blank = (challenge.blanks ?? [])[Number(match[1])];
      if (!blank) return false;
      const text = match[2];
      // The key's own form: lower case, whitespace folded, cut to 40
      // characters (a cut can leave one trailing space).
      const folded = normalizeBlank(text);
      const inForm = text === folded || (text.length === BLANK_KEY_CHARS && text === `${folded} `);
      if (text.length > BLANK_KEY_CHARS || text !== text.toLowerCase() || !inForm) return false;
      const accepted = [blank.answer, ...(blank.alternatives ?? [])].map((a) => normalizeBlank(a).toLowerCase());
      return !accepted.includes(folded);
    }

    case 'pseudocode_order':
      return key === 'order';

    default:
      return false;
  }
}

/**
 * A miss summary received from a browser (a guest's merge), re-checked
 * against the challenge it names:
 *   - only keys `wrongAnswerKeys` could have written for a wrong answer stay;
 *   - the last answer is reduced again, and dropped when it is malformed or
 *     actually correct - a correct answer is never shown as a miss;
 *   - `codeOnly` follows the challenge, not what the sender claimed.
 * `grade` is the authoritative non-code grader (the server passes its own).
 * The counts are capped separately, by `mergeActivityLogs`.
 */
export function checkMissSummary(
  challenge: MissChallenge,
  summary: MissSummary,
  options: { maxChars?: number; grade?: (challenge: MissChallenge, answer: unknown) => boolean } = {}
): MissSummary {
  const grade = options.grade ?? gradeAnswer;
  const keys: Record<string, number> = {};
  for (const key of Object.keys(summary.keys ?? {})) {
    if (validWrongKey(challenge, key)) Object.defineProperty(keys, key, { value: summary.keys[key], writable: true, enumerable: true, configurable: true });
  }
  let lastAnswer = summary.lastAnswer ? normalizeMissAnswer(challenge, summary.lastAnswer, options.maxChars) : null;
  if (lastAnswer && lastAnswer.kind !== 'code' && grade(challenge, rawAnswerFromMiss(challenge, lastAnswer))) lastAnswer = null;
  const checked: MissSummary = { ...summary, keys, lastAnswer };
  if (isCodeChallengeType(challenge.type)) checked.codeOnly = true;
  else delete checked.codeOnly;
  return checked;
}

function clip(text: string, max = 80): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

/** A human label for a wrong-answer key: the option text, the typed value, "Wrong order". */
export function missKeyLabel(challenge: Pick<Challenge, 'options'>, key: string): string {
  const option = /^o(\d+(?:\.\d+)*)$/.exec(key);
  if (option) {
    const texts = option[1].split('.').map((i) => {
      const text = challenge.options?.[Number(i)];
      return typeof text === 'string' ? clip(text, 60) : `Option ${Number(i) + 1}`;
    });
    return texts.join(' + ');
  }
  const blank = /^b(\d+):(.*)$/.exec(key);
  if (blank) return `Blank ${Number(blank[1]) + 1}: "${clip(blank[2], 40)}"`;
  if (key === 'order') return 'Lines in the wrong order';
  return key;
}

/** A human description of one stored miss, for the admin's recent list. */
export function describeMissAnswer(challenge: Pick<Challenge, 'options' | 'pseudocodeLines'>, answer: MissAnswer | null): string {
  if (!answer) return '—';
  switch (answer.kind) {
    case 'choice':
      return clip(challenge.options?.[answer.index] ?? `Option ${answer.index + 1}`);
    case 'multi':
      return answer.indices.map((i) => clip(challenge.options?.[i] ?? `Option ${i + 1}`, 40)).join(' + ');
    case 'blanks':
      return answer.values.map((v) => `"${clip(v, 40)}"`).join(', ');
    case 'order':
      return `Order ${answer.lines.map((i) => i + 1).join(' ')}`;
    case 'code':
      return `${answer.passed} of ${answer.total} tests passed`;
    default:
      return '—';
  }
}
