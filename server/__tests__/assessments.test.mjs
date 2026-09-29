/**
 * Test-out and placement over HTTP (Phase 5): server/assessment-routes.js
 * with the real server/db.js (node:fs/promises stubbed), the real shared
 * rules (access, leveling, settings), the real settings, activity and habits
 * services, and `verifySubmission` stubbed (path-fixture.mjs).
 *
 *   - start: 201; a second start 409 `active-exists` (Resume); 429 `cooldown`
 *     and `limit` with `retryAt`; 403 `premium`, `disabled`, `not-reachable`;
 *     404 an unknown stage or track; 503 `unverifiable`;
 *   - submit: a pass writes `testedOut`, the test id, XP equal to
 *     `xpForTestOut` and clears the draft; a wrong answer 422 and unexpected
 *     hints 422 are not counted; below the pass mark is a failure;
 *     `unverifiable` 503 is not counted; the rules are the ones copied at the
 *     start;
 *   - an expired record counts as a failure;
 *   - a placement moves on, and stops at the first test not passed;
 *   - another learner's id, and `__proto__`, are a 404.
 */
import express from 'express';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('node:fs/promises', () => ({
  readFile: async () => '{}',
  writeFile: async () => {},
  rename: async () => {},
  mkdir: async () => {}
}));

import * as store from '../db.js';
import { clearAssessmentCooldown, createAssessmentRouter } from '../assessment-routes.js';
import { createProgressRouter } from '../progress-routes.js';
import { createLearningDeps, lib, resetStore } from './learning-fixture.mjs';
import { PASSING_PY, cleared, completedStagesFor as stagesForStore, contentFor, getChallenge, verifySubmission } from './path-fixture.mjs';

let server;
let root;
let learningDeps;
const drafts = [];
const verified = [];
const flags = { canVerifyPython: false, content: true, premiumLog: false, unverifiable: new Set() };

async function call(method, path, { body, user = 'u1' } = {}) {
  const res = await fetch(root + path, {
    method,
    headers: { ...(body !== undefined ? { 'content-type': 'application/json' } : {}), ...(user ? { 'x-user': user } : {}) },
    body: body !== undefined ? JSON.stringify(body) : undefined
  });
  const text = await res.text();
  return { status: res.status, json: text ? JSON.parse(text) : null };
}

const start = (body, user = 'u1') => call('POST', '/assessments', { body, user });
const testOut = (stageId, user = 'u1') => start({ kind: 'test-out', stageId }, user);
const placement = (trackId = 'core', user = 'u1') => start({ kind: 'placement', trackId }, user);
/** Hand in the current test: answer 0 is right for every fixture stage test. */
const submit = (id, stageId, extra = {}, user = 'u1') =>
  call('POST', `/assessments/${encodeURIComponent(id)}/submit`, { body: { stageId, attempts: 1, hintsUsed: 0, answer: 0, ...extra }, user });
const fail = (id, stageId, reason = 'gave-up', user = 'u1') => call('POST', `/assessments/${encodeURIComponent(id)}/fail`, { body: { stageId, reason }, user });

function setRules(patch) {
  const settings = learningDeps.settings;
  const result = settings.update({ revision: settings.revision(), patch });
  expect(result.ok, JSON.stringify(result.issues)).toBe(true);
}

function setSolved(userId, ids) {
  store.setProgress(userId, { ...store.getProgress(userId), completedChallenges: [...ids] });
}

/** Move a stored record's times into the past (as if `minutes` went by). */
function ageRecord(userId, id, minutes) {
  const log = store.getAssessmentLog(userId);
  const shift = (iso) => (iso ? new Date(Date.parse(iso) - minutes * 60_000).toISOString() : iso);
  store.putAssessmentLog(userId, {
    ...log,
    records: log.records.map((r) => (r.id === id ? { ...r, startedAt: shift(r.startedAt), expiresAt: shift(r.expiresAt), finishedAt: shift(r.finishedAt) } : r))
  });
}

