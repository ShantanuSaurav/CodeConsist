/**
 * Phase 3 on the server: the streak, freezes, repair and the daily goal as
 * the solve and merge pipelines run them (server/habits.js over the shared
 * engine in src/platform/habits).
 *
 * Over HTTP where one day is enough (the goal bonus is paid once a day, the
 * response carries `habits` and `habitEvents`), and against the real store
 * with `recordSolveHabits` where the test needs many days (a freeze on the
 * 7th goal day, a repair across a missed day): the route adds nothing on
 * top of it but the clock.
 *
 * Real server/db.js with node:fs/promises stubbed (as in drafts.test.mjs),
 * the real shared rules, the real settings, activity and habits services.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('node:fs/promises', () => ({
  readFile: async () => '{}',
  writeFile: async () => {},
  rename: async () => {},
  mkdir: async () => {}
}));

import * as store from '../db.js';
import { lib, resetStore, startLearnerApp } from './learning-fixture.mjs';

let app;

beforeAll(async () => {
  await store.load();
  app = await startLearnerApp(store);
});

afterAll(async () => {
  await app.close();
});

beforeEach(() => {
  resetStore(store);
});

const solve = (body) => app.call('POST', '/progress/solve', { user: 'u1', zone: 'UTC', body });
const setRules = (patch) => {
  const service = app.learningDeps.settings;
  const result = service.update({ revision: service.revision(), patch });
  expect(result.ok).toBe(true);
};
const user = () => store.findUserById('u1');

/* ------------------------------------------------------------ over HTTP */

describe('the daily goal on a solve', () => {
  it('pays the bonus once, the first time the day reaches the goal', async () => {
    // Regular (the default): 100 XP, +10. The fixture pays 40, 50, 60 and 40.
    const a = await solve({ challengeId: 'q-quiz', answer: 1 });
    expect(a.json).toMatchObject({ bonusXp: 0, habitEvents: { goalMet: false, bonusXp: 0 } });
    expect(a.json.habits.goal).toMatchObject({ optionId: 'regular', metric: 'xp', target: 100, done: 40, met: false });

    const b = await solve({ challengeId: 'q-multi', answer: [0, 2] });
    expect(b.json.habitEvents.goalMet).toBe(false);

    const c = await solve({ challengeId: 'q-blank', answer: ['x'] });
    expect(c.status).toBe(200);
    expect(c.json).toMatchObject({ awardedXp: 60, bonusXp: 10, habitEvents: { goalMet: true, bonusXp: 10 } });
    expect(c.json.bonuses).toEqual([{ kind: 'daily-goal', day: c.json.today.day, xp: 10 }]);
    // The bonus goes on the day beside its XP, never into it (the XP goal reads `xp`).
    expect(c.json.today).toMatchObject({ xp: 150, goalBonusXp: 10, goal: { optionId: 'regular', metric: 'xp', target: 100 } });
    expect(c.json.progress.xp).toBe(160);
    expect(c.json.habits.goal).toMatchObject({ met: true, done: 150 });

    const d = await solve({ challengeId: 'q-order', answer: ['start', 'loop', 'end'] });
    expect(d.json).toMatchObject({ bonusXp: 0, habitEvents: { goalMet: false, bonusXp: 0 } });
    expect(d.json.today.goalBonusXp).toBe(10);
    expect(store.getProgress('u1').xp).toBe(200);
  });

  it('pays what the option says, and nothing with goals switched off', async () => {
    setRules({ goals: { options: [{ id: 'tiny', label: 'Tiny', blurb: '', metric: 'lessons', target: 1, bonusXp: 7, enabled: true }], defaultOptionId: 'tiny' } });
    const first = await solve({ challengeId: 'q-quiz', answer: 1 });
    expect(first.json).toMatchObject({ bonusXp: 7, habitEvents: { goalMet: true } });
    expect(first.json.progress.xp).toBe(47);

    resetStore(store);
    setRules({ goals: { enabled: false } });
    const off = await solve({ challengeId: 'q-quiz', answer: 1 });
    expect(off.json).toMatchObject({ bonusXp: 0, habitEvents: { goalMet: false } });
    expect(off.json.habits.goal).toBeNull();
  });

  it('counts the learner’s own goal choice', async () => {
    store.updateUser('u1', { preferences: { ...store.normalizePreferences(null), dailyGoalId: 'casual' } });
    const res = await solve({ challengeId: 'q-multi', answer: [0, 2] });
    expect(res.json).toMatchObject({ bonusXp: 5, habitEvents: { goalMet: true } });
    expect(res.json.today.goal.optionId).toBe('casual');
  });

  it('answers GET /progress with the derived status beside the row', async () => {
    await solve({ challengeId: 'q-quiz', answer: 1 });
    const res = await app.call('GET', '/progress', { user: 'u1' });
    expect(res.json.progress).toMatchObject({ streak: 1 });
    expect(res.json.habits).toMatchObject({ streak: 1, activeToday: true, freezes: 0, maxFreezes: 2, repair: null });
  });
});

