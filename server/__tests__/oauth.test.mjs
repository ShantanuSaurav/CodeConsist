/**
 * Provider token verification - the half of "sign in with Google" that
 * decides whether an identity is real.
 *
 * The Google tests mint their OWN RSA key pair and sign their own id_tokens,
 * so a good token, a forged one and an expired one are all genuinely
 * constructed rather than described: the only way a token passes here is if
 * server/oauth.js really did check the RS256 signature against the JWKS it
 * was given. That is the line between "linking accounts by verified email is
 * safe" and "anyone who can base64-encode JSON owns every account".
 */
import crypto from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GOOGLE_JWKS_URL, OAuthError, createJwksCache, createOAuthProviders, pickGitHubEmail, verifyGoogleIdToken } from '../oauth.js';
import { slugifyUsername, usernameFor } from '../oauth-routes.js';

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

/* -------------------------------------------------------------- key material */

const CLIENT_ID = 'test-client-id.apps.googleusercontent.com';
const CLIENT_SECRET = 'google-client-secret-never-leaks';

const keyPair = (kid) => {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
  return { kid, privateKey, jwk: { ...publicKey.export({ format: 'jwk' }), kid, alg: 'RS256', use: 'sig' } };
};

const REAL = keyPair('real-key');
const IMPOSTOR = keyPair('real-key'); // same kid, different key - a forgery, not a rotation

const base64url = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');

function idToken(claims, key = REAL) {
  const header = base64url({ alg: 'RS256', typ: 'JWT', kid: key.kid });
  const payload = base64url(claims);
  const signer = crypto.createSign('RSA-SHA256');
  signer.update(`${header}.${payload}`);
  return `${header}.${payload}.${signer.sign(key.privateKey).toString('base64url')}`;
}

const goodClaims = (extra = {}) => ({
  iss: 'https://accounts.google.com',
  aud: CLIENT_ID,
  sub: '1122334455',
  email: 'ada@example.com',
  email_verified: true,
  name: 'Ada Lovelace',
  picture: 'https://lh3.example/ada.png',
  exp: Math.floor(Date.now() / 1000) + 3600,
  ...extra
});

/** A fetch stand-in that answers only the URLs a test names. */
function stubFetch(routes) {
  return vi.fn(async (url) => {
    const handler = routes[String(url)];
    if (!handler) throw new Error(`unexpected fetch: ${url}`);
    return handler();
  });
}

const jsonOk = (body) => () => ({ ok: true, status: 200, json: async () => body });
const jsonFail = (status, body = {}) => () => ({ ok: false, status, json: async () => body });

const jwksFetch = (keys = [REAL.jwk]) => stubFetch({ [GOOGLE_JWKS_URL]: jsonOk({ keys }) });
const cacheWith = (keys = [REAL.jwk]) => createJwksCache(jwksFetch(keys));

/** Every rejection this suite provokes, so one test can sweep them all for secrets. */
const thrown = [];
async function refuses(promise) {
  const error = await promise.then(
    () => null,
    (err) => err
  );
  expect(error).toBeInstanceOf(OAuthError);
  thrown.push(error.message);
  return error;
}

/* ----------------------------------------------------- google id_token */

