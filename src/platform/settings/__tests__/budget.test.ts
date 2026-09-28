import { describe, expect, it } from 'vitest';
import type { Challenge } from '@/types';
import { DEFAULT_SETTINGS } from '../defaults';
import { mergeSettings } from '../merge';
import { validateSettings } from '../schema';
import { DEFAULT_FEEDBACK_SETTINGS, effectiveAttemptBudget, noteContextFor, revealCap, wrongAnswerNotesAllowed } from '../budget';

const base = { id: 'x', stageId: 'stage-1', title: 't', difficulty: 'easy', language: 'javascript', prompt: 'p', explanation: 'e', xpReward: 10 } as const;
const quiz = (options = 4) => ({ ...base, type: 'quiz', options: Array.from({ length: options }, (_, i) => `o${i}`), correctIndex: 0 }) as Challenge;
const multi = { ...base, type: 'multi_select', options: ['a', 'b', 'c', 'd'], correctIndices: [0, 1] } as Challenge;
const fill = (blanks: Challenge['blanks']) => ({ ...base, type: 'fill_blank', codeSnippet: blanks!.map(() => '___').join(' '), blanks }) as Challenge;
const order = { ...base, type: 'pseudocode_order', pseudocodeLines: ['a', 'b', 'c'] } as Challenge;
const code = { ...base, type: 'code_runner', starterCode: 's', entryFunction: 'f', testCases: [{ input: '1', expected: '1' }], solutionCode: 'x' } as Challenge;
const settings = { feedback: DEFAULT_SETTINGS.feedback, review: DEFAULT_SETTINGS.review };

describe('the feedback defaults', () => {
  it('are the documented numbers, and pass their own schema', () => {
    expect(DEFAULT_SETTINGS.feedback).toEqual(DEFAULT_FEEDBACK_SETTINGS);
    expect(DEFAULT_SETTINGS.feedback.attemptsBeforeReveal).toEqual({
      practice: { quiz: 2, output_prediction: 2, multi_select: 3, fill_blank: 3, pseudocode_order: 3 },
      learn: 1
    });
    expect(DEFAULT_SETTINGS.feedback.requeue).toEqual({ enabled: true, maxRounds: 2, maxScoreAfterReveal: { learn: 80, practice: 60 } });
    expect(DEFAULT_SETTINGS.feedback.solutionAfterFailedRuns).toBe(2);
    expect(validateSettings(DEFAULT_SETTINGS).ok).toBe(true);
  });

  it('hold every value to its bounds', () => {
    const paths = (patch: object) => validateSettings(mergeSettings(DEFAULT_SETTINGS, patch)).issues.map((i) => i.path);
    expect(paths({ feedback: { attemptsBeforeReveal: { practice: { quiz: 0 } } } })).toEqual(['feedback.attemptsBeforeReveal.practice.quiz']);
    expect(paths({ feedback: { attemptsBeforeReveal: { learn: 6 } } })).toEqual(['feedback.attemptsBeforeReveal.learn']);
    expect(paths({ feedback: { requeue: { maxRounds: 4 } } })).toEqual(['feedback.requeue.maxRounds']);
    expect(paths({ feedback: { requeue: { maxScoreAfterReveal: { practice: 49 } } } })).toEqual(['feedback.requeue.maxScoreAfterReveal.practice']);
    expect(paths({ feedback: { solutionAfterFailedRuns: 11 } })).toEqual(['feedback.solutionAfterFailedRuns']);
    expect(paths({ feedback: { solutionAfterFailedRuns: 0, requeue: { maxRounds: 0 } } })).toEqual([]);
  });
});

