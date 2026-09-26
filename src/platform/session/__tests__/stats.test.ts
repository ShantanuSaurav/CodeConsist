import { describe, expect, it } from 'vitest';
import { INITIAL_STATS, adoptAccountProgress, hydrateStats, sessionToday, solveWasDeferred, statsAfterSolve } from '../stats';
import { ApiError, OfflineError } from '../../api-client/api';
import { nextStreak } from '../../xp-leveling/leveling';

describe('hydrateStats', () => {
  it('backfills an old v2 save with every field added since', () => {
    // What `cq-user-stats-v2` held before concepts, entitlements or owners existed.
    const old = {
      xp: 1000,
      level: 99,
      streak: 4,
      lastActiveDay: '2020-01-01',
      completedChallenges: ['c1'],
      attempts: { c1: { challengeId: 'c1', score: 100, attempts: 1, hintsUsed: 0, solvedAt: '2020-01-01T10:00:00.000Z' } }
    };
    const stats = hydrateStats(old, undefined, '2026-09-25');
    expect(stats).toEqual({
      ...INITIAL_STATS,
      ...old,
      // Derived, never trusted from the save.
      level: 5,
      streak: 0,
      bestStreak: 4,
      completedStages: [],
      seenConcepts: [],
      isPremium: false,
      unlockedStages: []
    });
  });

  it('keeps a live streak, and levels with the curve it is given', () => {
    const stats = hydrateStats({ xp: 25, streak: 3, bestStreak: 9, lastActiveDay: '2026-09-24' }, { thresholds: [0, 10, 20], overflowStep: 100 }, '2026-09-25');
    expect(stats).toMatchObject({ level: 3, streak: 3, bestStreak: 9 });
  });

  it('survives anything', () => {
    for (const raw of [null, undefined, 'nope', 42, [], { xp: 'lots', attempts: 'x', completedChallenges: 'y', unlockedStages: [1, 'stage-2'] }]) {
      const stats = hydrateStats(raw);
      expect(stats.xp).toBe(Number((raw as any)?.xp) || 0);
      expect(Array.isArray(stats.completedChallenges)).toBe(true);
      expect(typeof stats.attempts).toBe('object');
    }
    expect(hydrateStats({ unlockedStages: [1, 'stage-2'] }).unlockedStages).toEqual(['stage-2']);
  });
});

describe('a zone flip westward', () => {
  // Solved in Auckland on the 27th, then reloaded in Los Angeles at 18:00 on
  // the 26th (01:00Z on the 27th). The server's day never moves back: it
  // still counts the 27th.
  const inLosAngeles = new Date('2026-09-27T01:00:00Z');
  const saved = { xp: 500, streak: 4, bestStreak: 4, lastActiveDay: '2026-09-27' };

  it('counts today as the server does - never a day before the last one recorded', () => {
    expect(sessionToday('America/Los_Angeles', saved, null, inLosAngeles)).toBe('2026-09-27');
    expect(sessionToday('America/Los_Angeles', null, { lastDay: '2026-09-27' }, inLosAngeles)).toBe('2026-09-27');
    // With nothing recorded it is just the local day.
    expect(sessionToday('America/Los_Angeles', INITIAL_STATS, { lastDay: null }, inLosAngeles)).toBe('2026-09-26');
  });

  it('keeps the streak on reload, and the next solve neither restarts it nor lands on the 26th', () => {
    const today = sessionToday('America/Los_Angeles', saved, null, inLosAngeles);
    expect(hydrateStats(saved, undefined, today).streak).toBe(4);
    expect(nextStreak(4, saved.lastActiveDay, today)).toBe(4);
    // What judging it on the browser's own day did.
    expect(hydrateStats(saved, undefined, '2026-09-26').streak).toBe(0);
    expect(nextStreak(4, saved.lastActiveDay, '2026-09-26')).toBe(1);
  });

  it('adopts the streak the server worked out, whatever this browser thinks the day is', () => {
    const cached = hydrateStats(saved, undefined, '2026-09-26');
    const adopted = adoptAccountProgress(cached, { xp: 500, streak: 4, bestStreak: 4, lastActiveDay: '2026-09-27', completedChallenges: ['c1'] });
    expect(adopted).toMatchObject({ xp: 500, streak: 4, lastActiveDay: '2026-09-27', completedChallenges: ['c1'] });
  });
});

describe('statsAfterSolve', () => {
  const prev = { ...INITIAL_STATS, xp: 140, level: 3, completedChallenges: ['a', 'b'], streak: 2, lastActiveDay: '2026-09-25', isPremium: true, unlockedStages: ['s9'] };
  // The server has only seen `a` so far; its XP for it is 120.
  const server = { xp: 120, level: 2, streak: 2, bestStreak: 2, lastActiveDay: '2026-09-25', completedChallenges: ['a'], completedStages: [], attempts: {} };
  const curve = { thresholds: [0, 100, 130], overflowStep: 100 };

  it('keeps what this tab did while the request was in flight when the rules are the same', () => {
    const next = statsAfterSolve(prev, server, { rulesChanged: false, curve, serverDay: '2026-09-25' });
    expect(next).toMatchObject({ xp: 140, level: 3, completedChallenges: ['a', 'b'], streak: 2, isPremium: true, unlockedStages: ['s9'] });
  });

  it('takes the server’s XP - and the level it gives - when the rules changed', () => {
    const next = statsAfterSolve(prev, server, { rulesChanged: true, curve, serverDay: '2026-09-25' });
    expect(next).toMatchObject({ xp: 120, level: 2, completedChallenges: ['a', 'b'] });
  });

  it('judges the streak on the server’s day', () => {
    const afterFlip = { ...server, streak: 5, lastActiveDay: '2026-09-27' };
    expect(statsAfterSolve(prev, afterFlip, { rulesChanged: false, curve, serverDay: '2026-09-27' }).streak).toBe(5);
  });
});

describe('solveWasDeferred', () => {
  it('keeps a solve the server turned away unjudged - too many in a row, or the code runner busy', () => {
    expect(solveWasDeferred(new ApiError('Too many attempts - try again in 2 minutes.', 429, { reason: 'rate-limited', retryAfterSeconds: 90 }))).toBe(true);
    expect(solveWasDeferred(new ApiError('The code runner is busy - try again in a moment.', 503, { reason: 'busy' }))).toBe(true);
  });

  it('treats every other refusal as the verdict it is', () => {
    expect(solveWasDeferred(new ApiError('That submission does not solve the challenge.', 422, { reason: 'tests-failed' }))).toBe(false);
    expect(solveWasDeferred(new ApiError('This lesson is part of a premium stage.', 403, { reason: 'premium-locked' }))).toBe(false);
    expect(solveWasDeferred(new ApiError('Server error.', 503))).toBe(false);
    expect(solveWasDeferred(new ApiError('Session ended.', 401))).toBe(false);
    // Offline has its own branch (the same outcome, its own sentence).
    expect(solveWasDeferred(new OfflineError())).toBe(false);
    expect(solveWasDeferred(new Error('boom'))).toBe(false);
  });
});