/* ----------------------------------------------------- against the store */

/**
 * One passing solve on `day` (UTC), the way the route runs steps 10-11:
 * the day row first, then the habits. Pays `xp` like a first solve would.
 */
function solveOn(day, { xp = 100, firstSolve = true } = {}) {
  const u = user();
  const now = new Date(`${day}T12:00:00.000Z`);
  const progress = store.getProgress('u1');
  const today = app.learningDeps.activity.todayFor(u, progress, now);
  expect(today).toBe(day);
  const dayRow = app.learningDeps.activity.recordSolve(u, {
    challengeId: `c-${day}-${Math.random()}`,
    isTest: false,
    firstSolve,
    awardedXp: xp,
    day: today,
    at: now.toISOString()
  });
  const next = { ...progress, xp: progress.xp + xp };
  const result = app.learningDeps.habits.recordSolveHabits({ user: u, progress: next, today, dayRow, now });
  store.setProgress('u1', result.next);
  return result;
}

const statusOn = (day) => app.learningDeps.habits.habitSummary(user(), store.getProgress('u1'), new Date(`${day}T12:00:00.000Z`));

describe('freezes and repair against the real store', () => {
  beforeEach(() => {
    store.updateUser('u1', { preferences: { ...store.normalizePreferences(null), timeZone: 'UTC', timeZoneSetAt: '2026-01-01T00:00:00.000Z' } });
  });

  it('earns a freeze on the 7th goal day, and pays each goal bonus once', () => {
    const days = ['2026-03-01', '2026-03-02', '2026-03-03', '2026-03-04', '2026-03-05', '2026-03-06', '2026-03-07'];
    const earned = days.map((day) => solveOn(day).habitEvents.freezeEarned);
    expect(earned).toEqual([false, false, false, false, false, false, true]);
    const status = statusOn('2026-03-07');
    expect(status).toMatchObject({ streak: 7, freezes: 1, freezeProgress: 0 });
    // Seven days of 100 XP, and seven goal bonuses of 10 - never two on a day.
    expect(store.getProgress('u1').xp).toBe(770);
    expect(solveOn('2026-03-07').bonusXp).toBe(0);
    expect(store.getProgress('u1').xp).toBe(870);
  });

  it('a freeze covers one missed day: the streak goes on', () => {
    setRules({ streak: { freeze: { startingCount: 1 } } });
    solveOn('2026-03-01');
    solveOn('2026-03-02');
    // 03-03 missed; the freeze held covers it.
    const back = solveOn('2026-03-04');
    expect(back.habitEvents.frozenDays).toEqual(['2026-03-03']);
    expect(statusOn('2026-03-04')).toMatchObject({ streak: 3, freezes: 0, repair: null });
  });

  it('a repair completes: extra lessons within the window win the streak back', () => {
    for (const day of ['2026-03-01', '2026-03-02', '2026-03-03', '2026-03-04', '2026-03-05']) solveOn(day, { xp: 40 });
    // 03-06 missed, no freeze held: on 03-07 the run of 5 is broken, and an offer opens.
    const first = solveOn('2026-03-07', { xp: 40 });
    expect(first.habitEvents.broken).toEqual({ lostStreak: 5, repairOffered: true });
    let status = statusOn('2026-03-07');
    expect(status.streak).toBe(1);
    expect(status.repair).toMatchObject({ lostStreak: 5, missedDays: ['2026-03-06'], required: 3, done: 1, remaining: 2 });

    solveOn('2026-03-07', { xp: 0, firstSolve: false });
    const third = solveOn('2026-03-07', { xp: 0, firstSolve: false });
    expect(third.habitEvents.repaired).toBe(true);
    status = statusOn('2026-03-07');
    // The lost 5, the missed day bridged (not counted), and today.
    expect(status).toMatchObject({ streak: 6, repair: null, bestStreak: 6 });
    expect(store.getProgress('u1').habit.repairedDays).toEqual(['2026-03-06']);
    expect(store.getProgress('u1').habit.runs).toEqual([]);
  });

  it('a repair expires once its window has passed', () => {
    for (const day of ['2026-03-01', '2026-03-02', '2026-03-03']) solveOn(day, { xp: 40 });
    // Missed 03-04 and 03-05: the offer (window 2 days from the first missed day) ran out on 03-06.
    expect(statusOn('2026-03-05').repair).toMatchObject({ missedDays: ['2026-03-04'] });
    const late = statusOn('2026-03-07');
    expect(late.repair).toBeNull();
    expect(late.streak).toBe(0);
    expect(late.runs).toEqual([{ start: '2026-03-01', end: '2026-03-03', length: 3, ended: 'missed' }]);
  });
});

