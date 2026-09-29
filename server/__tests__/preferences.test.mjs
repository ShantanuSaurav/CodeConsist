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
import { SEEN_CONCEPTS_MAX, unionSeenConcepts } from '../progress-rules.js';
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

/* ------------------------------------------------------------ Phase 5 */

describe('PATCH /api/me/preferences: track, mode and the first-run setup (Phase 5)', () => {
  const prefs = () => store.normalizePreferences(store.findUserById('u1').preferences);
  const send = (body) => learner.call('PATCH', '/me/preferences', { user: 'u1', body });

  it('stores the track, the mode and the setup answers, and null puts each back', async () => {
    const res = await send({ trackId: 'c', learningMode: 'practice', motivation: 'job', experience: 'some' });
    expect(res.status).toBe(200);
    expect(res.json.user.preferences).toMatchObject({ trackId: 'c', learningMode: 'practice', motivation: 'job', experience: 'some' });
    expect(prefs()).toMatchObject({ trackId: 'c', learningMode: 'practice', motivation: 'job', experience: 'some' });
    const back = await send({ trackId: null, learningMode: null, motivation: null, experience: null });
    expect(back.json.user.preferences).toMatchObject({ trackId: null, learningMode: null, motivation: null, experience: null });
  });

  it('answers 400 for a bad value in each field, naming it, and changes nothing', async () => {
    const cases = [
      [{ trackId: 'fortran' }, 'trackId'],
      [{ trackId: 7 }, 'trackId'],
      [{ learningMode: 'cram' }, 'learningMode'],
      [{ motivation: 'fame' }, 'motivation'],
      [{ motivation: '' }, 'motivation'],
      [{ experience: 'guru' }, 'experience'],
      [{ onboarding: 'maybe' }, 'onboarding'],
      [{ onboarding: null }, 'onboarding']
    ];
    for (const [body, field] of cases) {
      const res = await send(body);
      expect(res.status, JSON.stringify(body)).toBe(400);
      expect(res.json.error).toContain(field);
    }
    expect(prefs()).toMatchObject({ trackId: null, learningMode: null, motivation: null, experience: null });
    expect(store.findUserById('u1').onboarding ?? null).toBeNull();
  });

  it('a motivation answer the admin removed is refused', async () => {
    const service = learner.learningDeps.settings;
    const options = service.current().onboarding.motivation.options.filter((o) => o.id !== 'fun');
    expect(service.update({ revision: service.revision(), patch: { onboarding: { motivation: { options } } } }).ok).toBe(true);
    expect((await send({ motivation: 'fun' })).status).toBe(400);
    expect((await send({ motivation: 'job' })).status).toBe(200);
  });

  it('records the setup finished or dismissed, keeping the other time', async () => {
    const dismissed = await send({ onboarding: 'dismissed' });
    expect(dismissed.status).toBe(200);
    expect(dismissed.json.user.onboarding.dismissedAt).toBeTruthy();
    expect(dismissed.json.user.onboarding.completedAt).toBeNull();
    const done = await send({ onboarding: 'completed', motivation: 'fun' });
    expect(done.json.user.onboarding.completedAt).toBeTruthy();
    // The dismissal is still there: both are history.
    expect(done.json.user.onboarding.dismissedAt).toBe(dismissed.json.user.onboarding.dismissedAt);
    expect(store.normalizeOnboarding(store.findUserById('u1').onboarding)).toEqual(done.json.user.onboarding);
    // The setup state is not a preference.
    expect(prefs()).not.toHaveProperty('onboarding');
  });

  it('refuses a track the server does not show (an unpublished one, or before the content loads)', async () => {
    const hidden = await startLearnerApp(store, { preferences: { learnerTracks: () => ['core'] } });
    const early = await startLearnerApp(store, { preferences: { learnerTracks: () => null } });
    try {
      expect((await hidden.call('PATCH', '/me/preferences', { user: 'u1', body: { trackId: 'c' } })).status).toBe(400);
      expect((await hidden.call('PATCH', '/me/preferences', { user: 'u1', body: { trackId: 'core' } })).status).toBe(200);
      expect((await early.call('PATCH', '/me/preferences', { user: 'u1', body: { trackId: 'core' } })).status).toBe(400);
    } finally {
      await hidden.close();
      await early.close();
    }
  });

  it('a guest merge brings their track, mode and answers only where the account has none', async () => {
    store.updateUser('u1', { preferences: { ...prefs(), learningMode: 'learn' } });
    const res = await learner.call('POST', '/progress/merge', {
      user: 'u1',
      body: { progress: {}, preferences: { trackId: 'c', learningMode: 'practice', motivation: 'college', experience: 'guru' } }
    });
    expect(res.status).toBe(200);
    // Adopted where empty; the account's own mode wins; a bad answer is never adopted.
    expect(res.json.preferences).toMatchObject({ trackId: 'c', learningMode: 'learn', motivation: 'college', experience: null });
    expect(adoptGuestPreferences({}, { trackId: 'core' })).toBeNull();
  });
});

