/**
 * The administrator's side of Phase 5: one learner's first-run setup and
 * test-outs in the Users drawer, "Clear test-out cooldowns" (audited), the
 * onboarding and placement numbers behind the Analytics card, and the stage
 * list the placement and test-out sections show.
 *
 * Real server/db.js (node:fs/promises stubbed), the real admin router and
 * learning services; admin-auth mocked as in admin-learning.test.mjs.
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
import { ADMIN_ASSESSMENTS_SHOWN, onboardingAnalytics } from '../assessment-routes.js';
import { createLearningDeps, lib, resetStore } from './learning-fixture.mjs';

let server;
let base;
let learningDeps;

beforeAll(async () => {
  await store.load();
  learningDeps = { ...createLearningDeps(store), canVerify: (challenge) => challenge.type !== 'code_runner' };
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

const HOUR = 3600_000;
const iso = (msAgo) => new Date(Date.now() - msAgo).toISOString();

/** A finished test-out of stage-1. */
function testOut(id, { passed = false, hoursAgo = 1 } = {}) {
  const at = iso(hoursAgo * HOUR);
  return {
    id,
    kind: 'test-out',
    trackId: 'core',
    stageIds: ['stage-1'],
    cursor: 1,
    status: passed ? 'passed' : 'failed',
    results: { 'stage-1': { outcome: passed ? 'passed' : 'failed', runs: 2, hintsUsed: 0, score: passed ? 90 : 0, verified: true, at } },
    rules: { passMark: 80, hintsAllowed: false, maxRuns: 3, xpPercent: 100, clears: true },
    startedAt: at,
    expiresAt: iso(hoursAgo * HOUR - HOUR),
    finishedAt: at
  };
}

/** A placement over stage-1 (and a stage since removed), ended after `passed` passes. */
function placement(id, passed) {
  const at = iso(2 * HOUR);
  const stageIds = ['stage-1', 'stage-gone'];
  const results = {};
  stageIds.slice(0, passed).forEach((s) => {
    results[s] = { outcome: 'passed', runs: 1, hintsUsed: 0, score: 100, verified: true, at };
  });
  return {
    id,
    kind: 'placement',
    trackId: 'core',
    stageIds,
    cursor: passed,
    status: 'finished',
    results,
    rules: { passMark: 70, hintsAllowed: false, maxRuns: 4, xpPercent: 100, clears: true, stopOnFirstFail: true },
    startedAt: at,
    expiresAt: iso(0),
    finishedAt: at
  };
}

beforeEach(() => {
  resetStore(store, ['u1', 'u2', 'u3']);
  store.updateUser('u1', {
    onboarding: { completedAt: '2026-09-01T10:00:00.000Z', dismissedAt: null },
    preferences: { ...store.normalizePreferences(null), motivation: 'job', experience: 'some', trackId: 'core', learningMode: 'learn' }
  });
  store.updateUser('u2', {
    onboarding: { completedAt: null, dismissedAt: '2026-09-02T10:00:00.000Z' },
    // An answer the admin has since removed.
    preferences: { ...store.normalizePreferences(null), motivation: 'retired-answer', experience: 'experienced' }
  });
  // u3 never saw the setup, but has progress (an account from before it existed).
  store.setProgress('u3', { ...store.getProgress('u3'), completedChallenges: ['q-quiz'] });
});

describe('GET /users/:id/learning - the setup and test-outs', () => {
  it('shows the setup, its answers, the stages tested out of and the newest assessments first', async () => {
    store.setProgress('u1', {
      ...store.getProgress('u1'),
      testedOut: { 'stage-1': { at: iso(HOUR), via: 'test-out', clears: true, assessmentId: 'as_b' } }
    });
    store.putAssessmentLog('u1', { records: [testOut('as_a', { hoursAgo: 3 }), testOut('as_b', { passed: true })], cooldownClearedAt: {} });
    const { status, json } = await call('GET', '/users/u1/learning');
    expect(status).toBe(200);
    expect(json.setup.onboarding).toEqual({ completedAt: '2026-09-01T10:00:00.000Z', dismissedAt: null });
    expect(json.setup.answers).toEqual({ motivation: 'job', experience: 'some', trackId: 'core', learningMode: 'learn' });
    expect(json.setup.testedOut).toEqual([expect.objectContaining({ stageId: 'stage-1', name: 'Stage 01 · Stage one', via: 'test-out', clears: true })]);
    expect(json.setup.assessments.map((a) => a.id)).toEqual(['as_b', 'as_a']);
    expect(json.setup.assessments[0]).toMatchObject({ kind: 'test-out', status: 'passed', passMark: 80, stages: [{ stageId: 'stage-1', outcome: 'passed', runs: 2 }] });
  });

  it('lists at most the newest 20', async () => {
    const records = Array.from({ length: 25 }, (_, i) => testOut(`as_${String(i).padStart(2, '0')}`, { hoursAgo: 30 - i }));
    store.putAssessmentLog('u1', { records, cooldownClearedAt: {} });
    const { json } = await call('GET', '/users/u1/learning');
    expect(json.setup.assessments).toHaveLength(ADMIN_ASSESSMENTS_SHOWN);
    expect(json.setup.assessments[0].id).toBe('as_24');
  });
});