describe('reset keeps the streak history', () => {
  it('closes the current run as reset, freezes back to the start', async () => {
    await solve({ challengeId: 'q-quiz', answer: 1 });
    const res = await app.call('POST', '/progress/reset', { user: 'u1' });
    expect(res.json.progress.habit.runs).toEqual([expect.objectContaining({ length: 1, ended: 'reset' })]);
    expect(res.json.habits).toMatchObject({ streak: 0, freezes: 0 });
  });
});

describe('a guest who signs up keeps their streak and goal', () => {
  it('adopts the guest habit (freezes capped) and the goal choice', async () => {
    const today = lib.dayKeyIn('UTC');
    const yesterday = lib.addDays(today, -1);
    const res = await app.call('POST', '/progress/merge', {
      user: 'u1',
      zone: 'UTC',
      body: {
        progress: { streak: 4, bestStreak: 4, lastActiveDay: yesterday, completedChallenges: [] },
        habit: { v: 1, freezes: 9, freezeProgress: 3, runStart: lib.addDays(yesterday, -3), runs: [] },
        preferences: { dailyGoalId: 'serious' }
      }
    });
    expect(res.status).toBe(200);
    expect(res.json.progress).toMatchObject({ streak: 4, lastActiveDay: yesterday });
    // At most `freeze.maxHeld` (2) is believed.
    expect(res.json.progress.habit.freezes).toBe(2);
    expect(res.json.preferences.dailyGoalId).toBe('serious');
    expect(res.json.habits).toMatchObject({ streak: 4, goal: { optionId: 'serious' } });
  });
});

/* ------------------------------------------- what a merge may not believe */

