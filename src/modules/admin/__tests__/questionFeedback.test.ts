import { describe, expect, it } from 'vitest';
import type { QuestionInput } from '../services/adminApi';
import { alignNotes, builtInPatch, feedbackIssues, leakWarnings, savedWrongAnswers, wrongChoicesOf } from '../services/questionFeedback';

const quiz: QuestionInput = {
  stageId: 'stage-1',
  type: 'quiz',
  title: 'Declare a constant',
  prompt: 'Which keyword declares a constant binding?',
  explanation: 'const makes a binding that cannot be reassigned.',
  language: 'javascript',
  difficulty: 'easy',
  xpReward: 40,
  hints: ['Think about reassignment.'],
  tags: ['variables'],
  codeSnippet: '',
  options: ['var', 'let', 'a const binding'],
  optionFeedback: ['', '', ''],
  correctIndex: 2,
  correctIndices: [],
  blanks: [],
  pseudocodeLines: [],
  testCases: [],
  examples: [],
  constraints: []
};

const fill: QuestionInput = {
  ...quiz,
  type: 'fill_blank',
  options: [],
  optionFeedback: [],
  codeSnippet: 'const n = items.___;',
  blanks: [{ answer: 'length', alternatives: [], choices: [], wrongAnswers: [] }]
};

const row = { original: { title: quiz.title, prompt: quiz.prompt, explanation: quiz.explanation, xpReward: 40, difficulty: 'easy', hints: quiz.hints, tags: quiz.tags } };

describe('notes lined up with the options', () => {
  it('pads and cuts', () => {
    expect(alignNotes(['a'], 3)).toEqual(['a', '', '']);
    expect(alignNotes(['a', 'b', 'c'], 2)).toEqual(['a', 'b']);
    expect(alignNotes(undefined, 2)).toEqual(['', '']);
  });

  it('keeps only rows with both an answer and a note, trimmed', () => {
    expect(savedWrongAnswers([{ answer: ' size ', feedback: ' Sets have size. ' }, { answer: 'count', feedback: '' }])).toEqual([{ answer: 'size', feedback: 'Sets have size.' }]);
  });

  it('lists a dropdown blank’s wrong choices', () => {
    expect(wrongChoicesOf({ answer: 'length', alternatives: [], choices: ['length', 'size', 'LENGTH ', 'count'] })).toEqual(['size', 'count']);
  });
});

describe('feedbackIssues', () => {
  it('matches the server: an accepted answer, a half row, a repeat, a long note', () => {
    const q: QuestionInput = {
      ...fill,
      blanks: [
        {
          answer: 'length',
          alternatives: [],
          choices: [],
          wrongAnswers: [
            { answer: 'LENGTH', feedback: 'x' },
            { answer: 'size', feedback: '' },
            { answer: 'count', feedback: 'no count' },
            { answer: 'Count', feedback: 'n'.repeat(601) }
          ]
        }
      ]
    };
    expect(feedbackIssues(q).map((i) => i.path)).toEqual(['blanks.0.wrongAnswers.0', 'blanks.0.wrongAnswers.1', 'blanks.0.wrongAnswers.3', 'blanks.0.wrongAnswers.3']);
    expect(feedbackIssues({ ...quiz, optionFeedback: ['n'.repeat(601), '', ''] })).toEqual([{ path: 'optionFeedback.0', message: 'The note on option A is too long (max 600 characters).' }]);
    expect(feedbackIssues(quiz)).toEqual([]);
  });

  it('a dropdown row with no note is simply no note; one outside the choices is refused', () => {
    const q: QuestionInput = { ...fill, blanks: [{ answer: 'length', alternatives: [], choices: ['length', 'size'], wrongAnswers: [{ answer: 'size', feedback: '' }, { answer: 'count', feedback: 'x' }] }] };
    expect(feedbackIssues(q).map((i) => i.path)).toEqual(['blanks.0.wrongAnswers.1']);
  });
});

describe('leakWarnings', () => {
  it('warns under a note that names the right answer', () => {
    expect(leakWarnings({ ...quiz, optionFeedback: ['Use a const binding instead.', '', ''] })).toEqual({
      'optionFeedback.0': 'This note contains the right answer, so learners see it only once the answer is shown.'
    });
    const q: QuestionInput = { ...fill, blanks: [{ answer: 'length', alternatives: [], choices: [], wrongAnswers: [{ answer: 'size', feedback: 'Use the length property.' }] }] };
    expect(Object.keys(leakWarnings(q))).toEqual(['blanks.0.wrongAnswers.0']);
  });
});

describe('builtInPatch - saving a built-in question', () => {
  it('sends only what changed, and null where a field is back to the source', () => {
    const edited = { ...quiz, title: 'Declare a constant, again', optionFeedback: ['var can be redeclared.', '', ''] };
    expect(builtInPatch(edited, quiz, row)).toEqual({ title: 'Declare a constant, again', optionFeedback: ['var can be redeclared.', '', ''] });
    // The form opened on an earlier override; the admin typed the source's title back.
    const opened = { ...quiz, title: 'An old override' };
    expect(builtInPatch({ ...opened, title: quiz.title }, opened, row)).toEqual({ title: null });
    expect(builtInPatch(quiz, quiz, row)).toEqual({});
    // Every note cleared: the notes go.
    const withNotes = { ...quiz, optionFeedback: ['x', '', ''] };
    expect(builtInPatch({ ...withNotes, optionFeedback: ['', '', ''] }, withNotes, row)).toEqual({ optionFeedback: null });
  });

  it('sends blank notes as one entry per blank', () => {
    const edited: QuestionInput = { ...fill, blanks: [{ answer: 'length', alternatives: [], choices: [], wrongAnswers: [{ answer: 'size', feedback: 'Sets have size.' }] }] };
    expect(builtInPatch(edited, fill, row)).toEqual({ blankFeedback: [{ wrongAnswers: [{ answer: 'size', feedback: 'Sets have size.' }] }] });
  });

  it('is null - save a replacement - once the logic changed', () => {
    expect(builtInPatch({ ...quiz, options: ['var', 'let', 'const'] }, quiz, row)).toBeNull();
    expect(builtInPatch({ ...quiz, correctIndex: 1 }, quiz, row)).toBeNull();
    expect(builtInPatch({ ...fill, blanks: [{ answer: 'size', alternatives: [], choices: [], wrongAnswers: [] }] }, fill, row)).toBeNull();
    expect(builtInPatch({ ...quiz, codeSnippet: 'let x;' }, quiz, row)).toBeNull();
  });
});
