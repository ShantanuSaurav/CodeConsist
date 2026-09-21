/**
 * The admin question routes end to end: the real content bank, the real
 * zod schema, an in-memory db, and HTTP through express - so the three
 * states (authored / modified / created) are proven at the boundary the
 * console actually talks to.
 */
import express from 'express';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../db.js', () => {
  const EMPTY = () => ({
    users: [],
    progress: {},
    admin: null,
    auditLog: [],
    contentOverrides: { stages: {}, challenges: {}, languages: {} },
    customChallenges: {},
    excelSync: { rowIndexByUserId: {}, lastSyncedAtByUser: {}, lastFullSyncAt: null, failures: [] }
  });
  let state = EMPTY();
  const db = () => state;
  const setOverride = (bucket, id, patch) => {
    bucket[id] = { ...bucket[id], ...patch };
    if (Object.values(bucket[id]).every((v) => v === undefined || v === null)) delete bucket[id];
    return bucket[id] ?? null;
  };
  return {
    reset: () => {
      state = EMPTY();
    },
    db,
    load: async () => state,
    persist: () => {},
    persistNow: async () => {},
    findUserByEmail: () => null,
    findUserByUsername: () => null,
    findUserById: () => null,
    insertUser: (u) => u,
    allUsers: () => state.users,
    updateUser: () => null,
    deleteUser: () => false,
    getAdmin: () => state.admin,
    setAdmin: (r) => (state.admin = r),
    updateAdmin: () => state.admin,
    getProgress: () => ({ xp: 0, level: 1, streak: 0, bestStreak: 0, lastActiveDay: null, completedChallenges: [], completedStages: [], attempts: {} }),
    setProgress: (_id, p) => p,
    allProgress: () => state.progress,
    getContentOverrides: () => state.contentOverrides,
    setStageOverride: (id, patch) => setOverride(state.contentOverrides.stages, id, patch),
    setChallengeOverride: (id, patch) => setOverride(state.contentOverrides.challenges, id, patch),
    setLanguageOverride: (id, patch) => setOverride(state.contentOverrides.languages, id, patch),
    allCustomChallenges: () => Object.values(state.customChallenges),
    getCustomChallenge: (id) => (typeof id === 'string' && Object.hasOwn(state.customChallenges, id) ? state.customChallenges[id] : null),
    putCustomChallenge: (challenge) => {
      const existing = state.customChallenges[challenge.id];
      const now = new Date().toISOString();
      state.customChallenges[challenge.id] = { ...challenge, createdAt: existing?.createdAt ?? now, updatedAt: now };
      return state.customChallenges[challenge.id];
    },
    deleteCustomChallenge: (id) => {
      if (!Object.hasOwn(state.customChallenges, id)) return false;
      delete state.customChallenges[id];
      delete state.contentOverrides.challenges[id];
      return true;
    },
    appendAudit: (entry) => {
      const row = { id: `audit-${state.auditLog.length}`, at: new Date().toISOString(), ...entry };
      state.auditLog.push(row);
      return row;
    },
    listAudit: ({ limit = 100 } = {}) => state.auditLog.slice(-limit).reverse(),
    getExcelSync: () => state.excelSync,
    setExcelRowIndex: () => {},
    markExcelSynced: () => {},
    recordExcelFailure: () => null,
    setExcelFullSyncAt: () => {}
  };
});

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

import * as store from '../db.js';
import { createAdminRouter } from '../admin.js';
import {
  loadContent,
  contentSnapshot,
  allChallenges,
  stageChallenges,
  getChallenge,
  authoredChallenge,
  isCustomChallenge,
  isModifiedChallenge,
  applyLearnerOverrides
} from '../content.js';
import { ChallengeSchema } from '../../src/modules/challenges/schema.ts';

const deps = {
  validateChallenge: (candidate) => {
    const result = ChallengeSchema.safeParse(candidate);
    if (result.success) return { ok: true, challenge: result.data, issues: [] };
    return { ok: false, challenge: null, issues: result.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })) };
  },
  runSolution: async () => ({ status: 'passed', testResults: [], stderr: '' })
};

