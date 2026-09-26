/**
 * Shared set-up for the learning-loop route tests: a small question bank,
 * the real shared rules (src/platform/server-lib.ts, imported as TypeScript
 * the way admin-questions.test.mjs imports the challenge schema), the real
 * settings and activity services, and an express app with the progress,
 * activity and settings routers mounted as server/index.js mounts them.
 *
 * Not a test file itself (vitest only runs *.test.mjs). Each test file still
 * mocks node:fs/promises itself, so the real server/db.js never touches
 * server/data/db.json.
 */
import express from 'express';
import * as lib from '../../src/platform/server-lib.ts';
import { createSettingsService } from '../settings.js';
import { createSettingsRouter } from '../settings-routes.js';
import { createActivityService } from '../activity.js';
import { createActivityRouter } from '../activity-routes.js';
import { createProgressRouter } from '../progress-routes.js';

export { lib };

const base = { stageId: 'stage-1', difficulty: 'easy', language: 'javascript', prompt: 'p', explanation: 'e' };

/** A six-question stage: five kinds of lesson and a stage test. */
export const CHALLENGES = {
  'q-quiz': { ...base, id: 'q-quiz', title: 'Pick one', type: 'quiz', options: ['Apple', 'Banana', 'Cherry'], correctIndex: 1, xpReward: 40 },
  'q-multi': { ...base, id: 'q-multi', title: 'Pick some', type: 'multi_select', options: ['A', 'B', 'C', 'D'], correctIndices: [0, 2], xpReward: 50 },
  'q-blank': { ...base, id: 'q-blank', title: 'Fill it', type: 'fill_blank', codeSnippet: 'let ___;', blanks: [{ answer: 'x' }], xpReward: 60 },
  'q-order': { ...base, id: 'q-order', title: 'Put them in order', type: 'pseudocode_order', pseudocodeLines: ['start', 'loop', 'end'], xpReward: 40 },
  'q-code': {
    ...base,
    id: 'q-code',
    title: 'Write it',
    type: 'code_runner',
    entryFunction: 'f',
    testCases: [
      { input: '1', expected: '1' },
      { input: '2', expected: '2' },
      { input: '3', expected: '3' }
    ],
    xpReward: 70
  },
  't-test': { ...base, id: 't-test', title: 'Stage test', type: 'quiz', isStageTest: true, options: ['Right', 'Wrong'], correctIndex: 0, xpReward: 150 }
};

export const getChallenge = (id) => (typeof id === 'string' && Object.hasOwn(CHALLENGES, id) ? CHALLENGES[id] : null);

/** The server's verdict, minus the sandbox: a code lesson "passes" with this exact text. */
export const PASSING_CODE = 'function f(x) { return x; }';
export async function verifySubmission(challenge, body) {
  if (lib.isCodeChallengeType(challenge.type)) {
    return { ok: body.code === PASSING_CODE, verified: true, reason: 'Tests run by the server.' };
  }
  if (body.answer === undefined) return { ok: false, verified: true, reason: 'No answer was submitted.' };
  return { ok: lib.gradeAnswer(challenge, body.answer), verified: true, reason: 'Answer checked by the server.' };
}

export const completedStagesFor = (ids) => (Object.keys(CHALLENGES).every((id) => ids.includes(id)) ? ['stage-1'] : []);

/** The real services over the real store. `serverZone` pins the fallback zone so tests do not depend on the machine. */
export function createLearningDeps(store, { env = {}, serverZone = () => 'UTC' } = {}) {
  const settings = createSettingsService({ store, lib, env });
  const activity = createActivityService({ lib, store, settings, getChallengeMerged: getChallenge, gradeAnswer: lib.gradeAnswer, serverZone });
  return { lib, settings, activity, runtimeInfo: () => ({ pythonVerifiable: false, judge0Languages: [] }) };
}

/** Clear every store the learning routes write, and add learners. */
export function resetStore(store, userIds = ['u1', 'u2']) {
  const state = store.db();
  state.users = [];
  state.progress = {};
  state.drafts = {};
  state.activity = {};
  state.settings = { overrides: {}, revision: 0, updatedAt: null, updatedBy: null };
  state.auditLog = [];
  for (const id of userIds) store.insertUser({ id, email: `${id}@example.com`, username: id, passwordHash: 'x', isPremium: false, identities: {} });
}

/**
 * An express app with the learner routes, authenticated by an `x-user`
 * header the way drafts.test.mjs does it. Returns `{ server, call, learningDeps }`.
 */
export async function startLearnerApp(store, options = {}) {
  const learningDeps = createLearningDeps(store, options);
  const cleared = [];
  const app = express();
  app.use(express.json({ limit: '256kb' }));
  app.use((req, _res, next) => {
    const id = req.headers['x-user'];
    req.user = typeof id === 'string' && id ? store.findUserById(id) : null;
    next();
  });
  const requireAuth = (req, res, next) => (req.user ? next() : res.status(401).json({ error: 'Sign in to continue.' }));
  app.use('/api', createSettingsRouter({ getService: () => learningDeps.settings }));
  app.use(
    '/api',
    createProgressRouter({
      requireAuth,
      store,
      learningDeps,
      getChallenge,
      getChallengeMerged: getChallenge,
      verifySubmission,
      completedStagesFor,
      clearDraftForSolve: (userId, challengeId) => cleared.push([userId, challengeId]),
      // What server/index.js adds on top: the solve rate limit, the access
      // gates, a slotted verifySubmission (premium-gate.test.mjs).
      ...(options.progress ?? {})
    })
  );
  app.use(
    '/api',
    createActivityRouter({ requireAuth, learningDeps, gradeAnswer: lib.gradeAnswer, getChallengeMerged: getChallenge, ...(options.activity ?? {}) })
  );
  app.use((err, _req, res, _next) => res.status(500).json({ error: err.message }));

  const server = await new Promise((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  const root = `http://127.0.0.1:${server.address().port}/api`;

  async function call(method, path, { body, user, zone, headers = {} } = {}) {
    const res = await fetch(root + path, {
      method,
      headers: {
        ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
        ...(user ? { 'x-user': user } : {}),
        ...(zone ? { 'x-time-zone': zone } : {}),
        ...headers
      },
      body: body !== undefined ? JSON.stringify(body) : undefined
    });
    const text = await res.text();
    return { status: res.status, headers: res.headers, json: text ? JSON.parse(text) : null };
  }

  return { server, call, learningDeps, cleared, close: () => new Promise((resolve) => server.close(resolve)) };
}
