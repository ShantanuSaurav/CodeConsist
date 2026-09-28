/**
 * The Teaching page's routes (server/admin.js, server/concept-cards.js):
 * create, replace, "show it again", revert, hide and delete a teaching card,
 * one concept per lesson, the schema's issues, orphaned anchors - and that
 * learners get exactly what the admin sees (applyLearnerOverrides).
 *
 * The real content bank, the real zod ConceptSchema, an in-memory db and
 * HTTP through express, as in admin-questions.test.mjs.
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
    conceptCards: {},
    excelSync: { rowIndexByUserId: {}, lastSyncedAtByUser: {}, lastFullSyncAt: null, failures: [] }
  });
  let state = EMPTY();
  const setOverride = (bucket, id, patch) => {
    bucket[id] = { ...bucket[id], ...patch };
    if (Object.values(bucket[id]).every((v) => v === undefined || v === null)) delete bucket[id];
    return bucket[id] ?? null;
  };
  return {
    reset: () => {
      state = EMPTY();
    },
    db: () => state,
    load: async () => state,
    persist: () => {},
    findUserById: () => null,
    findUserByEmail: () => null,
    allUsers: () => state.users,
    getProgress: () => ({ xp: 0, level: 1, streak: 0, completedChallenges: [], completedStages: [], attempts: {} }),
    allProgress: () => state.progress,
    getContentOverrides: () => state.contentOverrides,
    setChallengeOverride: (id, patch) => setOverride(state.contentOverrides.challenges, id, patch),
    setStageOverride: (id, patch) => setOverride(state.contentOverrides.stages, id, patch),
    allCustomChallenges: () => Object.values(state.customChallenges),
    getCustomChallenge: (id) => (typeof id === 'string' && Object.hasOwn(state.customChallenges, id) ? state.customChallenges[id] : null),
    putCustomChallenge: (c) => (state.customChallenges[c.id] = { ...c }),
    deleteCustomChallenge: () => false,
    allConceptCards: () => Object.values(state.conceptCards),
    getConceptCard: (key) => (typeof key === 'string' && Object.hasOwn(state.conceptCards, key) ? state.conceptCards[key] : null),
    putConceptCard: (record) => {
      const existing = state.conceptCards[record.key];
      const now = new Date().toISOString();
      state.conceptCards[record.key] = { ...record, createdAt: existing?.createdAt ?? now, updatedAt: now };
      return state.conceptCards[record.key];
    },
    deleteConceptCard: (key) => {
      if (!Object.hasOwn(state.conceptCards, key)) return false;
      delete state.conceptCards[key];
      return true;
    },
    appendAudit: (entry) => {
      state.auditLog.push({ id: `audit-${state.auditLog.length}`, at: new Date().toISOString(), ...entry });
    },
    listAudit: () => state.auditLog,
    getExcelSync: () => state.excelSync
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
import { applyLearnerOverrides, contentSnapshot, loadContent } from '../content.js';
import { conceptIdFor, generateConceptKey, normalizeAnchor, normalizeConceptInput } from '../concept-cards.js';
import { ConceptSchema } from '../../src/modules/challenges/schema.ts';

const deps = {
  validateConcept: (candidate) => {
    const result = ConceptSchema.safeParse(candidate);
    if (result.success) return { ok: true, concept: result.data, issues: [] };
    return { ok: false, concept: null, issues: result.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })) };
  }
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

async function call(method, path, body) {
  const res = await fetch(base + path, {
    method,
    headers: body !== undefined ? { 'content-type': 'application/json' } : {},
    body: body !== undefined ? JSON.stringify(body) : undefined
  });
  const text = await res.text();
  return { status: res.status, json: text ? JSON.parse(text) : null };
}

/** What learners get for one lesson. */
const servedConcept = (id) => applyLearnerOverrides(contentSnapshot(), store.getContentOverrides()).challenges.find((c) => c.id === id)?.concept;

const CARD = {
  title: 'Comparing with ===',
  summary: 'How strict equality compares two values.',
  intro: 'Strict equality checks the type and the value.',
  example: { code: '1 === 1;\n1 === "1";', language: 'javascript', callouts: [{ line: 2, text: 'Different types, so false.' }] },
  why: 'No conversion happens before the comparison.'
};

