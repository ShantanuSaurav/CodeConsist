/**
 * The provider sign-in routes, mounted at /api by server/index.js:
 *
 *   GET  /api/auth/oauth/providers             which buttons the browser shows
 *   POST /api/auth/oauth/:provider/link-ticket permission to connect to MY account
 *   GET  /api/auth/oauth/:provider/start       302 to Google/GitHub
 *   GET  /api/auth/oauth/:provider/callback    302 back into the app with a token
 *
 * The rules that keep one account out of another's reach:
 *
 *   - A session token never travels in a URL. "Connect this provider to my
 *     account" is a navigation, which carries no Authorization header, so it
 *     carries a single-use ticket minted from the learner's own session
 *     instead - a value nobody else can write into a link.
 *
 *   - `state` is issued here, kept server-side (no cookie), and is SINGLE USE:
 *     the record is deleted the instant it is read, so a replayed callback URL
 *     - out of a browser history, a referrer log or someone's shoulder - finds
 *     nothing and fails.
 *   - An account is only ever found by email when the provider VERIFIED that
 *     email (server/oauth.js refuses to return anything else). Linking on an
 *     unverified address would let anyone who can type your email address into
 *     a provider profile walk into your account.
 *   - The learner token goes back in the URL FRAGMENT. A fragment is never
 *     sent to a server, so it stays out of access logs, proxies and the
 *     Referer header that a query string would leak it into.
 *   - Failure never leaks a stack: the callback redirects to
 *     /?auth_error=<short message> and the landing page shows that one line.
 */
import crypto from 'node:crypto';
import express from 'express';
import { OAuthError, PROVIDER_IDS } from './oauth.js';

const asyncRoute = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

/** Long enough to finish a sign-in (including creating an account at the provider), short enough to be useless later. */
const STATE_TTL_MS = 10 * 60_000;
/** A bound on memory: this Map is the only thing an unauthenticated caller can make grow. */
const STATE_MAX = 500;
/**
 * How many unspent states ONE caller may hold. Without this, anyone could
 * open 500 sign-ins and push every real learner's pending state out of the
 * map, so everybody came back from Google to "that link has expired".
 */
const STATE_PER_SOURCE_MAX = 20;

/** A link ticket is spent within seconds of being minted, on the next navigation. */
const TICKET_TTL_MS = 60_000;
const TICKET_MAX = 500;
/** One learner does not need more than a handful of open "connect" attempts. */
const TICKET_PER_SOURCE_MAX = 5;

/** The same rule /api/auth/register enforces - a generated username must pass it too. */
const USERNAME_RE = /^[a-zA-Z0-9_. -]+$/;
const USERNAME_MIN = 2;
const USERNAME_MAX = 24;
/** Stop counting `-2`, `-3`, ... and reach for randomness instead. */
const UNIQUIFY_TRIES = 50;

/**
 * Short-lived values that are handed out once and spent once: the `state`
 * that travels to the provider and back, and the ticket that authorises a
 * "connect this provider to my account" navigation. In memory on purpose: a
 * restart cancels sign-ins that were mid-flight, which is the right outcome,
 * and nothing here is worth writing to disk.
 *
 * `source` is who asked (an address for states, a user id for tickets). It
 * exists so that the cap is per caller: a global cap alone was a denial of
 * service, because filling it evicted the entries real learners were in the
 * middle of using.
 */
function createSingleUseStore({ ttlMs, max, perSourceMax }) {
  const entries = new Map();

  function sweep(now = Date.now()) {
    for (const [key, record] of entries) {
      if (now - record.createdAt > ttlMs) entries.delete(key);
    }
    // Still over the global bound: drop the oldest entry belonging to
    // whoever holds the most, never simply the oldest overall - that is what
    // let one caller push everybody else out.
    while (entries.size > max) {
      const counts = new Map();
      for (const record of entries.values()) counts.set(record.source, (counts.get(record.source) ?? 0) + 1);
      let heaviest = null;
      let most = -1;
      for (const [source, count] of counts) {
        if (count > most) {
          most = count;
          heaviest = source;
        }
      }
      for (const [key, record] of entries) {
        if (record.source === heaviest) {
          entries.delete(key);
          break;
        }
      }
    }
  }

  return {
    /** Null when this source already holds its share - the caller says so in its own words. */
    issue(record, source = '') {
      sweep();
      let held = 0;
      for (const existing of entries.values()) if (existing.source === source) held++;
      if (held >= perSourceMax) return null;
      const value = crypto.randomBytes(24).toString('base64url');
      entries.set(value, { ...record, source, createdAt: Date.now() });
      sweep();
      return value;
    },
    /** Reads AND consumes - there is deliberately no way to look at one without spending it. */
    take(value) {
      if (typeof value !== 'string' || !value) return null;
      const record = entries.get(value) ?? null;
      entries.delete(value);
      if (!record) return null;
      return Date.now() - record.createdAt > ttlMs ? null : record;
    },
    get size() {
      return entries.size;
    }
  };
}

