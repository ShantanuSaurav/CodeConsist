/**
 * One-time password reset links, issued by an administrator from Users.
 *
 * There is no email here: the admin issues a link, sends it to the learner
 * privately, and the learner sets a new password on /reset-password. The
 * link is effectively a password, so:
 *
 *   - the token is 32 random bytes (base64url, 43 characters), shown to the
 *     admin ONCE; only its SHA-256 is stored (server/db.js passwordResets),
 *     and it is never written to the audit log;
 *   - it travels in the URL FRAGMENT (`/reset-password#token=...`), which a
 *     browser never sends to a server, and then only in request bodies - so
 *     it never lands in an access log, a proxy log or a Referer header;
 *   - issuing a new link revokes the learner's other open ones;
 *   - it works once: `claimPasswordReset` marks it used synchronously, before
 *     any await, so two concurrent submits cannot both succeed;
 *   - a reset bumps `users[].tokenVersion`, which signs out every session
 *     issued before it (server/auth.js learnerTokenIsCurrent).
 *
 * Works for Google/GitHub-only accounts too: it gives them a password.
 */
import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import express from 'express';

const TOKEN_RE = /^[A-Za-z0-9_-]{43}$/;
/** 32 symbols, so a byte modulo 32 is unbiased (the same alphabet as order ids). */
const ID_ALPHABET = 'abcdefghijklmnopqrstuvwxyz234567';
const DEFAULT_TTL_MINUTES = 1440;
/** The same rule /api/auth/register and /api/auth/password apply. */
export const MIN_PASSWORD_LENGTH = 8;

const asyncRoute = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

export function hashResetToken(token) {
  return crypto.createHash('sha256').update(String(token)).digest('hex');
}

function newResetId() {
  let out = 'pr_';
  for (const byte of crypto.randomBytes(12)) out += ID_ALPHABET[byte % ID_ALPHABET.length];
  return out;
}

/** 'active' | 'used' | 'revoked' | 'expired' - used and revoked win over expired. */
export function resetStatus(record, nowMs = Date.now()) {
  if (!record) return 'unknown';
  if (record.usedAt) return 'used';
  if (record.revokedAt) return 'revoked';
  const expires = Date.parse(record.expiresAt ?? '');
  if (!Number.isFinite(expires) || expires <= nowMs) return 'expired';
  return 'active';
}

/** The admin's view of one link - never the hash. */
export function publicReset(record, nowMs = Date.now()) {
  return {
    id: record.id,
    createdAt: record.createdAt,
    expiresAt: record.expiresAt,
    usedAt: record.usedAt ?? null,
    revokedAt: record.revokedAt ?? null,
    status: resetStatus(record, nowMs)
  };
}

/**
 * Issue a link for `userId`. Revokes that learner's other open links first,
 * prunes long-dead records, and returns `{ record, token }` - the token is
 * the only copy there will ever be.
 */
export function issuePasswordReset({ store, userId, adminId = null, ttlMinutes = DEFAULT_TTL_MINUTES, now = new Date() }) {
  const nowMs = now.getTime();
  store.prunePasswordResets(nowMs);
  for (const open of store.passwordResetsForUser(userId)) {
    if (resetStatus(open, nowMs) === 'active') store.updatePasswordReset(open.id, { revokedAt: now.toISOString() });
  }
  const minutes = Number.isFinite(Number(ttlMinutes)) && Number(ttlMinutes) > 0 ? Number(ttlMinutes) : DEFAULT_TTL_MINUTES;
  const token = crypto.randomBytes(32).toString('base64url');
  let id = newResetId();
  while (store.getPasswordReset(id)) id = newResetId();
  const record = {
    id,
    userId,
    tokenHash: hashResetToken(token),
    createdAt: now.toISOString(),
    expiresAt: new Date(nowMs + minutes * 60_000).toISOString(),
    createdBy: adminId,
    usedAt: null,
    revokedAt: null
  };
  store.putPasswordReset(record);
  return { record, token };
}

