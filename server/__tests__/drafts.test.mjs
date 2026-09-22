/**
 * Saved coding sessions - the half of "I do not want to start over" that the
 * server owns.
 *
 * These run against the REAL server/db.js, with node:fs/promises stubbed so
 * the store never reads or writes the project's actual db.json: the caps, the
 * eviction order and the `__proto__` handling are properties of the real
 * implementation, and a hand-written mock of it would prove nothing.
 */
import express from 'express';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

// The one thing a test must never do is touch server/data/db.json.
vi.mock('node:fs/promises', () => ({
  readFile: async () => JSON.stringify({ users: [], progress: {}, drafts: {} }),
  writeFile: async () => {},
  rename: async () => {},
  mkdir: async () => {}
}));

import * as store from '../db.js';
import { clearDraftForSolve, createDraftsRouter } from '../drafts-routes.js';

const KNOWN_CHALLENGES = new Set(['c-1', 'c-2', '__proto__']);

let server;
let base;

beforeAll(async () => {
  await store.load();

  const app = express();
  app.use(express.json({ limit: '256kb' }));
  // The same learner auth shape server/index.js has, named by a header.
  app.use((req, _res, next) => {
    const id = req.headers['x-user'];
    req.user = typeof id === 'string' && id ? store.findUserById(id) : null;
    next();
  });
  const requireAuth = (req, res, next) => (req.user ? next() : res.status(401).json({ error: 'Sign in to continue.' }));
  app.use('/api', createDraftsRouter({ requireAuth, getChallengeMerged: (id) => (KNOWN_CHALLENGES.has(id) ? { id } : null) }));
  app.use((err, _req, res, _next) => res.status(500).json({ error: err.message }));

  server = await new Promise((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  base = `http://127.0.0.1:${server.address().port}/api`;
});

afterAll(async () => {
  await new Promise((resolve) => server.close(resolve));
});

async function call(method, path, { body, user } = {}) {
  const res = await fetch(base + path, {
    method,
    headers: { ...(body !== undefined ? { 'content-type': 'application/json' } : {}), ...(user ? { 'x-user': user } : {}) },
    body: body !== undefined ? JSON.stringify(body) : undefined
  });
  const text = await res.text();
  return { status: res.status, text, json: text ? JSON.parse(text) : null };
}

const learner = (id) => store.insertUser({ id, email: `${id}@example.com`, username: id, passwordHash: 'x', isPremium: false, identities: {} });

beforeEach(() => {
  const state = store.db();
  state.users = [];
  state.progress = {};
  state.drafts = {};
  state.orders = {};
  state.certificates = {};
  learner('u1');
  learner('u2');
});

/* ------------------------------------------------------------- the routes */

describe('drafts routes', () => {
  it('saves, restores and throws away one draft', async () => {
    const saved = await call('PUT', '/drafts/c-1', { body: { code: 'const x = 1;', language: 'javascript' }, user: 'u1' });
    expect(saved.status).toBe(200);
    expect(saved.json.draft).toMatchObject({ code: 'const x = 1;', language: 'javascript' });
    expect(saved.json.draft.updatedAt).toEqual(expect.any(String));

    const restored = await call('GET', '/drafts', { user: 'u1' });
    expect(restored.json.drafts['c-1']).toMatchObject({ code: 'const x = 1;', language: 'javascript' });

    const removed = await call('DELETE', '/drafts/c-1', { user: 'u1' });
    expect(removed.json).toEqual({ ok: true });
    expect((await call('GET', '/drafts', { user: 'u1' })).json.drafts).toEqual({});
  });

  it('hands back every draft in one call, so signing in restores the lot', async () => {
    await call('PUT', '/drafts/c-1', { body: { code: 'one' }, user: 'u1' });
    await call('PUT', '/drafts/c-2', { body: { code: 'two' }, user: 'u1' });
    const res = await call('GET', '/drafts', { user: 'u1' });
    expect(Object.keys(res.json.drafts).sort()).toEqual(['c-1', 'c-2']);
  });

  it('replaces the previous draft for the same lesson', async () => {
    await call('PUT', '/drafts/c-1', { body: { code: 'first' }, user: 'u1' });
    await call('PUT', '/drafts/c-1', { body: { code: 'second' }, user: 'u1' });
    expect((await call('GET', '/drafts', { user: 'u1' })).json.drafts['c-1'].code).toBe('second');
  });

  it('needs a signed-in learner', async () => {
    expect((await call('GET', '/drafts')).status).toBe(401);
    expect((await call('PUT', '/drafts/c-1', { body: { code: 'x' } })).status).toBe(401);
    expect((await call('DELETE', '/drafts/c-1')).status).toBe(401);
  });

  it('404s for a lesson this server does not serve', async () => {
    const res = await call('PUT', '/drafts/not-a-challenge', { body: { code: 'x' }, user: 'u1' });
    expect(res.status).toBe(404);
    expect(res.json.error).toBe('Unknown challenge.');
  });

  it('refuses code that is not text', async () => {
    for (const code of [undefined, 42, { toString: 'no' }, ['x']]) {
      const res = await call('PUT', '/drafts/c-1', { body: { code }, user: 'u1' });
      expect(res.status).toBe(400);
    }
  });

  it('caps one draft at 20000 characters, and says so', async () => {
    const atCap = await call('PUT', '/drafts/c-1', { body: { code: 'x'.repeat(20_000) }, user: 'u1' });
    expect(atCap.status).toBe(200);

    const overCap = await call('PUT', '/drafts/c-1', { body: { code: 'x'.repeat(20_001) }, user: 'u1' });
    expect(overCap.status).toBe(400);
    expect(overCap.json.error).toContain('20000');
    // The one that fit is still there, untouched.
    expect((await call('GET', '/drafts', { user: 'u1' })).json.drafts['c-1'].code).toHaveLength(20_000);
  });

  it('keeps one learner out of another learner’s drafts', async () => {
    await call('PUT', '/drafts/c-1', { body: { code: 'u1 private work' }, user: 'u1' });
    await call('PUT', '/drafts/c-1', { body: { code: 'u2 own work' }, user: 'u2' });

    // There is no route that takes a user id: a draft is always the caller's.
    expect((await call('GET', '/drafts', { user: 'u2' })).json.drafts['c-1'].code).toBe('u2 own work');
    expect((await call('GET', '/drafts', { user: 'u1' })).json.drafts['c-1'].code).toBe('u1 private work');

    await call('DELETE', '/drafts/c-1', { user: 'u2' });
    expect((await call('GET', '/drafts', { user: 'u1' })).json.drafts['c-1'].code).toBe('u1 private work');
  });

  it('treats __proto__ as an ordinary challenge id', async () => {
    const res = await call('PUT', '/drafts/__proto__', { body: { code: 'polluted' }, user: 'u1' });
    expect(res.status).toBe(200);

    expect({}.code).toBeUndefined();
    expect(Object.prototype.code).toBeUndefined();
    expect(Object.getPrototypeOf({})).toBe(Object.prototype);

    const all = await call('GET', '/drafts', { user: 'u1' });
    expect(all.text).toContain('__proto__');
    expect(all.json.drafts.__proto__.code).toBe('polluted');
  });
});

/* ------------------------------------------------------------- the store */

describe('draft store', () => {
  it('looks up own properties only', () => {
    store.putDraft('u1', 'c-1', { code: 'x' });
    expect(store.getDraft('u1', 'toString')).toBeNull();
    expect(store.getDraft('u1', 'constructor')).toBeNull();
    expect(store.getDraft('u-nobody', 'c-1')).toBeNull();
    expect(store.getDrafts('u-nobody')).toEqual({});
  });

  it('keeps 200 drafts per learner, dropping the least recently updated first', () => {
    for (let i = 0; i < 200; i++) store.putDraft('u1', `gen-${i}`, { code: `code ${i}` });
    expect(Object.keys(store.getDrafts('u1'))).toHaveLength(200);

    // Backdate one from the MIDDLE: eviction is by updatedAt, not by the
    // order things happen to have been written in.
    store.getDraft('u1', 'gen-100').updatedAt = '2000-01-01T00:00:00.000Z';

    store.putDraft('u1', 'gen-200', { code: 'the newest' });

    const kept = store.getDrafts('u1');
    expect(Object.keys(kept)).toHaveLength(200);
    expect(kept['gen-100']).toBeUndefined();
    expect(kept['gen-0']).toMatchObject({ code: 'code 0' });
    expect(kept['gen-200']).toMatchObject({ code: 'the newest' });
  });

  it('drops a solved lesson’s draft - one place, called by /api/progress/solve', () => {
    store.putDraft('u1', 'c-1', { code: 'half-finished' });
    expect(clearDraftForSolve('u1', 'c-1')).toBe(true);
    expect(store.getDraft('u1', 'c-1')).toBeNull();
    // Solving a lesson that was never drafted is not an error.
    expect(clearDraftForSolve('u1', 'c-2')).toBe(false);
  });

  it('will not take a draft for a lesson the learner has already solved', async () => {
    // The debounced save the last keystroke queued can easily land after the
    // solve that deleted the draft. Refusing it here is what stops a solved
    // lesson reopening at a half-finished attempt on the next device.
    store.setProgress('u1', { ...store.getProgress('u1'), completedChallenges: ['c-1'] });

    const res = await call('PUT', '/drafts/c-1', { user: 'u1', body: { code: 'the late write' } });

    expect(res.status).toBe(200);
    expect(res.json).toEqual({ draft: null });
    expect(store.getDraft('u1', 'c-1')).toBeNull();
    // A lesson they have not solved still saves normally.
    expect((await call('PUT', '/drafts/c-2', { user: 'u1', body: { code: 'still going' } })).json.draft).toMatchObject({
      code: 'still going'
    });
  });

  it('takes a deleted account’s drafts with it', () => {
    store.putDraft('u1', 'c-1', { code: 'mine' });
    store.putDraft('u2', 'c-1', { code: 'theirs' });

    expect(store.deleteUser('u1')).toBe(true);

    expect(store.getDrafts('u1')).toEqual({});
    expect(store.db().drafts.u1).toBeUndefined();
    // Nobody else's work is touched.
    expect(store.getDraft('u2', 'c-1')).toMatchObject({ code: 'theirs' });
  });
});
