/**
 * "Continue with Google" and "Continue with GitHub" - provider configuration
 * and token verification.
 *
 * Deliberately free of Express, of the store, and of module-level state: this
 * file turns an authorization code into a VERIFIED identity
 * ({ providerUserId, email, emailVerified, ... }) and nothing else. Deciding
 * which account that identity belongs to lives in server/oauth-routes.js.
 *
 * The rules that make this safe to link to an existing account:
 *
 *   - A Google id_token is verified CRYPTOGRAPHICALLY: the RS256 signature is
 *     checked against Google's published JWKS before a single claim inside it
 *     is trusted. Base64 is an encoding, not a signature - anybody can mint a
 *     decodable token that says whatever they like.
 *   - An email is only ever accepted when the provider says it is verified
 *     (`email_verified` on Google, `verified` on the GitHub emails list).
 *     Without that, "sign in with an email you do not own" is a takeover of
 *     whoever does own it.
 *   - A client secret, an access token and an id_token never appear in a
 *     message, a log line or a return value. Error text is written for the
 *     person who clicked the button, never a provider's raw response body.
 *
 * No SDK and no new dependency: one form POST, two GETs and one signature
 * check is the whole flow, and global `fetch` plus node:crypto do all of it.
 */
import crypto from 'node:crypto';

const TIMEOUT_MS = 20_000;
/** Tolerance for a clock that is a little ahead of Google's when checking `exp`. */
const CLOCK_SKEW_MS = 60_000;
/** Google rotates signing keys; an unknown `kid` refetches, but at most this often. */
const JWKS_MIN_REFRESH_MS = 60_000;

const GOOGLE_AUTHORIZE_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
export const GOOGLE_JWKS_URL = 'https://www.googleapis.com/oauth2/v3/certs';
const GOOGLE_ISSUERS = new Set(['https://accounts.google.com', 'accounts.google.com']);

const GITHUB_AUTHORIZE_URL = 'https://github.com/login/oauth/authorize';
const GITHUB_TOKEN_URL = 'https://github.com/login/oauth/access_token';
const GITHUB_USER_URL = 'https://api.github.com/user';
const GITHUB_EMAILS_URL = 'https://api.github.com/user/emails';
/** GitHub's API requires one, and rejects the request without it. */
const USER_AGENT = 'CodeConsist';

/**
 * Anything that stops a provider sign-in. `message` is written for the
 * learner - it is what ends up in `?auth_error=` on the landing page - so it
 * never carries a stack, a raw provider body, or any part of a credential.
 */
export class OAuthError extends Error {
  constructor(message, status = 502) {
    super(message);
    this.name = 'OAuthError';
    this.status = status;
  }
}

/** Same placeholder guard the Excel and Judge0 config use: `your-client-id` is not configuration. */
const PLACEHOLDER_RE = /^(your[-_]|replace[-_]|xxx)/i;
const looksReal = (value) => {
  const text = String(value ?? '').trim();
  return text.length > 0 && !PLACEHOLDER_RE.test(text);
};

/**
 * A short, secret-free reason for a failed connection - the same reasoning as
 * server/payments.js: a raw fetch error message can quote the request we sent,
 * and one of those headers carries the client secret.
 */
function networkReason(err) {
  if (err?.name === 'TimeoutError' || err?.name === 'AbortError') return `timed out after ${TIMEOUT_MS / 1000} s`;
  const code = err?.cause?.code ?? err?.code;
  return code ? String(code).slice(0, 40) : 'network error';
}

/**
 * One provider call. Only the HTTP status is ever repeated back - never the
 * body, which for a failed token exchange echoes the request that carried the
 * client secret.
 */
async function fetchJson(fetchImpl, url, { method = 'GET', form, token, label } = {}) {
  let res;
  try {
    res = await fetchImpl(url, {
      method,
      headers: {
        Accept: 'application/json',
        'User-Agent': USER_AGENT,
        ...(form ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {})
      },
      body: form ? new URLSearchParams(form).toString() : undefined,
      signal: AbortSignal.timeout(TIMEOUT_MS)
    });
  } catch (err) {
    throw new OAuthError(`${label} could not be reached (${networkReason(err)}). Please try again.`);
  }

  let json = null;
  try {
    json = await res.json();
  } catch {
    json = null; // A proxy or an outage can answer a provider URL with HTML.
  }
  if (!res.ok) throw new OAuthError(`${label} refused the sign-in (HTTP ${res.status}). Please try again.`);
  if (!json || typeof json !== 'object') throw new OAuthError(`${label} sent a reply this app could not read.`);
  return json;
}

/* ----------------------------------------------------------------- google */

function decodeJwtSegment(segment) {
  try {
    return JSON.parse(Buffer.from(String(segment), 'base64url').toString('utf8'));
  } catch {
    return null;
  }
}

