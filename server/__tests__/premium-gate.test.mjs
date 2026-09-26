/**
 * The server-side premium lock.
 *
 *   - server/billing.js premiumStageIds / stageAccessFor / premiumGate: who
 *     may open which stage - free, guest, lifetime, a track (covering a stage
 *     added to it later), a single stage, a revoked order, admin overrides;
 *   - server/content.js lockedStub: what /api/content sends instead of a
 *     locked lesson - nothing that answers it;
 *   - server/progression.js checkSolveAccess / mergeAccess, wired into the
 *     real progress router the way server/index.js wires them: a solve is
 *     refused 403 before any code runs, a guest merge reports what it
 *     skipped, and 'log' mode lets everything through while counting.
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
import { premiumGate, premiumStageIds, stageAccessFor } from '../billing.js';
import { lockedStub } from '../content.js';
import { checkSolveAccess, mergeAccess, premiumGateStats } from '../progression.js';
import { BusyError, createLimiter, rateLimit } from '../rate-limit.js';
import { CHALLENGES, resetStore, startLearnerApp, verifySubmission } from './learning-fixture.mjs';

/* ------------------------------------------------------------- fixtures */

const stage = (id, extra = {}) => ({ id, index: '01', name: id, slug: id, language: 'javascript', description: '', ...extra });

/** core: s1 free, s2 + s3 premium; c: c1 free. */
const SNAPSHOT = {
  stages: [stage('s1'), stage('s2', { isPremium: true }), stage('s3', { isPremium: true }), stage('c1', { language: 'c' })],
  challenges: [],
  languageTracks: [
    { id: 'core', label: 'Developer path', stageIds: ['s1', 's2', 's3'] },
    { id: 'c', label: 'C', stageIds: ['c1'] }
  ]
};

const ctx = (overrides = { stages: {}, challenges: {}, languages: {} }, snapshot = SNAPSHOT) => ({ snapshot, overrides });

let orderSeq = 0;
function paid(userId, product, extra = {}) {
  orderSeq += 1;
  return store.putOrder({
    id: `ord_test${orderSeq}`,
    userId,
    product,
    productKey: 'x',
    amount: 0,
    currency: 'INR',
    provider: 'admin',
    status: 'paid',
    createdAt: new Date(Date.UTC(2026, 0, 1, 0, orderSeq)).toISOString(),
    paidAt: new Date().toISOString(),
    ...extra
  });
}

const user = (id) => store.findUserById(id);

beforeAll(async () => {
  await store.load();
});

beforeEach(() => {
  resetStore(store, ['u1', 'u2']);
  store.db().orders = {};
  store.db().certificates = {};
  store.db().contentOverrides = { stages: {}, challenges: {}, languages: {} };
});

/* ------------------------------------------------------ billing.js gate */

describe('premiumStageIds', () => {
  it('lists premium stages after admin overrides, hidden ones included', () => {
    expect([...premiumStageIds(ctx())]).toEqual(['s2', 's3']);
    const overrides = { stages: { s2: { isPremium: false }, c1: { isPremium: true }, s3: { hidden: true } }, challenges: {}, languages: {} };
    expect([...premiumStageIds(ctx(overrides))].sort()).toEqual(['c1', 's3']);
  });
});

