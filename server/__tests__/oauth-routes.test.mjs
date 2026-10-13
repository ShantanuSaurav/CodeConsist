/**
 * The provider sign-in routes at the HTTP boundary: a real express app, the
 * real router, a stubbed provider and an in-memory store - so the rules that
 * keep one learner out of another's account are proven where a browser talks
 * to them.
 *
 * What these tests are really guarding:
 *   - a `state` is spent the first time it is used, so a callback URL out of
 *     a history or a log is worthless;
 *   - the same provider identity always lands on the SAME account, and never
 *     quietly creates a second one;
 *   - an existing password account is linked, not replaced - it can still be
 *     signed into with its password afterwards;
 *   - the session token goes back in the URL fragment, never the query;
 *   - a failure shows one sentence, never a stack.
 */
import express from 'express';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { OAuthError } from '../oauth.js';
import { createOAuthRouter, createStateStore } from '../oauth-routes.js';

/* ------------------------------------------------------------------ store */

/** The same shape and rules as server/db.js, entirely in memory. */
function createStore() {
  const users = [];
  const progress = {};
  const find = (id) => users.find((u) => u.id === id) ?? null;
  return {
    users,
    findUserById: find,
    findUserByEmail: (email) => users.find((u) => u.email === String(email ?? '').trim().toLowerCase()) ?? null,
    findUserByUsername: (name) => users.find((u) => u.username.toLowerCase() === String(name ?? '').trim().toLowerCase()) ?? null,
    findUserByIdentity: (provider, providerUserId) =>
      users.find((u) => String(u.identities?.[provider]?.providerUserId ?? '') === String(providerUserId)) ?? null,
    linkIdentity: (userId, provider, identity) => {
      const user = find(userId);
      if (!user) return null;
      user.identities ??= {};
      user.identities[provider] = { ...identity, linkedAt: user.identities[provider]?.linkedAt ?? identity.linkedAt };
      return user.identities[provider];
    },
    insertUser: (user) => {
      users.push(user);
      return user;
    },
    recordLogin: (userId) => {
      const user = find(userId);
      if (user) user.lastLoginAt = new Date().toISOString();
      return user;
    },
    getProgress: (userId) => progress[userId] ?? { xp: 0, completedChallenges: [] }
  };
}

/* --------------------------------------------------------------- harness */

// Deliberately not a real JWT: this file is about the routes, and a fake
// token makes "which account was this issued for" readable in an assertion.
const signLearnerToken = (user) => `learner.${user.id}`;
const verifyLearnerToken = (token) => {
  if (typeof token !== 'string' || !token.startsWith('learner.')) throw new Error('Not a learner token.');
  return { sub: token.slice('learner.'.length) };
};

const IDENTITY = {
  providerUserId: 'g-1',
  email: 'ada@example.com',
  emailVerified: true,
  name: 'Ada Lovelace',
  username: null,
  avatarUrl: 'https://lh3.example/ada.png'
};

let store;
let exchangeImpl;
let nativeVerifyImpl;
let githubEnabled;
let syncUser;
let server;
let base;