describe('the concept helpers', () => {
  it('tidy a card and name fields in the form’s words', () => {
    const { candidate, issues } = normalizeConceptInput({ ...CARD, title: '  Spaced  ', tryIt: { instructions: '', starterCode: '' }, secondExample: { code: '  ' } }, { id: 'concept-x-0000' });
    expect(issues).toEqual([]);
    expect(candidate).toMatchObject({ id: 'concept-x-0000', title: 'Spaced' });
    expect(candidate.tryIt).toBeUndefined();
    expect(candidate.secondExample).toBeUndefined();

    const bad = normalizeConceptInput({ ...CARD, title: '', example: { code: 'one line', callouts: [{ line: 3, text: 'x' }, { line: 1, text: '' }] } }, { id: 'k' });
    expect(bad.issues.map((i) => i.path)).toEqual(['title', 'example.callouts.0.line', 'example.callouts.1.text']);
  });

  it('make unique keys and served ids', () => {
    const key = generateConceptKey('Hello, World!', [], () => 0);
    expect(key).toBe('concept-hello-world-0000');
    expect(generateConceptKey('Hello, World!', [key], (() => { let n = 0; return () => (n++ === 0 ? 0 : 0.5); })())).not.toBe(key);
    expect(conceptIdFor('variables-let', 0)).toBe('variables-let');
    expect(conceptIdFor('variables-let', 2)).toBe('variables-let-r2');
  });

  it('check anchors', () => {
    expect(normalizeAnchor({ kind: 'lesson', challengeId: ' stage-1-a03 ' }).anchor).toEqual({ kind: 'lesson', challengeId: 'stage-1-a03' });
    expect(normalizeAnchor({ kind: 'unit', unitId: 'stage-1:m1', stageId: 'stage-1' }).anchor).toEqual({ kind: 'unit', unitId: 'stage-1:m1', stageId: 'stage-1' });
    expect(normalizeAnchor({ kind: 'page' }).issues[0].path).toBe('anchor');
  });
});

describe('GET /content/concepts', () => {
  it('lists the built-in concepts, per-stage coverage and one row per lesson', async () => {
    const res = await call('GET', '/content/concepts?stageId=stage-1');
    expect(res.status).toBe(200);
    const row = res.json.rows.find((r) => r.key === 'variables-let');
    expect(row).toMatchObject({ source: 'authored', hidden: false, lessonId: 'stage-1-a00', stageId: 'stage-1', orphaned: false, problem: null });
    const stage1 = res.json.coverage.find((c) => c.stageId === 'stage-1');
    expect(stage1.withConcept).toBeGreaterThanOrEqual(2);
    expect(stage1.lessons).toBeGreaterThan(stage1.withConcept);
    expect(res.json.lessons.find((l) => l.id === 'stage-1-a00').concept).toMatchObject({ key: 'variables-let', source: 'authored' });
    expect(res.json.lessons.find((l) => l.id === 'stage-1-a03').concept).toBeNull();
  });
});