describe('stageAccessFor / premiumGate', () => {
  it('always allows a free stage, and a guest gets no premium stage', () => {
    const guest = stageAccessFor(null, ctx());
    expect(guest.allows('s1')).toBe(true);
    expect(guest.allows('c1')).toBe(true);
    expect(guest.allows('s2')).toBe(false);
    expect(guest.lockedStageIds).toEqual(['s2', 's3']);
    expect(guest.all).toBe(false);
    expect(premiumGate(null, { id: 'x', stageId: 's2' }, ctx())).toEqual({ ok: false, stageId: 's2' });
    expect(premiumGate(null, { id: 'y', stageId: 's1' }, ctx())).toEqual({ ok: true });
  });

  it('denies a signed-in learner who has bought nothing', () => {
    expect(stageAccessFor(user('u1'), ctx()).lockedStageIds).toEqual(['s2', 's3']);
  });

  it('opens everything for a lifetime licence (or the legacy Pro flag)', () => {
    paid('u1', { kind: 'lifetime' });
    expect(stageAccessFor(user('u1'), ctx())).toMatchObject({ all: true, lockedStageIds: [] });
    store.updateUser('u2', { isPremium: true });
    expect(stageAccessFor(user('u2'), ctx()).all).toBe(true);
  });

  it('opens a track’s stages, including one added to the track later', () => {
    paid('u1', { kind: 'track', trackId: 'core' });
    expect(stageAccessFor(user('u1'), ctx()).lockedStageIds).toEqual([]);
    const grown = {
      ...SNAPSHOT,
      stages: [...SNAPSHOT.stages, stage('s4', { isPremium: true })],
      languageTracks: [{ id: 'core', label: 'Developer path', stageIds: ['s1', 's2', 's3', 's4'] }, SNAPSHOT.languageTracks[1]]
    };
    expect(stageAccessFor(user('u1'), ctx(undefined, grown)).allows('s4')).toBe(true);
  });

  it('opens one bought stage and not the next', () => {
    paid('u1', { kind: 'stage', stageId: 's2' });
    const access = stageAccessFor(user('u1'), ctx());
    expect(access.allows('s2')).toBe(true);
    expect(access.allows('s3')).toBe(false);
  });

  it('closes again when the order is revoked', () => {
    const order = paid('u1', { kind: 'stage', stageId: 's2' });
    expect(stageAccessFor(user('u1'), ctx()).allows('s2')).toBe(true);
    store.putOrder({ ...order, status: 'revoked', revokedAt: new Date().toISOString() });
    expect(stageAccessFor(user('u1'), ctx()).allows('s2')).toBe(false);
  });

  it('follows an admin override either way', () => {
    const free = { stages: { s2: { isPremium: false } }, challenges: {}, languages: {} };
    expect(stageAccessFor(null, ctx(free)).allows('s2')).toBe(true);
    const premium = { stages: { c1: { isPremium: true } }, challenges: {}, languages: {} };
    expect(stageAccessFor(null, ctx(premium)).allows('c1')).toBe(false);
  });

  it('allows everything before the content has loaded, and a missing challenge', () => {
    expect(stageAccessFor(null, { snapshot: null, overrides: null }).all).toBe(true);
    expect(premiumGate(null, null, ctx())).toEqual({ ok: true });
  });
});

/* ---------------------------------------------------------- lockedStub */

describe('lockedStub', () => {
  const full = {
    id: 'q1',
    stageId: 's2',
    type: 'code_runner',
    title: 'Reverse a list',
    difficulty: 'medium',
    xpReward: 70,
    language: 'python',
    isStageTest: true,
    tags: ['lists'],
    prompt: 'Write reverse()',
    options: ['a', 'b'],
    correctIndex: 1,
    correctIndices: [0, 1],
    blanks: [{ answer: 'x' }],
    codeSnippet: 'let ___;',
    pseudocodeLines: ['start', 'end'],
    starterCode: 'def reverse(xs):',
    testCases: [{ input: '[1]', expected: '[1]' }],
    solutionCode: 'def reverse(xs): return xs[::-1]',
    hints: ['slice'],
    explanation: 'Slicing with a step of -1.',
    concept: { id: 'c', title: 'Slices' },
    entryFunction: 'reverse',
    uiPreview: false
  };

  it('keeps only what lists and labels the lesson, and marks it locked', () => {
    expect(lockedStub(full)).toEqual({
      id: 'q1',
      stageId: 's2',
      type: 'code_runner',
      title: 'Reverse a list',
      difficulty: 'medium',
      xpReward: 70,
      language: 'python',
      isStageTest: true,
      tags: ['lists'],
      locked: true
    });
  });

  it('drops every answer and solution field', () => {
    const stub = lockedStub(full);
    for (const field of ['prompt', 'options', 'correctIndex', 'correctIndices', 'blanks', 'codeSnippet', 'pseudocodeLines', 'starterCode', 'testCases', 'solutionCode', 'hints', 'explanation', 'concept', 'entryFunction']) {
      expect(stub, field).not.toHaveProperty(field);
    }
    // An allow-list: a field added to challenges later is left out too.
    expect(lockedStub({ ...full, answerKey: 'secret' })).not.toHaveProperty('answerKey');
  });
});

/* ------------------------------------------------- the routes, gated */

/** The fixture's one stage, made premium. */
const ROUTE_SNAPSHOT = {
  stages: [{ id: 'stage-1', index: '01', name: 'Stage one', isPremium: true }],
  challenges: Object.values(CHALLENGES),
  languageTracks: [{ id: 'core', label: 'Developer path', stageIds: ['stage-1'] }]
};

