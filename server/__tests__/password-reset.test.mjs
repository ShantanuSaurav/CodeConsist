/**
 * Admin-issued password reset links, end to end over HTTP: the admin routes
 * inside the real admin router (only its session check is mocked, by a
 * header), the learner routes as server/index.js mounts them, the real
 * server/db.js (node:fs/promises stubbed so db.json is never touched) and
 * real bcrypt and JWTs.
 *
 * What matters most: the token exists only in the one response that issues
 * it (the store holds a SHA-256, the audit log holds neither), a link works
 * once - even when two submits race - and using one signs out every other
 * session.
 */
import bcrypt from 'bcryptjs';
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
import { initAuthSecret, learnerTokenIsCurrent, signLearnerToken, verifyLearnerToken } from '../auth.js';
import { createLimiter, rateLimit } from '../rate-limit.js';
import {
  claimPasswordReset,
  createPasswordResetRouter,
  hashResetToken,
  inspectPasswordReset,
  issuePasswordReset
} from '../password-reset.js';
import { createLearningDeps, resetStore } from './learning-fixture.mjs';

const previousSecret = process.env.JWT_SECRET;
let server;
let base;
let limiter;
let resetRule = { limit: 1000, windowSeconds: 900 };

beforeAll(async () => {
  process.env.JWT_SECRET = 'test-secret-for-password-resets';
  await initAuthSecret();
  await store.load();
  limiter = createLimiter();
  const learningDeps = createLearningDeps(store);

  const app = express();
  app.use(express.json());
  // Learner routes exactly as server/index.js wires them: no auth, a
  // per-address limit (by a header here, standing in for clientIp).
  app.use(
    '/api',
    createPasswordResetRouter({
      store,
      publicUser: (u) => ({ id: u.id, username: u.username, hasPassword: Boolean(u.passwordHash) }),
      signLearnerToken,
      progressFor: (u) => store.getProgress(u.id),
      limiter,
      limit: rateLimit({ limiter, bucket: 'passwordReset.ip', rule: () => resetRule, key: (req) => req.headers['x-ip'] ?? null })
    })
  );
  app.use('/api/admin', createAdminRouter({ learning: learningDeps, access: { limiter, hops: () => 2 } }));
  app.use((err, _req, res, _next) => res.status(500).json({ error: err.message }));
  server = await new Promise((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  base = `http://127.0.0.1:${server.address().port}/api`;
});

afterAll(async () => {
  await new Promise((resolve) => server.close(resolve));
  if (previousSecret === undefined) delete process.env.JWT_SECRET;
  else process.env.JWT_SECRET = previousSecret;
});

beforeEach(async () => {
  resetStore(store, ['u1', 'u2']);
  store.db().passwordResets = {};
  resetRule = { limit: 1000, windowSeconds: 900 };
  limiter.reset('passwordReset.ip');
  limiter.reset('login.account');
  store.updateUser('u1', { passwordHash: await bcrypt.hash('old-password', 4), tokenVersion: 0 });
});

async function call(method, path, { body, admin = false, headers = {} } = {}) {
  const res = await fetch(base + path, {
    method,
    headers: { ...(body !== undefined ? { 'content-type': 'application/json' } : {}), ...(admin ? { 'x-admin': 'yes' } : {}), ...headers },
    body: body !== undefined ? JSON.stringify(body) : undefined
  });
  const text = await res.text();
  return { status: res.status, json: text ? JSON.parse(text) : null };
}

const issue = (userId = 'u1') => call('POST', `/admin/users/${userId}/password-reset`, { admin: true });

describe('issuing a link (admin)', () => {
  it('401s without an admin session and 404s an unknown learner', async () => {
    expect((await call('POST', '/admin/users/u1/password-reset')).status).toBe(401);
    expect((await issue('nobody')).status).toBe(404);
  });

  it('answers 201 with the token once, and stores only its hash', async () => {
    const res = await issue();
    expect(res.status).toBe(201);
    const { token, reset, path, url } = res.json;
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(path).toBe(`/reset-password#token=${token}`);
    expect(url).toBeNull();
    expect(reset).toEqual({ id: expect.stringMatching(/^pr_[a-z2-7]{12}$/), createdAt: expect.any(String), expiresAt: expect.any(String) });
    // 1440 minutes by default.
    expect(Date.parse(reset.expiresAt) - Date.parse(reset.createdAt)).toBe(1440 * 60_000);

    const stored = store.getPasswordReset(reset.id);
    expect(stored.tokenHash).toBe(hashResetToken(token));
    expect(JSON.stringify(store.db())).not.toContain(token);
  });

  it('never writes the token (or its hash) to the audit log', async () => {
    const { json } = await issue();
    const row = store.db().auditLog.at(-1);
    expect(row).toMatchObject({ action: 'user.password-reset.issue', target: 'u1', adminUsername: 'admin' });
    expect(row.details).toEqual({ userId: 'u1', resetId: json.reset.id, expiresAt: json.reset.expiresAt });
    const log = JSON.stringify(store.db().auditLog);
    expect(log).not.toContain(json.token);
    expect(log).not.toContain(hashResetToken(json.token));
  });

  it('revokes the learner’s earlier open link', async () => {
    const first = await issue();
    const second = await issue();
    expect(store.getPasswordReset(first.json.reset.id).revokedAt).toEqual(expect.any(String));
    expect(store.getPasswordReset(second.json.reset.id).revokedAt).toBeNull();
    expect((await call('POST', '/auth/password-reset/inspect', { body: { token: first.json.token } })).json).toEqual({ valid: false, reason: 'revoked' });
  });

  it('takes its lifetime from access.passwordResetTtlMinutes', async () => {
    await call('PUT', '/admin/settings', { admin: true, body: { revision: 0, patch: { access: { passwordResetTtlMinutes: 30 } } } });
    const { json } = await issue();
    expect(Date.parse(json.reset.expiresAt) - Date.parse(json.reset.createdAt)).toBe(30 * 60_000);
  });

  it('lists the links with their status, and revokes one', async () => {
    const first = await issue();
    const second = await issue();
    const list = await call('GET', '/admin/users/u1/password-resets', { admin: true });
    expect(list.status).toBe(200);
    expect(list.json.resets.map((r) => [r.id, r.status])).toEqual([
      [second.json.reset.id, 'active'],
      [first.json.reset.id, 'revoked']
    ]);
    expect(JSON.stringify(list.json)).not.toContain('tokenHash');

    // The Users table shows the live link.
    const users = await call('GET', '/admin/users', { admin: true });
    expect(users.json.users.find((u) => u.id === 'u1').activeResetLink).toEqual({ expiresAt: second.json.reset.expiresAt });
    expect(users.json.users.find((u) => u.id === 'u2').activeResetLink).toBeNull();

    const revoked = await call('POST', `/admin/password-resets/${second.json.reset.id}/revoke`, { admin: true });
    expect(revoked.status).toBe(200);
    expect(revoked.json.reset.status).toBe('revoked');
    expect(store.db().auditLog.at(-1)).toMatchObject({ action: 'user.password-reset.revoke', details: { userId: 'u1', resetId: second.json.reset.id } });
    expect((await call('POST', `/admin/password-resets/${second.json.reset.id}/revoke`, { admin: true })).status).toBe(409);
    expect((await call('POST', '/admin/password-resets/pr_nothing/revoke', { admin: true })).status).toBe(404);
  });
});

describe('inspecting a link (learner)', () => {
  it('says whose it is and until when', async () => {
    const { json } = await issue();
    const res = await call('POST', '/auth/password-reset/inspect', { body: { token: json.token } });
    expect(res.status).toBe(200);
    expect(res.json).toEqual({ valid: true, username: 'u1', expiresAt: json.reset.expiresAt });
  });

  it('calls a malformed or unknown token unknown without a lookup', async () => {
    for (const token of ['', 'short', 'x'.repeat(44), 42, null, 'A'.repeat(43)]) {
      expect((await call('POST', '/auth/password-reset/inspect', { body: { token } })).json).toEqual({ valid: false, reason: 'unknown' });
    }
  });

  it('knows expired and used links', () => {
    const { record, token } = issuePasswordReset({ store, userId: 'u1', ttlMinutes: 15, now: new Date('2026-01-01T00:00:00Z') });
    expect(inspectPasswordReset({ store, token, now: new Date('2026-01-01T00:14:00Z') }).ok).toBe(true);
    expect(inspectPasswordReset({ store, token, now: new Date('2026-01-01T00:15:00Z') })).toEqual({ ok: false, reason: 'expired' });
    store.updatePasswordReset(record.id, { usedAt: '2026-01-01T00:05:00Z' });
    expect(inspectPasswordReset({ store, token, now: new Date('2026-01-01T00:06:00Z') })).toEqual({ ok: false, reason: 'used' });
  });
});

describe('using a link (learner)', () => {
  it('sets a password bcrypt accepts, bumps the token version and answers like a login', async () => {
    const oldSession = verifyLearnerToken(signLearnerToken(store.findUserById('u1')));
    const { json } = await issue();
    const res = await call('POST', '/auth/password-reset', { body: { token: json.token, newPassword: 'brand-new-pass' } });
    expect(res.status).toBe(200);
    expect(res.json).toEqual({ token: expect.any(String), user: { id: 'u1', username: 'u1', hasPassword: true }, progress: expect.any(Object) });

    const user = store.findUserById('u1');
    expect(await bcrypt.compare('brand-new-pass', user.passwordHash)).toBe(true);
    expect(user.tokenVersion).toBe(1);
    expect(user.lastLoginAt).toEqual(expect.any(String));
    expect(store.getPasswordReset(json.reset.id).usedAt).toEqual(expect.any(String));

    // The new token is a session; every token from before is not.
    expect(learnerTokenIsCurrent(verifyLearnerToken(res.json.token), user)).toBe(true);
    expect(learnerTokenIsCurrent(oldSession, user)).toBe(false);

    const audit = store.db().auditLog.at(-1);
    expect(audit).toMatchObject({ action: 'user.password-reset.used', adminId: null, details: { userId: 'u1', resetId: json.reset.id } });
    expect(JSON.stringify(store.db().auditLog)).not.toContain(json.token);
  });

  it('gives a Google/GitHub-only account a password', async () => {
    store.updateUser('u2', { passwordHash: null, identities: { google: { providerUserId: 'g-2' } } });
    const { json } = await issue('u2');
    const res = await call('POST', '/auth/password-reset', { body: { token: json.token, newPassword: 'first-password' } });
    expect(res.status).toBe(200);
    expect(res.json.user.hasPassword).toBe(true);
  });

  it('works once: a second use answers 410', async () => {
    const { json } = await issue();
    expect((await call('POST', '/auth/password-reset', { body: { token: json.token, newPassword: 'brand-new-pass' } })).status).toBe(200);
    const again = await call('POST', '/auth/password-reset', { body: { token: json.token, newPassword: 'another-pass' } });
    expect(again.status).toBe(410);
    expect(again.json.reason).toBe('used');
    expect(store.findUserById('u1').tokenVersion).toBe(1);
  });

  it('lets exactly one of two concurrent submits through', async () => {
    const { json } = await issue();
    const results = await Promise.all([
      call('POST', '/auth/password-reset', { body: { token: json.token, newPassword: 'first-racer-pw' } }),
      call('POST', '/auth/password-reset', { body: { token: json.token, newPassword: 'second-racer-pw' } })
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 410]);
    expect(store.findUserById('u1').tokenVersion).toBe(1);
  });

  it('refuses a short password without spending the link', async () => {
    const { json } = await issue();
    const short = await call('POST', '/auth/password-reset', { body: { token: json.token, newPassword: 'short' } });
    expect(short.status).toBe(400);
    expect(store.getPasswordReset(json.reset.id).usedAt).toBeNull();
    expect((await call('POST', '/auth/password-reset', { body: { token: json.token, newPassword: 'long-enough' } })).status).toBe(200);
  });

  it('410s an unknown, revoked or expired link', async () => {
    expect((await call('POST', '/auth/password-reset', { body: { token: 'A'.repeat(43), newPassword: 'long-enough' } })).json.reason).toBe('unknown');
    const first = await issue();
    await issue();
    const revoked = await call('POST', '/auth/password-reset', { body: { token: first.json.token, newPassword: 'long-enough' } });
    expect(revoked.status).toBe(410);
    expect(revoked.json.reason).toBe('revoked');
  });

  it('clears the email’s failed sign-ins', async () => {
    const rule = { limit: 1, windowSeconds: 900 };
    limiter.hit('login.account', 'u1@example.com', rule);
    expect(limiter.peek('login.account', 'u1@example.com', rule).allowed).toBe(false);
    const { json } = await issue();
    await call('POST', '/auth/password-reset', { body: { token: json.token, newPassword: 'long-enough' } });
    expect(limiter.peek('login.account', 'u1@example.com', rule).allowed).toBe(true);
  });

  it('is limited per address', async () => {
    resetRule = { limit: 3, windowSeconds: 900 };
    const headers = { 'x-ip': '203.0.113.9' };
    for (let i = 0; i < 3; i++) expect((await call('POST', '/auth/password-reset/inspect', { body: { token: 'x' }, headers })).status).toBe(200);
    const refused = await call('POST', '/auth/password-reset/inspect', { body: { token: 'x' }, headers });
    expect(refused.status).toBe(429);
    expect(refused.json.reason).toBe('rate-limited');
    // Another address is its own bucket.
    expect((await call('POST', '/auth/password-reset/inspect', { body: { token: 'x' }, headers: { 'x-ip': '198.51.100.1' } })).status).toBe(200);
  });
});

describe('claimPasswordReset', () => {
  it('marks the link used in the same synchronous step, so a second claim fails', () => {
    const { token } = issuePasswordReset({ store, userId: 'u1' });
    expect(claimPasswordReset({ store, token }).ok).toBe(true);
    expect(claimPasswordReset({ store, token })).toEqual({ ok: false, reason: 'used' });
  });
});

describe('the store', () => {
  it('deleteUser removes the learner’s links and no one else’s', () => {
    issuePasswordReset({ store, userId: 'u1' });
    issuePasswordReset({ store, userId: 'u2' });
    expect(store.deleteUser('u1')).toBe(true);
    expect(store.passwordResetsForUser('u1')).toEqual([]);
    expect(store.passwordResetsForUser('u2')).toHaveLength(1);
  });

  it('prunes links that ended more than 30 days ago on every issue', () => {
    const long = new Date('2026-01-01T00:00:00Z');
    const { record } = issuePasswordReset({ store, userId: 'u2', ttlMinutes: 15, now: long });
    // Still within 30 days of expiring: kept.
    issuePasswordReset({ store, userId: 'u1', now: new Date('2026-01-20T00:00:00Z') });
    expect(store.getPasswordReset(record.id)).not.toBeNull();
    issuePasswordReset({ store, userId: 'u1', now: new Date('2026-02-15T00:00:00Z') });
    expect(store.getPasswordReset(record.id)).toBeNull();
  });

  it('never finds a record through a prototype key', () => {
    expect(store.getPasswordReset('__proto__')).toBeNull();
    expect(store.getPasswordReset('constructor')).toBeNull();
    expect(store.findPasswordResetByTokenHash('')).toBeNull();
  });
});

describe('Limits & access status (admin)', () => {
  it('shows the limiter, and Unblock clears a key', async () => {
    const rule = { limit: 1, windowSeconds: 900 };
    limiter.hit('login.account', 'u1@example.com', rule);
    limiter.hit('login.account', 'u1@example.com', rule);

    const status = await call('GET', '/admin/access/status', { admin: true });
    expect(status.status).toBe(200);
    expect(status.json.ip).toMatchObject({ socket: expect.any(String), hops: 2 });
    const bucket = status.json.limiter.buckets['login.account'];
    expect(bucket).toMatchObject({ blocked: expect.any(Number), setting: 'loginAccount', rule: { limit: 10, windowSeconds: 900 } });
    expect(bucket.top[0]).toMatchObject({ key: 'u1@example.com', count: 2, username: 'u1' });
    expect(status.json.premium).toMatchObject({ mode: 'enforce', blocked: expect.any(Number) });

    const reset = await call('POST', '/admin/access/rate-limits/reset', { admin: true, body: { bucket: 'login.account', key: 'u1@example.com' } });
    expect(reset.json).toEqual({ ok: true, cleared: 1 });
    expect(limiter.peek('login.account', 'u1@example.com', rule).allowed).toBe(true);
    expect(store.db().auditLog.at(-1)).toMatchObject({ action: 'security.rate-limit.reset', details: { bucket: 'login.account', key: 'u1@example.com', cleared: 1 } });

    expect((await call('POST', '/admin/access/rate-limits/reset', { admin: true, body: { bucket: 'nope' } })).status).toBe(400);
    expect((await call('GET', '/admin/access/status')).status).toBe(401);
  });
});