describe('POST /users/:id/assessments/clear-cooldown', () => {
  beforeEach(() => {
    // Two failed test-outs, the last one ten minutes ago: a cooldown is running.
    store.putAssessmentLog('u1', { records: [testOut('as_a', { hoursAgo: 2 }), testOut('as_b', { hoursAgo: 1 / 6 })], cooldownClearedAt: {} });
  });

  const eligibility = () => {
    const log = lib.normalizeAssessmentLog(store.getAssessmentLog('u1'));
    const stage = { id: 'stage-1', index: '01', name: 'Stage one', description: '', language: 'javascript', challenges: [], state: 'Locked', test: { id: 't-test' } };
    return lib.testOutEligibility({
      stage,
      trackStages: [stage],
      log,
      rules: learningDeps.settings.current().testOut,
      stats: { completedChallenges: [], testedOut: {}, isPremium: false, unlockedStages: [] },
      now: new Date()
    });
  };

  it('clears every cooldown by default, audited, and answers with the drawer view', async () => {
    expect(eligibility()).toMatchObject({ allowed: false, reason: 'cooldown' });
    const { status, json } = await call('POST', '/users/u1/assessments/clear-cooldown', {});
    expect(status).toBe(200);
    expect(Object.keys(json.setup.cooldownClearedAt)).toEqual(['*']);
    expect(eligibility()).toMatchObject({ allowed: true, attemptsLeft: 3 });
    // Nothing passed or recorded is touched.
    expect(lib.normalizeAssessmentLog(store.getAssessmentLog('u1')).records).toHaveLength(2);
    const [entry] = store.listAudit({ limit: 5 });
    expect(entry).toMatchObject({ action: 'assessment.cooldown.clear', target: 'u1', details: { username: 'u1', stageId: '*' } });
  });

  it('clears one stage, or a placement on one track', async () => {
    expect((await call('POST', '/users/u1/assessments/clear-cooldown', { stageId: 'stage-1' })).status).toBe(200);
    expect((await call('POST', '/users/u1/assessments/clear-cooldown', { stageId: 'placement:core' })).status).toBe(200);
    expect(Object.keys(lib.normalizeAssessmentLog(store.getAssessmentLog('u1')).cooldownClearedAt).sort()).toEqual(['placement:core', 'stage-1']);
  });

  it('refuses an unknown stage and an unknown learner, and audits nothing', async () => {
    for (const stageId of ['stage-9', '__proto__', 42, 'placement:java']) {
      const res = await call('POST', '/users/u1/assessments/clear-cooldown', { stageId });
      expect(res.status, String(stageId)).toBe(400);
      expect(res.json.error).toContain('stageId');
    }
    expect((await call('POST', '/users/nobody/assessments/clear-cooldown', {})).status).toBe(404);
    expect(store.listAudit({ limit: 5 })).toEqual([]);
  });
});

describe('GET /analytics/onboarding', () => {
  it('counts the setup, the answers (a removed one as other), placements and test-outs per stage - accounts only', async () => {
    store.putAssessmentLog('u1', { records: [testOut('as_a'), testOut('as_b', { passed: true }), placement('as_p1', 1)], cooldownClearedAt: {} });
    store.putAssessmentLog('u2', { records: [placement('as_p2', 2), testOut('as_c', { passed: true })], cooldownClearedAt: {} });
    const { status, json } = await call('GET', '/analytics/onboarding');
    expect(status).toBe(200);
    expect(json.setup).toEqual({ accounts: 3, completed: 1, dismissed: 1, notYet: 1, notYetWithProgress: 1 });
    const motivation = Object.fromEntries(json.answers.motivation.map((m) => [m.id, m.count]));
    expect(motivation).toMatchObject({ job: 1, college: 0, other: 1 });
    expect(json.answers.noMotivation).toBe(1);
    expect(Object.fromEntries(json.answers.experience.map((e) => [e.id, e.count]))).toEqual({ new: 0, some: 1, experienced: 1 });
    expect(json.placements).toEqual({ started: 2, active: 0, ended: 2, medianStagesPlaced: 1.5 });
    expect(json.testOuts).toEqual([{ stageId: 'stage-1', name: 'Stage 01 · Stage one', attempts: 3, passed: 2, passRate: 67 }]);
  });

  it('is a pure count over what it is given (an expired record counts as ended)', () => {
    const running = { ...placement('as_r', 0), status: 'active', finishedAt: null, expiresAt: iso(HOUR) };
    const out = onboardingAnalytics({
      users: [{ id: 'x', onboarding: null, preferences: {} }],
      progressOf: () => null,
      logOf: () => ({ records: [running], cooldownClearedAt: {} }),
      lib,
      settings: learningDeps.settings.current()
    });
    expect(out.placements).toMatchObject({ started: 1, active: 0, ended: 1, medianStagesPlaced: 0 });
  });
});

describe('the rules context for the placement and test-out sections', () => {
  it('lists every track’s stages with their test and whether this server can check it', async () => {
    const { json } = await call('GET', '/settings/context');
    expect(json.path.tracks).toEqual([{ id: 'core', label: 'Core', hidden: false, stageIds: ['stage-1'] }]);
    expect(json.path.stages).toEqual([
      expect.objectContaining({ id: 'stage-1', name: 'Stage one', test: { id: 't-test', title: 'Stage test', type: 'quiz', language: 'javascript', verifiable: true } })
    ]);
  });
});