/**
 * Google's public signing keys, by `kid`. Cached because they change roughly
 * daily and every sign-in would otherwise cost an extra round trip; an
 * unknown `kid` (a rotation) triggers one refresh, throttled so a token with
 * a made-up `kid` cannot be replayed into a fetch loop against Google.
 */
export function createJwksCache(fetchImpl = fetch, url = GOOGLE_JWKS_URL) {
  let keysByKid = new Map();
  let lastAttemptAt = 0;

  async function refresh() {
    // Stamped BEFORE the request, so a failing endpoint is retried once a
    // minute rather than on every single callback.
    lastAttemptAt = Date.now();
    const json = await fetchJson(fetchImpl, url, { label: 'Google' });
    const next = new Map();
    for (const jwk of Array.isArray(json.keys) ? json.keys : []) {
      if (jwk && typeof jwk.kid === 'string') next.set(jwk.kid, jwk);
    }
    if (next.size === 0) throw new OAuthError('Google published no usable signing keys. Please try again.');
    keysByKid = next;
  }

  return {
    async keyFor(kid) {
      if (typeof kid !== 'string' || !kid) return null;
      if (keysByKid.has(kid)) return keysByKid.get(kid);
      if (Date.now() - lastAttemptAt < JWKS_MIN_REFRESH_MS && keysByKid.size > 0) return null;
      await refresh();
      return keysByKid.get(kid) ?? null;
    }
  };
}

/**
 * Verify a Google id_token and return its claims. Everything is checked
 * before anything is trusted: the RS256 signature against Google's JWKS, then
 * `iss`, `aud`, `exp` and `email_verified`. A token that fails any of these
 * throws - it is never downgraded to "unverified but usable".
 */
export async function verifyGoogleIdToken(idToken, { clientId, jwks, fetchImpl = fetch, now = Date.now() } = {}) {
  const parts = String(idToken ?? '').split('.');
  if (parts.length !== 3) throw new OAuthError('Google sent an identity token this app could not read.');

  const header = decodeJwtSegment(parts[0]);
  const claims = decodeJwtSegment(parts[1]);
  if (!header || !claims) throw new OAuthError('Google sent an identity token this app could not read.');
  if (header.alg !== 'RS256') throw new OAuthError('Google signed in with an unexpected algorithm, so the sign-in was refused.');

  const keys = jwks ?? createJwksCache(fetchImpl);
  const jwk = await keys.keyFor(header.kid);
  if (!jwk) throw new OAuthError('Google’s signing key for this sign-in could not be found. Please try again.');

  let verified = false;
  try {
    const key = crypto.createPublicKey({ key: jwk, format: 'jwk' });
    const verifier = crypto.createVerify('RSA-SHA256');
    verifier.update(`${parts[0]}.${parts[1]}`);
    verified = verifier.verify(key, Buffer.from(parts[2], 'base64url'));
  } catch {
    verified = false;
  }
  // The single most important line in this file: below here the claims are
  // known to have come from Google, and above here they are just a string
  // somebody put in a URL.
  if (!verified) throw new OAuthError('That Google sign-in could not be verified, so it was refused.', 400);

  if (!GOOGLE_ISSUERS.has(String(claims.iss))) {
    throw new OAuthError('That Google sign-in came from an unexpected issuer, so it was refused.', 400);
  }
  if (!clientId || claims.aud !== clientId) {
    throw new OAuthError('That Google sign-in was issued for a different app, so it was refused.', 400);
  }
  const expiresAt = Number(claims.exp) * 1000;
  if (!Number.isFinite(expiresAt) || expiresAt + CLOCK_SKEW_MS <= now) {
    throw new OAuthError('That Google sign-in has expired. Please try again.', 400);
  }
  if (claims.email_verified !== true || typeof claims.email !== 'string' || !claims.email) {
    throw new OAuthError('Google has not verified the email address on that account, so it cannot be used to sign in.', 400);
  }
  if (typeof claims.sub !== 'string' || !claims.sub) {
    throw new OAuthError('Google sent an identity token this app could not read.');
  }
  return claims;
}

function buildGoogle(env, fetchImpl) {
  const clientId = String(env.GOOGLE_CLIENT_ID ?? '').trim();
  const clientSecret = String(env.GOOGLE_CLIENT_SECRET ?? '').trim();
  if (!looksReal(clientId) || !looksReal(clientSecret)) return null;

  const jwks = createJwksCache(fetchImpl);

  return {
    id: 'google',
    label: 'Google',
    authorizeUrl(state, redirectUri) {
      const params = new URLSearchParams({
        client_id: clientId,
        redirect_uri: redirectUri,
        response_type: 'code',
        scope: 'openid email profile',
        state,
        // Always offer the account chooser: a shared machine signed into one
        // Google account would otherwise sign straight back in as them.
        prompt: 'select_account'
      });
      return `${GOOGLE_AUTHORIZE_URL}?${params}`;
    },
    async exchange(code, redirectUri) {
      const token = await fetchJson(fetchImpl, GOOGLE_TOKEN_URL, {
        method: 'POST',
        label: 'Google',
        form: {
          code,
          client_id: clientId,
          client_secret: clientSecret,
          // Google checks this matches the one the authorize step used, byte
          // for byte - server/oauth-routes.js stores it with the state.
          redirect_uri: redirectUri,
          grant_type: 'authorization_code'
        }
      });
      if (typeof token.id_token !== 'string' || !token.id_token) {
        throw new OAuthError('Google did not return an identity token. Please try again.');
      }
      const claims = await verifyGoogleIdToken(token.id_token, { clientId, jwks });
      return {
        providerUserId: String(claims.sub),
        email: String(claims.email).trim().toLowerCase(),
        emailVerified: true,
        name: typeof claims.name === 'string' ? claims.name : null,
        username: null, // Google has no handle - the route falls back to the name, then the email.
        avatarUrl: typeof claims.picture === 'string' ? claims.picture : null
      };
    }
  };
}

