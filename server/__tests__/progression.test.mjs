/**
 * The stage order on the server (Phase 5), server/progression.js:
 *
 *   - learnerAccess: a learner's stages built exactly as their browser
 *     builds them (the shared groupIntoStages + applyProgressByTrack);
 *   - checkSolveAccess under `access.solveGate` off / log / enforce, after
 *     the premium gate, with the in-memory counters the admin watches - and
 *     wired into the real solve route (403 before any code runs);
 *   - completedStagesFor counting a test-out record that `clears`;
 *   - applySolveCore (server/progress-rules.js), shared by the solve and the
 *     assessment routes: the same maths, plus a test-out's share;
 *   - a guest's test-out claims (verifyClaims + acceptClaims): verified,
 *     wrong, unverifiable, over the cap, below the pass mark, and the rest;
 *   - filterMerge under `access.mergeGate`, which drops a forged later-stage
 *     lesson - and the merge route's `droppedChallenges` and `claims`.
 *
 * Real server/db.js with node:fs/promises stubbed.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('node:fs/promises', () => ({
  readFile: async () => '{}',
  writeFile: async () => {},
  rename: async () => {},
  mkdir: async () => {}
}));

import * as store from '../db.js';
import {
  LOCK_MESSAGES,
  MAX_CLAIMS,
  acceptClaims,
  checkSolveAccess,
  completedStagesFor,
  filterMerge,
  learnerAccess,
  noteGate,
  progressionGateStats,
  resetProgressionGateStats,
  verifyClaims
} from '../progression.js';
import { applySolveCore } from '../progress-rules.js';
import { BusyError } from '../rate-limit.js';
import { lib, resetStore, startLearnerApp } from './learning-fixture.mjs';
import { PASSING_PY, SNAPSHOT, cleared, completedStagesFor as stagesForStore, contentFor, getChallenge, verifySubmission } from './path-fixture.mjs';

const clone = (v) => JSON.parse(JSON.stringify(v));
const user = (id = 'u1') => store.findUserById(id);
const overrides = () => store.getContentOverrides();

/** The learner's stored row, with these solves (and test-outs). */
function setSolved(userId, ids, testedOut = {}) {
  store.setProgress(userId, { ...store.getProgress(userId), completedChallenges: [...ids], testedOut });
}

const record = (clears = true, via = 'test-out') => ({ at: '2026-09-28T10:00:00.000Z', via, clears, assessmentId: 'as_1' });

/** The context server/index.js builds for a solve (progressionContext). */
const solveCtx = (solveGate, extra = {}) => ({
  snapshot: SNAPSHOT,
  overrides: overrides(),
  mode: 'enforce',
  route: 'solve',
  lib,
  solveGate,
  progressFor: (u) => store.getProgress(u.id),
  ...extra
});

let orderSeq = 0;
function paid(userId, product) {
  orderSeq += 1;
  return store.putOrder({
    id: `ord_p5_${orderSeq}`,
    userId,
    product,
    productKey: 'x',
    amount: 0,
    currency: 'INR',
    provider: 'admin',
    status: 'paid',
    createdAt: new Date(Date.UTC(2026, 0, 1, 0, orderSeq)).toISOString(),
    paidAt: new Date().toISOString()
  });
}

beforeAll(async () => {
  await store.load();
});

beforeEach(() => {
  resetStore(store, ['u1', 'u2']);
  store.db().orders = {};
  store.db().certificates = {};
  store.db().contentOverrides = { stages: {}, challenges: {}, languages: {}, units: {} };
  resetProgressionGateStats();
});

/* ------------------------------------------------------------ learnerAccess */

