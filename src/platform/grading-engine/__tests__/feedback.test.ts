import { describe, expect, it } from 'vitest';
import type { Challenge } from '@/types';
import { blankNotes, feedbackCoverage, feedbackLeaks, optionNotes, wrongAnswerKeys } from '../feedback';

const base = { id: 'x', stageId: 'stage-1', title: 'Declare it', difficulty: 'easy', language: 'javascript', prompt: 'p', explanation: 'e', xpReward: 10 } as const;

/** Fixture notes - the built-in bank carries none yet. */
const quiz = {
  ...base,
  type: 'quiz',
  options: ['var', 'let', 'const declaration', 'static'],
  correctIndex: 2,
  optionFeedback: [
    'var can be redeclared and reassigned, so it does not protect the value.',
    'let blocks redeclaration but still lets you reassign.',
    'A const declaration cannot be reassigned after it is set.',
    'Use a const declaration here instead.' // names the right answer: leaks
  ]
} as Challenge;

const multi = {
  ...base,
  type: 'multi_select',
  options: ['0', '""', '[]', 'null'],
  correctIndices: [0, 1, 3],
  optionFeedback: ['', '', 'An empty array is an object, and every object is truthy.', 'null is falsy.']
} as Challenge;

const fill = {
  ...base,
  type: 'fill_blank',
  title: 'Count the items',
  codeSnippet: 'const n = items.___;\nconsole.___(n);',
  blanks: [
    {
      answer: 'length',
      wrongAnswers: [
        { answer: 'size', feedback: 'Arrays have no size property - that is Set and Map.' },
        // Names the answer, which is nowhere on screen: held back until the reveal.
        { answer: 'count', feedback: 'There is no count property; use the length property.' }
      ]
    },
    { answer: 'log', choices: ['log', 'print', 'write'], wrongAnswers: [{ answer: 'print', feedback: 'console has no print method.' }] }
  ]
} as Challenge;

describe('feedbackLeaks', () => {
  it('flags a wrong option note that quotes a correct option of 8+ characters', () => {
    expect([...feedbackLeaks(quiz)]).toEqual(['o3']);
  });

  it('never flags a correct option note, and ignores short correct options', () => {
    const short = { ...quiz, options: ['var', 'let', 'const'], correctIndex: 2, optionFeedback: ['Use const.', '', 'const cannot be reassigned.'] } as Challenge;
    expect([...feedbackLeaks(short)]).toEqual([]);
  });

  it('flags a blank note that names an answer as a word, unless that word is on screen already', () => {
    expect([...feedbackLeaks(fill)]).toEqual(['b0.1']);
    // The same note is no leak when the word is already in the code on screen.
    const onScreen = { ...fill, codeSnippet: 'const length = items.___;', blanks: [fill.blanks![0]] } as Challenge;
    expect([...feedbackLeaks(onScreen)]).toEqual([]);
  });
});

describe('optionNotes', () => {
  it('before the reveal: only the learner’s wrong pick, never a correct option’s note', () => {
    expect(optionNotes(quiz, [0], false)).toEqual([{ position: 0, text: quiz.optionFeedback![0], kind: 'wrong', leaks: false }]);
    expect(optionNotes(quiz, [2], false)).toEqual([]);
  });

  it('holds a leaking note back until the reveal, then shows it with the correct option’s note', () => {
    expect(optionNotes(quiz, [3], false)).toEqual([]);
    expect(optionNotes(quiz, [3], true)).toEqual([
      { position: 2, text: quiz.optionFeedback![2], kind: 'right', leaks: false },
      { position: 3, text: quiz.optionFeedback![3], kind: 'wrong', leaks: true }
    ]);
  });

  it('notes several picks on a select-all, skipping empty notes and indices out of range', () => {
    expect(optionNotes(multi, [0, 2, 9], false)).toEqual([{ position: 2, text: multi.optionFeedback![2], kind: 'wrong', leaks: false }]);
    expect(optionNotes(multi, [2], true).map((n) => [n.position, n.kind])).toEqual([
      [2, 'wrong'],
      [3, 'right']
    ]);
  });

  it('is empty for a question without notes', () => {
    expect(optionNotes({ ...quiz, optionFeedback: undefined }, [0], true)).toEqual([]);
  });
});

describe('blankNotes', () => {
  it('matches a wrong answer the way the grader matches answers: case and spaces for a single word', () => {
    expect(blankNotes(fill, ['  SIZE ', 'log'], false)).toEqual([{ position: 0, text: fill.blanks![0].wrongAnswers![0].feedback, kind: 'wrong', leaks: false }]);
    expect(blankNotes(fill, ['length', 'print'], false)).toEqual([{ position: 1, text: 'console has no print method.', kind: 'wrong', leaks: false }]);
  });

  it('says nothing for a right answer, an empty one, or a wrong one nobody anticipated', () => {
    expect(blankNotes(fill, ['length', 'log'], true)).toEqual([]);
    expect(blankNotes(fill, ['', 'write'], true)).toEqual([]);
  });

  it('holds a leaking note back until the reveal', () => {
    expect(blankNotes(fill, ['count', 'log'], false)).toEqual([]);
    expect(blankNotes(fill, ['count', 'log'], true)).toEqual([{ position: 0, text: fill.blanks![0].wrongAnswers![1].feedback, kind: 'wrong', leaks: true }]);
  });
});

describe('wrongAnswerKeys (reused from misses.ts)', () => {
  it('names what was wrong', () => {
    expect(wrongAnswerKeys(quiz, { kind: 'choice', index: 0 })).toEqual(['o0']);
    expect(wrongAnswerKeys(multi, { kind: 'multi', indices: [0, 2] })).toEqual(['o0.2']);
    expect(wrongAnswerKeys(fill, { kind: 'blanks', values: ['Size', 'log'] })).toEqual(['b0:size']);
    expect(wrongAnswerKeys({ ...base, type: 'pseudocode_order', pseudocodeLines: ['a', 'b', 'c'] } as Challenge, { kind: 'order', lines: [1, 0, 2] })).toEqual(['order']);
  });
});

describe('feedbackCoverage', () => {
  it('counts the notes an eligible question has', () => {
    expect(feedbackCoverage(quiz)).toEqual({ eligible: true, hasNotes: true, notes: 4 });
    expect(feedbackCoverage(fill)).toEqual({ eligible: true, hasNotes: true, notes: 3 });
    expect(feedbackCoverage({ ...quiz, optionFeedback: ['', ''] })).toEqual({ eligible: true, hasNotes: false, notes: 0 });
    expect(feedbackCoverage({ ...base, type: 'code_runner' } as Challenge)).toEqual({ eligible: false, hasNotes: false, notes: 0 });
  });
});
