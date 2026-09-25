/**
 * Admin analytics built from the activity store: "Most missed", one
 * question's wrong-answer drill-down, and one learner's learning drawer.
 *
 * The old "Most missed" counted `attempts` keys, which are written only on a
 * solve - so it could never list anything. These prove it now fills from
 * recorded misses, honours the threshold setting and labels answers.
 *
 * Real server/db.js (node:fs/promises stubbed), the real admin router and
 * services; the content bank is the small fixture bank.
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
import { CHALLENGES, createLearningDeps, lib, resetStore } from './learning-fixture.mjs';

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

const get = async (path) => {
  const res = await fetch(base + path);
  return { status: res.status, json: await res.json() };
};

/** Record wrong answers for one learner the way POST /activity/misses does. */
function miss(userId, challengeId, rawAnswers, { final = false } = {}) {
  const challenge = CHALLENGES[challengeId];
  const t = Date.now();
  const items = rawAnswers.map((raw, i) => {
    const answer = lib.normalizeMissAnswer(challenge, raw, 200);
    return { challengeId, answer, keys: lib.wrongAnswerKeys(challenge, answer), context: 'lesson', final, at: new Date(t - i * 1000).toISOString() };
  });
  return learningDeps.activity.recordMisses(store.findUserById(userId), items);
}

function setMinLearners(n) {
  const service = learningDeps.settings;
  expect(service.update({ revision: service.revision(), patch: { retention: { mostMissedMinLearners: n } } }).ok).toBe(true);
}

beforeEach(() => {
  resetStore(store, ['u1', 'u2', 'u3', 'u4']);
  miss('u1', 'q-quiz', [0, 2]);
  miss('u2', 'q-quiz', [2], { final: true });
  miss('u3', 'q-quiz', [2]);
  miss('u1', 'q-multi', [[0, 3]]);
  miss('u2', 'q-multi', [[0, 3]]);
  // u4 got it right first time; u1 got there in the end.
  store.setProgress('u4', { ...store.getProgress('u4'), completedChallenges: ['q-quiz'] });
  store.setProgress('u1', { ...store.getProgress('u1'), completedChallenges: ['q-quiz'] });
});

describe('GET /analytics: most missed', () => {
  it('fills from recorded misses, with the old keys kept', async () => {
    const { json } = await get('/analytics');
    expect(json.mostMissed).toHaveLength(1);
    expect(json.mostMissed[0]).toEqual({
      id: 'q-quiz',
      title: 'Pick one',
      stageId: 'stage-1',
      learners: 4,
      missedBy: 3,
      missRate: 0.75,
      totalMisses: 4,
      revealed: 1,
      topWrong: [
        { key: 'o2', label: 'Cherry', count: 3 },
        { key: 'o0', label: 'Apple', count: 1 }
      ],
      attempts: 4,
      solved: 2
    });
  });

  it('applies the minimum-learners setting', async () => {
    setMinLearners(2);
    const two = (await get('/analytics')).json.mostMissed;
    expect(two.map((r) => r.id)).toEqual(['q-multi', 'q-quiz']);
    expect(two[0].topWrong).toEqual([{ key: 'o0.3', label: 'A + D', count: 2 }]);

    setMinLearners(4);
    expect((await get('/analytics')).json.mostMissed).toEqual([]);
  });

  it('forgets a deleted learner', async () => {
    store.deleteUser('u3');
    expect((await get('/analytics')).json.mostMissed).toEqual([]);
  });
});

describe('GET /analytics/challenges/:id/misses', () => {
  it('shows the wrong-answer distribution and recent misses, never who', async () => {
    const { status, json } = await get('/analytics/challenges/q-quiz/misses');
    expect(status).toBe(200);
    expect(json.challenge).toMatchObject({ id: 'q-quiz', type: 'quiz', options: ['Apple', 'Banana', 'Cherry'] });
    expect(json).toMatchObject({ missedBy: 3, totalMisses: 4, revealed: 1 });
    expect(json.answers).toEqual([
      { key: 'o2', label: 'Cherry', count: 3 },
      { key: 'o0', label: 'Apple', count: 1 }
    ]);
    expect(json.recent).toHaveLength(4);
    expect(json.recent.map((r) => r.answer).sort()).toEqual(['Apple', 'Cherry', 'Cherry', 'Cherry']);
    expect(JSON.stringify(json)).not.toMatch(/u1|u2|u3|example\.com/);
  });

  it('404s an unknown question', async () => {
    expect((await get('/analytics/challenges/nope/misses')).status).toBe(404);
  });
});

describe('GET /users/:id/learning', () => {
  it("shows one learner's zone, days and most-missed questions", async () => {
    const { status, json } = await get('/users/u1/learning');
    expect(status).toBe(200);
    expect(json.timeZone).toBe('UTC');
    expect(json.days[json.today]).toMatchObject({ mistakes: 3 });
    expect(json.misses.map((m) => m.challengeId)).toEqual(['q-quiz', 'q-multi']);
    expect(json.misses[0]).toMatchObject({ title: 'Pick one', count: 2 });
    expect(json.misses[1]).toMatchObject({ title: 'Pick some', topWrong: 'A + D' });
  });

  it('404s an unknown learner', async () => {
    expect((await get('/users/nobody/learning')).status).toBe(404);
  });
});

describe('the user list', () => {
  it('computes the level with the current curve', async () => {
    store.setProgress('u1', { ...store.getProgress('u1'), xp: 250, level: 1 });
    const service = learningDeps.settings;
    service.update({ revision: service.revision(), patch: { levels: { thresholds: [0, 10, 100, 200] } } });
    const { json } = await get('/users');
    expect(json.users.find((u) => u.id === 'u1').level).toBe(4);
  });
});