describe('learnerAccess', () => {
  const states = (access) => Object.fromEntries(access.stages.map((s) => [s.id, s.state]));

  it('builds the stages the browser shows: each track its own chain, premium never damming', () => {
    const fresh = learnerAccess(user(), store.getProgress('u1'), { lib, snapshot: SNAPSHOT, overrides: overrides() });
    expect(states(fresh)).toEqual({ p1: 'In progress', p2: 'Locked', p3: 'Locked', p4: 'Locked', p5: 'In progress', c1: 'In progress', y1: 'In progress' });
    setSolved('u1', cleared('p1'));
    const after = learnerAccess(user(), store.getProgress('u1'), { lib, snapshot: SNAPSHOT, overrides: overrides() });
    expect(after.stage('p1').state).toBe('Completed');
    expect(after.stage('p2').state).toBe('In progress');
    expect(after.trackOf('p2').track.id).toBe('core');
    expect(after.trackOf('p2').stages.map((s) => s.id)).toEqual(['p1', 'p2', 'p3', 'p4', 'p5']);
  });

  it('leaves out hidden tracks and hidden stages, as the browser does', () => {
    store.db().contentOverrides.languages = { c: { hidden: true } };
    store.db().contentOverrides.stages = { p2: { hidden: true } };
    setSolved('u1', cleared('p1'));
    const access = learnerAccess(user(), store.getProgress('u1'), { lib, snapshot: SNAPSHOT, overrides: overrides() });
    expect(access.tracks.map((t) => t.id)).toEqual(['core', 'py']);
    expect(access.stage('p2')).toBeNull();
    // With p2 gone, p3 follows p1.
    expect(access.stage('p3').state).toBe('In progress');
  });

  it('reads a lifetime licence and bought stages, and uses the test-out records', () => {
    paid('u1', { kind: 'lifetime' });
    setSolved('u1', ['p3-test'], { p3: record(true) });
    const access = learnerAccess(user(), store.getProgress('u1'), { lib, snapshot: SNAPSHOT, overrides: overrides() });
    expect(access.stats.isPremium).toBe(true);
    expect(states(access)).toMatchObject({ p1: 'In progress', p2: 'In progress', p3: 'Completed', p4: 'In progress', p5: 'Locked' });
    expect(access.stage('p3').testedOut).toBe(true);
  });

  it('is null before the content or the rules are loaded', () => {
    expect(learnerAccess(user(), store.getProgress('u1'), { lib, snapshot: null })).toBeNull();
    expect(learnerAccess(user(), store.getProgress('u1'), { lib: null, snapshot: SNAPSHOT })).toBeNull();
  });
});

/* ------------------------------------------------------- checkSolveAccess */