async function startApp() {
  const providers = {
    google: {
      id: 'google',
      label: 'Google',
      clientId: 'native-web-client.apps.googleusercontent.com',
      verifyNativeToken: (token, nonce) => nativeVerifyImpl(token, nonce),
      authorizeUrl: (state, redirectUri) =>
        `https://accounts.google.example/authorize?state=${encodeURIComponent(state)}&redirect_uri=${encodeURIComponent(redirectUri)}`,
      exchange: (code, redirectUri) => exchangeImpl(code, redirectUri)
    },
    // Not configured on this install - its routes must 404, not half-work.
    get github() { return githubEnabled ? { id: 'github', label: 'GitHub',
      authorizeUrl: (state, redirectUri) => `https://github.com/login/oauth/authorize?state=${encodeURIComponent(state)}&redirect_uri=${encodeURIComponent(redirectUri)}`,
      exchange: (code, redirectUri) => exchangeImpl(code, redirectUri) } : null; },
    enabled: ['google'],
    publicConfig: () => ({ google: true, github: Boolean(githubEnabled) })
  };

  const app = express();
  app.use(express.json());
  app.use('/api', createOAuthRouter({ providers, store, signLearnerToken, publicUser: (u) => ({ id: u.id }), syncUser, verifyLearnerToken }));
  app.use((err, _req, res, _next) => res.status(500).json({ error: err.message }));

  server = await new Promise((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  base = `http://127.0.0.1:${server.address().port}`;
}

const get = (path, headers = {}) => fetch(base + path, { method: 'GET', redirect: 'manual', headers });
const post = (path, headers = {}) => fetch(base + path, { method: 'POST', redirect: 'manual', headers });

/**
 * Start a sign-in. Every answer is a redirect, because every caller is a full
 * page navigation: to the provider with a `state` when it worked, back to the
 * app with an `auth_error` when it did not.
 */
async function startFlow(query = '', headers = {}) {
  const res = await get(`/api/auth/oauth/google/start${query}`, headers);
  const location = res.headers.get('location');
  const url = location ? new URL(location) : null;
  return {
    status: res.status,
    state: url?.searchParams.get('state') ?? null,
    authError: url?.searchParams.get('auth_error') ?? null,
    location: url
  };
}

/** The Settings page's first step: ask for a connect ticket with the session's own header. */
async function linkTicket(token, provider = 'google') {
  const res = await post(`/api/auth/oauth/${provider}/link-ticket`, { authorization: `Bearer ${token}` });
  return { status: res.status, ...(await res.json().catch(() => ({}))) };
}

const callback = (state, code = 'auth-code') =>
  get(`/api/auth/oauth/google/callback?code=${code}&state=${encodeURIComponent(state ?? '')}`);

const errorFrom = (res) => new URL(res.headers.get('location')).searchParams.get('auth_error');

beforeEach(async () => {
  store = createStore();
  exchangeImpl = async () => ({ ...IDENTITY });
  githubEnabled = false;
  nativeVerifyImpl = vi.fn(async (token, nonce) => {
    if (token !== `signed:${nonce}`) throw new OAuthError('That Google sign-in does not belong to this request.', 400);
    return { ...IDENTITY };
  });
  syncUser = vi.fn();
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
  delete process.env.APP_ORIGIN;
  await startApp();
});

afterEach(async () => {
  await new Promise((resolve) => server.close(resolve));
  vi.restoreAllMocks();
});

const passwordAccount = (extra = {}) =>
  store.insertUser({
    id: 'u-pass',
    email: 'ada@example.com',
    username: 'ada',
    passwordHash: '$2a$10$notarealhashbutastringallthesame',
    isPremium: false,
    identities: {},
    ...extra
  });

const mobilePost = (path, body = {}, token) => fetch(base + path, {
  method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body), redirect: 'manual'
});
async function mobileStart(body = {}, token, provider = 'google') {
  const res = await mobilePost(`/api/auth/mobile/${provider}/start`, body, token);
  const data = await res.json();
  return { ...data, state: data.authorizationUrl ? new URL(data.authorizationUrl).searchParams.get('state') : null, response: res };
}
const poll = (flow, extra = {}) => mobilePost('/api/auth/mobile/poll', { id: flow.id, verifier: flow.verifier, ...extra });
async function mobileComplete(flow) {
  const response = await callback(flow.state);
  const html = await response.text();
  return { response, html, code: html.match(/<h2>(\d{6})<\/h2>/)?.[1] };
}

describe('native provider sign-in handoff', () => {
  it.each(['google', 'github'])('returns %s directly to the app and requires both device verifier and callback proof', async provider => {
    githubEnabled = true;
    const flow = await mobileStart({ returnToApp: true }, undefined, provider);
    const done = await get(`/api/auth/oauth/${provider}/callback?code=auth-code&state=${flow.state}`);
    expect(done.status).toBe(302);
    const location = done.headers.get('location');
    const returned = new URL(location);
    expect(returned.protocol + '//' + returned.host + returned.pathname).toBe('codeconsist://auth/callback');
    expect(returned.searchParams.get('attempt')).toBe(flow.id);
    expect(location).not.toContain(flow.verifier);
    expect(location).not.toContain('learner.');
    const proof = returned.searchParams.get('proof');
    expect(proof).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(await (await poll(flow)).json()).toEqual({ status: 'awaiting_app_return' });
    expect((await poll(flow, { verifier: 'A'.repeat(43), proof })).status).toBe(410);
    expect((await poll(flow, { proof: 'B'.repeat(43) })).status).toBe(400);
    const response = await poll(flow, { proof });
    expect(response.status).toBe(200);
    expect((await response.json()).user.id).toBe(store.users[0].id);
    expect((await poll(flow, { proof })).status).toBe(410);
  });
  it('returns provider errors to the app and cancellation releases a pending flow', async () => {
    const failed = await mobileStart({ returnToApp: true });
    exchangeImpl = async () => { throw new OAuthError('Provider verification failed.'); };
    const response = await callback(failed.state);
    expect(response.status).toBe(302);
    expect(response.headers.get('location')).toMatch(/^codeconsist:\/\/auth\/callback\?/);
    expect(response.headers.get('location')).not.toContain('Provider verification failed');
    expect((await poll(failed)).status).toBe(400);
    const cancelled = await mobileStart({ returnToApp: true });
    await mobilePost('/api/auth/mobile/cancel', { id: cancelled.id, verifier: cancelled.verifier });
    expect((await poll(cancelled)).status).toBe(410);
    exchangeImpl = async () => ({ ...IDENTITY });
    await callback(cancelled.state);
    expect(store.users).toHaveLength(0);
  });
  it('keeps session tokens and the polling verifier out of URLs and requires the browser-only code', async () => {
    const flow = await mobileStart();
    expect(flow.response.status).toBe(200);
    expect(flow.response.headers.get('cache-control')).toContain('no-store');
    expect(flow.authorizationUrl).not.toContain(flow.verifier);
    expect((await poll(flow)).status).toBe(202);
    const done = await mobileComplete(flow);
    expect(done.response.status).toBe(200);
    expect(done.response.headers.get('location')).toBeNull();
    expect(done.html).not.toContain('learner.');
    expect(done.html).not.toContain(flow.verifier);
    const waiting = await poll(flow);
    expect(waiting.status).toBe(202);
    expect(await waiting.json()).toEqual({ status: 'confirmation_required' });
    const session = await poll(flow, { code: done.code });
    const data = await session.json();
    expect(session.status).toBe(200);
    expect(data.status).toBe('complete');
    expect(data.token).toBe(`learner.${store.users[0].id}`);
    expect(data.user.id).toBe(store.users[0].id);
    expect(data.progress.xp).toBe(0);
    expect((await poll(flow, { code: done.code })).status).toBe(410);
    expect(store.users).toHaveLength(1);
  });
  it('does not let a wrong verifier spend a valid sign-in, and bounds code guesses', async () => {
    const flow = await mobileStart(); const done = await mobileComplete(flow);
    expect((await poll(flow, { verifier: 'A'.repeat(43), code: done.code })).status).toBe(410);
    const wrong = done.code === '000000' ? '999999' : '000000';
    for (let i = 0; i < 5; i++) expect((await poll(flow, { code: wrong })).status).toBe(400);
    expect((await poll(flow, { code: done.code })).status).toBe(410);
  });
  it('surfaces provider failure privately and will not link without a current learner session', async () => {
    expect((await mobileStart({ link: true })).response.status).toBe(401);
    const flow = await mobileStart();
    exchangeImpl = async () => { throw new OAuthError('Provider verification failed.'); };
    const done = await mobileComplete(flow);
    expect(done.html).not.toContain('Provider verification failed.');
    const result = await poll(flow);
    expect(result.status).toBe(400);
    expect((await result.json()).error).toBe('Provider verification failed.');
    expect(store.users).toHaveLength(0);
  });
  it('links an existing password account and refuses redemption after password reset', async () => {
    const user = passwordAccount();
    const flow = await mobileStart({ link: true }, signLearnerToken(user));
    const done = await mobileComplete(flow);
    expect(store.users).toHaveLength(1);
    expect(store.users[0].identities.google.providerUserId).toBe(IDENTITY.providerUserId);
    user.tokenVersion = 1;
    expect((await poll(flow, { code: done.code })).status).toBe(401);
  });
  it('will not attach a provider if the initiating session was reset during sign-in', async () => {
    const user = passwordAccount();
    const flow = await mobileStart({ link: true }, signLearnerToken(user));
    user.tokenVersion = 1;
    const done = await mobileComplete(flow);
    expect(done.code).toBeUndefined();
    expect(user.identities.google).toBeUndefined();
    expect((await poll(flow)).status).toBe(400);
  });
  it('expires pending and completed handoffs', async () => {
    const flow = await mobileStart(); const done = await mobileComplete(flow);
    const now = Date.now(); vi.spyOn(Date, 'now').mockReturnValue(now + 600001);
    expect((await poll(flow, { code: done.code })).status).toBe(410);
  });
});

describe('native Google credential exchange', () => {
  async function begin(token) {
    const response = await mobilePost('/api/auth/mobile/google/native/start', { link: Boolean(token) }, token);
    return { response, ...(await response.json()) };
  }
  it('verifies a nonce-bound credential and redeems a native request exactly once', async () => {
    const challenge = await begin();
    expect(challenge.response.status).toBe(200);
    expect(challenge.response.headers.get('cache-control')).toContain('no-store');
    expect(challenge.nonce).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(challenge.clientId).toBe('native-web-client.apps.googleusercontent.com');
    const response = await mobilePost('/api/auth/mobile/google/native/complete', { id: challenge.id, idToken: `signed:${challenge.nonce}` });
    expect(response.status).toBe(200);
    expect((await response.json()).status).toBe('complete');
    expect(nativeVerifyImpl).toHaveBeenCalledWith(`signed:${challenge.nonce}`, challenge.nonce);
    expect(store.users).toHaveLength(1);
    expect((await mobilePost('/api/auth/mobile/google/native/complete', { id: challenge.id, idToken: `signed:${challenge.nonce}` })).status).toBe(410);
  });
  it('rejects another request’s credential and preserves password-account linking rules', async () => {
    const wrong = await begin();
    expect((await mobilePost('/api/auth/mobile/google/native/complete', { id: wrong.id, idToken: 'signed:some-other-nonce' })).status).toBe(400);
    expect(store.users).toHaveLength(0);
    const user = passwordAccount();
    const unlinked = await begin();
    expect((await mobilePost('/api/auth/mobile/google/native/complete', { id: unlinked.id, idToken: `signed:${unlinked.nonce}` })).status).toBe(409);
    expect(user.identities.google).toBeUndefined();
    const linked = await begin(signLearnerToken(user));
    expect((await mobilePost('/api/auth/mobile/google/native/complete', { id: linked.id, idToken: `signed:${linked.nonce}` }, signLearnerToken(user))).status).toBe(200);
    expect(user.identities.google.providerUserId).toBe(IDENTITY.providerUserId);
    expect(store.users).toHaveLength(1);
  });
  it('refuses linking after password reset and releases cancelled requests', async () => {
    const user = passwordAccount();
    const linking = await begin(signLearnerToken(user));
    nativeVerifyImpl = async () => { user.tokenVersion = 1; return { ...IDENTITY }; };
    expect((await mobilePost('/api/auth/mobile/google/native/complete', { id: linking.id, idToken: 'signed' })).status).toBe(401);
    expect(user.identities.google).toBeUndefined();
    const cancelled = await begin();
    await mobilePost('/api/auth/mobile/google/native/cancel', { id: cancelled.id });
    expect((await mobilePost('/api/auth/mobile/google/native/complete', { id: cancelled.id, idToken: 'signed' })).status).toBe(410);
  });
});

/* ------------------------------------------------------------- providers */

describe('GET /api/auth/oauth/providers', () => {
  it('answers booleans only', async () => {
    const res = await get('/api/auth/oauth/providers');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ google: true, github: false });
  });
});

