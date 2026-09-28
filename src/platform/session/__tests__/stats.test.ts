import { describe, expect, it } from 'vitest';
import {
  INITIAL_STATS,
  adoptAccountProgress,
  hydrateStats,
  pendingReviewLog,
  reviewAnswerFailure,
  sessionToday,
  solveWasDeferred,
  statsAfterSolve,
  withLocalReviewAnswer,
  withPendingReview,
  withoutPendingReviews
} from '../stats';
import { ApiError, OfflineError } from '../../api-client/api';
import { learnerHabitStatus } from '../../habits';
import { DEFAULT_SETTINGS } from '../../settings/defaults';

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
    const stats = hydrateStats(old);
    expect(stats).toEqual({
      ...INITIAL_STATS,
      ...old,
      // Derived, never trusted from the save.
      level: 5,
      // The streak stays RAW: the habits engine works out that it ended long ago.
      streak: 4,
      bestStreak: 4,
      completedStages: [],
      seenConcepts: [],
      isPremium: false,
      unlockedStages: []
    });
  });

  it('keeps a live streak, and levels with the curve it is given', () => {
    const stats = hydrateStats({ xp: 25, streak: 3, bestStreak: 9, lastActiveDay: '2026-09-24' }, { thresholds: [0, 10, 20], overflowStep: 100 });
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

  it('keeps the streak on reload, and never breaks it on a day before the last one counted', () => {
    const today = sessionToday('America/Los_Angeles', saved, null, inLosAngeles);
    const status = (day: string) =>
      learnerHabitStatus(hydrateStats(saved), { settings: DEFAULT_SETTINGS, dailyGoalId: null, today: day, day: null, now: inLosAngeles, zone: 'America/Los_Angeles' });
    expect(hydrateStats(saved).streak).toBe(4);
    expect(status(today)).toMatchObject({ streak: 4, activeToday: true });
    // Even judged on the browser's own (earlier) day, nothing is missed.
    expect(status('2026-09-26').streak).toBe(4);
  });

  it('adopts the streak the server worked out, whatever this browser thinks the day is', () => {
    const cached = hydrateStats(saved);
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
    const next = statsAfterSolve(prev, server, { rulesChanged: false, curve });
    expect(next).toMatchObject({ xp: 140, level: 3, completedChallenges: ['a', 'b'], streak: 2, isPremium: true, unlockedStages: ['s9'] });
  });

  it('takes the server’s XP - and the level it gives - when the rules changed', () => {
    const next = statsAfterSolve(prev, server, { rulesChanged: true, curve });
    expect(next).toMatchObject({ xp: 120, level: 2, completedChallenges: ['a', 'b'] });
  });

  it('takes the server’s raw streak fields, habit included', () => {
    const afterFlip = { ...server, streak: 5, lastActiveDay: '2026-09-27' };
    expect(statsAfterSolve(prev, afterFlip, { rulesChanged: false, curve }).streak).toBe(5);
    const habit = { v: 1 as const, freezes: 1, freezeProgress: 3, settledThrough: null, frozenDays: [], repairedDays: [], repairedOn: [], repair: null, runStart: '2026-09-23', runs: [] };
    expect(statsAfterSolve(prev, { ...afterFlip, habit }, { rulesChanged: false, curve }).habit).toEqual(habit);
    // An older server without habits leaves this tab's own.
    expect(statsAfterSolve({ ...prev, habit }, afterFlip, { rulesChanged: false, curve }).habit).toEqual(habit);
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

describe('unit completions in the stats (P2)', () => {
  it('hydrates unitsCompleted safely from any save', () => {
    expect(hydrateStats({}).unitsCompleted).toEqual({});
    const saved = { unitsCompleted: { 's:a1': { completedAt: '2026-09-25T10:00:00.000Z', perfect: true, bonusXp: 25 }, broken: 'x' } };
    expect(hydrateStats(saved).unitsCompleted).toEqual({ 's:a1': { completedAt: '2026-09-25T10:00:00.000Z', perfect: true, bonusXp: 25 } });
  });

  it('takes the server’s unit completions after a solve', () => {
    const prev = { ...INITIAL_STATS, xp: 60, unitsCompleted: { local: { completedAt: '2026-09-25T10:00:00.000Z', perfect: true, bonusXp: 25 } } };
    const server = { xp: 60, streak: 1, lastActiveDay: '2026-09-25', completedChallenges: [], unitsCompleted: {} };
    expect(statsAfterSolve(prev, server, { rulesChanged: true, curve: { thresholds: [0, 100], overflowStep: 100 } }).unitsCompleted).toEqual({});
  });
});

describe('the Practice schedule and pending Practice answers in the stats (P4)', () => {
  const event = (challengeId: string, at = '2026-09-25T10:00:00.000Z') => ({ challengeId, sessionId: 'local-1', at, day: at.slice(0, 10), outcome: 'clean' as const, correct: true });

  it('hydrates the schedule and the pending answers safely from any save', () => {
    const stats = hydrateStats({
      review: { a: { box: 1, due: '2026-09-26' }, broken: { box: 'x' } },
      unsynced: { reviewLog: [event('a'), { challengeId: '' }, 'junk'] }
    });
    expect(stats.review).toEqual({ a: { box: 1, due: '2026-09-26' } });
    expect(pendingReviewLog(stats)).toEqual([event('a')]);
    // Nothing pending: no field at all.
    expect(hydrateStats({ unsynced: { reviewLog: [] } }).unsynced).toBeUndefined();
  });

  it('adds pending answers, and drops exactly the ones a merge sent', () => {
    let stats = withPendingReview({ ...INITIAL_STATS }, event('a'));
    stats = withPendingReview(stats, event('b', '2026-09-25T11:00:00.000Z'));
    expect(pendingReviewLog(stats).map((e) => e.challengeId)).toEqual(['a', 'b']);
    const sent = pendingReviewLog(stats).slice(0, 1);
    stats = withPendingReview(stats, event('c', '2026-09-25T12:00:00.000Z'));
    expect(pendingReviewLog(withoutPendingReviews(stats, sent)).map((e) => e.challengeId)).toEqual(['b', 'c']);
    expect(withoutPendingReviews(stats, pendingReviewLog(stats)).unsynced).toBeUndefined();
  });

  it('writes a local answer onto the stats as they are when it lands - keeping what the server paid meanwhile', () => {
    // Sent first, fell back to a local price after the next question's answer had landed from the server.
    const landed = { ...INITIAL_STATS, xp: 40, level: 1, completedChallenges: ['a', 'b'], review: { b: { box: 2, due: '2026-10-02', paid: '2026-09-25' } } };
    const next = withLocalReviewAnswer(landed, { challengeId: 'a', state: { box: 1, due: '2026-09-28', last: '2026-09-25T10:00:00.000Z', paid: '2026-09-25' }, xp: 5, event: event('a') });
    expect(next.xp).toBe(45);
    expect(next.review).toEqual({ b: { box: 2, due: '2026-10-02', paid: '2026-09-25' }, a: { box: 1, due: '2026-09-28', last: '2026-09-25T10:00:00.000Z', paid: '2026-09-25' } });
    expect(pendingReviewLog(next)).toEqual([event('a')]);
    // A wrong answer (no event) that paid nothing only moves the schedule.
    const wrong = withLocalReviewAnswer(landed, { challengeId: 'a', state: { box: 0, due: '2026-09-25' }, xp: 0, event: null });
    expect(wrong).toMatchObject({ xp: 40, review: { a: { box: 0, due: '2026-09-25' } } });
    expect(wrong.unsynced).toBeUndefined();
  });

  it('tells an expired session from an answer the server could not take', () => {
    expect(reviewAnswerFailure(new OfflineError())).toBe('local');
    expect(reviewAnswerFailure(new ApiError('Too many attempts.', 429))).toBe('local');
    expect(reviewAnswerFailure(new ApiError('The code runner is busy.', 503, { reason: 'busy' }))).toBe('local');
    expect(reviewAnswerFailure(new ApiError('This practice session has ended. Start a new one.', 404, { reason: 'expired' }))).toBe('expired');
    // A question removed from the bank since: a 404 that is not the session's.
    expect(reviewAnswerFailure(new ApiError('Unknown challenge.', 404))).toBe('failed');
    expect(reviewAnswerFailure(new ApiError('Session ended.', 401))).toBe('signed-out');
    expect(reviewAnswerFailure(new ApiError('Practice is not available yet.', 503))).toBe('failed');
    expect(reviewAnswerFailure(new ApiError('That question is not part of this practice session.', 400))).toBe('failed');
    expect(reviewAnswerFailure(new Error('boom'))).toBe('failed');
  });

  it('keeps the pending answers when the server row is adopted, and takes its schedule', () => {
    const prev = withPendingReview({ ...INITIAL_STATS, review: { a: { box: 0, due: '2026-09-26' } } }, event('a'));
    const next = adoptAccountProgress(prev, { xp: 0, completedChallenges: [], review: { a: { box: 2, due: '2026-10-02' } } });
    expect(next.review).toEqual({ a: { box: 2, due: '2026-10-02' } });
    expect(pendingReviewLog(next)).toHaveLength(1);
  });
});