describe('checkSolveAccess under access.solveGate', () => {
  let warn;
  beforeEach(() => {
    warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });
  afterAll(() => warn?.mockRestore());

  it('off: no check, nothing counted', () => {
    expect(checkSolveAccess(user(), getChallenge('p2-a'), solveCtx('off'))).toEqual({ ok: true });
    expect(progressionGateStats().solve).toMatchObject({ refused: 0, wouldRefuse: 0 });
  });

  it('log: lets it through, counts it and says so in the log', () => {
    expect(checkSolveAccess(user(), getChallenge('p2-a'), solveCtx('log'))).toEqual({ ok: true });
    const stats = progressionGateStats().solve;
    expect(stats).toMatchObject({ refused: 0, wouldRefuse: 1, wouldRefuse24h: 1, byReason: { 'stage-locked': 1 } });
    expect(stats.lastAt).toEqual(expect.any(String));
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('[progression] would refuse solve (stage-locked) p2-a'));
  });

  it('enforce: refuses a lesson in a locked stage, with the reason and the sentence', () => {
    expect(checkSolveAccess(user(), getChallenge('p2-a'), solveCtx('enforce'))).toEqual({
      ok: false,
      reason: 'stage-locked',
      stageId: 'p2',
      error: LOCK_MESSAGES['stage-locked']
    });
    expect(progressionGateStats().solve).toMatchObject({ refused: 1, refused24h: 1, wouldRefuse: 0 });
    // The 24-hour count forgets it a day later; the count since boot does not.
    expect(progressionGateStats(Date.now() + 25 * 3_600_000).solve).toMatchObject({ refused: 1, refused24h: 0 });
  });

  it('keeps counting the last 24 hours after a full day nobody looked at', () => {
    const clock = vi.spyOn(Date, 'now');
    const start = Date.UTC(2026, 8, 1);
    try {
      clock.mockReturnValue(start);
      // A day of 10,000 would-refusals (the most kept) with no admin reading them...
      noteGate('merge', { mode: 'log', reason: 'stage-locked', count: 10_000 });
      clock.mockReturnValue(start + 2 * 86_400_000);
      // ...never stops the next day's from counting.
      noteGate('merge', { mode: 'log', reason: 'stage-locked', count: 3 });
    } finally {
      clock.mockRestore();
    }
    expect(progressionGateStats(start + 2 * 86_400_000).merge).toMatchObject({ wouldRefuse: 10_003, wouldRefuse24h: 3 });
  });

  it('enforce: refuses a stage test before its lessons, and allows it after', () => {
    expect(checkSolveAccess(user(), getChallenge('p1-test'), solveCtx('enforce'))).toMatchObject({ ok: false, reason: 'test-locked', stageId: 'p1' });
    setSolved('u1', ['p1-a', 'p1-b']);
    expect(checkSolveAccess(user(), getChallenge('p1-test'), solveCtx('enforce'))).toEqual({ ok: true });
  });

  it('enforce: allows what the path shows open - the next stage, a re-solve, a tested-out stage and the ones before it', () => {
    expect(checkSolveAccess(user(), getChallenge('p1-a'), solveCtx('enforce')).ok).toBe(true);
    setSolved('u1', cleared('p1'));
    expect(checkSolveAccess(user(), getChallenge('p2-a'), solveCtx('enforce')).ok).toBe(true);
    expect(checkSolveAccess(user(), getChallenge('p1-test'), solveCtx('enforce')).ok).toBe(true);
    setSolved('u2', ['p3-test'], { p3: record(true) });
    expect(checkSolveAccess(user('u2'), getChallenge('p2-a'), solveCtx('enforce')).ok).toBe(true);
    expect(checkSolveAccess(user('u2'), getChallenge('p3-a'), solveCtx('enforce')).ok).toBe(true);
  });

  it('enforce: sticky evidence - a stage already worked in stays open', () => {
    // A solve in p3 from before the order was enforced (p2 never cleared).
    setSolved('u1', [...cleared('p1'), 'p3-a']);
    expect(checkSolveAccess(user(), getChallenge('p3-b'), solveCtx('enforce')).ok).toBe(true);
    expect(checkSolveAccess(user(), getChallenge('p3-test'), solveCtx('enforce'))).toMatchObject({ ok: false, reason: 'test-locked' });
  });

  it('enforce: a hidden stage is unavailable', () => {
    store.db().contentOverrides.stages = { p2: { hidden: true } };
    expect(checkSolveAccess(user(), getChallenge('p2-a'), solveCtx('enforce'))).toMatchObject({ ok: false, reason: 'stage-unavailable' });
  });

  it('the premium gate goes first; with the stage bought, the order still applies', () => {
    expect(checkSolveAccess(user(), getChallenge('p4-a'), solveCtx('enforce'))).toEqual({ ok: false, reason: 'premium-locked', stageId: 'p4' });
    paid('u1', { kind: 'stage', stageId: 'p4' });
    expect(checkSolveAccess(user(), getChallenge('p4-a'), solveCtx('enforce'))).toMatchObject({ ok: false, reason: 'stage-locked', stageId: 'p4' });
    setSolved('u1', cleared('p1', 'p2', 'p3'));
    expect(checkSolveAccess(user(), getChallenge('p4-a'), solveCtx('enforce'))).toEqual({ ok: true });
  });

  it('with the premium gate only logging, a premium stage is judged by the order alone', () => {
    const ctx = solveCtx('enforce', { mode: 'log' });
    expect(checkSolveAccess(user(), getChallenge('p4-a'), ctx)).toMatchObject({ ok: false, reason: 'stage-locked' });
    setSolved('u1', cleared('p1', 'p2', 'p3'));
    expect(checkSolveAccess(user(), getChallenge('p4-a'), ctx)).toEqual({ ok: true, logged: true, stageId: 'p4' });
  });

  it('without the rules or the learner row there is nothing to judge with: allowed', () => {
    expect(checkSolveAccess(user(), getChallenge('p2-a'), solveCtx('enforce', { lib: null })).ok).toBe(true);
    expect(checkSolveAccess(user(), getChallenge('p2-a'), solveCtx('enforce', { snapshot: null, mode: 'log' })).ok).toBe(true);
  });
});

/* ------------------------------------------------------- the solve route */

