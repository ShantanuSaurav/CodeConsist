import { describe, expect, it } from 'vitest';
import type { ChallengeAttempt } from '@/types';
import { DEFAULT_UNIT_SETTINGS } from '../../progress/units';
import { applyMergeUnitRewards, applyUnitRewards, completedUnitIds, isPerfectUnit, normalizeUnitsCompleted, perfectUnitIds } from '../rewards';
import type { RewardProgress } from '../rewards';

const UNITS = [
  { id: 's:a1', challengeIds: ['a', 'b'] },
  { id: 's:a2', challengeIds: ['c', 'd'] }
];
const unitFor = (id: string) => UNITS.find((u) => u.challengeIds.includes(id)) ?? null;
const NOW = '2026-09-27T10:00:00.000Z';

const attempt = (id: string, attempts = 1, hintsUsed = 0): ChallengeAttempt => ({ challengeId: id, score: 100, attempts, hintsUsed, solvedAt: NOW });

function row(solved: Record<string, [number, number]>, extra: Partial<RewardProgress> = {}): RewardProgress {
  return {
    xp: 100,
    completedChallenges: Object.keys(solved),
    attempts: Object.fromEntries(Object.entries(solved).map(([id, [a, h]]) => [id, attempt(id, a, h)])),
    ...extra
  };
}

/** "After" a first solve of `id` (clean unless said otherwise), from `before`. */
function solveOf(before: RewardProgress, id: string, tries = 1, hints = 0): RewardProgress {
  return {
    ...before,
    xp: before.xp + 10,
    completedChallenges: [...before.completedChallenges, id],
    attempts: { ...before.attempts, [id]: attempt(id, tries, hints) }
  };
}

describe('applyUnitRewards', () => {
  it('pays the bonus when a first solve completes a unit cleared first try without hints', () => {
    const before = row({ a: [1, 0] });
    const { progress, reward } = applyUnitRewards(before, solveOf(before, 'b'), { challengeId: 'b', firstSolve: true, now: NOW }, { unitFor });
    expect(reward).toEqual({ unitId: 's:a1', perfect: true, bonusXp: 25, completedAt: NOW, challengeId: 'b' });
    expect(progress.xp).toBe(100 + 10 + 25);
    expect(progress.unitsCompleted).toEqual({ 's:a1': { completedAt: NOW, perfect: true, bonusXp: 25 } });
  });

  it('pays nothing for a re-solve, or a solve that does not finish the unit', () => {
    const before = row({ a: [1, 0], b: [1, 0] });
    expect(applyUnitRewards(before, before, { challengeId: 'b', firstSolve: false }, { unitFor }).reward).toBeNull();
    const started = row({});
    expect(applyUnitRewards(started, solveOf(started, 'a'), { challengeId: 'a', firstSolve: true }, { unitFor }).reward).toBeNull();
  });

  it('pays once per unit id', () => {
    const before = row({ a: [1, 0] }, { unitsCompleted: { 's:a1': { completedAt: NOW, perfect: true, bonusXp: 25 } } });
    // The record says it was paid (a regrouping put b back in it, say): nothing more.
    const result = applyUnitRewards(before, solveOf(before, 'b'), { challengeId: 'b', firstSolve: true }, { unitFor });
    expect(result.reward).toBeNull();
    expect(result.progress.xp).toBe(110);
  });

  it('records a completion without a bonus after a retry - or a hint while hints count', () => {
    const retried = row({ a: [2, 0] });
    expect(applyUnitRewards(retried, solveOf(retried, 'b'), { challengeId: 'b', firstSolve: true }, { unitFor }).reward).toMatchObject({ perfect: false, bonusXp: 0 });
    const hinted = row({ a: [1, 1] });
    expect(applyUnitRewards(hinted, solveOf(hinted, 'b'), { challengeId: 'b', firstSolve: true }, { unitFor }).reward).toMatchObject({ perfect: false, bonusXp: 0 });
    // With hints allowed it is perfect, and the configured bonus is paid.
    const cfg = { ...DEFAULT_UNIT_SETTINGS, perfectRequiresNoHints: false, perfectBonusXp: 40 };
    expect(applyUnitRewards(hinted, solveOf(hinted, 'b'), { challengeId: 'b', firstSolve: true }, { unitFor, cfg }).reward).toMatchObject({ perfect: true, bonusXp: 40 });
  });

  it('never mutates the rows it is given', () => {
    const before = row({ a: [1, 0] }, { unitsCompleted: {} });
    const after = solveOf(before, 'b');
    const snapshot = JSON.stringify([before, after]);
    applyUnitRewards(before, after, { challengeId: 'b', firstSolve: true }, { unitFor });
    expect(JSON.stringify([before, after])).toBe(snapshot);
  });
});

