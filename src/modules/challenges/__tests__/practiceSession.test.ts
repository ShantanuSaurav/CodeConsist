import { describe, expect, it } from 'vitest';
import type { Challenge, Stage, Unit } from '@/types';
import { reachableLessonIndex, resolveOpenTarget } from '../session/PracticeSessionProvider';
import { EMPTY_COUNTS, countSolve, levelToAnnounceOnClose, runSummary } from '../session/useUnitRun';

const lesson = (id: string): Challenge =>
  ({ id, stageId: 's', title: id, type: 'quiz', difficulty: 'easy', language: 'javascript', prompt: 'p', explanation: 'e', xpReward: 10 }) as Challenge;

function unit(id: string, index: number, ids: string[]): Unit {
  const challenges = ids.map(lesson);
  return { id, name: `Unit ${index + 1}`, challengeIds: ids, stageId: 's', index, challenges, estMinutes: 1, xp: 10 * ids.length, source: 'default' };
}

const units = [unit('s:a1', 0, ['a', 'b', 'c']), unit('s:a2', 1, ['d', 'e']), unit('s:b1', 2, ['f', 'g'])];
const stage: Pick<Stage, 'challenges' | 'units'> = { challenges: units.flatMap((u) => u.challenges), units };

describe('resolveOpenTarget', () => {
  it('lands on the current unit, at its first unsolved lesson', () => {
    expect(resolveOpenTarget(stage, [])).toEqual({ unitId: 's:a1', index: 0 });
    expect(resolveOpenTarget(stage, ['a', 'b', 'c', 'd'])).toEqual({ unitId: 's:a2', index: 1 });
  });

  it('opens a lesson in a reachable unit where it is', () => {
    expect(resolveOpenTarget(stage, ['a', 'b', 'c'], 'b')).toEqual({ unitId: 's:a1', index: 1 });
    expect(resolveOpenTarget(stage, ['a', 'b', 'c'], 'd')).toEqual({ unitId: 's:a2', index: 0 });
  });

  it('pulls a deep link into a locked unit back to the current one, with a notice', () => {
    const target = resolveOpenTarget(stage, ['a'], 'f');
    expect(target).toMatchObject({ unitId: 's:a1', index: 1 });
    expect(target.notice).toMatch(/Finish Unit 1 first/);
  });

  it('pulls a lesson past the first unsolved one in the current unit back, with a notice', () => {
    const target = resolveOpenTarget(stage, [], 'c');
    expect(target).toMatchObject({ unitId: 's:a1', index: 0 });
    expect(target.notice).toMatch(/lessons open in order/);
  });

  it('opens Unit 1 for review when the stage is done', () => {
    expect(resolveOpenTarget(stage, ['a', 'b', 'c', 'd', 'e', 'f', 'g'])).toEqual({ unitId: 's:a1', index: 0 });
  });

  it('never puts the stage test in a unit: its id lands wherever the learner is', () => {
    expect(resolveOpenTarget(stage, ['a', 'b', 'c'], 's-test')).toEqual({ unitId: 's:a2', index: 0 });
  });

  it('keeps the old rule for a stage without units', () => {
    const flat = { challenges: ['a', 'b', 'c'].map(lesson) };
    expect(resolveOpenTarget(flat, ['a'])).toEqual({ unitId: null, index: 1 });
    expect(resolveOpenTarget(flat, [], 'c')).toMatchObject({ unitId: null, index: 0, notice: expect.any(String) });
    expect(reachableLessonIndex(flat.challenges, ['a', 'b', 'c'])).toBe(2);
  });
});

describe('a unit run', () => {
  const outcome = (overrides = {}) => ({ solveXp: 10, perfectBonusXp: 0, goalBonusXp: 0, totalXp: 10, unitCompleted: null, perfect: false, verifiedByServer: true, ...overrides });

  it('counts first-try answers, hints, XP and a completion', () => {
    let counts = countSolve(EMPTY_COUNTS, { attempts: 1, hints: 0, outcome: outcome() });
    counts = countSolve(counts, { attempts: 2, hints: 1, outcome: outcome() });
    counts = countSolve(counts, { attempts: 1, hints: 0, outcome: outcome({ perfectBonusXp: 25, totalXp: 35, unitCompleted: 's:a1', perfect: false }) });
    expect(counts).toMatchObject({ questions: 3, firstTry: 2, hints: 1, xp: 55, perfectBonusXp: 25, unitCompleted: 's:a1', unverified: 0 });
    expect(runSummary(counts)).toEqual({ accuracy: 67, flawless: false });
  });

  it('counts the daily-goal bonus a solve in the run paid (Phase 3)', () => {
    let counts = countSolve(EMPTY_COUNTS, { attempts: 1, hints: 0, outcome: outcome() });
    expect(counts).toMatchObject({ goalMet: false, goalBonusXp: 0 });
    counts = countSolve(counts, { attempts: 1, hints: 0, outcome: outcome({ goalBonusXp: 10, goalMet: true, totalXp: 20 }) });
    counts = countSolve(counts, { attempts: 1, hints: 0, outcome: outcome() });
    expect(counts).toMatchObject({ goalMet: true, goalBonusXp: 10, xp: 40 });
  });

  it('is flawless only with every answer first try and no hint; empty has no accuracy', () => {
    const clean = countSolve(countSolve(EMPTY_COUNTS, { attempts: 1, hints: 0, outcome: outcome() }), { attempts: 1, hints: 0, outcome: outcome({ verifiedByServer: false }) });
    expect(runSummary(clean)).toEqual({ accuracy: 100, flawless: true });
    expect(clean.unverified).toBe(1);
    expect(runSummary(EMPTY_COUNTS)).toEqual({ accuracy: null, flawless: false });
  });

  it('toasts a level crossed only when the run closes before its end screen', () => {
    // Closed mid-unit after crossing level 4 -> 5: the end screen never said it.
    expect(levelToAnnounceOnClose({ finished: false, levelBefore: 4, level: 5 })).toBe(5);
    // The end screen was reached: it (or its level-up line) already announced it.
    expect(levelToAnnounceOnClose({ finished: true, levelBefore: 4, level: 5 })).toBeNull();
    // No level crossed, or the run never took its snapshot.
    expect(levelToAnnounceOnClose({ finished: false, levelBefore: 5, level: 5 })).toBeNull();
    expect(levelToAnnounceOnClose({ finished: false, levelBefore: null, level: 5 })).toBeNull();
  });
});
