import { describe, expect, it } from 'vitest';
import type { Challenge } from '@/types';
import { checkMissSummary, describeMissAnswer, missKeyLabel, normalizeMissAnswer, rawAnswerFromMiss, validWrongKey, wrongAnswerKeys } from '../misses';
import { gradeAnswer } from '../grading';

const base = { id: 'x', stageId: 's', title: 't', difficulty: 'easy', language: 'javascript', prompt: 'p', explanation: 'e', xpReward: 10 } as const;

const quiz = { ...base, type: 'quiz', options: ['A', 'B', 'C'], correctIndex: 1 } as Challenge;
const multi = { ...base, type: 'multi_select', options: ['A', 'B', 'C', 'D'], correctIndices: [0, 2] } as Challenge;
const blanks = {
  ...base,
  type: 'fill_blank',
  codeSnippet: 'let ___ = ___;',
  blanks: [{ answer: 'x' }, { answer: '42', alternatives: ['forty-two'] }]
} as Challenge;
const order = { ...base, type: 'pseudocode_order', pseudocodeLines: ['start', 'loop', 'loop', 'end'] } as Challenge;
const code = { ...base, type: 'code_runner', testCases: [{ input: '1', expected: '1' }, { input: '2', expected: '2' }, { input: '3', expected: '3' }] } as Challenge;

describe('normalizeMissAnswer', () => {
  it('reduces a single choice to its index', () => {
    expect(normalizeMissAnswer(quiz, 2)).toEqual({ kind: 'choice', index: 2 });
    expect(normalizeMissAnswer(quiz, { kind: 'choice', index: 0 })).toEqual({ kind: 'choice', index: 0 });
    expect(normalizeMissAnswer(quiz, 3)).toBeNull();
    expect(normalizeMissAnswer(quiz, -1)).toBeNull();
    expect(normalizeMissAnswer(quiz, 1.5)).toBeNull();
    expect(normalizeMissAnswer(quiz, '2')).toBeNull();
  });

  it('reduces a selection to sorted, unique indices', () => {
    expect(normalizeMissAnswer(multi, [3, 0])).toEqual({ kind: 'multi', indices: [0, 3] });
    expect(normalizeMissAnswer(multi, [0, 0])).toBeNull();
    expect(normalizeMissAnswer(multi, [])).toBeNull();
    expect(normalizeMissAnswer(multi, [9])).toBeNull();
  });

  it('keeps blank text, folded and cut to the length cap', () => {
    expect(normalizeMissAnswer(blanks, ['  y ', '41'])).toEqual({ kind: 'blanks', values: ['y', '41'] });
    const long = normalizeMissAnswer(blanks, ['y'.repeat(500), 'z'], 20);
    expect(long).toEqual({ kind: 'blanks', values: ['y'.repeat(20), 'z'] });
    expect(normalizeMissAnswer(blanks, ['only one'])).toBeNull();
    expect(normalizeMissAnswer(blanks, [{}, 'x'])).toBeNull();
  });

  it('turns the learner’s line order into positions in the correct order', () => {
    expect(normalizeMissAnswer(order, ['loop', 'start', 'loop', 'end'])).toEqual({ kind: 'order', lines: [1, 0, 2, 3] });
    expect(normalizeMissAnswer(order, ['start', 'loop', 'loop', 'finish'])).toBeNull(); // not one of its lines
    expect(normalizeMissAnswer(order, ['start', 'start', 'loop', 'end'])).toBeNull(); // 'start' only once
    expect(normalizeMissAnswer(order, { kind: 'order', lines: [3, 2, 1, 0] })).toEqual({ kind: 'order', lines: [3, 2, 1, 0] });
    expect(normalizeMissAnswer(order, { kind: 'order', lines: [0, 0, 1, 2] })).toBeNull();
    expect(normalizeMissAnswer(order, { kind: 'order', lines: [0, 1, 2, 7] })).toBeNull();
  });

  it('keeps only a pass count for code, and only for a real failure', () => {
    expect(normalizeMissAnswer(code, { passed: 1, total: 3 })).toEqual({ kind: 'code', passed: 1, total: 3 });
    expect(normalizeMissAnswer(code, { kind: 'code', passed: 0, total: 2 })).toEqual({ kind: 'code', passed: 0, total: 2 });
    expect(normalizeMissAnswer(code, { passed: 3, total: 3 })).toBeNull(); // that is a pass
    expect(normalizeMissAnswer(code, { passed: 1, total: 4 })).toBeNull(); // more tests than it has
    expect(normalizeMissAnswer(code, 'function f() {}')).toBeNull(); // code is never stored
  });
});