describe('applyMergeUnitRewards', () => {
  it('pays only for units the new ids complete, each once', () => {
    const before = row({ a: [1, 0] });
    const merged = { ...solveOf(solveOf(before, 'b'), 'c'), unitsCompleted: before.unitsCompleted };
    const { progress, rewards, bonusXp } = applyMergeUnitRewards(before, merged, { newIds: ['b', 'c'], now: NOW }, { unitFor });
    expect(rewards.map((r) => r.unitId)).toEqual(['s:a1']);
    expect(bonusXp).toBe(25);
    expect(progress.xp).toBe(merged.xp + 25);
  });

  it('pays nothing for a unit that was complete before the merge', () => {
    const before = row({ a: [1, 0], b: [1, 0] });
    const merged = solveOf(before, 'c');
    expect(applyMergeUnitRewards(before, merged, { newIds: ['c'] }, { unitFor }).rewards).toEqual([]);
  });

  it('dates a completion by the latest of its new solves', () => {
    const before = row({});
    const merged = solveOf(solveOf(before, 'a'), 'b');
    const times: Record<string, string> = { a: '2026-09-20T10:00:00.000Z', b: '2026-09-21T10:00:00.000Z' };
    const { rewards } = applyMergeUnitRewards(before, merged, { newIds: ['b', 'a'], solvedAtOf: (id) => times[id] }, { unitFor });
    expect(rewards).toEqual([{ unitId: 's:a1', perfect: true, bonusXp: 25, completedAt: times.b, challengeId: 'b' }]);
  });

  it('ignores any XP or completion the client claims - it only reads solves', () => {
    const before = row({});
    const merged = { ...solveOf(before, 'a'), unitsCompleted: { 's:a2': { completedAt: NOW, perfect: true, bonusXp: 999 } } };
    // `c`/`d` are not solved, so the forged record neither pays nor blocks anything real.
    const { bonusXp } = applyMergeUnitRewards(before, merged, { newIds: ['a'] }, { unitFor });
    expect(bonusXp).toBe(0);
  });
});

describe('badge counts', () => {
  it('counts a unit done from its solves, and keeps a recorded completion', () => {
    expect([...completedUnitIds(UNITS, ['a', 'b'])]).toEqual(['s:a1']);
    expect([...completedUnitIds(UNITS, [], { gone: { completedAt: NOW, perfect: false, bonusXp: 0 } })]).toEqual(['gone']);
  });

  it('keeps a perfect unit perfect after a replay adds attempts (the record)', () => {
    const replayed = { a: attempt('a', 2), b: attempt('b', 1) };
    expect(isPerfectUnit(UNITS[0], replayed)).toBe(false);
    expect([...perfectUnitIds(UNITS, replayed, { 's:a1': { completedAt: NOW, perfect: true, bonusXp: 25 } })]).toEqual(['s:a1']);
    // A learner from before units existed: perfect by their attempts alone.
    expect([...perfectUnitIds(UNITS, { a: attempt('a'), b: attempt('b') })]).toEqual(['s:a1']);
  });

  it('makes a stored record safe', () => {
    expect(normalizeUnitsCompleted({ ok: { completedAt: NOW, perfect: true, bonusXp: 25 }, bad: { completedAt: 'nope' }, junk: 3 })).toEqual({
      ok: { completedAt: NOW, perfect: true, bonusXp: 25 }
    });
    expect(normalizeUnitsCompleted(null)).toEqual({});
  });
});
