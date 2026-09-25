import { describe, expect, it } from 'vitest';
import type { Challenge } from '@/types';
import { ALL_CHALLENGES } from '../content';
import { canRevealSolution, contextForMode, revealsAnswers } from '../session/rules';
import type { AnswerContext } from '../session/rules';

const CONTEXTS: AnswerContext[] = ['lesson', 'test', 'review', 'library', 'assessment'];

const lesson = { isStageTest: false, solutionCode: 'function f() {}' } as Pick<Challenge, 'isStageTest' | 'solutionCode'>;

describe('canRevealSolution', () => {
  it('is false for every stage test in the bank, in every context, however many runs failed', () => {
    const tests = ALL_CHALLENGES.filter((c) => c.isStageTest);
    expect(tests.length).toBeGreaterThan(0);
    for (const challenge of tests) {
      for (const context of CONTEXTS) {
        for (const attempts of [0, 2, 5, 50]) {
          expect(canRevealSolution({ challenge, context, isCorrect: false, attempts })).toBe(false);
        }
      }
    }
  });

  it('is false for a stage test even when it carries a solution', () => {
    const challenge = { isStageTest: true, solutionCode: 'function f() {}' };
    expect(canRevealSolution({ challenge, context: 'lesson', isCorrect: false, attempts: 10 })).toBe(false);
  });

  it('is false in test and assessment contexts, even for a lesson', () => {
    for (const context of ['test', 'assessment'] as const) {
      expect(canRevealSolution({ challenge: lesson, context, isCorrect: false, attempts: 10 })).toBe(false);
    }
  });

  it('offers a lesson solution after two failed runs, and not before or once solved', () => {
    expect(canRevealSolution({ challenge: lesson, context: 'lesson', isCorrect: false, attempts: 1 })).toBe(false);
    expect(canRevealSolution({ challenge: lesson, context: 'lesson', isCorrect: false, attempts: 2 })).toBe(true);
    expect(canRevealSolution({ challenge: lesson, context: 'library', isCorrect: false, attempts: 3 })).toBe(true);
    expect(canRevealSolution({ challenge: lesson, context: 'lesson', isCorrect: true, attempts: 3 })).toBe(false);
    expect(canRevealSolution({ challenge: { isStageTest: false }, context: 'lesson', isCorrect: false, attempts: 3 })).toBe(false);
  });
});

describe('revealsAnswers', () => {
  it('never reveals a stage test, whatever the context', () => {
    for (const context of CONTEXTS) expect(revealsAnswers(context, { isStageTest: true })).toBe(false);
  });

  it('reveals lessons except in test-like contexts', () => {
    expect(revealsAnswers('lesson', { isStageTest: false })).toBe(true);
    expect(revealsAnswers('library', {})).toBe(true);
    expect(revealsAnswers('review', {})).toBe(true);
    expect(revealsAnswers('test', {})).toBe(false);
    expect(revealsAnswers('assessment', {})).toBe(false);
  });

  it('maps practice-session modes onto contexts', () => {
    expect(contextForMode('test')).toBe('test');
    expect(contextForMode('lessons')).toBe('lesson');
  });
});