describe('the solve route behind the stage order', () => {
  let app;
  const gate = { solve: 'enforce' };
  const verified = [];

  beforeAll(async () => {
    app = await startLearnerApp(store, {
      progress: {
        getChallenge,
        getChallengeMerged: getChallenge,
        completedStagesFor: stagesForStore(store),
        verifySubmission: async (challenge, body) => {
          verified.push(challenge.id);
          return verifySubmission(challenge, body);
        },
        checkSolveAccess: (u, challenge) => checkSolveAccess(u, challenge, solveCtx(gate.solve)),
        progressionContext: () => contentFor(store)
      }
    });
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    verified.length = 0;
    gate.solve = 'enforce';
  });

  const solve = (challengeId, answer = 1) => app.call('POST', '/progress/solve', { user: 'u1', body: { challengeId, answer } });

  it('enforce: 403 with the reason, before any code runs, recording nothing', async () => {
    const res = await solve('p2-a');
    expect(res.status).toBe(403);
    expect(res.json).toEqual({ error: LOCK_MESSAGES['stage-locked'], reason: 'stage-locked', stageId: 'p2' });
    expect(verified).toEqual([]);
    expect(store.getProgress('u1').completedChallenges).toEqual([]);
    expect((await solve('p1-test', 0)).json.reason).toBe('test-locked');
  });

  it('log: the solve goes through and is counted', async () => {
    gate.solve = 'log';
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const res = await solve('p2-a');
    expect(res.status).toBe(200);
    expect(res.json.progress.completedChallenges).toEqual(['p2-a']);
    expect(progressionGateStats().solve.wouldRefuse).toBe(1);
    warn.mockRestore();
  });

  it('an open lesson solves as always, and the stage clears through the shared rule', async () => {
    for (const id of ['p1-a', 'p1-b']) expect((await solve(id)).status).toBe(200);
    const res = await solve('p1-test', 0);
    expect(res.status).toBe(200);
    expect(res.json.progress.completedStages).toEqual(['p1']);
    expect((await solve('p2-a')).status).toBe(200);
  });
});

/* ------------------------------------------------------ completedStagesFor */

describe('completedStagesFor', () => {
  const run = (ids, testedOut) => completedStagesFor(ids, testedOut, { snapshot: SNAPSHOT, overrides: overrides() });

  it('clears a stage by its lessons and test, or by a record that clears with the test solved', () => {
    expect(run(cleared('p1'), {})).toEqual(['p1']);
    expect(run(['p2-test'], { p2: record(true) })).toEqual(['p2']);
    expect(run(['p2-test'], { p2: record(false) })).toEqual([]);
    expect(run([], { p2: record(true) })).toEqual([]);
    expect(run([...cleared('p1'), 'p3-test'], { p3: record(true, 'placement') })).toEqual(['p1', 'p3']);
  });

  it('counts only the lessons learners are served, and reads records as own properties', () => {
    store.db().contentOverrides.challenges = { 'p1-b': { hidden: true } };
    expect(run(['p1-a', 'p1-test'], {})).toEqual(['p1']);
    expect(run(['p2-test'], JSON.parse('{"__proto__": {"clears": true}}'))).toEqual([]);
    expect(completedStagesFor(['p1-a'], {}, {})).toEqual([]);
  });
});

/* ---------------------------------------------------------- applySolveCore */

describe('applySolveCore (shared by the solve and the assessment routes)', () => {
  const rules = clone(lib.DEFAULT_SETTINGS);
  const base = () => store.getProgress('u1');
  const now = new Date('2026-09-28T12:00:00.000Z');
  const core = (challengeId, extra = {}) =>
    applySolveCore({
      progress: base(),
      challenge: getChallenge(challengeId),
      attempts: 2,
      hintsUsed: 0,
      now,
      lib,
      xp: rules.xp,
      levels: rules.levels,
      completedStagesFor: stagesForStore(store),
      ...extra
    });

  it('prices and records an ordinary solve exactly as before', () => {
    const { next, awarded, score, firstSolve } = core('p1-a');
    expect(awarded).toBe(lib.xpForSolve(20, 2, 0, rules.xp));
    expect(score).toBe(90);
    expect(firstSolve).toBe(true);
    expect(next.attempts['p1-a']).toEqual({
      challengeId: 'p1-a',
      score: 90,
      attempts: 2,
      hintsUsed: 0,
      solvedAt: now.toISOString(),
      lastSolvedAt: now.toISOString(),
      solves: 1
    });
    expect(next.testedOut).toEqual({});
  });

  it('a test passed in a test-out pays its share, says how, and writes the record before counting stages', () => {
    const testOut = { stageId: 'p2', via: 'test-out', clears: true, assessmentId: 'as_9', xpPercent: 50 };
    const { next, awarded } = core('p2-test', { attempts: 1, testOut });
    expect(awarded).toBe(lib.xpForTestOut(100, 50, 1, 0, rules.xp));
    expect(awarded).toBe(50);
    expect(next.attempts['p2-test'].via).toBe('test-out');
    expect(next.testedOut).toEqual({ p2: { at: now.toISOString(), via: 'test-out', clears: true, assessmentId: 'as_9' } });
    expect(next.completedStages).toEqual(['p2']);
    expect(next.xp).toBe(50);
  });

  it('a record that does not clear opens the stage without clearing it', () => {
    const { next } = core('p2-test', { testOut: { stageId: 'p2', via: 'placement', clears: false, assessmentId: 'as_9', xpPercent: 100 } });
    expect(next.testedOut.p2.clears).toBe(false);
    expect(next.completedStages).toEqual([]);
  });
});