beforeAll(async () => {
  await store.load();
  learningDeps = createLearningDeps(store);
  const app = express();
  app.use(express.json({ limit: '256kb' }));
  app.use((req, _res, next) => {
    const id = req.headers['x-user'];
    req.user = typeof id === 'string' && id ? store.findUserById(id) : null;
    next();
  });
  const requireAuth = (req, res, next) => (req.user ? next() : res.status(401).json({ error: 'Sign in to continue.' }));
  app.use(
    '/api',
    createAssessmentRouter({
      requireAuth,
      store,
      learningDeps,
      getChallengeMerged: getChallenge,
      verifySubmission: async (challenge, body) => {
        verified.push(challenge.id);
        return verifySubmission(challenge, body);
      },
      completedStagesFor: stagesForStore(store),
      clearDraftForSolve: (userId, challengeId) => drafts.push([userId, challengeId]),
      progressionContext: () => (flags.content ? contentFor(store, { premiumEnforced: !flags.premiumLog }) : null),
      // This "server" has no CPython unless a test says so.
      canVerify: (challenge) => !flags.unverifiable.has(challenge.id) && (challenge.language !== 'python' || flags.canVerifyPython)
    })
  );
  // POST /progress/reset, to show what a reset leaves of the log.
  app.use(
    '/api',
    createProgressRouter({
      requireAuth,
      store,
      learningDeps,
      getChallenge,
      getChallengeMerged: getChallenge,
      verifySubmission,
      completedStagesFor: stagesForStore(store),
      clearDraftForSolve: () => {}
    })
  );
  app.use((err, _req, res, _next) => res.status(500).json({ error: err.message }));
  server = await new Promise((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  root = `http://127.0.0.1:${server.address().port}/api`;
});

afterAll(async () => {
  await new Promise((resolve) => server.close(resolve));
});

beforeEach(() => {
  resetStore(store, ['u1', 'u2']);
  store.db().orders = {};
  store.db().contentOverrides = { stages: {}, challenges: {}, languages: {}, units: {} };
  drafts.length = 0;
  verified.length = 0;
  flags.canVerifyPython = false;
  flags.content = true;
  flags.premiumLog = false;
  flags.unverifiable = new Set();
});

/* ------------------------------------------------------------------- start */

describe('starting a test-out', () => {
  it('201 with the record, its rules copied from the settings', async () => {
    const res = await testOut('p3');
    expect(res.status).toBe(201);
    const a = res.json.assessment;
    expect(a).toMatchObject({ kind: 'test-out', trackId: 'core', stageIds: ['p3'], cursor: 0, status: 'active', current: 'p3', results: {}, finishedAt: null });
    expect(a.id).toMatch(/^as_[0-9a-f]{16}$/);
    expect(a.rules).toEqual({ passMark: 80, hintsAllowed: false, maxRuns: 3, xpPercent: 100, clears: true });
    expect(Date.parse(a.expiresAt) - Date.parse(a.startedAt)).toBe(60 * 60_000);
    expect(store.getAssessmentLog('u1').records).toHaveLength(1);
  });

  it('409 active-exists while one is running, with the running one to resume', async () => {
    const first = (await testOut('p3')).json.assessment;
    const again = await testOut('p2');
    expect(again.status).toBe(409);
    expect(again.json).toMatchObject({ reason: 'active-exists', assessment: { id: first.id, current: 'p3' } });
    expect((await placement()).json.reason).toBe('active-exists');
  });

  it('404 for an unknown stage or track, 400 for an unknown kind, 401 signed out', async () => {
    expect((await testOut('nope')).status).toBe(404);
    expect((await placement('nope')).status).toBe(404);
    expect((await start({ kind: 'exam' })).status).toBe(400);
    expect((await testOut('p3', null)).status).toBe(401);
  });

  it('403 premium, disabled and not-reachable', async () => {
    expect(await testOut('p4')).toMatchObject({ status: 403, json: { reason: 'premium' } });
    setRules({ testOut: { disabledStages: ['p3'] } });
    expect(await testOut('p3')).toMatchObject({ status: 403, json: { reason: 'disabled' } });
    setRules({ testOut: { disabledStages: null, enabled: false } });
    expect(await testOut('p3')).toMatchObject({ status: 403, json: { reason: 'disabled' } });
    setRules({ testOut: { enabled: null, allowSkipAhead: false } });
    expect(await testOut('p3')).toMatchObject({ status: 403, json: { reason: 'not-reachable' } });
    expect((await testOut('p2')).status).toBe(201);
    expect(store.getAssessmentLog('u1').records).toHaveLength(1);
  });

  it('409 for a stage already cleared, or one whose lessons are done (take the test itself)', async () => {
    setSolved('u1', [...cleared('p1'), 'p2-a', 'p2-b']);
    expect(await testOut('p1')).toMatchObject({ status: 409, json: { reason: 'already-cleared' } });
    expect(await testOut('p2')).toMatchObject({ status: 409, json: { reason: 'test-pending' } });
  });

  it('503 unverifiable when this server cannot check the stage test itself, unless that is allowed', async () => {
    expect(await testOut('y1')).toMatchObject({ status: 503, json: { reason: 'unverifiable' } });
    expect(store.getAssessmentLog('u1')).toBeNull();
    setRules({ access: { requireServerVerification: false } });
    expect((await testOut('y1')).status).toBe(201);
  });

  it('503 before the content is loaded', async () => {
    flags.content = false;
    expect(await testOut('p3')).toMatchObject({ status: 503, json: { reason: 'unavailable' } });
  });
});

describe('limits and cooldowns', () => {
  it('429 cooldown after a failed test-out, with when it ends', async () => {
    const a = (await testOut('p3')).json.assessment;
    const failed = await fail(a.id, 'p3', 'out-of-runs');
    expect(failed.json.assessment).toMatchObject({ status: 'failed', current: null });
    const again = await testOut('p3');
    expect(again.status).toBe(429);
    expect(again.json.reason).toBe('cooldown');
    expect(Date.parse(again.json.retryAt) - Date.parse(failed.json.assessment.finishedAt)).toBe(60 * 60_000);
    // Another stage is not waiting.
    expect((await testOut('p2')).status).toBe(201);
  });

  it('429 limit once maxAttempts are used in the window', async () => {
    setRules({ testOut: { maxAttempts: 2, cooldownMinutes: 0 } });
    for (let i = 0; i < 2; i++) {
      const a = (await testOut('p3')).json.assessment;
      await fail(a.id, 'p3');
    }
    const refused = await testOut('p3');
    expect(refused.status).toBe(429);
    expect(refused.json.reason).toBe('limit');
    expect(Date.parse(refused.json.retryAt)).toBeGreaterThan(Date.now() + 23 * 3_600_000);
  });

  it("an admin's clear forgets the tries (clearAssessmentCooldown, for the admin route)", async () => {
    const a = (await testOut('p3')).json.assessment;
    await fail(a.id, 'p3');
    expect((await testOut('p3')).status).toBe(429);
    // Dated a moment ahead, so the try just made is certainly before it.
    const log = clearAssessmentCooldown(store, lib, 'u1', 'p3', new Date(Date.now() + 1000));
    expect(Object.keys(log.cooldownClearedAt)).toEqual(['p3']);
    expect(log.records).toHaveLength(1);
    const status = await call('GET', '/assessments/status?trackId=core');
    expect(status.json.testOut.p3).toEqual({ allowed: true, reason: null, retryAt: null, attemptsLeft: 3 });
    // Without a stage, everything: `*`.
    expect(Object.keys(clearAssessmentCooldown(store, lib, 'u1').cooldownClearedAt).sort()).toEqual(['*', 'p3']);
  });

  it('an expired record counts as a failure: 409 on submit, and the cooldown starts from its end', async () => {
    const a = (await testOut('p3')).json.assessment;
    ageRecord('u1', a.id, 61);
    const late = await submit(a.id, 'p3');
    expect(late.status).toBe(409);
    expect(late.json).toMatchObject({ reason: 'expired', assessment: { status: 'expired', current: null } });
    expect(store.getProgress('u1').completedChallenges).toEqual([]);
    // Stored as expired, not active.
    expect(store.getAssessmentLog('u1').records[0].status).toBe('expired');
    const status = (await call('GET', '/assessments/status?trackId=core')).json;
    expect(status.active).toBeNull();
    expect(status.testOut.p3).toMatchObject({ allowed: false, reason: 'cooldown', attemptsLeft: 2 });
  });
});

describe('a progress reset', () => {
  it('clears the tested-out stages but keeps the log, so a cooldown outlives it', async () => {
    const a = (await testOut('p2')).json.assessment;
    expect((await submit(a.id, 'p2')).json.passed).toBe(true);
    const b = (await testOut('p3')).json.assessment;
    await fail(b.id, 'p3');
    expect(store.getProgress('u1').testedOut.p2).toMatchObject({ via: 'test-out' });
    const log = JSON.parse(JSON.stringify(store.getAssessmentLog('u1')));

    const res = await call('POST', '/progress/reset');
    expect(res.status).toBe(200);
    expect(res.json.progress.testedOut).toEqual({});
    expect(store.getProgress('u1').testedOut).toEqual({});
    expect(store.getAssessmentLog('u1')).toEqual(log);
    // Starting over is not a way round the wait.
    expect(await testOut('p3')).toMatchObject({ status: 429, json: { reason: 'cooldown' } });
  });
});

/* ------------------------------------------------------------------ submit */

describe('handing in a test-out', () => {
  it('a pass records the test (via), its share of XP, the record that clears, and drops the draft', async () => {
    setRules({ testOut: { xpPercent: 50 } });
    const a = (await testOut('p3')).json.assessment;
    const res = await submit(a.id, 'p3', { attempts: 2 });
    expect(res.status).toBe(200);
    const expectedXp = lib.xpForTestOut(100, 50, 2, 0, lib.DEFAULT_SETTINGS.xp);
    expect(res.json).toMatchObject({ passed: true, awardedXp: expectedXp, assessment: { status: 'passed', cursor: 1, current: null } });
    expect(res.json.assessment.results.p3).toMatchObject({ outcome: 'passed', runs: 2, hintsUsed: 0, score: 90, verified: true });
    const row = store.getProgress('u1');
    expect(row.completedChallenges).toEqual(['p3-test']);
    expect(row.attempts['p3-test']).toMatchObject({ via: 'test-out', attempts: 2 });
    expect(row.testedOut.p3).toMatchObject({ via: 'test-out', clears: true, assessmentId: a.id });
    expect(row.completedStages).toEqual(['p3']);
    expect(row.xp).toBe(expectedXp);
    expect(drafts).toEqual([['u1', 'p3-test']]);
    // The day row counts the test like any stage test.
    expect(res.json.today).toMatchObject({ tests: 1, xp: expectedXp });
    // Now cleared: no second test-out of it.
    expect((await testOut('p3')).json.reason).toBe('already-cleared');
  });

  it('a wrong answer is 422 and not counted: the run goes on and can still pass', async () => {
    const a = (await testOut('p3')).json.assessment;
    const wrong = await submit(a.id, 'p3', { answer: 1 });
    expect(wrong).toMatchObject({ status: 422, json: { reason: 'wrong' } });
    expect(store.getAssessmentLog('u1').records[0].status).toBe('active');
    expect(store.getProgress('u1').completedChallenges).toEqual([]);
    expect((await submit(a.id, 'p3', { attempts: 2 })).json.passed).toBe(true);
  });

  it('hints when none are allowed are 422, checked before any answer is run', async () => {
    const a = (await testOut('p3')).json.assessment;
    const res = await submit(a.id, 'p3', { hintsUsed: 1 });
    expect(res).toMatchObject({ status: 422, json: { reason: 'hints-not-allowed' } });
    expect(verified).toEqual([]);
    expect(store.getAssessmentLog('u1').records[0].status).toBe('active');
  });

  it('a right answer below the pass mark is a failure: nothing solved, and the cooldown starts', async () => {
    const a = (await testOut('p3')).json.assessment;
    const res = await submit(a.id, 'p3', { attempts: 4 });
    expect(res.status).toBe(200);
    expect(res.json).toMatchObject({ passed: false, awardedXp: 0, assessment: { status: 'failed' } });
    expect(res.json.assessment.results.p3).toMatchObject({ outcome: 'failed', score: 70 });
    expect(store.getProgress('u1').testedOut).toEqual({});
    expect(store.getProgress('u1').completedChallenges).toEqual([]);
    expect((await testOut('p3')).json.reason).toBe('cooldown');
  });

  it('503 unverifiable when the answer could not be checked by the server - not counted', async () => {
    flags.canVerifyPython = true;
    const a = (await testOut('y1')).json.assessment;
    const res = await submit(a.id, 'y1', { answer: undefined, code: PASSING_PY });
    expect(res).toMatchObject({ status: 503, json: { reason: 'unverifiable' } });
    expect(store.getAssessmentLog('u1').records[0].status).toBe('active');
    expect(store.getProgress('u1').completedChallenges).toEqual([]);
  });

  it('keeps the rules copied at the start when the admin changes them', async () => {
    const a = (await testOut('p3')).json.assessment;
    setRules({ testOut: { passMark: 100, xpPercent: 0, countsAsCleared: false } });
    const res = await submit(a.id, 'p3', { attempts: 3 });
    expect(res.json.passed).toBe(true);
    expect(res.json.awardedXp).toBe(lib.xpForTestOut(100, 100, 3, 0, lib.DEFAULT_SETTINGS.xp));
    expect(store.getProgress('u1').testedOut.p3.clears).toBe(true);
    // The next one starts under the new rules.
    const next = (await testOut('p2')).json.assessment;
    expect(next.rules).toMatchObject({ passMark: 100, maxRuns: 1, xpPercent: 0, clears: false });
  });

  it('409 for a test the run is not on, and for a run that is over', async () => {
    const a = (await testOut('p3')).json.assessment;
    expect(await submit(a.id, 'p2')).toMatchObject({ status: 409, json: { reason: 'wrong-stage' } });
    await submit(a.id, 'p3');
    expect(await submit(a.id, 'p3')).toMatchObject({ status: 409, json: { reason: 'not-active' } });
    expect(await fail(a.id, 'p3')).toMatchObject({ status: 409, json: { reason: 'not-active' } });
  });

  it("another learner's record, or a made-up id, is a 404 - __proto__ included", async () => {
    const a = (await testOut('p3')).json.assessment;
    expect((await submit(a.id, 'p3', {}, 'u2')).status).toBe(404);
    expect((await fail(a.id, 'p3', 'gave-up', 'u2')).status).toBe(404);
    expect((await call('POST', `/assessments/${a.id}/finish`, { user: 'u2' })).status).toBe(404);
    for (const id of ['__proto__', 'constructor', 'as_0000000000000000']) {
      expect((await submit(id, 'p3')).status).toBe(404);
      expect((await fail(id, 'p3')).status).toBe(404);
    }
    // Untouched.
    expect(store.getAssessmentLog('u1').records[0].status).toBe('active');
    expect(store.getAssessmentLog('u2')).toBeNull();
  });

  it('400 for a fail without a reason it knows', async () => {
    const a = (await testOut('p3')).json.assessment;
    expect((await call('POST', `/assessments/${a.id}/fail`, { body: { stageId: 'p3', reason: 'bored' } })).status).toBe(400);
  });
});

/* --------------------------------------------------------------- placement */

describe('a placement', () => {
  it('walks its queue: passes move on, and the first test not passed ends it', async () => {
    const res = await placement('core');
    expect(res.status).toBe(201);
    const a = res.json.assessment;
    // p4 is premium (skipped); the default holds at most three tests.
    expect(a).toMatchObject({ kind: 'placement', trackId: 'core', stageIds: ['p1', 'p2', 'p3'], current: 'p1' });
    expect(a.rules).toEqual({ passMark: 70, hintsAllowed: false, maxRuns: 4, xpPercent: 100, clears: true, stopOnFirstFail: true });
    expect(Date.parse(a.expiresAt) - Date.parse(a.startedAt)).toBe(3 * 60 * 60_000);

    const first = await submit(a.id, 'p1', { attempts: 4 });
    expect(first.json.assessment).toMatchObject({ status: 'active', cursor: 1, current: 'p2' });
    expect(first.json.awardedXp).toBe(lib.xpForTestOut(100, 100, 4, 0, lib.DEFAULT_SETTINGS.xp));
    const second = await submit(a.id, 'p2');
    expect(second.json.assessment).toMatchObject({ status: 'active', current: 'p3' });
    expect(second.json.awardedXp).toBe(100);
    // 170 XP meets the default daily goal (100 XP): its bonus comes on the second pass, as on any solve.
    expect(second.json.bonusXp).toBe(10);
    const last = await fail(a.id, 'p3', 'out-of-runs');
    expect(last.json.assessment).toMatchObject({ status: 'finished', cursor: 3, current: null });
    expect(last.json.assessment.results.p3).toMatchObject({ outcome: 'failed' });

    const row = store.getProgress('u1');
    expect(row.testedOut.p1).toMatchObject({ via: 'placement', clears: true, assessmentId: a.id });
    expect(row.testedOut.p2).toMatchObject({ via: 'placement' });
    expect(row.testedOut.p3).toBeUndefined();
    expect(row.completedStages).toEqual(['p1', 'p2']);
    expect(row.xp).toBe(first.json.awardedXp + second.json.awardedXp + second.json.bonusXp);

    // The path: p1 and p2 tested out, p3 open.
    const status = (await call('GET', '/assessments/status?trackId=core')).json;
    expect(status.placement).toMatchObject({ eligible: false, reason: 'cooldown' });
    expect(status.testOut.p1.reason).toBe('already-cleared');
    // p3 is open now; a placement's tries are not test-out tries, so it can still be tested out of.
    expect(status.testOut.p3).toEqual({ allowed: true, reason: null, retryAt: null, attemptsLeft: 3 });
  });

  it('stops at the first test not passed, below the pass mark included', async () => {
    const a = (await placement('core')).json.assessment;
    const res = await submit(a.id, 'p1', { attempts: 5 }); // raw 60 < 70
    expect(res.json).toMatchObject({ passed: false, assessment: { status: 'finished', cursor: 1 } });
    expect(store.getProgress('u1').testedOut).toEqual({});
  });

  it('goes on past a failure when stopOnFirstFail is off, and can be finished early', async () => {
    setRules({ placement: { stopOnFirstFail: false } });
    const a = (await placement('core')).json.assessment;
    expect((await fail(a.id, 'p1', 'gave-up')).json.assessment).toMatchObject({ status: 'active', current: 'p2' });
    const done = await call('POST', `/assessments/${a.id}/finish`);
    expect(done.json.assessment).toMatchObject({ status: 'finished', current: null });
    // A test-out cannot be "finished early".
    const t = (await testOut('p2')).json.assessment;
    expect((await call('POST', `/assessments/${t.id}/finish`)).status).toBe(400);
  });

  it('never queues a test this server cannot check: cut before the first, and not offered when none can be', async () => {
    // The py track's only test is Python, and this server has no CPython.
    const py = await call('GET', '/assessments/status?trackId=py');
    expect(py.json.placement).toEqual({ eligible: false, reason: 'unverifiable', retryAt: null, queue: [] });
    expect(await placement('py')).toMatchObject({ status: 503, json: { reason: 'unverifiable' } });
    expect(store.getAssessmentLog('u1')?.records ?? []).toEqual([]);
    flags.canVerifyPython = true;
    expect((await call('GET', '/assessments/status?trackId=py')).json.placement).toMatchObject({ eligible: true, queue: ['y1'] });

    // One in the middle of the queue: the placement stops short of it.
    flags.unverifiable = new Set(['p2-test']);
    expect((await call('GET', '/assessments/status?trackId=core')).json.placement).toEqual({ eligible: true, reason: null, retryAt: null, queue: ['p1'] });
    const res = await placement('core');
    expect(res.status).toBe(201);
    expect(res.json.assessment.stageIds).toEqual(['p1']);
  });

  it('refuses when switched off, when nothing is left to place, and during the retake wait', async () => {
    setRules({ placement: { enabled: false } });
    expect(await placement('core')).toMatchObject({ status: 403, json: { reason: 'disabled' } });
    setRules({ placement: { enabled: null } });
    setSolved('u1', cleared('c1'));
    expect(await placement('c')).toMatchObject({ status: 409, json: { reason: 'nothing-to-place' } });
    const a = (await placement('core')).json.assessment;
    await call('POST', `/assessments/${a.id}/finish`);
    const again = await placement('core');
    expect(again).toMatchObject({ status: 429, json: { reason: 'cooldown' } });
    expect(Date.parse(again.json.retryAt)).toBeGreaterThan(Date.now() + 6 * 86_400_000);
  });
});

/* ------------------------------------------------------------------ status */

describe('GET /assessments/status', () => {
  it('says what may start now, per stage and for a placement, and what is running', async () => {
    const fresh = await call('GET', '/assessments/status?trackId=core');
    expect(fresh.status).toBe(200);
    expect(fresh.json.placement).toEqual({ eligible: true, reason: null, retryAt: null, queue: ['p1', 'p2', 'p3'] });
    expect(Object.keys(fresh.json.testOut)).toEqual(['p1', 'p2', 'p3', 'p4', 'p5']);
    expect(fresh.json.testOut.p3).toEqual({ allowed: true, reason: null, retryAt: null, attemptsLeft: 3 });
    expect(fresh.json.testOut.p4.reason).toBe('premium');
    expect(fresh.json.active).toBeNull();

    const a = (await testOut('p3')).json.assessment;
    expect((await call('GET', '/assessments/status')).json.active).toMatchObject({ id: a.id, current: 'p3' });
    expect((await call('GET', '/assessments/status?trackId=nope')).status).toBe(404);
  });

  it('while the premium gate only logs, a premium stage is judged as bought - by the status and the start alike', async () => {
    flags.premiumLog = true;
    const status = (await call('GET', '/assessments/status?trackId=core')).json;
    expect(status.testOut.p4).toEqual({ allowed: true, reason: null, retryAt: null, attemptsLeft: 3 });
    expect((await testOut('p4')).status).toBe(201);
  });
});