/**
 * Is this token a live link? `{ ok: true, record, user }` or
 * `{ ok: false, reason: 'unknown' | 'expired' | 'used' | 'revoked' }`.
 * Anything that is not 43 base64url characters is 'unknown' without a lookup.
 */
export function inspectPasswordReset({ store, token, now = new Date() }) {
  if (typeof token !== 'string' || !TOKEN_RE.test(token)) return { ok: false, reason: 'unknown' };
  const record = store.findPasswordResetByTokenHash(hashResetToken(token));
  if (!record) return { ok: false, reason: 'unknown' };
  const status = resetStatus(record, now.getTime());
  if (status !== 'active') return { ok: false, reason: status };
  const user = store.findUserById(record.userId);
  if (!user) return { ok: false, reason: 'unknown' };
  return { ok: true, record, user };
}

/**
 * Use the link: re-inspect and mark it used in the same synchronous step.
 * Must be called before any await in the request, so a second submit that
 * lands while the first is hashing finds it already used.
 */
export function claimPasswordReset({ store, token, now = new Date() }) {
  const check = inspectPasswordReset({ store, token, now });
  if (!check.ok) return check;
  store.updatePasswordReset(check.record.id, { usedAt: now.toISOString() });
  return check;
}

const REASON_TEXT = {
  unknown: 'That reset link is not valid. Ask the person who sent it for a new one.',
  expired: 'That reset link has expired. Ask the person who sent it for a new one.',
  used: 'That reset link has already been used. Ask the person who sent it for a new one.',
  revoked: 'That reset link was replaced or withdrawn. Ask the person who sent it for a new one.'
};

/**
 * The learner's two routes, mounted at /api (no auth - the token is the
 * credential):
 *
 *   POST /auth/password-reset/inspect  { token }              -> { valid, username, expiresAt } | { valid: false, reason }
 *   POST /auth/password-reset          { token, newPassword } -> the same shape as login
 *
 * @param {object} deps
 * @param {object} deps.store           server/db.js
 * @param {(user) => object} deps.publicUser
 * @param {(user) => string} deps.signLearnerToken
 * @param {(user) => object} deps.progressFor   the progress a login answers with
 * @param {object} [deps.limiter]       server/rate-limit.js - a successful reset clears the email's failed sign-ins
 * @param {Function} [deps.limit]       `passwordReset.ip` middleware
 */