/* ------------------------------------------------------- guest test-out claims */

describe('a guest’s test-out claims', () => {
  const at = () => new Date().toISOString();
  const claim = (stageId, extra = {}) => ({ kind: 'test-out', stageId, testId: `${stageId}-test`, attempts: 1, hintsUsed: 0, answer: 0, at: at(), ...extra });
  const rulesWith = (patch = {}) => {
    const rules = clone(lib.DEFAULT_SETTINGS);
    for (const [section, values] of Object.entries(patch)) Object.assign(rules[section], values);
    return rules;
  };

  async function merge(claims, { rules = rulesWith(), userId = 'u1', premiumEnforced = true, verify = verifySubmission } = {}) {
    const verified = await verifyClaims(claims, { rules, lib, getChallengeMerged: getChallenge, verifySubmission: verify });
    const now = new Date();
    const result = acceptClaims(store.getProgress(userId), verified.checked, {
      user: user(userId),
      lib,
      rules,
      now,
      zone: 'UTC',
      today: lib.dayKeyIn('UTC', now),
      completedStagesFor: stagesForStore(store),
      snapshot: SNAPSHOT,
      overrides: overrides(),
      premiumEnforced
    });
    return { ...result, rejected: [...verified.rejected, ...result.rejected] };
  }

  it('keeps a verified pass: the test solved (via), its share of XP, the record that clears, a credit for the day', async () => {
    const result = await merge([claim('p3')]);
    expect(result.accepted).toEqual([{ stageId: 'p3', testId: 'p3-test', kind: 'test-out', xp: 100 }]);
    expect(result.rejected).toEqual([]);
    expect(result.awardedXp).toBe(lib.xpForTestOut(100, 100, 1, 0, lib.DEFAULT_SETTINGS.xp));
    expect(result.progress.completedChallenges).toEqual(['p3-test']);
    expect(result.progress.attempts['p3-test'].via).toBe('test-out');
    expect(result.progress.testedOut.p3).toMatchObject({ via: 'test-out', clears: true, assessmentId: 'guest-test-out' });
    expect(result.progress.completedStages).toEqual(['p3']);
    expect(result.credits).toEqual([expect.objectContaining({ challengeId: 'p3-test', isTest: true, awardedXp: 100 })]);
  });

  it('refuses a wrong answer, and one this server could not check while verification is required', async () => {
    expect((await merge([claim('p3', { answer: 1 })])).rejected).toEqual([{ stageId: 'p3', reason: 'wrong' }]);
    const py = claim('y1', { answer: undefined, code: PASSING_PY });
    expect((await merge([py])).rejected).toEqual([{ stageId: 'y1', reason: 'unverifiable' }]);
    const relaxed = await merge([py], { rules: rulesWith({ access: { requireServerVerification: false } }) });
    expect(relaxed.accepted.map((a) => a.stageId)).toEqual(['y1']);
  });

  it('refuses below the pass mark, and hints when none are allowed - without running anything', async () => {
    const runs = [];
    const verify = async (c, b) => {
      runs.push(c.id);
      return verifySubmission(c, b);
    };
    const result = await merge([claim('p2', { attempts: 4 }), claim('p3', { hintsUsed: 1 })], { verify });
    expect(result.rejected).toEqual([
      { stageId: 'p2', reason: 'below-pass-mark' },
      { stageId: 'p3', reason: 'hints' }
    ]);
    expect(runs).toEqual([]);
    // A placement test has its own, lower pass mark (70: four runs).
    expect((await merge([claim('p2', { kind: 'placement', attempts: 4 })])).accepted.map((a) => a.kind)).toEqual(['placement']);
  });

  it('checks at most MAX_CLAIMS claims; the rest are refused as over the cap', async () => {
    const many = Array.from({ length: MAX_CLAIMS + 2 }, (_, i) => claim(`zz${i}`));
    const result = await merge(many);
    const overCap = result.rejected.filter((r) => r.reason === 'over-cap').map((r) => r.stageId);
    expect(overCap).toEqual([`zz${MAX_CLAIMS}`, `zz${MAX_CLAIMS + 1}`]);
    expect(result.rejected.filter((r) => r.reason === 'not-a-test')).toHaveLength(MAX_CLAIMS);
  });

  it('refuses claims switched off, malformed ones and the wrong test', async () => {
    expect((await merge([claim('p3')], { rules: rulesWith({ access: { acceptGuestClaims: false } }) })).rejected).toEqual([{ stageId: 'p3', reason: 'disabled' }]);
    expect((await merge([claim('p3')], { rules: rulesWith({ testOut: { enabled: false } }) })).rejected).toEqual([{ stageId: 'p3', reason: 'disabled' }]);
    expect((await merge([claim('p3', { testId: 'p3-a' })])).rejected).toEqual([{ stageId: 'p3', reason: 'not-a-test' }]);
    expect((await merge([claim('p3', { testId: 'p2-test' })])).rejected).toEqual([{ stageId: 'p3', reason: 'not-a-test' }]);
    expect((await merge([{ stageId: 'p3', kind: 'exam' }])).rejected).toEqual([{ stageId: 'p3', reason: 'invalid' }]);
    // The browser's map by stage id is read too; a second claim for a stage is ignored.
    expect((await merge({ p3: claim('p3') })).accepted).toHaveLength(1);
    expect((await merge([claim('p3'), claim('p3', { answer: 1 })])).accepted).toHaveLength(1);
  });

  it('never runs a test the account has already solved, and counts each run against the limit', async () => {
    const runs = [];
    const verify = async (c, b) => {
      runs.push(c.id);
      return verifySubmission(c, b);
    };
    let budget = 1;
    const verified = await verifyClaims([claim('p2'), claim('p3'), claim('p5')], {
      rules: rulesWith(),
      lib,
      getChallengeMerged: getChallenge,
      verifySubmission: verify,
      alreadySolved: (testId) => testId === 'p2-test',
      mayRun: () => budget-- > 0
    });
    expect(verified.rejected).toEqual([
      { stageId: 'p2', reason: 'already-cleared' },
      { stageId: 'p5', reason: 'rate-limited' }
    ]);
    expect(runs).toEqual(['p3-test']);
    expect(verified.checked.map((c) => c.claim.stageId)).toEqual(['p3']);
  });

  it('refuses a premium stage, a stage already cleared, and one out of reach', async () => {
    expect((await merge([claim('p4')])).rejected).toEqual([{ stageId: 'p4', reason: 'premium' }]);
    // While the premium gate only logs, the stage is judged as bought.
    expect((await merge([claim('p4')], { premiumEnforced: false })).accepted.map((a) => a.stageId)).toEqual(['p4']);
    setSolved('u1', cleared('p1'));
    expect((await merge([claim('p1')])).rejected).toEqual([{ stageId: 'p1', reason: 'already-cleared' }]);
    // With skip-ahead off, only the first locked stage (p2 for a new learner) can be claimed.
    const noSkip = rulesWith({ testOut: { allowSkipAhead: false } });
    expect((await merge([claim('p3')], { rules: noSkip, userId: 'u2' })).rejected).toEqual([{ stageId: 'p3', reason: 'not-reachable' }]);
    expect((await merge([claim('p2')], { rules: noSkip, userId: 'u2' })).accepted.map((a) => a.stageId)).toEqual(['p2']);
  });

  it('takes claims in track order, so each one opens the way for the next', async () => {
    const noSkip = rulesWith({ testOut: { allowSkipAhead: false } });
    const result = await merge([claim('p3'), claim('p2'), claim('p1')], { rules: noSkip });
    expect(result.accepted.map((a) => a.stageId)).toEqual(['p1', 'p2', 'p3']);
    expect(result.progress.completedStages).toEqual(['p1', 'p2', 'p3']);
  });

  it('a placement claims at most maxStages tests, from its queue', async () => {
    const rules = rulesWith({ placement: { maxStages: 2 } });
    const placement = (stageId) => claim(stageId, { kind: 'placement' });
    const result = await merge([placement('p1'), placement('p2'), placement('p3')], { rules });
    expect(result.accepted.map((a) => a.stageId)).toEqual(['p1', 'p2']);
    expect(result.rejected).toEqual([{ stageId: 'p3', reason: 'not-reachable' }]);
    expect(result.progress.testedOut.p1.via).toBe('placement');
  });
});

