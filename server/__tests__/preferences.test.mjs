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
    // No zone was sent, so there is no zone verdict either.
    expect(res.json.applied).toEqual({});
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

/* ------------------------------------------------------------ Phase 3 */

describe('PATCH /api/me/preferences: the daily goal and the time zone', () => {
  const prefs = () => store.normalizePreferences(store.findUserById('u1').preferences);
  const setPrefs = (patch) => store.updateUser('u1', { preferences: { ...prefs(), ...patch } });
  const send = (body) => learner.call('PATCH', '/me/preferences', { user: 'u1', body });

  it('takes an enabled goal option, and null puts the default back', async () => {
    const res = await send({ dailyGoalId: 'serious' });
    expect(res.status).toBe(200);
    expect(res.json.user.preferences.dailyGoalId).toBe('serious');
    expect(prefs().dailyGoalId).toBe('serious');
    const back = await send({ dailyGoalId: null });
    expect(back.json.user.preferences.dailyGoalId).toBeNull();
  });

  it('refuses a goal that is unknown or switched off', async () => {
    const unknown = await send({ dailyGoalId: 'marathon' });
    expect(unknown.status).toBe(400);
    expect(unknown.json.error).toBe('That goal is not available.');
    const service = learner.learningDeps.settings;
    const options = service.current().goals.options.map((o) => (o.id === 'intense' ? { ...o, enabled: false } : o));
    expect(service.update({ revision: service.revision(), patch: { goals: { options } } }).ok).toBe(true);
    expect((await send({ dailyGoalId: 'intense' })).status).toBe(400);
    expect((await send({ dailyGoalId: 42 })).status).toBe(400);
    expect(prefs().dailyGoalId).toBeNull();
  });

  it('takes a valid zone and refuses one that is not', async () => {
    const res = await send({ timeZone: 'Asia/Kolkata' });
    expect(res.status).toBe(200);
    expect(res.json.applied).toEqual({ timeZone: true });
    expect(prefs()).toMatchObject({ timeZone: 'Asia/Kolkata' });
    expect(prefs().timeZoneSetAt).toBeTruthy();
    for (const bad of ['Mars/Olympus', 'Asia Kolkata', '', null, 5]) {
      const refused = await send({ timeZone: bad });
      expect(refused.status, String(bad)).toBe(400);
      expect(refused.json.error).toContain('timeZone');
    }
    expect(prefs().timeZone).toBe('Asia/Kolkata');
  });

  it('a change inside the cooldown is not applied - and is not an error', async () => {
    setPrefs({ timeZone: 'Asia/Kolkata', timeZoneSetAt: new Date(Date.now() - 2 * 3600_000).toISOString() });
    const soon = await send({ timeZone: 'America/Los_Angeles', soundOn: false });
    expect(soon.status).toBe(200);
    expect(soon.json.applied).toEqual({ timeZone: false });
    // The rest of the patch still lands.
    expect(prefs()).toMatchObject({ timeZone: 'Asia/Kolkata', soundOn: false });

    // Past the cooldown (20 hours by default), it is taken.
    setPrefs({ timeZoneSetAt: new Date(Date.now() - 21 * 3600_000).toISOString() });
    const later = await send({ timeZone: 'America/Los_Angeles' });
    expect(later.json.applied).toEqual({ timeZone: true });
    expect(prefs().timeZone).toBe('America/Los_Angeles');

    // Sending the zone already stored is applied (nothing to wait for).
    expect((await send({ timeZone: 'America/Los_Angeles' })).json.applied).toEqual({ timeZone: true });
  });

  it('follows the admin’s cooldown', async () => {
    const service = learner.learningDeps.settings;
    expect(service.update({ revision: service.revision(), patch: { streak: { timeZoneChangeCooldownHours: 0 } } }).ok).toBe(true);
    setPrefs({ timeZone: 'Asia/Kolkata', timeZoneSetAt: new Date().toISOString() });
    expect((await send({ timeZone: 'Europe/London' })).json.applied).toEqual({ timeZone: true });
  });

  it('a guest merge brings their goal only where the account has none', async () => {
    const first = await learner.call('POST', '/progress/merge', { user: 'u1', body: { progress: {}, preferences: { dailyGoalId: 'casual' } } });
    expect(first.json.preferences.dailyGoalId).toBe('casual');
    const second = await learner.call('POST', '/progress/merge', { user: 'u1', body: { progress: {}, preferences: { dailyGoalId: 'intense' } } });
    expect(second.json.preferences.dailyGoalId).toBe('casual');
    // A goal this server does not offer is never adopted.
    resetStore(store);
    const odd = await learner.call('POST', '/progress/merge', { user: 'u1', body: { progress: {}, preferences: { dailyGoalId: 'marathon' } } });
    expect(odd.json.preferences.dailyGoalId).toBeNull();
  });

  it('without the rules (an older caller) the new fields are refused', () => {
    expect(parsePreferencesPatch({ dailyGoalId: 'regular' }).error).toBe('That goal is not available.');
    expect(parsePreferencesPatch({ timeZone: 'UTC' }).error).toContain('timeZone');
    expect(adoptGuestPreferences({}, { dailyGoalId: 'regular' })).toBeNull();
  });
});
