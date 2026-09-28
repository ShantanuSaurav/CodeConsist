/**
 * The administrator's side of Phase 3: one learner's streak and goal in the
 * Users drawer, the support edit (PATCH /users/:id/learning - range-checked
 * and audited), the derived streak and goal columns of the user list, the
 * goal choices on the rules page's context, and the engagement numbers.
 *
 * Real server/db.js (node:fs/promises stubbed), the real admin router and
 * learning services; admin-auth mocked as in admin-analytics.test.mjs.
 */
import express from 'express';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('node:fs/promises', () => ({
  readFile: async () => '{}',
  writeFile: async () => {},
  rename: async () => {},
  mkdir: async () => {}
}));

vi.mock('../admin-auth.js', () => ({
  requireAdminAuth: (req, _res, next) => {
    req.admin = { id: 'admin-1', userId: 'admin' };
    next();
  },
  publicAdmin: (a) => a,
  updateAdminCredentials: async () => ({ ok: false, error: 'stub' })
}));

vi.mock('../excel.js', () => ({
  excelSettingsSummary: () => ({ configured: false }),
  testConnection: async () => ({ ok: false }),
  syncAllUsers: async () => ({ synced: 0, failed: 0 }),
  retryFailed: async () => ({ retried: 0, stillFailing: 0 })
}));

vi.mock('../content.js', async (importOriginal) => {
  const actual = await importOriginal();
  const { CHALLENGES } = await import('./learning-fixture.mjs');
  const all = Object.values(CHALLENGES);
  const snapshot = {
    stages: [{ id: 'stage-1', index: '01', name: 'Stage one', description: '', language: 'javascript' }],
    challenges: all,
    languageTracks: [{ id: 'core', label: 'Core', stageIds: ['stage-1'] }]
  };
  return {
    ...actual,
    contentSnapshot: () => snapshot,
    allChallenges: () => all,
    getChallenge: (id) => (typeof id === 'string' && Object.hasOwn(CHALLENGES, id) ? CHALLENGES[id] : null)
  };
});

import * as store from '../db.js';
import { createAdminRouter } from '../admin.js';
import { createLearningDeps, lib, resetStore } from './learning-fixture.mjs';

let server;
let base;
let learningDeps;