/* ----------------------------------------------------------------- start */

describe('GET /api/auth/oauth/:provider/start', () => {
  it('redirects to the provider with a state and the callback URL', async () => {
    const { status, state, location } = await startFlow();
    expect(status).toBe(302);
    expect(location.origin).toBe('https://accounts.google.example');
    expect(state).toMatch(/^[A-Za-z0-9_-]{30,}$/);
    expect(location.searchParams.get('redirect_uri')).toBe(`${base}/api/auth/oauth/google/callback`);
  });

  it('issues a different state every time', async () => {
    const first = await startFlow();
    const second = await startFlow();
    expect(first.state).not.toBe(second.state);
  });

  it('sends an unknown or unconfigured provider back into the app, not to a JSON page', async () => {
    // This is a navigation: a JSON body would leave the learner staring at
    // raw text on the API origin with nothing to click.
    for (const id of ['gitlab', 'github', 'publicConfig']) {
      const res = await get(`/api/auth/oauth/${id}/start`);
      expect(res.status).toBe(302);
      const location = new URL(res.headers.get('location'));
      expect(location.origin).toBe(base);
      expect(location.searchParams.get('auth_error')).toMatch(/not available/i);
    }
  });

  it('honours APP_ORIGIN for the redirect URI', async () => {
    process.env.APP_ORIGIN = 'https://app.example/';
    const { location } = await startFlow();
    expect(location.searchParams.get('redirect_uri')).toBe('https://app.example/api/auth/oauth/google/callback');
  });
});

