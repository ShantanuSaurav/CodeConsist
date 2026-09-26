/**
 * The settings store over HTTP: the public read every learner (and guest)
 * makes, and the admin read/write mounted inside the admin router.
 *
 * Real server/db.js (node:fs/promises stubbed), the real shared rules and
 * the real admin router; only the admin session check is mocked - by a
 * header, so "no admin session" can be tested too.
 */
import express from 'express';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('node:fs/promises', () => ({
  readFile: async () => '{}',
  writeFile: async () => {},
  rename: async () => {},
  mkdir: async () => {}
}));

vi.mock('../admin-auth.js', () => ({
  requireAdminAuth: (req, res, next) => {
    if (req.headers['x-admin'] !== 'yes') return res.status(401).json({ error: 'Admin sign-in required.' });
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
import { createSettingsRouter } from '../settings-routes.js';
import { createLearningDeps, lib, resetStore } from './learning-fixture.mjs';

let server;
let base;
let learningDeps;

beforeAll(async () => {
  await store.load();
  learningDeps = createLearningDeps(store);
  const app = express();
  app.use(express.json());
  app.use('/api', createSettingsRouter({ getService: () => learningDeps.settings }));
  app.use('/api/admin', createAdminRouter({ learning: learningDeps }));
  // The same router with no learning services - before boot, or a bare test.
  app.use('/api/bare-admin', createAdminRouter({}));
  // A server started with TRUST_PROXY_HOPS in its environment.
  app.use('/api/env-admin', createAdminRouter({ learning: createLearningDeps(store, { env: { TRUST_PROXY_HOPS: '1' } }) }));
  app.use((err, _req, res, _next) => res.status(500).json({ error: err.message }));
  server = await new Promise((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  base = `http://127.0.0.1:${server.address().port}/api`;
});

afterAll(async () => {
  await new Promise((resolve) => server.close(resolve));
});

beforeEach(() => resetStore(store));

async function call(method, path, { body, admin = false } = {}) {
  const res = await fetch(base + path, {
    method,
    headers: { ...(body !== undefined ? { 'content-type': 'application/json' } : {}), ...(admin ? { 'x-admin': 'yes' } : {}) },
    body: body !== undefined ? JSON.stringify(body) : undefined
  });
  const text = await res.text();
  return { status: res.status, headers: res.headers, json: text ? JSON.parse(text) : null };
}

const put = (revision, patch) => call('PUT', '/admin/settings', { admin: true, body: { revision, patch } });

describe('GET /api/settings (public)', () => {
  it('needs no sign-in and never sends the admin-only sections', async () => {
    const res = await call('GET', '/settings');
    expect(res.status).toBe(200);
    expect(res.json.revision).toBe(0);
    expect(res.json.settings.xp).toEqual(lib.DEFAULT_SETTINGS.xp);
    expect(res.json.settings.levels.ranks[0]).toEqual({ minLevel: 1, title: 'Apprentice' });
    expect(res.json.settings.retention).toBeUndefined();
    expect(res.headers.get('etag')).toBe('"r0"');
    expect(res.headers.get('cache-control')).toBe('no-cache');
  });
});

describe('the admin settings routes', () => {
  it('401 without an admin session', async () => {
    expect((await call('GET', '/admin/settings')).status).toBe(401);
    expect((await call('PUT', '/admin/settings', { body: { revision: 0, patch: { xp: { passScore: 70 } } } })).status).toBe(401);
    expect((await call('GET', '/admin/settings/context')).status).toBe(401);
    expect(store.getSettingsRecord().revision).toBe(0);
  });

  it('shows effective settings, overrides, defaults and issues', async () => {
    const res = await call('GET', '/admin/settings', { admin: true });
    expect(res.status).toBe(200);
    expect(res.json).toMatchObject({ revision: 0, overrides: {}, issues: [], env: {}, updatedAt: null, updatedBy: null });
    expect(res.json.settings.retention).toEqual(lib.DEFAULT_SETTINGS.retention);
    expect(res.json.defaults).toEqual(lib.DEFAULT_SETTINGS);
  });

  it('stores only the change, bumps the revision and writes an audit row', async () => {
    const res = await put(0, { xp: { passScore: 70 } });
    expect(res.status).toBe(200);
    expect(res.json).toMatchObject({ revision: 1, overrides: { xp: { passScore: 70 } }, updatedBy: 'admin' });
    expect(res.json.settings.xp.passScore).toBe(70);
    expect(store.getSettingsRecord().overrides).toEqual({ xp: { passScore: 70 } });

    const audit = store.db().auditLog.at(-1);
    expect(audit).toMatchObject({ action: 'settings.update', target: 'settings', adminUsername: 'admin' });
    expect(audit.details).toEqual({ revision: 1, changes: { 'xp.passScore': { from: 60, to: 70 } } });

    // Learners see it on their next read.
    const pub = await call('GET', '/settings');
    expect(pub.json.revision).toBe(1);
    expect(pub.json.settings.xp.passScore).toBe(70);
    expect(pub.headers.get('etag')).toBe('"r1"');
  });

  it('null puts a setting - or a whole section - back to its default', async () => {
    await put(0, { xp: { passScore: 70, hintPenalty: 5 }, streak: { maxPlausibleMergedStreak: 90 } });
    const one = await put(1, { xp: { passScore: null } });
    expect(one.json.overrides).toEqual({ xp: { hintPenalty: 5 }, streak: { maxPlausibleMergedStreak: 90 } });
    const section = await put(2, { xp: null });
    expect(section.json.overrides).toEqual({ streak: { maxPlausibleMergedStreak: 90 } });
    expect(section.json.settings.xp).toEqual(lib.DEFAULT_SETTINGS.xp);
    expect(section.json.revision).toBe(3);
  });

  it('400s an unknown setting or a patch that is not an object', async () => {
    const unknown = await put(0, { xp: { foo: 1 } });
    expect(unknown.status).toBe(400);
    expect(unknown.json.error).toBe('Unknown setting "xp.foo"');
    expect((await put(0, [1])).status).toBe(400);
    expect((await put(0, 'xp.passScore=70')).status).toBe(400);
    expect((await call('PUT', '/admin/settings', { admin: true, body: { patch: {} } })).status).toBe(400);
    expect(store.getSettingsRecord().revision).toBe(0);
  });

  it('409s a stale revision, with the current one', async () => {
    await put(0, { xp: { passScore: 70 } });
    const stale = await put(0, { xp: { passScore: 65 } });
    expect(stale.status).toBe(409);
    expect(stale.json.revision).toBe(1);
    expect(store.getSettingsRecord().overrides).toEqual({ xp: { passScore: 70 } });
  });

  it('422s invalid values, each tied to its path', async () => {
    const floor = await put(0, { xp: { scoreFloor: 90 } });
    expect(floor.status).toBe(422);
    expect(floor.json.issues).toEqual([{ path: 'xp.scoreFloor', message: 'Must be at most the pass score (60).' }]);

    const typed = await put(0, { xp: { passScore: '70' }, levels: { ranks: [{ minLevel: 2, title: 'X' }] } });
    expect(typed.status).toBe(422);
    expect(typed.json.issues.map((i) => i.path).sort()).toEqual(['levels.ranks.0.minLevel', 'xp.passScore']);
    expect(store.getSettingsRecord().revision).toBe(0);
  });

  it('a stored section that no longer validates falls back to its defaults and is reported', async () => {
    store.setSettingsRecord({ overrides: { xp: { scoreFloor: 95 }, streak: { maxPlausibleMergedStreak: 30 } }, revision: 5, updatedAt: null, updatedBy: null });
    const res = await call('GET', '/admin/settings', { admin: true });
    expect(res.json.settings.xp).toEqual(lib.DEFAULT_SETTINGS.xp);
    expect(res.json.settings.streak.maxPlausibleMergedStreak).toBe(30);
    expect(res.json.issues.map((i) => i.path)).toEqual(['xp.scoreFloor']);
    expect((await call('GET', '/settings')).json.settings.xp.scoreFloor).toBe(50);
  });

  it('a stored key this build does not know never blocks a save, and can be removed', async () => {
    // What a rollback leaves behind: keys a newer build wrote.
    store.setSettingsRecord({
      overrides: { celebrations: { confetti: true }, xp: { passScore: 70, legacyBonus: 3 } },
      revision: 3,
      updatedAt: null,
      updatedBy: null
    });
    const view = await call('GET', '/admin/settings', { admin: true });
    expect(view.json.issues.map((i) => i.path).sort()).toEqual(['celebrations', 'xp.legacyBonus']);

    // Any other change still saves - even one in the same section - and the unknown keys stay stored.
    const save = await put(3, { xp: { hintPenalty: 5 } });
    expect(save.status).toBe(200);
    expect(save.json.overrides).toEqual({ celebrations: { confetti: true }, xp: { passScore: 70, legacyBonus: 3, hintPenalty: 5 } });

    // They can be removed, never set.
    expect((await put(4, { celebrations: { confetti: false } })).status).toBe(400);
    expect((await put(4, { xp: { legacyBonus: 4 } })).status).toBe(400);
    const removed = await put(4, { celebrations: null, xp: { legacyBonus: null } });
    expect(removed.status).toBe(200);
    expect(removed.json.overrides).toEqual({ xp: { passScore: 70, hintPenalty: 5 } });
    expect(removed.json.issues).toEqual([]);
    expect(Object.keys(store.db().auditLog.at(-1).details.changes).sort()).toEqual(['celebrations', 'xp.legacyBonus']);
  });

  it('a stored section that stopped validating only blocks saves to that section', async () => {
    store.setSettingsRecord({ overrides: { xp: { scoreFloor: 95 } }, revision: 5, updatedAt: null, updatedBy: null });
    expect((await put(5, { streak: { maxPlausibleMergedStreak: 30 } })).status).toBe(200);

    const same = await put(6, { xp: { hintPenalty: 5 } });
    expect(same.status).toBe(422);
    expect(same.json.issues.map((i) => i.path)).toEqual(['xp.scoreFloor']);
    // Putting the bad value back to its default in the same save fixes it.
    expect((await put(6, { xp: { scoreFloor: null, hintPenalty: 5 } })).status).toBe(200);
  });

  it('describes the content, the runtimes and every learner’s XP for impact previews', async () => {
    store.setProgress('u1', { ...store.getProgress('u1'), xp: 1234 });
    const res = await call('GET', '/admin/settings/context', { admin: true });
    expect(res.status).toBe(200);
    expect(res.json.runtime).toEqual({ pythonVerifiable: false, judge0Languages: [] });
    expect(res.json.levels.learnerXp.sort((a, b) => a - b)).toEqual([0, 1234]);
    expect(res.json.content).toMatchObject({ lessons: expect.any(Number), tests: expect.any(Number), totalXp: expect.any(Number) });
  });

  it('503s while the settings service is not there', async () => {
    expect((await call('GET', '/bare-admin/settings', { admin: true })).status).toBe(503);
    expect((await call('PUT', '/bare-admin/settings', { admin: true, body: { revision: 0, patch: {} } })).status).toBe(503);
  });

  it('503s the Limits & access status while the limiter is not there', async () => {
    expect((await call('GET', '/admin/access/status', { admin: true })).status).toBe(503);
    expect((await call('POST', '/admin/access/rate-limits/reset', { admin: true, body: { bucket: 'login.ip' } })).status).toBe(503);
  });

  it('leaves the admin credentials route alone', async () => {
    // Same prefix, different route: PATCH /settings/credentials still reaches its own handler.
    const res = await call('PATCH', '/admin/settings/credentials', { admin: true, body: {} });
    expect(res.status).toBe(400);
    expect(res.json.error).toBe('Current password is required.');
  });
});

describe('the access section (Limits & access)', () => {
  it('is admin only: never sent to learners', async () => {
    const pub = await call('GET', '/settings');
    expect(pub.json.settings.access).toBeUndefined();
    const admin = await call('GET', '/admin/settings', { admin: true });
    expect(admin.json.settings.access).toEqual(lib.DEFAULT_SETTINGS.access);
    expect(admin.json.settings.access.rateLimit.loginAccount).toEqual({ limit: 10, windowSeconds: 900 });
  });

  it('holds every number to its range', async () => {
    const res = await put(0, {
      access: {
        rateLimit: { mode: 'sometimes', loginIp: { limit: 4 }, registerGlobal: { limit: 10_001 }, solveAccount: { windowSeconds: 59 } },
        execution: { maxConcurrent: 0, maxQueued: 201, queueWaitMs: 30_001 },
        network: { trustProxyHops: 6 },
        premiumGate: 'off',
        passwordResetTtlMinutes: 14
      }
    });
    expect(res.status).toBe(422);
    expect(res.json.issues.map((i) => i.path).sort()).toEqual([
      'access.execution.maxConcurrent',
      'access.execution.maxQueued',
      'access.execution.queueWaitMs',
      'access.network.trustProxyHops',
      'access.passwordResetTtlMinutes',
      'access.premiumGate',
      'access.rateLimit.loginIp.limit',
      'access.rateLimit.mode',
      'access.rateLimit.registerGlobal.limit',
      'access.rateLimit.solveAccount.windowSeconds'
    ]);
    expect(store.getSettingsRecord().revision).toBe(0);
  });

  it('stores a valid change sparsely and applies it at once', async () => {
    const res = await put(0, { access: { rateLimit: { loginAccount: { limit: 5 } }, cors: { mode: 'enforce' }, premiumGate: 'log' } });
    expect(res.status).toBe(200);
    expect(res.json.overrides).toEqual({ access: { rateLimit: { loginAccount: { limit: 5 } }, cors: { mode: 'enforce' }, premiumGate: 'log' } });
    expect(learningDeps.settings.get('access.rateLimit.loginAccount')).toEqual({ limit: 5, windowSeconds: 900 });
    expect(learningDeps.settings.get('access.premiumGate')).toBe('log');
  });

  it('wants exact origins, in the form a browser sends them, at most 20', async () => {
    expect((await put(0, { access: { cors: { extraOrigins: ['https://preview.example.com', 'http://localhost:5173'] } } })).status).toBe(200);

    for (const bad of ['https://example.com/app', 'https://*.example.com', 'ftp://example.com', 'example.com']) {
      const res = await put(1, { access: { cors: { extraOrigins: [bad] } } });
      expect(res.status, bad).toBe(422);
      expect(res.json.issues.map((i) => i.path)).toEqual(['access.cors.extraOrigins.0']);
    }
    // A valid origin written another way is refused with the form to use.
    const upper = await put(1, { access: { cors: { extraOrigins: ['https://Preview.Example.com/'] } } });
    expect(upper.status).toBe(422);
    expect(upper.json.issues[0].message).toContain('https://preview.example.com');

    const many = Array.from({ length: 21 }, (_, i) => `https://s${i}.example.com`);
    expect((await put(1, { access: { cors: { extraOrigins: many } } })).json.issues.map((i) => i.path)).toEqual(['access.cors.extraOrigins']);
  });

  it('takes the proxy hops from TRUST_PROXY_HOPS, under any admin override', async () => {
    const view = await call('GET', '/env-admin/settings', { admin: true });
    expect(view.json.env).toEqual({ 'access.network.trustProxyHops': 1 });
    expect(view.json.defaults.access.network.trustProxyHops).toBe(1);
    expect(view.json.settings.access.network.trustProxyHops).toBe(1);

    const saved = await call('PUT', '/env-admin/settings', { admin: true, body: { revision: 0, patch: { access: { network: { trustProxyHops: 2 } } } } });
    expect(saved.status).toBe(200);
    expect(saved.json.settings.access.network.trustProxyHops).toBe(2);
    // Reset puts the environment's value back, not the code default.
    const reset = await call('PUT', '/env-admin/settings', { admin: true, body: { revision: 1, patch: { access: { network: { trustProxyHops: null } } } } });
    expect(reset.json.settings.access.network.trustProxyHops).toBe(1);
  });
});

describe('the copy section (Site copy)', () => {
  it('goes out to learners with the rest of the public settings', async () => {
    const pub = await call('GET', '/settings');
    expect(pub.json.settings.copy.offline.banner).toBe(lib.DEFAULT_SETTINGS.copy.offline.banner);
  });

  it('keeps each text to its own tokens, its length and non-empty', async () => {
    const bad = await put(0, {
      copy: {
        landing: { pathLine: '{stages} stages and {lessons} lessons' },
        offline: { banner: 'x'.repeat(301), auth: '' }
      }
    });
    expect(bad.status).toBe(422);
    expect(bad.json.issues.map((i) => i.path).sort()).toEqual(['copy.landing.pathLine', 'copy.offline.auth', 'copy.offline.banner']);

    const ok = await put(0, { copy: { limits: { tooMany: 'Slow down - back in {minutes} min.' } } });
    expect(ok.status).toBe(200);
    expect(learningDeps.settings.copyText('limits.tooMany', { minutes: 4 })).toBe('Slow down - back in 4 min.');
    expect(learningDeps.settings.copyText('copy.premium.lockedSolve')).toBe(lib.DEFAULT_SETTINGS.copy.premium.lockedSolve);
    expect(learningDeps.settings.copyText('nothing.here')).toBe('');
  });
});