/* ----------------------------------------------------------------- github */

/**
 * The primary verified address, or any verified one. An unverified address is
 * never returned: GitHub lets anyone type any address into their profile, and
 * this app links accounts by email.
 */
export function pickGitHubEmail(rows) {
  const verified = (Array.isArray(rows) ? rows : []).filter(
    (row) => row && typeof row.email === 'string' && row.email.includes('@') && row.verified === true
  );
  const chosen = verified.find((row) => row.primary === true) ?? verified[0];
  return chosen ? chosen.email.trim().toLowerCase() : null;
}

function buildGitHub(env, fetchImpl) {
  const clientId = String(env.GITHUB_CLIENT_ID ?? '').trim();
  const clientSecret = String(env.GITHUB_CLIENT_SECRET ?? '').trim();
  if (!looksReal(clientId) || !looksReal(clientSecret)) return null;

  return {
    id: 'github',
    label: 'GitHub',
    authorizeUrl(state, redirectUri) {
      const params = new URLSearchParams({
        client_id: clientId,
        redirect_uri: redirectUri,
        // read:user for the profile, user:email for the verified address list.
        scope: 'read:user user:email',
        state
      });
      return `${GITHUB_AUTHORIZE_URL}?${params}`;
    },
    async exchange(code, redirectUri) {
      const token = await fetchJson(fetchImpl, GITHUB_TOKEN_URL, {
        method: 'POST',
        label: 'GitHub',
        form: { client_id: clientId, client_secret: clientSecret, code, redirect_uri: redirectUri }
      });
      // GitHub answers a bad or replayed code with HTTP 200 and an `error`
      // field, so a missing token is the only reliable check.
      if (typeof token.access_token !== 'string' || !token.access_token) {
        throw new OAuthError('GitHub could not complete that sign-in. Please start again.', 400);
      }
      const accessToken = token.access_token;

      const profile = await fetchJson(fetchImpl, GITHUB_USER_URL, { token: accessToken, label: 'GitHub' });
      if (profile.id === undefined || profile.id === null) {
        throw new OAuthError('GitHub sent a profile this app could not read. Please try again.');
      }
      const emails = await fetchJson(fetchImpl, GITHUB_EMAILS_URL, { token: accessToken, label: 'GitHub' });
      const email = pickGitHubEmail(emails);
      if (!email) {
        throw new OAuthError(
          'GitHub has no verified email address on this account. Verify one on GitHub, or sign in with a password.',
          400
        );
      }

      return {
        providerUserId: String(profile.id),
        email,
        emailVerified: true,
        name: typeof profile.name === 'string' ? profile.name : null,
        username: typeof profile.login === 'string' ? profile.login : null,
        avatarUrl: typeof profile.avatar_url === 'string' ? profile.avatar_url : null
      };
    }
  };
}

/* ------------------------------------------------------------------ setup */

/**
 * Build the providers this install has credentials for.
 *
 * Zero configuration is a supported state, not an error: with nothing set
 * both providers are null, `publicConfig()` reports false for each, and
 * server/oauth-routes.js answers 404 for their routes, so the browser simply
 * never shows the buttons and email + password is untouched.
 *
 * @param {{ env?: object, fetchImpl?: Function }} [options]
 * @returns {{ google: object|null, github: object|null, enabled: string[], publicConfig: () => { google: boolean, github: boolean } }}
 */
export function createOAuthProviders({ env = process.env, fetchImpl = fetch } = {}) {
  const google = buildGoogle(env, fetchImpl);
  const github = buildGitHub(env, fetchImpl);
  const enabled = [google, github].filter(Boolean).map((provider) => provider.id);

  return {
    google,
    github,
    enabled,
    /**
     * What the browser is told. ONLY booleans: in this flow the client id is
     * never needed in the browser (the redirect is built here, server-side),
     * so shipping it would be handing out a detail of the install for nothing.
     */
    publicConfig: () => ({ google: Boolean(google), github: Boolean(github) })
  };
}

/** The provider ids this server knows about, in the order the sign-in buttons use. */
export const PROVIDER_IDS = ['google', 'github'];