/* ------------------------------------------------------ filterMerge */

describe('filterMerge under access.mergeGate', () => {
  let warn;
  beforeEach(() => {
    warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });
  afterAll(() => warn?.mockRestore());

  const ctx = (mergeGate) => ({ lib, mergeGate, snapshot: SNAPSHOT, overrides: overrides() });
  const incoming = ['p1-a', 'p1-b', 'p3-a', 'p3-test', 'c1-a'];

  it('enforce drops a forged later-stage lesson and a test without its lessons', () => {
    const result = filterMerge(user(), store.getProgress('u1'), incoming, ctx('enforce'));
    expect(result).toEqual({ accepted: ['p1-a', 'p1-b', 'c1-a'], dropped: ['p3-a', 'p3-test'] });
    expect(progressionGateStats().merge).toMatchObject({ refused: 2, byReason: { 'stage-locked': 2 } });
  });

  it('builds on the account as it is - its solves and its test-outs', () => {
    setSolved('u1', ['p2-test'], { p2: record(true) });
    expect(filterMerge(user(), store.getProgress('u1'), incoming, ctx('enforce'))).toEqual({ accepted: ['p1-a', 'p1-b', 'p3-a', 'c1-a'], dropped: ['p3-test'] });
  });

  it('log credits everything and counts what would have been held back; off does not look', () => {
    expect(filterMerge(user(), store.getProgress('u1'), incoming, ctx('log'))).toEqual({ accepted: incoming, dropped: [] });
    expect(progressionGateStats().merge).toMatchObject({ refused: 0, wouldRefuse: 2 });
    expect(filterMerge(user(), store.getProgress('u1'), incoming, ctx('off'))).toEqual({ accepted: incoming, dropped: [] });
    expect(progressionGateStats().merge.wouldRefuse).toBe(2);
  });
});