describe('POST /api/progress/concepts (Phase 5)', () => {
  const KNOWN = new Set(['concept-vars', 'concept-loops', 'concept-if']);
  let app;
  beforeAll(async () => {
    app = await startLearnerApp(store, { progress: { knownConceptIds: () => KNOWN } });
  });
  afterAll(async () => {
    await app.close();
  });
  const post = (conceptIds, user = 'u1') => app.call('POST', '/progress/concepts', { user, body: { conceptIds } });

  it('adds known concepts once each, in first-seen order, and drops unknown ones', async () => {
    const first = await post(['concept-loops', 'nope', 'concept-vars', 'concept-loops', 42, '__proto__']);
    expect(first.status).toBe(200);
    expect(first.json.seenConcepts).toEqual(['concept-loops', 'concept-vars']);
    const second = await post(['concept-vars', 'concept-if']);
    expect(second.json.seenConcepts).toEqual(['concept-loops', 'concept-vars', 'concept-if']);
    expect(store.getProgress('u1').seenConcepts).toEqual(['concept-loops', 'concept-vars', 'concept-if']);
    // Only this learner's row.
    expect(store.getProgress('u2').seenConcepts).toEqual([]);
  });

  it('needs a list and a signed-in learner', async () => {
    expect((await post('concept-vars')).status).toBe(400);
    expect((await app.call('POST', '/progress/concepts', { user: 'u1', body: {} })).status).toBe(400);
    expect((await post(['concept-vars'], null)).status).toBe(401);
  });

  it('answers 503 while the content is not loaded', async () => {
    const early = await startLearnerApp(store, { progress: { knownConceptIds: () => null } });
    try {
      expect((await early.call('POST', '/progress/concepts', { user: 'u1', body: { conceptIds: ['concept-vars'] } })).status).toBe(503);
    } finally {
      await early.close();
    }
  });

  it('keeps at most 500, the newest', () => {
    const many = Array.from({ length: 700 }, (_, i) => `c-${i}`);
    const stored = many.slice(0, 450);
    const { list, added } = unionSeenConcepts(stored, many.slice(450), () => true);
    expect(added).toHaveLength(250);
    expect(list).toHaveLength(SEEN_CONCEPTS_MAX);
    expect(list[list.length - 1]).toBe('c-699');
    expect(list[0]).toBe('c-200');
    // One request adds at most 500 either way.
    expect(unionSeenConcepts([], many, () => true).added).toHaveLength(SEEN_CONCEPTS_MAX);
  });

  it('a merge unions the other device’s concepts - known ones only - and a reset clears them', async () => {
    store.setProgress('u1', { ...store.getProgress('u1'), seenConcepts: ['concept-if'] });
    const merged = await app.call('POST', '/progress/merge', { user: 'u1', body: { progress: { seenConcepts: ['concept-vars', 'made-up', 'concept-if'] } } });
    expect(merged.status).toBe(200);
    expect(merged.json.progress.seenConcepts).toEqual(['concept-if', 'concept-vars']);
    const reset = await app.call('POST', '/progress/reset', { user: 'u1' });
    expect(reset.json.progress.seenConcepts).toEqual([]);
  });
});