describe('wrongAnswerKeys', () => {
  it('names the wrong option, combination, blank or order', () => {
    expect(wrongAnswerKeys(quiz, { kind: 'choice', index: 2 })).toEqual(['o2']);
    expect(wrongAnswerKeys(multi, { kind: 'multi', indices: [0, 3] })).toEqual(['o0.3']);
    expect(wrongAnswerKeys(blanks, { kind: 'blanks', values: ['x', 'Forty One'] })).toEqual(['b1:forty one']);
    expect(wrongAnswerKeys(blanks, { kind: 'blanks', values: ['y', 'forty-two'] })).toEqual(['b0:y']);
    expect(wrongAnswerKeys(order, { kind: 'order', lines: [1, 0, 2, 3] })).toEqual(['order']);
    expect(wrongAnswerKeys(code, { kind: 'code', passed: 1, total: 3 })).toEqual([]);
  });

  it('labels keys for the admin', () => {
    expect(missKeyLabel(quiz, 'o2')).toBe('C');
    expect(missKeyLabel(multi, 'o0.3')).toBe('A + D');
    expect(missKeyLabel(blanks, 'b1:forty one')).toBe('Blank 2: "forty one"');
    expect(missKeyLabel(order, 'order')).toBe('Lines in the wrong order');
    expect(missKeyLabel(quiz, 'o9')).toBe('Option 10');
    expect(describeMissAnswer(code, { kind: 'code', passed: 1, total: 3 })).toBe('1 of 3 tests passed');
  });
});

describe('re-grading a stored miss', () => {
  it('turns it back into the answer gradeAnswer takes', () => {
    expect(gradeAnswer(quiz, rawAnswerFromMiss(quiz, { kind: 'choice', index: 1 }))).toBe(true);
    expect(gradeAnswer(quiz, rawAnswerFromMiss(quiz, { kind: 'choice', index: 2 }))).toBe(false);
    expect(gradeAnswer(multi, rawAnswerFromMiss(multi, { kind: 'multi', indices: [0, 2] }))).toBe(true);
    expect(gradeAnswer(blanks, rawAnswerFromMiss(blanks, { kind: 'blanks', values: ['x', 'forty-two'] }))).toBe(true);
    expect(gradeAnswer(order, rawAnswerFromMiss(order, { kind: 'order', lines: [0, 1, 2, 3] }))).toBe(true);
    expect(gradeAnswer(order, rawAnswerFromMiss(order, { kind: 'order', lines: [0, 2, 1, 3] }))).toBe(true); // the two 'loop' lines are interchangeable
    expect(gradeAnswer(order, rawAnswerFromMiss(order, { kind: 'order', lines: [1, 0, 2, 3] }))).toBe(false);
    expect(gradeAnswer(order, rawAnswerFromMiss(order, { kind: 'order', lines: [3, 0, 1, 2] }))).toBe(false);
    expect(rawAnswerFromMiss(code, { kind: 'code', passed: 1, total: 3 })).toBeNull();
  });
});