describe('the progress routes behind the gate', () => {
  let app;
  const gate = { mode: 'enforce' };
  const verified = [];
  const solveLimiter = createLimiter();
  let busy = false;

  const premiumContext = (route) => ({ snapshot: ROUTE_SNAPSHOT, overrides: store.getContentOverrides(), mode: gate.mode, route });

  beforeAll(async () => {
    app = await startLearnerApp(store, {
      progress: {
        checkSolveAccess: (u, challenge) => checkSolveAccess(u, challenge, premiumContext('solve')),
        mergeAccess: (u) => mergeAccess(u, premiumContext('merge')),
        solveLimit: rateLimit({ limiter: solveLimiter, bucket: 'solve.account', rule: () => ({ limit: 5, windowSeconds: 60 }), key: (req) => req.user?.id ?? null }),
        verifySubmission: async (challenge, body) => {
          verified.push(challenge.id);
          if (busy) throw new BusyError('queue-full');
          return verifySubmission(challenge, body);
        }
      }
    });
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    gate.mode = 'enforce';
    verified.length = 0;
    busy = false;
    solveLimiter.reset('solve.account');
  });

  const solve = (userId = 'u1') => app.call('POST', '/progress/solve', { user: userId, body: { challengeId: 'q-quiz', answer: 1 } });

  it('refuses a learner without access 403, before any code runs, and records nothing', async () => {
    const res = await solve();
    expect(res.status).toBe(403);
    expect(res.json).toEqual({ error: 'This lesson is part of a premium stage.', reason: 'premium-locked', stageId: 'stage-1' });
    expect(verified).toEqual([]);
    expect(store.getProgress('u1').completedChallenges).toEqual([]);
    expect(store.getProgress('u1').xp).toBe(0);
  });

  it('uses the admin’s wording for the refusal', async () => {
    await app.learningDeps.settings.update({ revision: 0, patch: { copy: { premium: { lockedSolve: 'Unlock this stage to continue.' } } } });
    expect((await solve()).json.error).toBe('Unlock this stage to continue.');
  });

  it('lets a buyer solve: a stage, a track or a lifetime licence', async () => {
    paid('u1', { kind: 'stage', stageId: 'stage-1' });
    expect((await solve('u1')).status).toBe(200);
    paid('u2', { kind: 'track', trackId: 'core' });
    expect((await solve('u2')).status).toBe(200);
  });

  it('only counts and logs in log mode', async () => {
    gate.mode = 'log';
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const before = premiumGateStats().wouldBlock;
    expect((await solve()).status).toBe(200);
    expect(premiumGateStats().wouldBlock).toBe(before + 1);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('[premium] would block solve'));
    warn.mockRestore();
  });

  it('counts real blocks too, per route', async () => {
    const before = premiumGateStats();
    await solve();
    const after = premiumGateStats();
    expect(after.blocked).toBe(before.blocked + 1);
    expect(after.byRoute.solve).toBe((before.byRoute.solve ?? 0) + 1);
  });

  it('does not credit premium ids in a guest merge, and says which', async () => {
    const res = await app.call('POST', '/progress/merge', {
      user: 'u1',
      body: { progress: { completedChallenges: ['q-quiz', 'q-multi'], attempts: {} } }
    });
    expect(res.status).toBe(200);
    expect(res.json.skippedLocked).toEqual(['q-quiz', 'q-multi']);
    expect(res.json.mergedChallenges).toBe(0);
    expect(res.json.progress.xp).toBe(0);
  });

  it('merges them for a buyer, with no skippedLocked', async () => {
    paid('u1', { kind: 'lifetime' });
    const res = await app.call('POST', '/progress/merge', { user: 'u1', body: { progress: { completedChallenges: ['q-quiz'], attempts: {} } } });
    expect(res.json.mergedChallenges).toBe(1);
    expect(res.json.skippedLocked).toBeUndefined();
  });

  it('answers 503 "busy" when every code-runner slot is taken, and records nothing', async () => {
    paid('u1', { kind: 'lifetime' });
    busy = true;
    const res = await solve();
    expect(res.status).toBe(503);
    expect(res.json).toEqual({ error: 'The code runner is busy - try again in a moment.', reason: 'busy' });
    expect(store.getProgress('u1').completedChallenges).toEqual([]);
  });

  it('is rate limited per account (solve.account)', async () => {
    paid('u1', { kind: 'lifetime' });
    for (let i = 0; i < 5; i++) expect((await solve()).status).toBe(200);
    const refused = await solve();
    expect(refused.status).toBe(429);
    expect(refused.json.reason).toBe('rate-limited');
    expect(refused.headers.get('retry-after')).toMatch(/^\d+$/);
    // Someone else's solves are their own bucket.
    paid('u2', { kind: 'lifetime' });
    expect((await solve('u2')).status).toBe(200);
  });
});