describe('creating, editing and removing cards', () => {
  it('creates a card on a lesson, and learners get it', async () => {
    const res = await call('POST', '/content/concepts', { anchor: { kind: 'lesson', challengeId: 'stage-1-a03' }, concept: CARD });
    expect(res.status).toBe(201);
    expect(res.json.card).toMatchObject({ source: 'created', lessonId: 'stage-1-a03', hidden: false, orphaned: false });
    expect(res.json.card.key).toMatch(/^concept-comparing-with-/);
    expect(servedConcept('stage-1-a03')).toMatchObject({ id: res.json.card.key, title: CARD.title });
    expect(store.listAudit().at(-1)).toMatchObject({ action: 'content.concept.create', target: res.json.card.key });
  });

  it('allows one concept per lesson (409 names the one to edit)', async () => {
    const onAuthored = await call('POST', '/content/concepts', { anchor: { kind: 'lesson', challengeId: 'stage-1-a00' }, concept: CARD });
    expect(onAuthored.status).toBe(409);
    expect(onAuthored.json.existingKey).toBe('variables-let');
    // The start of stage 1 is its first lesson - which has a concept already.
    expect((await call('POST', '/content/concepts', { anchor: { kind: 'stage', stageId: 'stage-1' }, concept: CARD })).status).toBe(409);
    const first = await call('POST', '/content/concepts', { anchor: { kind: 'lesson', challengeId: 'stage-1-a03' }, concept: CARD });
    const second = await call('POST', '/content/concepts', { anchor: { kind: 'lesson', challengeId: 'stage-1-a03' }, concept: CARD });
    expect(second.status).toBe(409);
    expect(second.json.existingKey).toBe(first.json.card.key);
  });

  it('returns the schema’s issues and saves nothing', async () => {
    const res = await call('POST', '/content/concepts', { anchor: { kind: 'lesson', challengeId: 'stage-1-a03' }, concept: { ...CARD, why: '', example: { code: 'x', language: 'klingon' } } });
    expect(res.status).toBe(422);
    expect(res.json.issues.map((i) => i.path)).toEqual(expect.arrayContaining(['why', 'example.language']));
    expect(store.allConceptCards()).toEqual([]);
    expect((await call('POST', '/content/concepts', { anchor: { kind: 'lesson', challengeId: 'nope' }, concept: CARD })).status).toBe(422);
    expect((await call('POST', '/content/concepts/validate', { concept: CARD })).json).toMatchObject({ ok: true, issues: [] });
  });

  it('replaces a created card, and "show it again" gives it a new served id', async () => {
    const { json } = await call('POST', '/content/concepts', { anchor: { kind: 'lesson', challengeId: 'stage-1-a03' }, concept: CARD });
    const key = json.card.key;
    const edited = await call('PUT', `/content/concepts/${key}`, { concept: { ...CARD, title: 'Strict equality' } });
    expect(edited.status).toBe(200);
    expect(servedConcept('stage-1-a03')).toMatchObject({ id: key, title: 'Strict equality' });
    const again = await call('PUT', `/content/concepts/${key}`, { concept: CARD, showAgain: true });
    expect(again.json.card.revision).toBe(1);
    expect(servedConcept('stage-1-a03').id).toBe(`${key}-r1`);
    // Moved to another lesson.
    const moved = await call('PUT', `/content/concepts/${key}`, { concept: CARD, anchor: { kind: 'lesson', challengeId: 'stage-1-a05' } });
    expect(moved.json.card.lessonId).toBe('stage-1-a05');
    expect(servedConcept('stage-1-a03')).toBeUndefined();
  });

  it('edits a built-in concept on its own lesson, and reverts it', async () => {
    const edited = await call('PUT', '/content/concepts/variables-let', { concept: { ...CARD, title: 'Variables, again' }, anchor: { kind: 'lesson', challengeId: 'stage-1-a03' } });
    expect(edited.status).toBe(200);
    expect(edited.json.card).toMatchObject({ source: 'modified', lessonId: 'stage-1-a00' });
    // An authored override is served by applyLearnerOverrides, under the authored id.
    expect(servedConcept('stage-1-a00')).toMatchObject({ id: 'variables-let', title: 'Variables, again' });
    expect(servedConcept('stage-1-a03')).toBeUndefined();

    const reverted = await call('POST', '/content/concepts/variables-let/revert');
    expect(reverted.json.card.source).toBe('authored');
    expect(servedConcept('stage-1-a00').title).toBe('What is a variable?');
    expect((await call('POST', '/content/concepts/variables-let/revert')).status).toBe(409);
  });

  it('hides and shows a concept, and only deletes a created card', async () => {
    expect((await call('PATCH', '/content/concepts/variables-let', { hidden: true })).json.card.hidden).toBe(true);
    expect(servedConcept('stage-1-a00')).toBeUndefined();
    expect((await call('PATCH', '/content/concepts/variables-let', { hidden: false })).json.card.hidden).toBe(false);
    expect(servedConcept('stage-1-a00')?.id).toBe('variables-let');
    expect(store.getConceptCard('variables-let')).toBeNull();

    expect((await call('DELETE', '/content/concepts/variables-let')).status).toBe(409);
    const { json } = await call('POST', '/content/concepts', { anchor: { kind: 'lesson', challengeId: 'stage-1-a03' }, concept: CARD });
    expect((await call('PATCH', `/content/concepts/${json.card.key}`, { hidden: true })).status).toBe(200);
    expect(servedConcept('stage-1-a03')).toBeUndefined();
    expect((await call('DELETE', `/content/concepts/${json.card.key}`)).json).toMatchObject({ deleted: true });
    expect((await call('DELETE', `/content/concepts/${json.card.key}`)).status).toBe(404);
  });

  it('flags a card whose lesson is hidden, and never serves it', async () => {
    const { json } = await call('POST', '/content/concepts', { anchor: { kind: 'lesson', challengeId: 'stage-1-a03' }, concept: CARD });
    store.setChallengeOverride('stage-1-a03', { hidden: true });
    const list = await call('GET', '/content/concepts?stageId=stage-1');
    expect(list.json.rows.find((r) => r.key === json.card.key)).toMatchObject({ orphaned: true, problem: 'anchor-missing', lessonId: 'stage-1-a03' });
    expect(applyLearnerOverrides(contentSnapshot(), store.getContentOverrides()).challenges.some((c) => c.concept?.id === json.card.key)).toBe(false);
  });

  it('shows the card key on the question row', async () => {
    const { json } = await call('POST', '/content/concepts', { anchor: { kind: 'lesson', challengeId: 'stage-1-a03' }, concept: CARD });
    const rows = (await call('GET', '/content/challenges?stageId=stage-1')).json.challenges;
    expect(rows.find((r) => r.id === 'stage-1-a03').conceptKey).toBe(json.card.key);
    expect(rows.find((r) => r.id === 'stage-1-a00').conceptKey).toBe('variables-let');
  });
});