describe('validWrongKey', () => {
  it('takes only the keys wrongAnswerKeys writes for a wrong answer', () => {
    expect(validWrongKey(quiz, 'o0')).toBe(true);
    expect(validWrongKey(quiz, 'o1')).toBe(false); // the right answer
    expect(validWrongKey(quiz, 'o3')).toBe(false); // no such option
    expect(validWrongKey(quiz, 'o01')).toBe(false);
    expect(validWrongKey(quiz, 'o0.2')).toBe(false); // a combination is not a single choice
    expect(validWrongKey(quiz, 'order')).toBe(false);

    expect(validWrongKey(multi, 'o0.3')).toBe(true);
    expect(validWrongKey(multi, 'o1')).toBe(true);
    expect(validWrongKey(multi, 'o0.2')).toBe(false); // the right set
    expect(validWrongKey(multi, 'o3.0')).toBe(false); // never written out of order
    expect(validWrongKey(multi, 'o0.0')).toBe(false);
    expect(validWrongKey(multi, 'o0.4')).toBe(false);

    expect(validWrongKey(blanks, 'b0:y')).toBe(true);
    expect(validWrongKey(blanks, 'b0:hello world')).toBe(true);
    expect(validWrongKey(blanks, 'b0:x')).toBe(false); // accepted
    expect(validWrongKey(blanks, 'b1:forty-two')).toBe(false); // an accepted alternative
    expect(validWrongKey(blanks, 'b2:y')).toBe(false); // no third blank
    expect(validWrongKey(blanks, 'b0:Y')).toBe(false); // keys are lower case
    expect(validWrongKey(blanks, 'b0: y')).toBe(false); // and whitespace-folded
    expect(validWrongKey(blanks, `b0:${'y'.repeat(41)}`)).toBe(false); // and cut to 40

    expect(validWrongKey(order, 'order')).toBe(true);
    expect(validWrongKey(code, 'o0')).toBe(false); // a code miss has no keys
    expect(validWrongKey(quiz, '__proto__')).toBe(false);
    expect(validWrongKey(quiz, '')).toBe(false);
  });

  it('agrees with wrongAnswerKeys on every wrong answer', () => {
    const cut = `${'a'.repeat(39)} bcd`; // cut at 40, it ends in a space
    const cases: [Challenge, unknown][] = [
      [quiz, 0],
      [quiz, 2],
      [multi, [0, 1, 3]],
      [multi, [3]],
      [multi, [0]],
      [blanks, ['  Hello   World ', '7']],
      [blanks, ['q'.repeat(60), 'x']],
      [blanks, [cut, '']],
      [order, ['end', 'start', 'loop', 'loop']]
    ];
    for (const [challenge, raw] of cases) {
      const answer = normalizeMissAnswer(challenge, raw);
      expect(answer, JSON.stringify(raw)).not.toBeNull();
      for (const key of wrongAnswerKeys(challenge, answer)) expect(validWrongKey(challenge, key), key).toBe(true);
    }
  });
});

describe('checkMissSummary', () => {
  const summary = (over: object = {}) => ({
    count: 3,
    firstAt: '2026-09-25T10:00:00.000Z',
    lastAt: '2026-09-25T11:00:00.000Z',
    lastDay: '2026-09-25',
    lastDayCount: 3,
    open: true,
    revealed: 0,
    keys: {},
    lastAnswer: null,
    ...over
  });

  it('keeps only real wrong-answer keys, and drops a correct last answer', () => {
    const checked = checkMissSummary(quiz, summary({ keys: { o0: 2, o1: 9, o7: 1, 'b0:x': 4 }, lastAnswer: { kind: 'choice', index: 1 }, codeOnly: true }));
    expect(checked).toMatchObject({ count: 3, keys: { o0: 2 }, lastAnswer: null });
    expect(checked.codeOnly).toBeUndefined();
    expect(checkMissSummary(blanks, summary({ lastAnswer: { kind: 'blanks', values: ['x', 'forty-two'] } })).lastAnswer).toBeNull();
    expect(checkMissSummary(blanks, summary({ lastAnswer: { kind: 'blanks', values: ['y', 'forty-two'] } })).lastAnswer).toEqual({ kind: 'blanks', values: ['y', 'forty-two'] });
  });

  it('reduces the last answer again, and marks a code question as code only', () => {
    expect(checkMissSummary(quiz, summary({ lastAnswer: { kind: 'choice', index: 7 } })).lastAnswer).toBeNull();
    expect(checkMissSummary(blanks, summary({ lastAnswer: { kind: 'blanks', values: ['y'.repeat(50), 'z'] } }), { maxChars: 20 }).lastAnswer).toEqual({
      kind: 'blanks',
      values: ['y'.repeat(20), 'z']
    });
    const failed = checkMissSummary(code, summary({ keys: { order: 2 }, lastAnswer: { kind: 'code', passed: 1, total: 3 } }));
    expect(failed).toMatchObject({ keys: {}, codeOnly: true, lastAnswer: { kind: 'code', passed: 1, total: 3 } });
    // A "failed" run that passed everything is not a miss.
    expect(checkMissSummary(code, summary({ lastAnswer: { kind: 'code', passed: 3, total: 3 } })).lastAnswer).toBeNull();
  });

  it('grades with the grader it is given', () => {
    expect(checkMissSummary(quiz, summary({ lastAnswer: { kind: 'choice', index: 2 } }), { grade: () => true }).lastAnswer).toBeNull();
  });
});