describe('verifyGoogleIdToken', () => {
  it('accepts a token Google really signed', async () => {
    const claims = await verifyGoogleIdToken(idToken(goodClaims()), { clientId: CLIENT_ID, jwks: cacheWith() });
    expect(claims.sub).toBe('1122334455');
    expect(claims.email).toBe('ada@example.com');
  });

  it('accepts the other accepted issuer spelling', async () => {
    const token = idToken(goodClaims({ iss: 'accounts.google.com' }));
    await expect(verifyGoogleIdToken(token, { clientId: CLIENT_ID, jwks: cacheWith() })).resolves.toMatchObject({ sub: '1122334455' });
  });

  it('refuses a token signed by a DIFFERENT key', async () => {
    // Same `kid`, same claims, real-looking signature - and no relationship to
    // Google's published key. This is the forgery the whole flow rests on.
    const forged = idToken(goodClaims(), IMPOSTOR);
    const err = await refuses(verifyGoogleIdToken(forged, { clientId: CLIENT_ID, jwks: cacheWith() }));
    expect(err.message).toMatch(/could not be verified/i);
  });

  it('refuses a token whose signature has been stripped or rewritten', async () => {
    const [header, payload] = idToken(goodClaims()).split('.');
    await refuses(verifyGoogleIdToken(`${header}.${payload}.`, { clientId: CLIENT_ID, jwks: cacheWith() }));
    await refuses(verifyGoogleIdToken(`${header}.${payload}`, { clientId: CLIENT_ID, jwks: cacheWith() }));
    // The "decode the payload and believe it" bug, written out: valid JSON,
    // no signature at all.
    const unsigned = `${base64url({ alg: 'none', kid: 'real-key' })}.${payload}.`;
    await refuses(verifyGoogleIdToken(unsigned, { clientId: CLIENT_ID, jwks: cacheWith() }));
  });

  it('refuses a wrong aud', async () => {
    const token = idToken(goodClaims({ aud: 'someone-elses-app.apps.googleusercontent.com' }));
    const err = await refuses(verifyGoogleIdToken(token, { clientId: CLIENT_ID, jwks: cacheWith() }));
    expect(err.message).toMatch(/different app/i);
  });

  it('refuses a wrong iss', async () => {
    const token = idToken(goodClaims({ iss: 'https://accounts.google.com.evil.example' }));
    const err = await refuses(verifyGoogleIdToken(token, { clientId: CLIENT_ID, jwks: cacheWith() }));
    expect(err.message).toMatch(/unexpected issuer/i);
  });

  it('refuses an expired token, but tolerates a minute of clock skew', async () => {
    const expired = idToken(goodClaims({ exp: Math.floor(Date.now() / 1000) - 3600 }));
    const err = await refuses(verifyGoogleIdToken(expired, { clientId: CLIENT_ID, jwks: cacheWith() }));
    expect(err.message).toMatch(/expired/i);

    const justExpired = idToken(goodClaims({ exp: Math.floor(Date.now() / 1000) - 30 }));
    await expect(verifyGoogleIdToken(justExpired, { clientId: CLIENT_ID, jwks: cacheWith() })).resolves.toMatchObject({
      sub: '1122334455'
    });
  });

  it('refuses email_verified: false', async () => {
    const token = idToken(goodClaims({ email_verified: false }));
    const err = await refuses(verifyGoogleIdToken(token, { clientId: CLIENT_ID, jwks: cacheWith() }));
    expect(err.message).toMatch(/not verified the email/i);
  });

  it('refuses when the signing key is not one Google published', async () => {
    const token = idToken(goodClaims());
    await refuses(verifyGoogleIdToken(token, { clientId: CLIENT_ID, jwks: cacheWith([{ ...IMPOSTOR.jwk, kid: 'other-key' }]) }));
  });
});

