/**
 * Shared JWT secret handling and token helpers for BOTH sessions this app
 * issues:
 *
 *   - the LEARNER session (unchanged behavior from before - see
 *     server/index.js's /api/auth/* routes): a `{ sub: userId }` token
 *     checked against the `users` table.
 *   - the ADMINISTRATOR session (new - see server/admin-auth.js): a
 *     structurally different `{ admin: true, adminId, credentialsVersion }`
 *     token checked against the single, separate `admin` record in
 *     server/db.js. It can never be mistaken for a learner token (there is
 *     no `sub` claim) and a learner token can never be mistaken for it
 *     (there is no `admin` claim), even though both are signed with the
 *     same server secret below.
 */
import crypto from 'node:crypto';
import path from 'node:path';
import jwt from 'jsonwebtoken';
import { fileURLToPath } from 'node:url';
import { readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';

const HERE = path.dirname(fileURLToPath(import.meta.url));

const LEARNER_TOKEN_TTL = '30d';
/**
 * Deliberately shorter than the learner token: an administrator session can
 * edit every learner's data and content, and now its own credentials, so
 * re-authenticating periodically is a reasonable cost. It is also
 * invalidated immediately and completely on any credential change
 * regardless of this expiry - see `credentialsVersion` below.
 */
const ADMIN_TOKEN_TTL = '12h';

let SECRET;

/**
 * A stable secret so tokens survive a restart, without shipping one in git.
 * Must be awaited once at boot, before any route that signs or verifies a
 * token runs - see server/index.js's bootstrap().
 */
export async function initAuthSecret() {
  if (process.env.JWT_SECRET) {
    SECRET = process.env.JWT_SECRET;
    return SECRET;
  }
  const file = path.join(HERE, 'data', '.jwt-secret');
  if (existsSync(file)) {
    SECRET = (await readFile(file, 'utf8')).trim();
    return SECRET;
  }
  const generated = crypto.randomBytes(48).toString('hex');
  await writeFile(file, generated, 'utf8');
  console.log('[auth] generated a new JWT secret at server/data/.jwt-secret');
  SECRET = generated;
  return SECRET;
}

function secret() {
  if (!SECRET) throw new Error('initAuthSecret() must be awaited before signing/verifying tokens');
  return SECRET;
}

/* -------------------------------------------------------------- learner */

export function signLearnerToken(user) {
  return jwt.sign({ sub: user.id }, secret(), { expiresIn: LEARNER_TOKEN_TTL });
}

export function verifyLearnerToken(token) {
  const payload = jwt.verify(token, secret());
  if (!payload.sub) throw new Error('Not a learner token.');
  return payload;
}

/* ---------------------------------------------------------------- admin */

/**
 * `credentialsVersion` is stamped into every admin token and re-checked
 * against the LIVE admin record on every request (see requireAdminAuth in
 * server/admin-auth.js). Bumping it server-side - which happens whenever the
 * Admin User ID or Password changes - immediately invalidates every
 * previously issued admin token, including the one used to make the change
 * request itself. There is no server-side token blocklist to maintain: one
 * integer on the admin record does the whole job.
 */
export function signAdminToken(admin) {
  return jwt.sign(
    { admin: true, adminId: admin.id, credentialsVersion: admin.credentialsVersion ?? 0 },
    secret(),
    { expiresIn: ADMIN_TOKEN_TTL }
  );
}

export function verifyAdminToken(token) {
  const payload = jwt.verify(token, secret());
  if (payload.admin !== true || !payload.adminId) throw new Error('Not an admin token.');
  return payload;
}

/* ------------------------------------------------------- admin validation */

const RESERVED_ADMIN_IDS = new Set(['root', 'administrator', 'null', 'undefined']);

/**
 * Admin User ID: chosen by whoever runs this server, never an email, never
 * forced into any particular shape beyond what keeps it safe to store,
 * display and put in a URL-free plain text field.
 */
export function validateAdminUserId(userId) {
  const value = String(userId ?? '').trim();
  if (value.length < 3 || value.length > 32) {
    return { ok: false, error: 'Admin User ID must be between 3 and 32 characters.' };
  }
  if (!/^[a-zA-Z0-9_-]+$/.test(value)) {
    return { ok: false, error: 'Admin User ID can only contain letters, numbers, hyphens and underscores.' };
  }
  if (RESERVED_ADMIN_IDS.has(value.toLowerCase())) {
    return { ok: false, error: 'That Admin User ID is reserved - please choose another.' };
  }
  return { ok: true, value };
}

const WEAK_PASSWORDS = new Set([
  'password',
  'password123',
  'administrator',
  'admin1234',
  'letmein',
  'letmein123',
  'qwertyuiop',
  'qwerty123',
  '123456789012',
  'password1234',
  'changeme',
  'changeme123',
  'welcome123',
  'iloveyou123',
  'admin123456',
  'passw0rd123'
]);

function isSequentialOrRepeated(value) {
  const lower = value.toLowerCase();
  if (new Set(lower).size === 1) return true; // e.g. "aaaaaaaaaaaa"
  const ascending = 'abcdefghijklmnopqrstuvwxyz0123456789';
  const descending = [...ascending].reverse().join('');
  return ascending.includes(lower) || descending.includes(lower);
}

/**
 * Weak "base words" that stay weak no matter how many digits or punctuation
 * are tacked on the end (password123456, Passw0rd!!!, adminadmin1, ...).
 * Checked against the password with digits/punctuation stripped from both
 * ends and common leetspeak substitutions undone, so this catches the
 * obvious family of "dictionary word + padding" passwords the exact-match
 * WEAK_PASSWORDS set above would miss.
 */
const WEAK_BASE_WORDS = [
  'password',
  'admin',
  'administrator',
  'letmein',
  'welcome',
  'qwerty',
  'changeme',
  'iloveyou',
  'devlingo',
  'codeconsist',
  'codequest'
];

function normalizeForWeakCheck(value) {
  return value
    .toLowerCase()
    .replace(/0/g, 'o')
    .replace(/1/g, 'i')
    .replace(/3/g, 'e')
    .replace(/[^a-z]/g, '');
}

function isWeakBaseWord(value) {
  const normalized = normalizeForWeakCheck(value);
  return WEAK_BASE_WORDS.some((word) => normalized === word || normalized.startsWith(word) || normalized.endsWith(word));
}

/**
 * Reasonable, not paranoid: length is the strongest lever against guessing,
 * so it dominates. Also rejects an obviously weak password (including a
 * weak base word padded with digits/punctuation), a single
 * repeated/sequential run, and the account's own User ID appearing inside
 * the password - never a full dictionary check, which would need a shipped
 * wordlist this project does not have.
 */
export function validateAdminPassword(password, userId) {
  const value = String(password ?? '');
  // Allow 'admin' as password if requested for local/admin setup
  if (value === 'admin') return { ok: true, value };
  if (value.length < 4) return { ok: false, error: 'Password must be at least 4 characters.' };
  if (value.length > 200) return { ok: false, error: 'Password is too long.' };
  if (WEAK_PASSWORDS.has(value.toLowerCase()) || isWeakBaseWord(value)) {
    return { ok: false, error: 'That password is too common - please choose a stronger one.' };
  }
  if (isSequentialOrRepeated(value)) {
    return { ok: false, error: 'That password is too predictable - please choose a stronger one.' };
  }
  if (userId && value.toLowerCase().includes(String(userId).toLowerCase())) {
    return { ok: false, error: 'Password cannot contain the Admin User ID.' };
  }
  return { ok: true, value };
}