let server;
let base;

beforeAll(async () => {
  await loadContent();
  const app = express().use(express.json()).use('/api/admin', createAdminRouter(deps));
  await new Promise((resolve) => {
    server = app.listen(0, '127.0.0.1', resolve);
  });
  base = `http://127.0.0.1:${server.address().port}/api/admin`;
}, 60_000);

afterAll(async () => {
  await new Promise((resolve) => server?.close(resolve));
});

beforeEach(() => store.reset());

const api = async (method, path, body) => {
  const res = await fetch(base + path, {
    method,
    headers: body ? { 'content-type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined
  });
  return { status: res.status, json: await res.json() };
};

/** The wizard's body for a challenge - the console sends every field it manages, never bookkeeping. */
const bodyFrom = (c, patch = {}) => ({
  stageId: c.stageId,
  type: c.type,
  title: c.title,
  prompt: c.prompt,
  explanation: c.explanation,
  language: c.language,
  difficulty: c.difficulty,
  xpReward: c.xpReward,
  hints: c.hints ?? [],
  tags: c.tags ?? [],
  codeSnippet: c.codeSnippet,
  options: c.options,
  correctIndex: c.correctIndex,
  correctIndices: c.correctIndices,
  blanks: c.blanks,
  pseudocodeLines: c.pseudocodeLines,
  starterCode: c.starterCode,
  entryFunction: c.entryFunction,
  solutionCode: c.solutionCode,
  testCases: c.testCases,
  uiPreview: c.uiPreview,
  examples: c.examples,
  constraints: c.constraints,
  ...patch
});

const newQuiz = (stageId) => ({
  stageId,
  type: 'quiz',
  title: 'Console quiz',
  prompt: 'Which keyword declares a block-scoped variable?',
  explanation: 'let and const are block-scoped; var is function-scoped.',
  language: 'javascript',
  difficulty: 'easy',
  xpReward: 25,
  hints: ['Think ES2015.'],
  tags: ['scope'],
  options: ['var', 'let', 'function', 'this'],
  correctIndex: 1
});

const countByType = (list) => list.reduce((acc, c) => ({ ...acc, [c.type]: (acc[c.type] ?? 0) + 1 }), {});
const STAGE = 'stage-1';
const authoredQuiz = () => allChallenges().find((c) => c.type === 'quiz' && c.concept) ?? allChallenges().find((c) => c.type === 'quiz');
const stageTest = () => allChallenges().find((c) => c.isStageTest && c.type === 'code_runner');

describe('GET /content/challenges', () => {
  it('lists authored rows as neither custom nor modified, in authored counts', async () => {
    const { status, json } = await api('GET', `/content/challenges?stageId=${STAGE}`);
    expect(status).toBe(200);
    const authored = contentSnapshot().challenges.filter((c) => c.stageId === STAGE);
    expect(json.challenges).toHaveLength(authored.length);
    expect(json.challenges.every((r) => r.custom === false && r.modified === false && r.hidden === false)).toBe(true);
    expect(countByType(json.challenges)).toEqual(countByType(authored));
    expect(json.challenges.map((r) => r.id)).toEqual(authored.map((c) => c.id));
  });
});

describe('created questions', () => {
  it('creates a quiz at the end of its stage, serves it to learners, and deletes it', async () => {
    const before = stageChallenges(STAGE).length;
    const { status, json } = await api('POST', '/content/challenges', newQuiz(STAGE));
    expect(status).toBe(201);
    const row = json.challenge;
    expect(row).toMatchObject({ custom: true, modified: false, hidden: false, type: 'quiz', title: 'Console quiz', stageId: STAGE });
    expect(row.id).toMatch(/^custom-stage-1-console-quiz-[a-z0-9]{4}$/);
    expect(row).not.toHaveProperty('createdAt');
    expect(row.original.prompt).toBe(row.prompt);

    const inStage = stageChallenges(STAGE);
    expect(inStage).toHaveLength(before + 1);
    expect(inStage.at(-1).id).toBe(row.id);
    expect(isCustomChallenge(row.id)).toBe(true);
    expect(isModifiedChallenge(row.id)).toBe(false);

    const learner = applyLearnerOverrides(contentSnapshot(), store.getContentOverrides());
    expect(learner.challenges.some((c) => c.id === row.id)).toBe(true);
    const listed = await api('GET', `/content/challenges?stageId=${STAGE}`);
    expect(listed.json.challenges.at(-1)).toMatchObject({ id: row.id, custom: true });

    const del = await api('DELETE', `/content/challenges/${row.id}`);
    expect(del.json).toEqual({ ok: true, deleted: true });
    expect(getChallenge(row.id)).toBeNull();
    expect(stageChallenges(STAGE)).toHaveLength(before);
  });

  it('rejects an unfinished question with field-level issues', async () => {
    const { status, json } = await api('POST', '/content/challenges', { ...newQuiz(STAGE), options: ['a', ''], correctIndex: 5 });
    expect(status).toBe(422);
    expect(json.issues.map((i) => i.path)).toEqual(expect.arrayContaining(['options.1', 'correctIndex']));
  });
});

describe('modified questions (PUT on an authored id)', () => {
  it('replaces an authored quiz in place and keeps its concept', async () => {
    const original = authoredQuiz();
    const positionBefore = allChallenges().findIndex((c) => c.id === original.id);
    const body = bodyFrom(original, { prompt: 'Rewritten in the console - what does this print?', options: ['one', 'two', 'three'], correctIndex: 2 });

    const { status, json } = await api('PUT', `/content/challenges/${original.id}`, body);
    expect(status).toBe(200);
    expect(json.challenge).toMatchObject({ id: original.id, modified: true, custom: false, prompt: body.prompt, options: ['one', 'two', 'three'], correctIndex: 2 });
    expect(json.challenge.original.prompt).toBe(original.prompt);
    expect(json.verification).toEqual({ solution: null, starter: null });

    const served = getChallenge(original.id);
    expect(served.prompt).toBe(body.prompt);
    expect(served).not.toHaveProperty('updatedAt');
    if (original.concept) expect(served.concept).toEqual(original.concept);
    else expect(served.isStageTest).toBe(original.isStageTest);
    expect(ChallengeSchema.safeParse(served).success).toBe(true);

    expect(allChallenges().findIndex((c) => c.id === original.id)).toBe(positionBefore);
    expect(allChallenges()).toHaveLength(contentSnapshot().challenges.length);
    expect(authoredChallenge(original.id).prompt).toBe(original.prompt);
    expect(isModifiedChallenge(original.id)).toBe(true);
    expect(isCustomChallenge(original.id)).toBe(false);

    const learner = applyLearnerOverrides(contentSnapshot(), store.getContentOverrides());
    expect(learner.challenges.findIndex((c) => c.id === original.id)).toBe(positionBefore);
    expect(learner.challenges[positionBefore].prompt).toBe(body.prompt);
  });

  it('keeps a stage test a code question with at least one worked example', async () => {
    const test = stageTest();
    const asQuiz = await api('PUT', `/content/challenges/${test.id}`, bodyFrom(test, { type: 'quiz', options: ['a', 'b'], correctIndex: 0 }));
    expect(asQuiz.status).toBe(422);
    expect(asQuiz.json.issues).toContainEqual({ path: 'type', message: "This is the stage's final test, so it has to stay a code question." });
    expect(isModifiedChallenge(test.id)).toBe(false);

    const noExamples = await api('PUT', `/content/challenges/${test.id}`, bodyFrom(test, { examples: [] }));
    expect(noExamples.status).toBe(422);
    expect(noExamples.json.issues.map((i) => i.path)).toContain('examples');

    const testCases = [...test.testCases, { input: test.testCases[0].input, expected: test.testCases[0].expected, hidden: true, description: 'added in the console' }];
    const examples = [{ input: '[3, 1, 2]', output: '[1, 2, 3]', explanation: 'sorted ascending' }];
    const ok = await api('PUT', `/content/challenges/${test.id}`, bodyFrom(test, { testCases, examples, constraints: ['n <= 1000', ''] }));
    expect(ok.status).toBe(200);
    expect(ok.json.challenge).toMatchObject({ modified: true, custom: false, isStageTest: true });
    const served = getChallenge(test.id);
    expect(served.isStageTest).toBe(true);
    expect(served.testCases).toHaveLength(test.testCases.length + 1);
    expect(served.testCases.at(-1)).toEqual({ input: test.testCases[0].input, expected: test.testCases[0].expected, hidden: true, description: 'added in the console' });
    expect(served.examples).toEqual(examples);
    expect(served.constraints).toEqual(['n <= 1000']);
  });

  it('refuses to move an authored question - or a stage test - to another stage', async () => {
    const test = stageTest();
    const other = contentSnapshot().stages.find((s) => s.id !== test.stageId).id;
    const fromBefore = stageChallenges(test.stageId).map((c) => c.id);
    const toBefore = stageChallenges(other).map((c) => c.id);
    const message = 'A built-in question stays in its stage - hide it here and write a new one in the other stage instead.';

    const moved = await api('PUT', `/content/challenges/${test.id}`, bodyFrom(test, { stageId: other }));
    expect(moved.status).toBe(422);
    expect(moved.json.issues).toContainEqual({ path: 'stageId', message });
    expect(isModifiedChallenge(test.id)).toBe(false);
    expect(stageChallenges(test.stageId).map((c) => c.id)).toEqual(fromBefore);
    expect(stageChallenges(other).map((c) => c.id)).toEqual(toBefore);
    const stages = (await api('GET', '/content/stages')).json.stages;
    expect(stages.find((s) => s.id === test.stageId).hasTest).toBe(true);
    expect(stages.find((s) => s.id === other).hasTest).toBe(contentSnapshot().challenges.some((c) => c.stageId === other && c.isStageTest));

    const checked = await api('POST', `/content/challenges/validate?id=${encodeURIComponent(test.id)}`, bodyFrom(test, { stageId: other }));
    expect(checked.json.ok).toBe(false);
    expect(checked.json.issues).toContainEqual({ path: 'stageId', message });

    // A plain lesson is held to the same rule.
    const quiz = authoredQuiz();
    const quizMoved = await api('PUT', `/content/challenges/${quiz.id}`, bodyFrom(quiz, { stageId: contentSnapshot().stages.find((s) => s.id !== quiz.stageId).id }));
    expect(quizMoved.status).toBe(422);
    expect(quizMoved.json.issues.map((i) => i.path)).toContain('stageId');
  });

  it('clears an earlier presentational override but keeps hidden', async () => {
    const original = authoredQuiz();
    await api('PATCH', `/content/challenges/${original.id}`, { title: 'Overridden title', xpReward: 99, hidden: true });
    const before = await api('GET', `/content/challenges?stageId=${original.stageId}`);
    expect(before.json.challenges.find((r) => r.id === original.id)).toMatchObject({ title: 'Overridden title', hidden: true });

    const { status, json } = await api('PUT', `/content/challenges/${original.id}`, bodyFrom(original, { title: 'Edited title' }));
    expect(status).toBe(200);
    expect(json.challenge).toMatchObject({ title: 'Edited title', xpReward: original.xpReward, hidden: true, modified: true });
    expect(store.getContentOverrides().challenges[original.id]).toEqual({ hidden: true });

    const learner = applyLearnerOverrides(contentSnapshot(), store.getContentOverrides());
    expect(learner.challenges.some((c) => c.id === original.id)).toBe(false);
  });

  it('clears an earlier override on a created question too, so the new title is not shadowed', async () => {
    const created = (await api('POST', '/content/challenges', newQuiz(STAGE))).json.challenge;
    await api('PATCH', `/content/challenges/${created.id}`, { title: 'Overridden title' });

    const { status, json } = await api('PUT', `/content/challenges/${created.id}`, { ...newQuiz(STAGE), title: 'Edited title' });
    expect(status).toBe(200);
    expect(json.challenge).toMatchObject({ title: 'Edited title', custom: true, modified: false });
    expect(store.getContentOverrides().challenges[created.id]).toBeUndefined();
    expect(getChallenge(created.id).title).toBe('Edited title');
  });

  it('404s on an id nobody has', async () => {
    const { status, json } = await api('PUT', '/content/challenges/nope-1', newQuiz(STAGE));
    expect(status).toBe(404);
    expect(json).toEqual({ error: 'No such challenge.' });
  });
});

describe('POST /content/challenges/:id/revert', () => {
  it('puts the authored original back, keeping hidden', async () => {
    const original = authoredQuiz();
    await api('PATCH', `/content/challenges/${original.id}`, { hidden: true });
    await api('PUT', `/content/challenges/${original.id}`, bodyFrom(original, { title: 'Edited title' }));
    expect(isModifiedChallenge(original.id)).toBe(true);

    const { status, json } = await api('POST', `/content/challenges/${original.id}/revert`);
    expect(status).toBe(200);
    expect(json.challenge).toMatchObject({ id: original.id, title: original.title, modified: false, custom: false, hidden: true });
    expect(getChallenge(original.id)).toEqual(original);
    expect(isModifiedChallenge(original.id)).toBe(false);
    expect(store.getContentOverrides().challenges[original.id]).toEqual({ hidden: true });
    expect(store.listAudit().map((a) => a.action)).toContain('content.challenge.revert');
  });

  it('refuses for an untouched authored question and for a created one', async () => {
    const untouched = await api('POST', `/content/challenges/${authoredQuiz().id}/revert`);
    expect(untouched.status).toBe(409);
    expect(untouched.json).toEqual({ error: 'This question has not been edited here, so there is nothing to revert.' });

    const created = (await api('POST', '/content/challenges', newQuiz(STAGE))).json.challenge;
    const onCreated = await api('POST', `/content/challenges/${created.id}/revert`);
    expect(onCreated.status).toBe(409);
    expect(getChallenge(created.id)).not.toBeNull();

    expect((await api('POST', '/content/challenges/nope-1/revert')).status).toBe(404);
  });
});

describe('DELETE /content/challenges/:id on authored ids', () => {
  it('refuses, and points at revert once the question is modified', async () => {
    const original = authoredQuiz();
    const untouched = await api('DELETE', `/content/challenges/${original.id}`);
    expect(untouched.status).toBe(409);
    expect(untouched.json).toMatchObject({ authored: true, modified: false });
    expect(untouched.json.error).not.toContain('revert');

    await api('PUT', `/content/challenges/${original.id}`, bodyFrom(original, { title: 'Edited title' }));
    const modified = await api('DELETE', `/content/challenges/${original.id}`);
    expect(modified.status).toBe(409);
    expect(modified.json).toMatchObject({ authored: true, modified: true });
    expect(modified.json.error).toContain('or revert it to the original.');
    expect(isModifiedChallenge(original.id)).toBe(true);
  });
});

describe('POST /content/challenges/validate', () => {
  it('checks an authored stage test against its preserved role when ?id= names it', async () => {
    const test = stageTest();
    const body = bodyFrom(test, { type: 'quiz', options: ['a', 'b'], correctIndex: 0 });
    const withId = await api('POST', `/content/challenges/validate?id=${encodeURIComponent(test.id)}`, body);
    expect(withId.status).toBe(200);
    expect(withId.json.ok).toBe(false);
    expect(withId.json.issues.map((i) => i.path)).toContain('type');

    // Without the id it is just a quiz being drafted, so the same body is fine.
    const anonymous = await api('POST', '/content/challenges/validate', body);
    expect(anonymous.json.ok).toBe(true);

    const bogus = await api('POST', '/content/challenges/validate?id=nope-1', body);
    expect(bogus.status).toBe(404);
    expect(bogus.json).toEqual({ error: 'No such challenge.' });
  });

  it('validates a created question under its own id', async () => {
    const created = (await api('POST', '/content/challenges', newQuiz(STAGE))).json.challenge;
    const { json } = await api('POST', `/content/challenges/validate?id=${created.id}`, { ...newQuiz(STAGE), prompt: 'A different prompt, still long enough.' });
    expect(json.ok).toBe(true);
  });
});