describe('createJwksCache', () => {
  it('fetches once, then serves the cached key', async () => {
    const fetchImpl = jwksFetch();
    const cache = createJwksCache(fetchImpl, GOOGLE_JWKS_URL);
    await cache.keyFor('real-key');
    await cache.keyFor('real-key');
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('does not refetch on every unknown kid - a made-up kid is not a fetch loop', async () => {
    const fetchImpl = jwksFetch();
    const cache = createJwksCache(fetchImpl, GOOGLE_JWKS_URL);
    for (let i = 0; i < 25; i++) expect(await cache.keyFor(`made-up-${i}`)).toBeNull();
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});

/* ------------------------------------------------------------- providers */

describe('createOAuthProviders', () => {
  it('is off, and honest about it, with nothing configured', () => {
    const providers = createOAuthProviders({ env: {}, fetchImpl: async () => ({}) });
    expect(providers.google).toBeNull();
    expect(providers.github).toBeNull();
    expect(providers.enabled).toEqual([]);
    expect(providers.publicConfig()).toEqual({ google: false, github: false });
  });

  it('ignores the placeholder values shipped in .env.example', () => {
    const providers = createOAuthProviders({
      env: { GOOGLE_CLIENT_ID: 'your-google-client-id', GOOGLE_CLIENT_SECRET: 'your-google-client-secret' },
      fetchImpl: async () => ({})
    });
    expect(providers.publicConfig()).toEqual({ google: false, github: false });
  });

  it('tells the browser booleans and nothing else - never a client id', () => {
    const providers = createOAuthProviders({
      env: { GOOGLE_CLIENT_ID: CLIENT_ID, GOOGLE_CLIENT_SECRET: CLIENT_SECRET },
      fetchImpl: async () => ({})
    });
    const config = providers.publicConfig();
    expect(config).toEqual({ google: true, github: false });
    expect(JSON.stringify(config)).not.toContain(CLIENT_ID);
    expect(providers.enabled).toEqual(['google']);
  });

  it('builds an authorize URL with the account chooser and the exact redirect', () => {
    const providers = createOAuthProviders({
      env: { GOOGLE_CLIENT_ID: CLIENT_ID, GOOGLE_CLIENT_SECRET: CLIENT_SECRET },
      fetchImpl: async () => ({})
    });
    const url = new URL(providers.google.authorizeUrl('state-123', 'http://localhost:4000/api/auth/oauth/google/callback'));
    expect(url.origin + url.pathname).toBe('https://accounts.google.com/o/oauth2/v2/auth');
    expect(Object.fromEntries(url.searchParams)).toMatchObject({
      client_id: CLIENT_ID,
      redirect_uri: 'http://localhost:4000/api/auth/oauth/google/callback',
      response_type: 'code',
      scope: 'openid email profile',
      state: 'state-123',
      prompt: 'select_account'
    });
  });

  it('exchanges a Google code for a verified identity', async () => {
    const fetchImpl = stubFetch({
      'https://oauth2.googleapis.com/token': jsonOk({ id_token: idToken(goodClaims()), access_token: 'ya29.secret' }),
      [GOOGLE_JWKS_URL]: jsonOk({ keys: [REAL.jwk] })
    });
    const providers = createOAuthProviders({ env: { GOOGLE_CLIENT_ID: CLIENT_ID, GOOGLE_CLIENT_SECRET: CLIENT_SECRET }, fetchImpl });
    const identity = await providers.google.exchange('auth-code', 'http://localhost:4000/api/auth/oauth/google/callback');

    expect(identity).toEqual({
      providerUserId: '1122334455',
      email: 'ada@example.com',
      emailVerified: true,
      name: 'Ada Lovelace',
      username: null,
      avatarUrl: 'https://lh3.example/ada.png'
    });
    // The code exchange posts the redirect_uri it was given, byte for byte.
    const body = fetchImpl.mock.calls[0][1].body;
    expect(body).toContain('redirect_uri=http%3A%2F%2Flocalhost%3A4000%2Fapi%2Fauth%2Foauth%2Fgoogle%2Fcallback');
    expect(body).toContain('grant_type=authorization_code');
  });

  it('refuses a Google exchange the provider answers with an error', async () => {
    const fetchImpl = stubFetch({ 'https://oauth2.googleapis.com/token': jsonFail(401, { error: 'invalid_client', client_secret: CLIENT_SECRET }) });
    const providers = createOAuthProviders({ env: { GOOGLE_CLIENT_ID: CLIENT_ID, GOOGLE_CLIENT_SECRET: CLIENT_SECRET }, fetchImpl });
    await refuses(providers.google.exchange('bad-code', 'http://localhost:4000/api/auth/oauth/google/callback'));
  });
});

/* ---------------------------------------------------------------- github */

const GITHUB_ENV = { GITHUB_CLIENT_ID: 'gh-client', GITHUB_CLIENT_SECRET: 'gh-client-secret-never-leaks' };
const githubUrls = ({ token = {}, user = {}, emails = [] } = {}) => ({
  'https://github.com/login/oauth/access_token': jsonOk({ access_token: 'gho_token_never_leaks', ...token }),
  'https://api.github.com/user': jsonOk({ id: 4242, login: 'ada', name: 'Ada Lovelace', avatar_url: 'https://avatars.example/ada.png', ...user }),
  'https://api.github.com/user/emails': jsonOk(emails)
});

describe('pickGitHubEmail', () => {
  it('takes the primary verified address', () => {
    expect(
      pickGitHubEmail([
        { email: 'old@example.com', primary: false, verified: true },
        { email: 'Ada@Example.com', primary: true, verified: true }
      ])
    ).toBe('ada@example.com');
  });

  it('falls back to any verified address, and never an unverified one', () => {
    expect(pickGitHubEmail([{ email: 'unverified@example.com', primary: true, verified: false }, { email: 'ok@example.com', primary: false, verified: true }])).toBe('ok@example.com');
    expect(pickGitHubEmail([{ email: 'unverified@example.com', primary: true, verified: false }])).toBeNull();
    expect(pickGitHubEmail(null)).toBeNull();
  });
});

describe('github exchange', () => {
  it('picks the primary verified email', async () => {
    const fetchImpl = stubFetch(
      githubUrls({
        emails: [
          { email: 'secondary@example.com', primary: false, verified: true },
          { email: 'ada@example.com', primary: true, verified: true }
        ]
      })
    );
    const providers = createOAuthProviders({ env: GITHUB_ENV, fetchImpl });
    await expect(providers.github.exchange('code', 'http://localhost:4000/api/auth/oauth/github/callback')).resolves.toEqual({
      providerUserId: '4242',
      email: 'ada@example.com',
      emailVerified: true,
      name: 'Ada Lovelace',
      username: 'ada',
      avatarUrl: 'https://avatars.example/ada.png'
    });
  });

  it('refuses when GitHub has no verified address', async () => {
    const fetchImpl = stubFetch(githubUrls({ emails: [{ email: 'ada@example.com', primary: true, verified: false }] }));
    const providers = createOAuthProviders({ env: GITHUB_ENV, fetchImpl });
    const err = await refuses(providers.github.exchange('code', 'http://localhost:4000/api/auth/oauth/github/callback'));
    expect(err.status).toBe(400);
    expect(err.message).toBe('GitHub has no verified email address on this account. Verify one on GitHub, or sign in with a password.');
  });

  it('refuses a bad code, which GitHub reports as HTTP 200 with no token', async () => {
    const fetchImpl = stubFetch({ 'https://github.com/login/oauth/access_token': jsonOk({ error: 'bad_verification_code' }) });
    const providers = createOAuthProviders({ env: GITHUB_ENV, fetchImpl });
    await refuses(providers.github.exchange('used-already', 'http://localhost:4000/api/auth/oauth/github/callback'));
  });

  it('reports a network failure without quoting the request it sent', async () => {
    const fetchImpl = vi.fn(async () => {
      throw Object.assign(new Error(`connect ECONNREFUSED with ${GITHUB_ENV.GITHUB_CLIENT_SECRET}`), { cause: { code: 'ECONNREFUSED' } });
    });
    const providers = createOAuthProviders({ env: GITHUB_ENV, fetchImpl });
    const err = await refuses(providers.github.exchange('code', 'http://localhost:4000/api/auth/oauth/github/callback'));
    expect(err.message).toContain('ECONNREFUSED');
  });
});

/* ---------------------------------------------------------------- secrets */

describe('error messages', () => {
  it('never contains a client secret, a token or a stack', () => {
    // Every failure this file provoked, swept in one place.
    expect(thrown.length).toBeGreaterThan(10);
    for (const message of thrown) {
      expect(message).not.toContain(CLIENT_SECRET);
      expect(message).not.toContain(GITHUB_ENV.GITHUB_CLIENT_SECRET);
      expect(message).not.toContain('gho_token_never_leaks');
      expect(message).not.toContain('ya29.secret');
      expect(message).not.toContain('eyJ'); // the leading bytes of any base64url JWT
      expect(message).not.toMatch(/\n\s+at /); // a stack frame
    }
  });
});

/* -------------------------------------------------------------- usernames */

describe('usernameFor', () => {
  const free = () => false;

  it('slugifies a provider name down to what /api/auth/register accepts', () => {
    expect(slugifyUsername('Ada Lovelace')).toBe('Ada Lovelace');
    expect(slugifyUsername('Ada  <b>Lovelace</b>')).toBe('Ada b Lovelace b');
    expect(slugifyUsername('尊敬')).toBe('');
    expect(slugifyUsername('a'.repeat(40))).toHaveLength(24);
  });

  it('prefers the name, then the login, then the email local part, then "user"', () => {
    expect(usernameFor({ name: 'Ada Lovelace', username: 'ada', email: 'a@example.com' }, free)).toBe('Ada Lovelace');
    expect(usernameFor({ name: null, username: 'ada', email: 'a@example.com' }, free)).toBe('ada');
    expect(usernameFor({ name: '尊', username: null, email: 'grace@example.com' }, free)).toBe('grace');
    expect(usernameFor({ name: null, username: null, email: 'x@example.com' }, free)).toBe('user');
  });

  it('appends -2, -3, ... until the name is free', () => {
    const taken = new Set(['ada', 'ada-2', 'ada-3']);
    expect(usernameFor({ username: 'ada', email: 'a@example.com' }, (n) => taken.has(n))).toBe('ada-4');
  });

  it('always produces something the register rule would accept', () => {
    const rule = /^[a-zA-Z0-9_. -]+$/;
    const taken = new Set();
    for (let i = 0; i < 60; i++) {
      const name = usernameFor({ name: 'Ada Lovelace the Countess of Lovelace', email: 'a@example.com' }, (n) => taken.has(n));
      expect(name.length).toBeGreaterThanOrEqual(2);
      expect(name.length).toBeLessThanOrEqual(24);
      expect(rule.test(name)).toBe(true);
      expect(taken.has(name)).toBe(false);
      taken.add(name);
    }
  });
});