describe('effectiveAttemptBudget', () => {
  it('uses the per-kind Practice number, and the Learn number in Learn mode', () => {
    expect(effectiveAttemptBudget(multi, 'lesson', 'practice', settings)).toBe(3);
    expect(effectiveAttemptBudget(order, 'lesson', null, settings)).toBe(3);
    expect(effectiveAttemptBudget(multi, 'lesson', 'learn', settings)).toBe(1);
    const custom = { ...settings, feedback: mergeSettings(DEFAULT_SETTINGS, { feedback: { attemptsBeforeReveal: { practice: { multi_select: 5 }, learn: 2 } } }).feedback };
    expect(effectiveAttemptBudget(multi, 'lesson', 'practice', custom)).toBe(5);
    expect(effectiveAttemptBudget(multi, 'library', 'learn', custom)).toBe(2);
  });

  it('never lets a single-choice question have its last option for free', () => {
    const five = { ...settings, feedback: mergeSettings(DEFAULT_SETTINGS, { feedback: { attemptsBeforeReveal: { practice: { quiz: 5 } } } }).feedback };
    expect(effectiveAttemptBudget(quiz(4), 'lesson', 'practice', five)).toBe(3);
    // A two-option quiz: one try.
    expect(effectiveAttemptBudget(quiz(2), 'lesson', 'practice', settings)).toBe(1);
    expect(effectiveAttemptBudget({ ...quiz(3), type: 'output_prediction' }, 'lesson', 'practice', settings)).toBe(2);
  });

  it('holds one dropdown blank to its choices minus one; typed or several blanks keep the number', () => {
    expect(effectiveAttemptBudget(fill([{ answer: 'a', choices: ['a', 'b'] }]), 'lesson', 'practice', settings)).toBe(1);
    expect(effectiveAttemptBudget(fill([{ answer: 'a', choices: ['a', 'b', 'c', 'd'] }]), 'lesson', 'practice', settings)).toBe(3);
    expect(effectiveAttemptBudget(fill([{ answer: 'a' }]), 'lesson', 'practice', settings)).toBe(3);
    expect(effectiveAttemptBudget(fill([{ answer: 'a', choices: ['a', 'b'] }, { answer: 'c', choices: ['c', 'd'] }]), 'lesson', 'practice', settings)).toBe(3);
  });

  it('is unlimited on a stage test, in test and assessment contexts, and for code', () => {
    expect(effectiveAttemptBudget({ ...quiz(), isStageTest: true }, 'lesson', 'practice', settings)).toBe(Infinity);
    expect(effectiveAttemptBudget(quiz(), 'test', 'practice', settings)).toBe(Infinity);
    expect(effectiveAttemptBudget(quiz(), 'assessment', 'learn', settings)).toBe(Infinity);
    expect(effectiveAttemptBudget(code, 'lesson', 'learn', settings)).toBe(Infinity);
  });

  it('uses the Practice-session number in a review (1 by default)', () => {
    expect(effectiveAttemptBudget(multi, 'review', 'practice', settings)).toBe(1);
    expect(effectiveAttemptBudget(multi, 'review', 'learn', { ...settings, review: { attemptsBeforeReveal: 2 } })).toBe(2);
  });

  it('is always at least 1', () => {
    expect(effectiveAttemptBudget(quiz(1), 'lesson', 'practice', settings)).toBe(1);
    const broken = { ...settings, feedback: { ...DEFAULT_FEEDBACK_SETTINGS, attemptsBeforeReveal: { practice: { ...DEFAULT_FEEDBACK_SETTINGS.attemptsBeforeReveal.practice, quiz: 0 }, learn: -3 } } };
    expect(effectiveAttemptBudget(quiz(), 'lesson', 'learn', broken)).toBe(1);
  });
});

describe('wrong-answer notes and the reveal cap', () => {
  it('follows the switch for where the question is answered', () => {
    const off = mergeSettings(DEFAULT_SETTINGS, { feedback: { showWrongAnswerNotes: { practice: false } } }).feedback;
    expect(noteContextFor('lesson', 'learn')).toBe('learn');
    expect(noteContextFor('library', null)).toBe('practice');
    expect(noteContextFor('review', 'learn')).toBe('review');
    expect(wrongAnswerNotesAllowed({}, 'lesson', 'practice', off)).toBe(false);
    expect(wrongAnswerNotesAllowed({}, 'lesson', 'learn', off)).toBe(true);
  });

  it('shows notes on stage tests only when the admin allows it', () => {
    expect(wrongAnswerNotesAllowed({ isStageTest: true }, 'test', 'learn', DEFAULT_FEEDBACK_SETTINGS)).toBe(false);
    expect(wrongAnswerNotesAllowed({ isStageTest: true }, 'test', 'learn', { ...DEFAULT_FEEDBACK_SETTINGS, stageTestWrongAnswerNotes: true })).toBe(true);
  });

  it('caps by mode, Practice when there is none', () => {
    expect(revealCap('learn', DEFAULT_FEEDBACK_SETTINGS)).toBe(80);
    expect(revealCap('practice', DEFAULT_FEEDBACK_SETTINGS)).toBe(60);
    expect(revealCap(null, DEFAULT_FEEDBACK_SETTINGS)).toBe(60);
  });
});
