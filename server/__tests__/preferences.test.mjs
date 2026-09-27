/**
 * A learner's own preferences over HTTP: PATCH /api/me/preferences (Phase 2
 * accepts `soundOn` only), and a guest's choice carried in by a merge.
 *
 * Real server/db.js with node:fs/promises stubbed (as in drafts.test.mjs);
 * the learner is picked by an `x-user` header, like the other route tests.
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
import { adoptGuestPreferences, createPreferencesRouter, parsePreferencesPatch, publicPreferences } from '../preferences-routes.js';
import { resetStore, startLearnerApp } from './learning-fixture.mjs';

let server;
let root;
let learner;

const publicUser = (user) => ({ id: user.id, username: user.username, preferences: publicPreferences(store.normalizePreferences(user.preferences)) });

beforeAll(async () => {
  await store.load();
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    const id = req.headers['x-user'];
    req.user = typeof id === 'string' && id ? store.findUserById(id) : null;
    next();
  });
  const requireAuth = (req, res, next) => (req.user ? next() : res.status(401).json({ error: 'Sign in to continue.' }));
  app.use('/api', createPreferencesRouter({ requireAuth, publicUser, store }));
  server = await new Promise((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  root = `http://127.0.0.1:${server.address().port}/api`;
  learner = await startLearnerApp(store);
});

afterAll(async () => {
  await new Promise((resolve) => server.close(resolve));
  await learner.close();
});

beforeEach(() => resetStore(store));

async function patch(body, user = 'u1') {
  const res = await fetch(`${root}/me/preferences`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json', ...(user ? { 'x-user': user } : {}) },
    body: JSON.stringify(body)
  });
  return { status: res.status, json: await res.json() };
}

describe('PATCH /api/me/preferences', () => {
  it('needs a signed-in learner', async () => {
    expect((await patch({ soundOn: false }, null)).status).toBe(401);
  });

  it('stores soundOn on the account and answers with the public user', async () => {
    const res = await patch({ soundOn: false });
    expect(res.status).toBe(200);
    expect(res.json.user.preferences).toMatchObject({ soundOn: false, timeZone: null });
    expect(res.json.applied).toEqual({ timeZone: false });
    expect(store.normalizePreferences(store.findUserById('u1').preferences).soundOn).toBe(false);
    // When the zone was set never leaves the server.
    expect(res.json.user.preferences).not.toHaveProperty('timeZoneSetAt');
  });

  it('null puts the default back', async () => {
    await patch({ soundOn: true });
    const res = await patch({ soundOn: null });
    expect(res.json.user.preferences.soundOn).toBeNull();
  });

  it('refuses a bad value, an unknown field and an empty patch, naming the field', async () => {
    const bad = await patch({ soundOn: 'loud' });
    expect(bad.status).toBe(400);
    expect(bad.json.error).toContain('soundOn');
    const unknown = await patch({ theme: 'dark' });
    expect(unknown.status).toBe(400);
    expect(unknown.json.error).toContain('theme');
    expect((await patch({})).status).toBe(400);
    expect((await patch([true])).status).toBe(400);
    expect(store.normalizePreferences(store.findUserById('u1').preferences).soundOn).toBeNull();
  });

  it('keeps the other preferences (the zone) as they were', async () => {
    store.updateUser('u1', { preferences: { ...store.normalizePreferences(null), timeZone: 'Asia/Kolkata', timeZoneSetAt: '2026-09-01T00:00:00.000Z' } });
    await patch({ soundOn: false });
    expect(store.findUserById('u1').preferences).toMatchObject({ timeZone: 'Asia/Kolkata', timeZoneSetAt: '2026-09-01T00:00:00.000Z', soundOn: false });
  });
});

describe('the pure rules', () => {
  it('parses a patch', () => {
    expect(parsePreferencesPatch({ soundOn: true })).toEqual({ patch: { soundOn: true } });
    expect(parsePreferencesPatch({ soundOn: 1 }).error).toBeTruthy();
    expect(parsePreferencesPatch(null).error).toBeTruthy();
  });

  it('adopts a guest choice only where the account has none', () => {
    expect(adoptGuestPreferences({ soundOn: null }, { soundOn: false })).toEqual({ soundOn: false });
    expect(adoptGuestPreferences({ soundOn: true }, { soundOn: false })).toBeNull();
    expect(adoptGuestPreferences({ soundOn: null }, { soundOn: 'off' })).toBeNull();
    expect(adoptGuestPreferences({}, null)).toBeNull();
  });
});

describe('a guest merge carries the sound choice', () => {
  it('is adopted when the account has none, and never over one it made', async () => {
    const first = await learner.call('POST', '/progress/merge', { user: 'u1', body: { progress: {}, preferences: { soundOn: false } } });
    expect(first.status).toBe(200);
    expect(first.json.preferences.soundOn).toBe(false);
    expect(store.findUserById('u1').preferences.soundOn).toBe(false);

    const second = await learner.call('POST', '/progress/merge', { user: 'u1', body: { progress: {}, preferences: { soundOn: true } } });
    expect(second.json.preferences.soundOn).toBe(false);
  });
});