/* -------------------------------------------------------------- callback */

describe('GET /api/auth/oauth/:provider/callback', () => {
  it('creates an account, and puts the token in the FRAGMENT', async () => {
    const { state } = await startFlow();
    const res = await callback(state);

    expect(res.status).toBe(302);
    expect(store.users).toHaveLength(1);
    const user = store.users[0];
    expect(user).toMatchObject({ email: 'ada@example.com', username: 'Ada Lovelace', passwordHash: null, isPremium: false });
    expect(user.identities.google).toMatchObject({ providerUserId: 'g-1', email: 'ada@example.com', avatarUrl: 'https://lh3.example/ada.png' });
    expect(user.lastLoginAt).toEqual(expect.any(String));

    const location = res.headers.get('location');
    expect(location).toBe(`${base}/auth/callback#token=learner.${user.id}`);
    // A query string would reach the server, the access log and the Referer header.
    expect(new URL(location).search).toBe('');
    expect(syncUser).toHaveBeenCalledWith(user, expect.anything(), 'signup');
  });

  it('signs the SAME account back in on the next visit - never a duplicate', async () => {
    await callback((await startFlow()).state);
    const firstId = store.users[0].id;

    await callback((await startFlow()).state);

    expect(store.users).toHaveLength(1);
    expect(store.users[0].id).toBe(firstId);
    expect(syncUser).toHaveBeenLastCalledWith(store.users[0], expect.anything(), 'login');
  });

  it('refuses to merge into an account that already has a password, and tells the learner what to do', async () => {
    // /api/auth/register never confirms the address it is handed, so a row
    // carrying this email is not evidence that the person holding the Google
    // account owns it - and signing them in would be the other way round:
    // whoever registered the address first would get the victim's session.
    const existing = passwordAccount();
    // Providers hand back addresses in whatever case the person typed them.
    exchangeImpl = async () => ({ ...IDENTITY, email: 'Ada@Example.com' });

    const res = await callback((await startFlow()).state);

    expect(errorFrom(res)).toMatch(/already uses that email address.*Settings/i);
    expect(res.headers.get('location')).not.toContain('#token=');
    // Nothing was touched: no identity attached, no second account, and the
    // password that was there still is.
    expect(store.users).toHaveLength(1);
    expect(existing.identities.google).toBeUndefined();
    expect(existing.passwordHash).toBe('$2a$10$notarealhashbutastringallthesame');
  });

  it('adopts an account that has no password, because nobody can be signed into it yet', async () => {
    // The other half of the same rule: a row with `passwordHash: null` was
    // made by a provider, so there is no one to displace.
    const existing = passwordAccount({ id: 'u-oauth', passwordHash: null });

    const res = await callback((await startFlow()).state);

    expect(store.users).toHaveLength(1);
    expect(existing.identities.google).toMatchObject({ providerUserId: 'g-1', email: 'ada@example.com' });
    expect(res.headers.get('location')).toContain('#token=learner.u-oauth');
  });

  it('gives a new account a username nobody else has', async () => {
    store.insertUser({ id: 'u-other', email: 'other@example.com', username: 'ada lovelace', passwordHash: 'x', identities: {} });
    await callback((await startFlow()).state);
    const created = store.users.find((u) => u.id !== 'u-other');
    expect(created.username).toBe('Ada Lovelace-2');
  });

  it('spends the state: the same callback URL replayed fails', async () => {
    const { state } = await startFlow();
    expect((await callback(state)).headers.get('location')).toContain('#token=');

    const replay = await callback(state);
    expect(errorFrom(replay)).toMatch(/already been used or has expired/i);
    // The replay did not create a second account or a second session.
    expect(store.users).toHaveLength(1);
  });

  it('refuses a state it never issued', async () => {
    const res = await callback('a-state-nobody-issued');
    expect(errorFrom(res)).toMatch(/already been used or has expired/i);
    expect(store.users).toHaveLength(0);
  });

  it('refuses a callback with no code', async () => {
    const { state } = await startFlow();
    const res = await get(`/api/auth/oauth/google/callback?state=${encodeURIComponent(state)}`);
    expect(errorFrom(res)).toMatch(/did not send an authorization code/i);
  });

  it('refuses an identity the provider did not verify', async () => {
    exchangeImpl = async () => ({ ...IDENTITY, emailVerified: false });
    const res = await callback((await startFlow()).state);
    expect(errorFrom(res)).toMatch(/has not verified that email address/i);
    expect(store.users).toHaveLength(0);
  });

  it('shows the provider failure as one sentence, never a stack', async () => {
    exchangeImpl = async () => {
      throw new OAuthError('GitHub has no verified email address on this account. Verify one on GitHub, or sign in with a password.', 400);
    };
    const res = await callback((await startFlow()).state);
    expect(errorFrom(res)).toBe('GitHub has no verified email address on this account. Verify one on GitHub, or sign in with a password.');
  });

  it('never leaks an unexpected error to the address bar', async () => {
    exchangeImpl = async () => {
      throw new Error('ENOENT: secret-token-abc123 at Object.<anonymous> (/server/oauth.js:1:1)');
    };
    const res = await callback((await startFlow()).state);
    const message = errorFrom(res);
    expect(message).toBe('That sign-in could not be completed. Please try again.');
    expect(message).not.toContain('secret-token-abc123');
    expect(message).not.toContain(' at ');
    expect(store.users).toHaveLength(0);
  });
});