describe('a merge never makes up streak days', () => {
  const today = () => lib.dayKeyIn('UTC');
  const merge = (body) => app.call('POST', '/progress/merge', { user: 'u1', zone: 'UTC', body });
  beforeEach(() => {
    store.updateUser('u1', { preferences: { ...store.normalizePreferences(null), timeZone: 'UTC', timeZoneSetAt: '2026-01-01T00:00:00.000Z' } });
  });

  it('re-solve counters a browser reports for past days add nothing to an existing streak', async () => {
    const t = today();
    // A 20-day run that ended 6 days ago: the streak is gone.
    store.setProgress('u1', {
      ...store.getProgress('u1'),
      completedChallenges: ['q-quiz'],
      streak: 20,
      bestStreak: 20,
      lastActiveDay: lib.addDays(t, -6),
      habit: { v: 1, freezes: 0, freezeProgress: 0, settledThrough: null, frozenDays: [], repairedDays: [], repair: null, runStart: lib.addDays(t, -25), runs: [] }
    });
    const days = {};
    for (let n = 5; n >= 1; n--) days[lib.addDays(t, -n)] = { reSolves: 1 };
    const res = await merge({ progress: { completedChallenges: ['q-quiz'] }, activity: { days } });
    expect(res.status).toBe(200);
    expect(res.json.habits.streak).toBe(0);
    // The stored (raw) run is untouched: no day was added to it.
    expect(store.getProgress('u1')).toMatchObject({ streak: 20, bestStreak: 20, lastActiveDay: lib.addDays(t, -6) });
  });

  it('after a reset, a merge keeps the account’s own (empty) streak: no adopted streak, no refilled freezes', async () => {
    await solve({ challengeId: 'q-quiz', answer: 1 });
    await app.call('POST', '/progress/reset', { user: 'u1' });
    const t = today();
    const res = await merge({
      progress: { streak: 400, bestStreak: 400, lastActiveDay: t, completedChallenges: [] },
      habit: { v: 1, freezes: 9, freezeProgress: 0, runs: [{ start: '2019-01-01', end: lib.addDays(t, -1), length: 99999, ended: 'missed' }] }
    });
    expect(res.status).toBe(200);
    expect(res.json.habits).toMatchObject({ streak: 0, freezes: 0 });
    const stored = store.getProgress('u1');
    expect(stored).toMatchObject({ streak: 0, bestStreak: 0 });
    expect(stored.habit.runs.map((r) => r.ended)).toEqual(['reset']);
  });

  it('a new account’s adopted habit is held to what could have happened', async () => {
    const t = today();
    const yesterday = lib.addDays(t, -1);
    const res = await merge({
      progress: { streak: 3, bestStreak: 3, lastActiveDay: t, completedChallenges: [] },
      habit: {
        v: 1,
        freezes: 1,
        runStart: '2019-01-01',
        repair: { lostStreak: 99999, lostRunStart: '2019-01-01', missedDays: [yesterday], expiresDay: '2099-12-31', required: 3, done: 0 },
        runs: [
          { start: '2019-01-01', end: '2026-01-10', length: 99999, ended: 'missed' },
          { start: '2026-01-01', end: '2026-01-05', length: 5, ended: 'missed' }
        ]
      }
    });
    expect(res.status).toBe(200);
    const habit = store.getProgress('u1').habit;
    // The run: as long as the streak, no longer.
    expect(habit.runStart).toBe(lib.addDays(t, -2));
    // A run longer than its days, or than any plausible streak, is dropped.
    expect(habit.runs).toEqual([{ start: '2026-01-01', end: '2026-01-05', length: 5, ended: 'missed' }]);
    // The offer: open no longer than the window allows, worth at most the plausible streak.
    const cap = app.learningDeps.settings.current().streak.maxPlausibleMergedStreak;
    expect(habit.repair).toMatchObject({ expiresDay: lib.addDays(yesterday, 2), lostStreak: cap - 3, required: 3 });
    expect(habit.repair.lostRunStart).toBe(lib.addDays(yesterday, -(cap - 3)));
  });

  it('drops a guest’s repair offer when repair is off', async () => {
    setRules({ streak: { repair: { enabled: false } } });
    const t = today();
    const yesterday = lib.addDays(t, -1);
    await merge({
      progress: { streak: 0, bestStreak: 5, lastActiveDay: lib.addDays(t, -2), completedChallenges: [] },
      habit: { v: 1, freezes: 0, repair: { lostStreak: 5, missedDays: [yesterday], expiresDay: lib.addDays(yesterday, 2), required: 3, done: 0 } }
    });
    expect(store.getProgress('u1').habit.repair).toBeNull();
  });

  it('pays no goal bonus for a day the merge did not credit (a reset, then a lower goal)', async () => {
    // 40 XP: short of Regular (100).
    await solve({ challengeId: 'q-quiz', answer: 1 });
    await app.call('POST', '/progress/reset', { user: 'u1' });
    store.updateUser('u1', { preferences: { ...store.normalizePreferences(user().preferences), dailyGoalId: 'casual' } });
    // Casual is 50: still short. Lower still: a 1-lesson goal the day already meets.
    setRules({ goals: { options: [{ id: 'tiny', label: 'Tiny', blurb: '', metric: 'lessons', target: 1, bonusXp: 7, enabled: true }], defaultOptionId: 'tiny' } });
    const res = await merge({ progress: { completedChallenges: [] } });
    expect(res.status).toBe(200);
    expect(res.json.bonusXp).toBe(0);
    expect(store.getProgress('u1').xp).toBe(0);
  });

  it('an older day merged onto a streak already worked out past it does not bring the run back', async () => {
    const t = today();
    store.setProgress('u1', {
      ...store.getProgress('u1'),
      completedChallenges: ['q-multi'],
      streak: 10,
      bestStreak: 10,
      lastActiveDay: lib.addDays(t, -5),
      habit: { v: 1, freezes: 0, freezeProgress: 0, settledThrough: null, frozenDays: [], repairedDays: [], repair: null, runStart: lib.addDays(t, -14), runs: [] }
    });
    // Support gives two freezes: the row is stored worked out through yesterday.
    const edit = app.learningDeps.habits.adminUpdate(user(), { freezes: 2 });
    expect(edit.ok).toBe(true);
    // An offline first solve from 4 days ago arrives.
    const solvedAt = new Date(`${lib.addDays(t, -4)}T12:00:00.000Z`).toISOString();
    const res = await merge({
      progress: {
        completedChallenges: ['q-multi', 'q-quiz'],
        attempts: { 'q-quiz': { attempts: 1, hintsUsed: 0, solvedAt: solvedAt, xpEarned: 40 } }
      }
    });
    expect(res.status).toBe(200);
    expect(res.json.habits).toMatchObject({ streak: 0, freezes: 2 });
  });
});

describe('goal-met with daily goals switched off', () => {
  it('still counts a passing solve as a streak day', async () => {
    setRules({ streak: { dayRule: 'goal-met' }, goals: { enabled: false } });
    const res = await solve({ challengeId: 'q-quiz', answer: 1 });
    expect(res.json.habitEvents).toMatchObject({ streakDay: true, goalMet: false });
    expect(res.json.habits).toMatchObject({ streak: 1, activeToday: true, dayRule: 'any-solve', goal: null });
  });
});