beforeAll(async () => {
  await store.load();
  learningDeps = createLearningDeps(store);
  const app = express().use(express.json()).use('/api/admin', createAdminRouter({ learning: learningDeps }));
  server = await new Promise((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  base = `http://127.0.0.1:${server.address().port}/api/admin`;
});

afterAll(async () => {
  await new Promise((resolve) => server.close(resolve));
});

async function call(method, path, body) {
  const res = await fetch(base + path, {
    method,
    headers: body !== undefined ? { 'content-type': 'application/json' } : {},
    body: body !== undefined ? JSON.stringify(body) : undefined
  });
  return { status: res.status, json: await res.json() };
}

const today = () => lib.dayKeyIn('UTC');
const prefs = (id) => store.normalizePreferences(store.findUserById(id).preferences);

beforeEach(() => {
  resetStore(store, ['u1', 'u2', 'u3']);
  store.updateUser('u1', { preferences: { ...store.normalizePreferences(null), timeZone: 'UTC', timeZoneSetAt: '2026-01-01T00:00:00.000Z' } });
  // u1: a 3-day streak through today, one freeze held.
  const t = today();
  store.setProgress('u1', {
    ...store.getProgress('u1'),
    streak: 3,
    bestStreak: 5,
    lastActiveDay: t,
    habit: { v: 1, freezes: 1, freezeProgress: 2, settledThrough: null, frozenDays: [], repairedDays: [], repair: null, runStart: lib.addDays(t, -2), runs: [] }
  });
  store.updateUser('u2', { preferences: { ...store.normalizePreferences(null), dailyGoalId: 'serious' } });
});

describe('GET /users/:id/learning', () => {
  it('adds the preferences, the stored habit, the derived summary and a 30-day strip', async () => {
    const { status, json } = await call('GET', '/users/u1/learning');
    expect(status).toBe(200);
    expect(json.preferences).toMatchObject({ timeZone: 'UTC', dailyGoalId: null });
    expect(json.effectiveGoal).toMatchObject({ id: 'regular', label: 'Regular' });
    expect(json.habit).toMatchObject({ streak: 3, bestStreak: 5, habit: { freezes: 1 } });
    expect(json.summary).toMatchObject({ streak: 3, freezes: 1, maxFreezes: 2, activeToday: true });
    expect(json.strip).toHaveLength(30);
    expect(json.maxFreezes).toBe(2);
  });
});

describe('PATCH /users/:id/learning', () => {
  it('refuses anything out of range, naming the field, and changes nothing', async () => {
    const cases = [
      [{ freezes: 3 }, 'freezes'],
      [{ freezes: -1 }, 'freezes'],
      [{ freezes: 1.5 }, 'freezes'],
      [{ streak: { value: 401, lastActiveDay: today() } }, 'streak.value'],
      [{ streak: { value: 2 } }, 'streak.lastActiveDay'],
      [{ streak: { value: 2, lastActiveDay: lib.addDays(today(), 1) } }, 'streak.lastActiveDay'],
      [{ dailyGoalId: 'nope' }, 'goal'],
      [{ clearTimeZone: false }, 'clearTimeZone'],
      [{ xp: 5000 }, 'xp'],
      [{}, 'Nothing']
    ];
    for (const [body, word] of cases) {
      const res = await call('PATCH', '/users/u1/learning', body);
      expect(res.status, JSON.stringify(body)).toBe(400);
      expect(res.json.error).toContain(word);
    }
    expect(store.getProgress('u1')).toMatchObject({ streak: 3, habit: { freezes: 1 } });
    expect(store.listAudit({ limit: 10 })).toEqual([]);
  });

  it('404s an unknown learner', async () => {
    expect((await call('PATCH', '/users/nobody/learning', { freezes: 0 })).status).toBe(404);
  });

  it('applies every field and audits each from and to', async () => {
    const lad = lib.addDays(today(), -1);
    const res = await call('PATCH', '/users/u1/learning', { freezes: 2, streak: { value: 10, lastActiveDay: lad }, dailyGoalId: 'intense', clearTimeZone: true });
    expect(res.status).toBe(200);
    expect(res.json.changed.sort()).toEqual(['dailyGoalId', 'freezes', 'streak', 'timeZone']);
    expect(store.getProgress('u1')).toMatchObject({ streak: 10, bestStreak: 10, lastActiveDay: lad, habit: { freezes: 2, runStart: lib.addDays(lad, -9), repair: null } });
    expect(prefs('u1')).toMatchObject({ dailyGoalId: 'intense', timeZone: null, timeZoneSetAt: null });
    expect(res.json.summary).toMatchObject({ streak: 10, freezes: 2 });

    const [entry] = store.listAudit({ limit: 1 });
    expect(entry).toMatchObject({ action: 'learning.user.update', target: 'u1' });
    expect(entry.details.changes).toEqual({
      freezes: { from: 1, to: 2 },
      streak: { from: { value: 3, lastActiveDay: today() }, to: { value: 10, lastActiveDay: lad } },
      dailyGoalId: { from: null, to: 'intense' },
      timeZone: { from: 'UTC', to: null }
    });
  });

  it('a streak of 0 closes the current run into the history as ended by an admin', async () => {
    const res = await call('PATCH', '/users/u1/learning', { streak: { value: 0 } });
    expect(res.status).toBe(200);
    const row = store.getProgress('u1');
    expect(row).toMatchObject({ streak: 0, lastActiveDay: null });
    expect(row.habit.runs).toEqual([{ start: lib.addDays(today(), -2), end: today(), length: 3, ended: 'admin' }]);
  });

  it('a patch that changes nothing is not audited', async () => {
    const res = await call('PATCH', '/users/u1/learning', { freezes: 1, dailyGoalId: null });
    expect(res.status).toBe(200);
    expect(res.json.changed).toEqual([]);
    expect(store.listAudit({ limit: 10 })).toEqual([]);
  });
});

describe('the user list and the rules context', () => {
  it('shows the derived streak and the goal that applies', async () => {
    // u3's stored streak of 4 ended days ago: the list says 0, as the learner sees it.
    store.setProgress('u3', { ...store.getProgress('u3'), streak: 4, lastActiveDay: lib.addDays(today(), -5) });
    const { json } = await call('GET', '/users');
    const byId = Object.fromEntries(json.users.map((u) => [u.id, u]));
    expect(byId.u1).toMatchObject({ streak: 3, goal: { id: 'regular', chosen: false } });
    expect(byId.u2.goal).toMatchObject({ id: 'serious', label: 'Serious', chosen: true });
    expect(byId.u3.streak).toBe(0);
  });

  it('counts goal choices on the settings context', async () => {
    const { json } = await call('GET', '/settings/context');
    expect(json.goals).toEqual({ choiceCounts: { casual: 0, regular: 0, serious: 1, intense: 0 }, unset: 2 });
  });
});

describe('GET /analytics/engagement', () => {
  it('counts goals, streaks, freezes and zones across learners', async () => {
    const { status, json } = await call('GET', '/analytics/engagement');
    expect(status).toBe(200);
    expect(json).toMatchObject({
      goalChoice: { serious: 1 },
      goalUnset: 2,
      learnersWithStreak: 1,
      avgStreak: 3,
      freezesHeld: 1,
      repairsOpen: 0,
      learnersWithTimeZone: 1,
      learners: 3
    });
    for (const key of ['metGoalToday', 'atRiskNow', 'freezesUsed7d', 'repairsDone7d']) expect(typeof json[key]).toBe('number');
  });
});

describe('the engagement week', () => {
  it('counts freezes used over the last 7 whole days and each repair completed in the last 7 days', async () => {
    const t = today();
    const d = (n) => lib.addDays(t, n);
    store.setProgress('u1', {
      ...store.getProgress('u1'),
      habit: {
        ...store.getProgress('u1').habit,
        // Used on the 7 days before today count; 8 days back does not.
        frozenDays: [d(-8), d(-7), d(-1)],
        repairedDays: [d(-9), d(-8), d(-3)],
        // Two repairs won back this week (one today), one 7 days ago - outside.
        repairedOn: [d(-7), d(-6), t]
      }
    });
    const { json } = await call('GET', '/analytics/engagement');
    expect(json).toMatchObject({ freezesUsed7d: 2, repairsDone7d: 2 });
  });
});