export function createPasswordResetRouter({ store, publicUser, signLearnerToken, progressFor, limiter = null, limit = (_req, _res, next) => next() }) {
  const router = express.Router();

  router.post('/auth/password-reset/inspect', limit, (req, res) => {
    const check = inspectPasswordReset({ store, token: req.body?.token });
    if (!check.ok) return res.json({ valid: false, reason: check.reason });
    res.json({ valid: true, username: check.user.username, expiresAt: check.record.expiresAt });
  });

  router.post(
    '/auth/password-reset',
    limit,
    asyncRoute(async (req, res) => {
      const token = req.body?.token;
      const newPassword = String(req.body?.newPassword ?? '');
      // Checked BEFORE the link is spent: a too-short password must not use it up.
      if (newPassword.length < MIN_PASSWORD_LENGTH) {
        return res.status(400).json({ error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters.` });
      }

      // Synchronous: the link is marked used before the await below.
      const claim = claimPasswordReset({ store, token });
      if (!claim.ok) return res.status(410).json({ error: REASON_TEXT[claim.reason] ?? REASON_TEXT.unknown, reason: claim.reason });

      const passwordHash = await bcrypt.hash(newPassword, 10);
      const current = store.findUserById(claim.user.id);
      if (!current) return res.status(410).json({ error: REASON_TEXT.unknown, reason: 'unknown' });
      const tokenVersion = (Number.isInteger(current.tokenVersion) ? current.tokenVersion : 0) + 1;
      const updated = store.updateUser(current.id, { passwordHash, tokenVersion });
      store.recordLogin(updated.id);
      // Their failed sign-ins were probably why they needed this.
      limiter?.reset('login.account', String(updated.email ?? '').toLowerCase());
      store.appendAudit({
        adminId: null,
        adminUsername: null,
        action: 'user.password-reset.used',
        target: updated.id,
        details: { userId: updated.id, resetId: claim.record.id }
      });
      console.log(`\x1b[32m[AUTH]\x1b[0m Learner "${updated.username}" set a new password with a reset link.`);
      res.json({ token: signLearnerToken(updated), user: publicUser(updated), progress: progressFor(updated) });
    })
  );

  return router;
}

/**
 * The admin's routes, mounted inside createAdminRouter (so behind
 * requireAdminAuth):
 *
 *   POST /users/:id/password-reset      -> 201 { reset, token, path, url }
 *   GET  /users/:id/password-resets     -> { resets: [{ id, createdAt, expiresAt, usedAt, revokedAt, status }] }
 *   POST /password-resets/:id/revoke    -> { reset }
 *
 * The token is in the 201 body and nowhere else: not stored, not audited.
 *
 * @param {object} deps
 * @param {object} deps.store
 * @param {(req, action, target, details) => void} deps.audit
 * @param {() => number} [deps.ttlMinutes]   `access.passwordResetTtlMinutes`, read per request
 * @param {() => string} [deps.appOrigin]    APP_ORIGIN, for a full link
 */
export function createPasswordResetAdminRouter({
  store,
  audit,
  ttlMinutes = () => DEFAULT_TTL_MINUTES,
  appOrigin = () => String(process.env.APP_ORIGIN ?? '').trim()
}) {
  const router = express.Router();

  router.post('/users/:id/password-reset', (req, res) => {
    const user = store.findUserById(req.params.id);
    if (!user) return res.status(404).json({ error: 'No such user.' });
    let minutes = DEFAULT_TTL_MINUTES;
    try {
      minutes = ttlMinutes() ?? DEFAULT_TTL_MINUTES;
    } catch {
      /* the default */
    }
    const { record, token } = issuePasswordReset({ store, userId: user.id, adminId: req.admin?.id ?? null, ttlMinutes: minutes });
    const path = `/reset-password#token=${token}`;
    const origin = appOrigin().replace(/\/+$/, '');
    // Never the token or its hash - the link must not be recoverable from the log.
    audit(req, 'user.password-reset.issue', user.id, { userId: user.id, resetId: record.id, expiresAt: record.expiresAt });
    res.status(201).json({
      reset: { id: record.id, createdAt: record.createdAt, expiresAt: record.expiresAt },
      token,
      path,
      url: origin ? `${origin}${path}` : null
    });
  });

  router.get('/users/:id/password-resets', (req, res) => {
    const user = store.findUserById(req.params.id);
    if (!user) return res.status(404).json({ error: 'No such user.' });
    const now = Date.now();
    res.json({ resets: store.passwordResetsForUser(user.id).map((record) => publicReset(record, now)) });
  });

  router.post('/password-resets/:id/revoke', (req, res) => {
    const record = store.getPasswordReset(req.params.id);
    if (!record) return res.status(404).json({ error: 'No such reset link.' });
    if (resetStatus(record) !== 'active') return res.status(409).json({ error: 'That link is no longer active.' });
    const updated = store.updatePasswordReset(record.id, { revokedAt: new Date().toISOString() });
    audit(req, 'user.password-reset.revoke', record.userId, { userId: record.userId, resetId: record.id });
    res.json({ reset: publicReset(updated) });
  });

  return router;
}

/** For the Users table: the learner's live link, if any (`{ expiresAt }`), else null. */
export function activeResetLink(store, userId, nowMs = Date.now()) {
  const active = store.passwordResetsForUser(userId).find((record) => resetStatus(record, nowMs) === 'active');
  return active ? { expiresAt: active.expiresAt } : null;
}
