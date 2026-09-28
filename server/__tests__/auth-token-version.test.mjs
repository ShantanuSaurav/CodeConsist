/**
 * Learner token versions: a password reset bumps `users[].tokenVersion`, and
 * every token signed before it stops being a session. A token from before
 * versions existed has no `tv` claim and reads as 0, so the upgrade itself
 * signs nobody out.
 *
 * Real jsonwebtoken with a test secret; the OAuth router is the second place
 * a learner token is accepted (its `learnerFor`), so it is checked here too.
 */
import express from 'express';
import jwt from 'jsonwebtoken';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { initAuthSecret, learnerTokenIsCurrent, signLearnerToken, verifyLearnerToken } from '../auth.js';
import { createOAuthRouter } from '../oauth-routes.js';

const SECRET = 'test-secret-for-token-versions-only';
const previousSecret = process.env.JWT_SECRET;

beforeAll(async () => {
  process.env.JWT_SECRET = SECRET;
  await initAuthSecret();
});

afterAll(() => {
  if (previousSecret === undefined) delete process.env.JWT_SECRET;
  else process.env.JWT_SECRET = previousSecret;
});

describe('signLearnerToken', () => {
  it('stamps the account’s token version as `tv`', () => {
    expect(verifyLearnerToken(signLearnerToken({ id: 'u1', tokenVersion: 3 }))).toMatchObject({ sub: 'u1', tv: 3 });
    // An account row from before versions existed counts as version 0.
    expect(verifyLearnerToken(signLearnerToken({ id: 'u1' }))).toMatchObject({ sub: 'u1', tv: 0 });
  });
});

describe('learnerTokenIsCurrent', () => {
  it('accepts a legacy token without `tv` for an account at version 0 or with none', () => {
    const legacy = verifyLearnerToken(jwt.sign({ sub: 'u1' }, SECRET));
    expect(legacy.tv).toBeUndefined();
    expect(learnerTokenIsCurrent(legacy, { id: 'u1', tokenVersion: 0 })).toBe(true);
    expect(learnerTokenIsCurrent(legacy, { id: 'u1' })).toBe(true);
  });

  it('refuses a token from before the last reset', () => {
    const before = verifyLearnerToken(signLearnerToken({ id: 'u1', tokenVersion: 0 }));
    expect(learnerTokenIsCurrent(before, { id: 'u1', tokenVersion: 1 })).toBe(false);
    const legacy = verifyLearnerToken(jwt.sign({ sub: 'u1' }, SECRET));
    expect(learnerTokenIsCurrent(legacy, { id: 'u1', tokenVersion: 1 })).toBe(false);
  });

  it('accepts a token issued at the current version', () => {
    const after = verifyLearnerToken(signLearnerToken({ id: 'u1', tokenVersion: 1 }));
    expect(learnerTokenIsCurrent(after, { id: 'u1', tokenVersion: 1 })).toBe(true);
  });

  it('is false without a payload or a user', () => {
    expect(learnerTokenIsCurrent(null, { id: 'u1' })).toBe(false);
    expect(learnerTokenIsCurrent({ sub: 'u1' }, null)).toBe(false);
  });
});

describe('the OAuth router honours token versions', () => {
  let server;
  let base;
  const users = [{ id: 'u1', email: 'a@example.com', username: 'ada', tokenVersion: 0, identities: {} }];

  beforeAll(async () => {
    const store = {
      findUserById: (id) => users.find((u) => u.id === id) ?? null,
      findUserByEmail: () => null,
      findUserByUsername: () => null,
      findUserByIdentity: () => null
    };
    const providers = {
      google: { id: 'google', label: 'Google', authorizeUrl: () => 'https://accounts.example/authorize', exchange: async () => ({}) },
      github: null,
      enabled: ['google'],
      publicConfig: () => ({ google: true, github: false })
    };
    const app = express();
    app.use('/api', createOAuthRouter({ providers, store, signLearnerToken, publicUser: (u) => ({ id: u.id }), syncUser: () => {}, verifyLearnerToken }));
    server = await new Promise((resolve) => {
      const s = app.listen(0, '127.0.0.1', () => resolve(s));
    });
    base = `http://127.0.0.1:${server.address().port}`;
  });

  afterAll(async () => {
    await new Promise((resolve) => server.close(resolve));
  });

  const linkTicket = (token) =>
    fetch(`${base}/api/auth/oauth/google/link-ticket`, { method: 'POST', headers: { authorization: `Bearer ${token}` } }).then((r) => r.status);

  it('takes a current token and refuses one signed before a reset', async () => {
    const old = signLearnerToken(users[0]);
    expect(await linkTicket(old)).toBe(200);
    users[0].tokenVersion = 1;
    expect(await linkTicket(old)).toBe(401);
    expect(await linkTicket(signLearnerToken(users[0]))).toBe(200);
  });
});