/* ------------------------------------------------------------- linking */

describe('?link=1', () => {
  it('mints a ticket only for a learner who proves it with their own header', async () => {
    passwordAccount({ email: 'different@example.com' });

    expect((await post('/api/auth/oauth/google/link-ticket')).status).toBe(401);
    expect((await linkTicket('not-a-real-token')).status).toBe(401);

    const minted = await linkTicket('learner.u-pass');
    expect(minted.status).toBe(200);
    expect(minted.ticket).toMatch(/^[A-Za-z0-9_-]{30,}$/);
  });

  it('sends a start with no ticket back into the app, not to a JSON page', async () => {
    const { status, state, authError } = await startFlow('?link=1');
    expect(status).toBe(302);
    expect(state).toBeNull();
    expect(authError).toMatch(/expired|sign in again/i);
  });

  it('attaches the provider to the signed-in account, not to a new one', async () => {
    const existing = passwordAccount({ email: 'different@example.com' });
    const { ticket } = await linkTicket('learner.u-pass');
    const { state } = await startFlow(`?link=1&ticket=${encodeURIComponent(ticket)}`);

    const res = await callback(state);

    // Linked to the signed-in account even though the emails differ - that is
    // what "connect this provider to MY account" means.
    expect(store.users).toHaveLength(1);
    expect(existing.identities.google).toMatchObject({ providerUserId: 'g-1', email: 'ada@example.com' });
    expect(res.headers.get('location')).toContain('#token=learner.u-pass');
  });

  it('ignores a session token in the query string, so a link nobody signed cannot bind somebody else', async () => {
    // The attack this replaces: the attacker signs up, takes their own token,
    // and sends the victim a plain link carrying it. The victim picks their
    // own Google account at the consent screen, the identity lands on the
    // ATTACKER's row, and the victim comes back holding the attacker's
    // session - working, from then on, inside an account the attacker can
    // also open with their own password.
    const attacker = passwordAccount({ id: 'u-attacker', email: 'attacker@example.com', username: 'attacker' });

    const { state, authError } = await startFlow('?link=1&token=learner.u-attacker');

    expect(state).toBeNull();
    expect(authError).toBeTruthy();
    expect(attacker.identities.google).toBeUndefined();
  });

  it('spends the ticket: the same connect link cannot be used twice', async () => {
    passwordAccount({ email: 'different@example.com' });
    const { ticket } = await linkTicket('learner.u-pass');
    const query = `?link=1&ticket=${encodeURIComponent(ticket)}`;

    expect((await startFlow(query)).state).toEqual(expect.any(String));
    const replay = await startFlow(query);
    expect(replay.state).toBeNull();
    expect(replay.authError).toMatch(/expired/i);
  });

  it('refuses a ticket nobody minted', async () => {
    passwordAccount({ email: 'different@example.com' });
    const { state, authError } = await startFlow('?link=1&ticket=a-ticket-nobody-issued');
    expect(state).toBeNull();
    expect(authError).toMatch(/expired/i);
  });

  it('refuses a provider identity that already belongs to somebody else', async () => {
    store.insertUser({
      id: 'u-owner',
      email: 'owner@example.com',
      username: 'owner',
      passwordHash: null,
      identities: { google: { providerUserId: 'g-1', email: 'owner@example.com', linkedAt: '2026-01-01T00:00:00.000Z' } }
    });
    const other = passwordAccount({ email: 'different@example.com' });

    const { ticket } = await linkTicket('learner.u-pass');
    const { state } = await startFlow(`?link=1&ticket=${encodeURIComponent(ticket)}`);
    const res = await callback(state);

    expect(errorFrom(res)).toMatch(/already connected to a different/i);
    // Nothing moved: the identity stays with its owner and the other account
    // is not signed in as them.
    expect(store.findUserById('u-owner').identities.google.providerUserId).toBe('g-1');
    expect(other.identities.google).toBeUndefined();
    expect(res.headers.get('location')).not.toContain('#token=');
  });

  it('refuses a ticket whose account has gone away since it was minted', async () => {
    passwordAccount({ email: 'different@example.com' });
    const { ticket } = await linkTicket('learner.u-pass');
    store.users.length = 0;

    const { state, authError } = await startFlow(`?link=1&ticket=${encodeURIComponent(ticket)}`);
    expect(state).toBeNull();
    expect(authError).toMatch(/sign in again/i);
  });
});