/** Pending sign-ins, keyed by the opaque `state` value the provider echoes back. */
export function createStateStore({ ttlMs = STATE_TTL_MS, max = STATE_MAX, perSourceMax = STATE_PER_SOURCE_MAX } = {}) {
  const store = createSingleUseStore({ ttlMs, max, perSourceMax });
  return {
    issue({ provider, redirectUri, linkUserId = null, source = '' }) {
      return store.issue({ provider, redirectUri, linkUserId }, source);
    },
    take: (value) => store.take(value),
    get size() {
      return store.size;
    }
  };
}

/** Permission to connect a provider to one signed-in account, good for one navigation. */
export function createTicketStore({ ttlMs = TICKET_TTL_MS, max = TICKET_MAX, perSourceMax = TICKET_PER_SOURCE_MAX } = {}) {
  const store = createSingleUseStore({ ttlMs, max, perSourceMax });
  return {
    issue({ userId, provider }) {
      return store.issue({ userId, provider }, String(userId));
    },
    take: (value) => store.take(value),
    get size() {
      return store.size;
    }
  };
}

/* -------------------------------------------------------------- usernames */

/** Reduce a provider's display name or login to something the register rule accepts. */
export function slugifyUsername(value) {
  const cleaned = String(value ?? '')
    .replace(/[^a-zA-Z0-9_. -]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return cleaned.slice(0, USERNAME_MAX).trim();
}

/**
 * A username for a brand-new OAuth account: the provider's name, else its
 * login, else the email's local part, else plain "user" - then `-2`, `-3`, …
 * until it is free. `isTaken(name)` is the caller's lookup, which must be the
 * same case-insensitive one /api/auth/register uses.
 */
export function usernameFor(identity, isTaken) {
  const local = String(identity?.email ?? '').split('@')[0];
  let base = '';
  for (const candidate of [identity?.name, identity?.username, local]) {
    const slug = slugifyUsername(candidate);
    if (slug.length >= USERNAME_MIN && USERNAME_RE.test(slug)) {
      base = slug;
      break;
    }
  }
  if (!base) base = 'user';
  if (!isTaken(base)) return base;

  const withSuffix = (suffix) => `${base.slice(0, USERNAME_MAX - suffix.length).trim()}${suffix}`;
  for (let n = 2; n <= UNIQUIFY_TRIES; n++) {
    const candidate = withSuffix(`-${n}`);
    if (!isTaken(candidate)) return candidate;
  }
  // 50 people with the same display name is unusual; a counter that keeps
  // climbing forever is worse than four random characters.
  for (let attempt = 0; attempt < 10; attempt++) {
    const candidate = withSuffix(`-${crypto.randomBytes(3).toString('base64url').slice(0, 4)}`);
    if (!isTaken(candidate)) return candidate;
  }
  return withSuffix(`-${crypto.randomBytes(3).toString('base64url').slice(0, 4)}`);
}

/* ----------------------------------------------------------------- router */

/**
 * @param {object} deps
 *   providers - server/oauth.js createOAuthProviders(); a null provider is simply not offered.
 *   store - server/db.js (the module itself, so tests can pass an in-memory stand-in).
 *   signLearnerToken(user) / verifyLearnerToken(token) - server/auth.js.
 *   publicUser(user) - accepted so this router is built like the others in
 *     server/index.js; every route here answers with a redirect or a boolean
 *     pair, so it is not used to shape a response.
 *   syncUser(user, progress, reason) - the same fire-and-forget Excel mirror register/login use.
 */
export function createOAuthRouter({ providers, store, signLearnerToken, publicUser, syncUser, verifyLearnerToken }) {
  const router = express.Router();
  const states = createStateStore();
  const tickets = createTicketStore();

  /** Only ever a provider we know by name: `providers` also holds helpers, and a URL must not reach one. */
  const providerFor = (id) => (PROVIDER_IDS.includes(String(id)) ? providers?.[String(id)] ?? null : null);

  /**
   * Where the browser comes back to. APP_ORIGIN wins in production (behind a
   * proxy or a tunnel the request's own host is whatever the hop said it
   * was); in development it is just this server.
   */
  function redirectBase(req) {
    const configured = String(process.env.APP_ORIGIN ?? '').trim();
    if (configured) return configured.replace(/\/+$/, '');
    return `${req.protocol}://${req.get('host')}`;
  }

  /**
   * The signed-in learner, from the Authorization header and nothing else. A
   * session token must never travel in a URL: a URL is something anyone can
   * put behind a link, and it is copied into history, referrers and every
   * proxy log on the way. `/start` gets a ticket instead - see below.
   */
  function learnerFor(req) {
    const header = req.headers.authorization || '';
    if (!header.startsWith('Bearer ')) return null;
    const token = header.slice(7);
    if (!token) return null;
    try {
      const { sub } = verifyLearnerToken(token);
      return store.findUserById(sub) ?? null;
    } catch {
      return null;
    }
  }

  /**
   * Who a request came from, decided the same way the access log decides it:
   * this API sits behind a tunnel in production, so `req.ip` is the tunnel
   * and would put every learner in one bucket.
   */
  function sourceKey(req) {
    const forwarded = req.headers['cf-connecting-ip'] || req.headers['x-forwarded-for'] || '';
    const first = String(forwarded).split(',')[0].trim();
    return first || req.ip || req.socket?.remoteAddress || 'unknown';
  }

  /**
   * Which account this verified identity belongs to. The order matters:
   *
   *   1. the account this provider identity is already on - the only match
   *      that needs no trust in an email address at all;
   *   2. an account with the same email - safe ONLY because the provider told
   *      us it verified that address (server/oauth.js throws otherwise);
   *   3. a brand new account, with no password at all until the learner sets
   *      one at /api/auth/password.
   */
  function resolveAccount({ provider, identity, linkUserId }) {
    const now = new Date().toISOString();
    // One spelling of an address, everywhere: accounts are matched on it, and
    // Ada@example.com and ada@example.com are the same mailbox.
    const email = String(identity.email).trim().toLowerCase();
    const record = {
      providerUserId: identity.providerUserId,
      email,
      linkedAt: now,
      ...(identity.avatarUrl ? { avatarUrl: identity.avatarUrl } : {}),
      ...(identity.name ? { name: identity.name } : {})
    };
    const owner = store.findUserByIdentity(provider.id, identity.providerUserId);

    if (linkUserId) {
      const target = store.findUserById(linkUserId);
      if (!target) throw new OAuthError('That session has ended. Sign in again, then connect the account.', 401);
      if (owner && owner.id !== target.id) {
        throw new OAuthError(`That ${provider.label} account is already connected to a different CodeConsist account.`, 409);
      }
      store.linkIdentity(target.id, provider.id, record);
      return { user: target, created: false };
    }

    if (owner) {
      // Refresh the stored email/avatar - people rename and change pictures.
      store.linkIdentity(owner.id, provider.id, record);
      return { user: owner, created: false };
    }

    const byEmail = store.findUserByEmail(email);
    if (byEmail) {
      // Only onto an account nobody can already sign into with a password.
      // /api/auth/register never confirms the address it is given, so a row
      // carrying your email address is not evidence that it is yours: merging
      // a verified provider identity onto one would hand whoever registered
      // it your session. With a password set, the owner proves it is theirs
      // by signing in and connecting the provider from Settings.
      if (byEmail.passwordHash) {
        throw new OAuthError(
          `An account already uses that email address. Sign in with your password, then connect ${provider.label} in Settings.`,
          409
        );
      }
      store.linkIdentity(byEmail.id, provider.id, record);
      return { user: byEmail, created: false };
    }

    const user = store.insertUser({
      id: crypto.randomUUID(),
      email,
      username: usernameFor({ ...identity, email }, (name) => Boolean(store.findUserByUsername(name))),
      // No password at all, rather than an unguessable one: "this account has
      // no password" is a fact the learner can see and fix, not a secret.
      passwordHash: null,
      isPremium: false,
      createdAt: now,
      identities: { [provider.id]: record }
    });
    return { user, created: true };
  }

  /* ------------------------------------------------------------ providers */

  /** Booleans only - the browser needs to know which buttons to draw, nothing more. */
  router.get('/auth/oauth/providers', (_req, res) => {
    res.json(providers.publicConfig());
  });

  /* --------------------------------------------------------- link ticket */

  /**
   * Permission to connect a provider to the account that is ALREADY signed
   * in. The Settings page asks for it with its Authorization header, then
   * puts the ticket - not the token - in the `/start` URL it navigates to.
   *
   * This exists because a link start is a navigation, and a navigation
   * carries no header. Taking the session token from the query instead meant
   * any page anywhere could send someone to a start URL holding the
   * ATTACKER's token: the victim would pick their own Google account, the
   * identity would be written onto the attacker's row, and the victim would
   * come back signed in as the attacker. A ticket cannot be abused that way -
   * it is minted from the victim's own session, so nobody else can write one
   * into a link, it is gone 60 seconds later, and it is spent once.
   */
  router.post('/auth/oauth/:provider/link-ticket', (req, res) => {
    const provider = providerFor(req.params.provider);
    if (!provider) return res.status(404).json({ error: 'That sign-in option is not available.' });

    const learner = learnerFor(req);
    if (!learner) return res.status(401).json({ error: 'Sign in again before connecting Google or GitHub.' });

    const ticket = tickets.issue({ userId: learner.id, provider: provider.id });
    if (!ticket) return res.status(429).json({ error: 'Too many connect attempts. Wait a moment and try again.' });
    res.json({ ticket, expiresInSeconds: TICKET_TTL_MS / 1000 });
  });

  /* ---------------------------------------------------------------- start */

  router.get(
    '/auth/oauth/:provider/start',
    asyncRoute(async (req, res) => {
      const base = redirectBase(req);
      // Every caller of this route is a full page navigation, so a failure
      // has to land somewhere the learner can act on it. A JSON body leaves
      // them on a blank page at the API origin with only the back button.
      const fail = (message) => res.redirect(`${base}/?auth_error=${encodeURIComponent(message)}`);

      const provider = providerFor(req.params.provider);
      if (!provider) return fail('That sign-in option is not available.');

      let linkUserId = null;
      if (String(req.query.link ?? '') === '1') {
        const ticket = tickets.take(String(req.query.ticket ?? ''));
        // Without this an expired session would quietly sign them in as
        // whoever the provider says they are, instead of linking.
        if (!ticket || ticket.provider !== provider.id) {
          return fail('That connect link has expired. Open Settings and try again.');
        }
        if (!store.findUserById(ticket.userId)) {
          return fail('Sign in again before connecting Google or GitHub.');
        }
        linkUserId = ticket.userId;
      }

      const redirectUri = `${base}/api/auth/oauth/${provider.id}/callback`;
      const state = states.issue({ provider: provider.id, redirectUri, linkUserId, source: sourceKey(req) });
      // Only ever this caller's own share of the map is full; everybody
      // else's sign-in is untouched.
      if (!state) return fail('Too many sign-ins started from this connection. Wait a moment and try again.');
      res.redirect(provider.authorizeUrl(state, redirectUri));
    })
  );

  /* ------------------------------------------------------------- callback */

  router.get(
    '/auth/oauth/:provider/callback',
    asyncRoute(async (req, res) => {
      const base = redirectBase(req);
      try {
        const provider = providerFor(req.params.provider);
        if (!provider) throw new OAuthError('That sign-in option is not available.', 404);

        // Consumed here, before anything else happens with it.
        const record = states.take(String(req.query.state ?? ''));
        if (!record || record.provider !== provider.id) {
          throw new OAuthError('That sign-in link has already been used or has expired. Please try again.', 400);
        }

        const code = String(req.query.code ?? '');
        if (!code) throw new OAuthError(`${provider.label} did not send an authorization code. Please try again.`, 400);

        // The redirect_uri must be byte-identical to the one the authorize
        // step used, so it comes from the state record, never rebuilt here.
        const identity = await provider.exchange(code, record.redirectUri);
        if (identity?.emailVerified !== true || !identity.email) {
          throw new OAuthError(`${provider.label} has not verified that email address, so it cannot be used to sign in.`, 400);
        }

        const { user, created } = resolveAccount({ provider, identity, linkUserId: record.linkUserId });
        store.recordLogin(user.id);

        // Fire-and-forget, exactly like register/login: the Excel mirror must
        // never be able to fail a sign-in.
        try {
          syncUser?.(user, store.getProgress(user.id), created ? 'signup' : 'login');
        } catch {
          /* never surfaces to the person signing in */
        }

        console.log(`\x1b[32m[AUTH]\x1b[0m Learner "${user.username}" signed in with ${provider.label}.`);

        const token = signLearnerToken(user);
        res.redirect(`${base}/auth/callback#token=${encodeURIComponent(token)}`);
      } catch (err) {
        const friendly =
          err instanceof OAuthError ? err.message : 'That sign-in could not be completed. Please try again.';
        // The message the learner sees is always one of ours; anything else is
        // a bug and belongs in the server log, not in their address bar.
        if (!(err instanceof OAuthError)) console.error('[oauth] callback failed:', err?.message ?? err);
        res.redirect(`${base}/?auth_error=${encodeURIComponent(friendly)}`);
      }
    })
  );

  return router;
}