/* -------------------------------------------------------- the merge route */

describe('the merge route: claims first, then the stage order', () => {
  let app;

  beforeAll(async () => {
    app = await startLearnerApp(store, {
      progress: {
        getChallenge,
        getChallengeMerged: getChallenge,
        completedStagesFor: stagesForStore(store),
        verifySubmission,
        progressionContext: () => contentFor(store),
        progression: { verifyClaims, acceptClaims, filterMerge }
      }
    });
  });

  it('without the merge steps (a bare router) claims are unavailable and nothing is held back', async () => {
    const bare = await startLearnerApp(store, {
      progress: { getChallenge, getChallengeMerged: getChallenge, completedStagesFor: stagesForStore(store), verifySubmission, progressionContext: () => contentFor(store) }
    });
    try {
      const res = await bare.call('POST', '/progress/merge', {
        user: 'u1',
        body: { progress: { completedChallenges: ['p3-a'], attempts: {} }, assessmentClaims: { p2: { kind: 'test-out', stageId: 'p2', testId: 'p2-test', answer: 0 } } }
      });
      expect(res.status).toBe(200);
      expect(res.json.claims).toEqual({ accepted: [], rejected: [{ stageId: 'p2', reason: 'unavailable' }] });
      expect(res.json.droppedChallenges).toBeUndefined();
      expect(store.getProgress('u1').completedChallenges).toEqual(['p3-a']);
    } finally {
      await bare.close();
    }
  });

  afterAll(async () => {
    await app.close();
  });

  const setRules = (patch) => {
    const settings = app.learningDeps.settings;
    const result = settings.update({ revision: settings.revision(), patch });
    expect(result.ok).toBe(true);
  };

  beforeEach(() => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  it('holds back a solve in a stage the account has not opened (enforce), and says which', async () => {
    setRules({ access: { mergeGate: 'enforce' } });
    const res = await app.call('POST', '/progress/merge', { user: 'u1', body: { progress: { completedChallenges: ['p1-a', 'p3-a'], attempts: {} } } });
    expect(res.status).toBe(200);
    expect(res.json.droppedChallenges).toEqual(['p3-a']);
    expect(res.json.mergedChallenges).toBe(1);
    expect(res.json.claims).toBeUndefined();
    expect(store.getProgress('u1').completedChallenges).toEqual(['p1-a']);
  });

  it('keeps the claims that hold up, explains the rest, and lets the lessons after a kept claim in', async () => {
    setRules({ access: { mergeGate: 'enforce' } });
    const now = new Date().toISOString();
    const res = await app.call('POST', '/progress/merge', {
      user: 'u2',
      body: {
        progress: { completedChallenges: ['p2-test', 'p3-a', 'p5-test'], attempts: {} },
        assessmentClaims: [
          { kind: 'test-out', stageId: 'p2', testId: 'p2-test', attempts: 1, hintsUsed: 0, answer: 0, at: now },
          { kind: 'test-out', stageId: 'p5', testId: 'p5-test', attempts: 1, hintsUsed: 0, answer: 1, at: now }
        ]
      }
    });
    expect(res.status).toBe(200);
    expect(res.json.claims).toEqual({ accepted: ['p2'], rejected: [{ stageId: 'p5', reason: 'wrong' }] });
    // p2 is tested out (and clears), so p3 is open; p5's test without its lessons is held back.
    expect(res.json.droppedChallenges).toEqual(['p5-test']);
    const row = store.getProgress('u2');
    expect(row.completedChallenges).toEqual(['p2-test', 'p3-a']);
    expect(row.testedOut.p2).toMatchObject({ via: 'test-out', clears: true });
    expect(row.completedStages).toEqual(['p2']);
    expect(res.json.awardedXp).toBe(100 + 20);
    expect(res.json.progress.testedOut.p2.clears).toBe(true);
  });

  const routeDeps = (extra = {}) => ({
    getChallenge,
    getChallengeMerged: getChallenge,
    completedStagesFor: stagesForStore(store),
    verifySubmission,
    progressionContext: () => contentFor(store),
    progression: { verifyClaims, acceptClaims, filterMerge },
    ...extra
  });
  const p2Claim = () => ({ kind: 'test-out', stageId: 'p2', testId: 'p2-test', attempts: 1, hintsUsed: 0, answer: 0, at: new Date().toISOString() });

  it('is limited like a solve: over the limit it answers 429 and runs nothing', async () => {
    const runs = [];
    const limited = await startLearnerApp(store, {
      progress: routeDeps({
        verifySubmission: async (c, b) => {
          runs.push(c.id);
          return verifySubmission(c, b);
        },
        mergeLimit: (_req, res) => res.status(429).json({ reason: 'rate-limited' })
      })
    });
    try {
      const res = await limited.call('POST', '/progress/merge', { user: 'u1', body: { progress: { completedChallenges: ['p2-test'], attempts: {} }, assessmentClaims: [p2Claim()] } });
      expect(res.status).toBe(429);
      expect(runs).toEqual([]);
      expect(store.getProgress('u1').completedChallenges).toEqual([]);
    } finally {
      await limited.close();
    }
  });

  it('a claim that could not be checked just now (busy, over the limit) keeps its test out of the merge, so it can be sent again', async () => {
    setRules({ access: { mergeGate: 'log' } });
    let busy = true;
    let allowed = true;
    const flaky = await startLearnerApp(store, {
      progress: routeDeps({
        verifySubmission: async (c, b) => {
          if (busy) throw new BusyError();
          return verifySubmission(c, b);
        },
        chargeClaimRun: () => ({ allowed })
      })
    });
    const body = () => ({ progress: { completedChallenges: ['p1-a', 'p2-test'], attempts: {} }, assessmentClaims: [p2Claim()] });
    try {
      const first = await flaky.call('POST', '/progress/merge', { user: 'u1', body: body() });
      expect(first.json.claims).toEqual({ accepted: [], rejected: [{ stageId: 'p2', reason: 'busy' }] });
      // Not credited as a plain solve - that would make p2 "already cleared" for good.
      expect(store.getProgress('u1').completedChallenges).toEqual(['p1-a']);

      busy = false;
      allowed = false;
      const second = await flaky.call('POST', '/progress/merge', { user: 'u1', body: body() });
      expect(second.json.claims).toEqual({ accepted: [], rejected: [{ stageId: 'p2', reason: 'rate-limited' }] });
      expect(store.getProgress('u1').completedChallenges).toEqual(['p1-a']);

      allowed = true;
      const third = await flaky.call('POST', '/progress/merge', { user: 'u1', body: body() });
      expect(third.json.claims).toEqual({ accepted: ['p2'], rejected: [] });
      expect(store.getProgress('u1').testedOut.p2).toMatchObject({ via: 'test-out', clears: true });
    } finally {
      await flaky.close();
    }
  });

  it('in log mode credits everything as before, and still answers for the claims', async () => {
    setRules({ access: { mergeGate: 'log' } });
    const res = await app.call('POST', '/progress/merge', {
      user: 'u1',
      body: { progress: { completedChallenges: ['p3-a'], attempts: {} }, assessmentClaims: [{ kind: 'test-out', stageId: 'p4', testId: 'p4-test', attempts: 1, answer: 0 }] }
    });
    expect(res.json.droppedChallenges).toBeUndefined();
    expect(res.json.claims).toEqual({ accepted: [], rejected: [{ stageId: 'p4', reason: 'premium' }] });
    expect(store.getProgress('u1').completedChallenges).toContain('p3-a');
  });
});