/* ------------------------------------------------------- flooding /start */

describe('one caller cannot break everybody else\'s sign-in', () => {
  it('caps the states one address holds instead of evicting the rest', async () => {
    // /start needs no account, so a global cap alone was a denial of service:
    // filling it dropped the states real learners were sitting on at the
    // consent screen, and every one of them came back to "already used".
    const victim = await startFlow('', { 'x-forwarded-for': '10.0.0.7' });
    expect(victim.state).toEqual(expect.any(String));

    let refused = 0;
    for (let i = 0; i < 40; i++) {
      const flood = await startFlow('', { 'x-forwarded-for': '203.0.113.9' });
      if (!flood.state) refused++;
    }
    expect(refused).toBeGreaterThan(0);

    // The learner who was mid-sign-in finishes normally.
    const res = await callback(victim.state);
    expect(res.headers.get('location')).toContain('#token=');
  });
});

/* --------------------------------------------------------- state store */

describe('createStateStore', () => {
  it('is single use', () => {
    const states = createStateStore();
    const value = states.issue({ provider: 'google', redirectUri: 'http://x/cb' });
    expect(states.take(value)).toMatchObject({ provider: 'google', redirectUri: 'http://x/cb', linkUserId: null });
    expect(states.take(value)).toBeNull();
  });

  it('expires', () => {
    const states = createStateStore({ ttlMs: -1 });
    expect(states.take(states.issue({ provider: 'google', redirectUri: 'http://x/cb' }))).toBeNull();
  });

  it('is bounded: an unauthenticated caller cannot grow it forever', () => {
    const states = createStateStore({ max: 5, perSourceMax: 1 });
    const issued = [];
    for (let i = 0; i < 50; i++) {
      issued.push(states.issue({ provider: 'google', redirectUri: 'http://x/cb', source: `ip-${i}` }));
    }
    expect(states.size).toBe(5);
    // The oldest went first; the five most recent still work.
    expect(states.take(issued[0])).toBeNull();
    expect(states.take(issued.at(-1))).toMatchObject({ provider: 'google' });
  });

  it('refuses one source more than its share, rather than evicting another source', () => {
    const states = createStateStore({ max: 100, perSourceMax: 3 });
    const mine = states.issue({ provider: 'google', redirectUri: 'http://x/cb', source: 'mine' });

    const flood = [];
    for (let i = 0; i < 50; i++) {
      flood.push(states.issue({ provider: 'google', redirectUri: 'http://x/cb', source: 'flood' }));
    }

    // Three got in, the rest were told no - and the flood never touched the
    // sign-in somebody else was in the middle of.
    expect(flood.filter(Boolean)).toHaveLength(3);
    expect(states.take(mine)).toMatchObject({ provider: 'google' });
  });
});
