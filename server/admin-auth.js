/**
 * The administrator credential system.
 *
 * Completely separate from the learner `users` table (see server/db.js's
 * single `admin` record): an administrator signs in with an Admin User ID +
 * Admin Password chosen by whoever runs this server, never with an email,
 * and never by way of a promoted learner account. There is exactly one
 * administrator record per install. It is never part of `store.allUsers()`,
 * never included in progress/leaderboard/analytics queries, and never
 * synced to Excel - see server/excel.js, which is only ever called with
 * learner user objects to begin with.
 *
 * `requireAdminAuth` below is the actual security boundary for every
 * `/api/admin/*` route (see server/admin.js) and for `/api/admin-auth/me`:
 * it independently verifies the bearer token against the live admin record
 * on every request. Nothing about "is this an admin" is ever taken from
 * anything the client asserts about itself.
 */
import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import * as store from './db.js';
import { signAdminToken, verifyAdminToken, validateAdminUserId, validateAdminPassword } from './auth.js';

const BCRYPT_COST = 12;
const LOCKOUT_THRESHOLD = 5;
const LOCKOUT_MS = 15 * 60_000;

// Computed once, so a login attempt against a User ID that does not match
// any admin still pays a real bcrypt.compare() cost - not the whole point of
// a timing-safe comparison, but it keeps "no such admin" and "wrong
// password" from being trivially distinguishable by response time.
const DUMMY_HASH = bcrypt.hashSync('no-admin-account-configured-yet', BCRYPT_COST);

/**
 * Runs once at boot, after store.load(). If an admin record already exists,
 * this is a complete no-op: ADMIN_USER_ID / ADMIN_PASSWORD are never read
 * again and never overwrite an existing admin, on this or any later
 * restart. If none exists yet, it reads the configured credentials,
 * validates them, hashes the password with bcrypt, and creates the admin
 * record - storing only the hash and the chosen Admin User ID. The
 * plaintext password is never stored, never logged, and never included in
 * this function's return value (it returns nothing at all).
 */
export async function bootstrapAdminAccount() {
  if (store.getAdmin()) return; // already set up - env vars are never read again

  const userId = process.env.ADMIN_USER_ID;
  const password = process.env.ADMIN_PASSWORD;

  if (!userId && !password) {
    console.warn(
      '[admin] No administrator account exists yet, and ADMIN_USER_ID / ADMIN_PASSWORD are not set. ' +
        'Add both to a .env file at the project root and restart the server to create one ' +
        '(see .env.example).'
    );
    return;
  }

  const idCheck = validateAdminUserId(userId);
  if (!idCheck.ok) {
    console.error(`[admin] ADMIN_USER_ID is invalid (${idCheck.error}) - administrator bootstrap skipped.`);
    return;
  }
  const passwordCheck = validateAdminPassword(password, idCheck.value);
  if (!passwordCheck.ok) {
    console.error(`[admin] ADMIN_PASSWORD is invalid (${passwordCheck.error}) - administrator bootstrap skipped.`);
    return;
  }

  const passwordHash = await bcrypt.hash(passwordCheck.value, BCRYPT_COST);
  store.setAdmin({
    id: crypto.randomUUID(),
    userId: idCheck.value,
    passwordHash,
    createdAt: new Date().toISOString(),
    lastLoginAt: null,
    status: 'active',
    credentialsVersion: 0,
    failedAttempts: 0,
    lockedUntil: null
  });

  console.log(`[admin] administrator account created: ${idCheck.value}`);
  console.log(
    '[admin] ADMIN_PASSWORD is no longer needed - it is never read again now that an administrator ' +
      'account exists. You can safely remove it from .env, or leave ADMIN_USER_ID / ADMIN_PASSWORD in ' +
      'place; either way they are ignored from here on. Change credentials later from ' +
      '/admin/settings/security.'
  );
}

/** Never the id/hash or anything env-derived - just what a client may see. */
export function publicAdmin(admin) {
  return { id: admin.id, userId: admin.userId, createdAt: admin.createdAt, lastLoginAt: admin.lastLoginAt };
}

function isLocked(admin) {
  return Boolean(admin.lockedUntil) && new Date(admin.lockedUntil).getTime() > Date.now();
}

/**
 * Verifies Admin User ID + Password. Returns the SAME generic error whether
 * the User ID does not exist, the password is wrong, or the account is
 * temporarily locked out - a failed attempt never reveals which of those
 * applied. Successful and failed attempts both update the admin record
 * (failure counter / lockout, or a reset + lastLoginAt on success).
 */
export async function authenticateAdmin(userId, password) {
  const admin = store.getAdmin();
  const GENERIC = 'Invalid administrator credentials.';

  if (!admin) {
    // Still pay a real bcrypt cost so "no admin configured" is not
    // instantly distinguishable from "wrong password" by response time.
    await bcrypt.compare(String(password ?? ''), DUMMY_HASH);
    return { ok: false, error: GENERIC };
  }

  const matchesUserId = admin.userId === String(userId ?? '').trim();

  if (matchesUserId && isLocked(admin)) {
    return { ok: false, error: GENERIC, locked: true };
  }

  const hashToCompare = matchesUserId ? admin.passwordHash : DUMMY_HASH;
  const passwordOk = await bcrypt.compare(String(password ?? ''), hashToCompare);

  if (!matchesUserId || !passwordOk) {
    if (matchesUserId) {
      const failedAttempts = (admin.failedAttempts ?? 0) + 1;
      const patch = { failedAttempts };
      if (failedAttempts >= LOCKOUT_THRESHOLD) {
        patch.lockedUntil = new Date(Date.now() + LOCKOUT_MS).toISOString();
      }
      store.updateAdmin(patch);
    }
    return { ok: false, error: GENERIC };
  }

  const updated = store.updateAdmin({ failedAttempts: 0, lockedUntil: null, lastLoginAt: new Date().toISOString() });
  return { ok: true, admin: updated };
}

/**
 * The security boundary for every `/api/admin/*` route and for
 * `/api/admin-auth/me`. Independently verifies the bearer token against the
 * LIVE admin record - never trusts anything the client asserts (there is no
 * `req.body.isAdmin` or similar anywhere in this app). A token whose
 * `credentialsVersion` no longer matches the record (because the Admin User
 * ID or Password changed since it was issued) is rejected exactly like an
 * expired or forged one.
 */
export function requireAdminAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Admin sign-in required.' });

  let payload;
  try {
    payload = verifyAdminToken(token);
  } catch {
    return res.status(401).json({ error: 'Admin sign-in required.' });
  }

  const admin = store.getAdmin();
  if (!admin || admin.id !== payload.adminId || (admin.credentialsVersion ?? 0) !== payload.credentialsVersion) {
    return res.status(401).json({ error: 'Admin sign-in required.' });
  }

  req.admin = admin;
  next();
}

/**
 * Changes the Admin User ID and/or Password. Requires the CURRENT password
 * (re-authentication, not just an existing valid session) before anything
 * else is checked. On success, bumps `credentialsVersion`, which
 * immediately invalidates every previously issued admin token - including
 * the one used to make this very request - so the caller must sign in again
 * with the new credentials afterward. The plaintext password is never
 * stored, logged, or returned.
 */
export async function updateAdminCredentials(admin, { currentPassword, newUserId, newPassword }) {
  const currentOk = await bcrypt.compare(String(currentPassword ?? ''), admin.passwordHash);
  if (!currentOk) return { ok: false, error: 'Current password is incorrect.' };

  const patch = {};
  const changed = { userId: false, password: false };

  if (typeof newUserId === 'string' && newUserId.trim()) {
    const idCheck = validateAdminUserId(newUserId);
    if (!idCheck.ok) return { ok: false, error: idCheck.error };
    if (idCheck.value !== admin.userId) {
      patch.userId = idCheck.value;
      changed.userId = true;
    }
  }

  if (typeof newPassword === 'string' && newPassword.length > 0) {
    const effectiveUserId = patch.userId ?? admin.userId;
    const passwordCheck = validateAdminPassword(newPassword, effectiveUserId);
    if (!passwordCheck.ok) return { ok: false, error: passwordCheck.error };
    patch.passwordHash = await bcrypt.hash(passwordCheck.value, BCRYPT_COST);
    changed.password = true;
  }

  if (!changed.userId && !changed.password) {
    return { ok: false, error: 'Provide a new Admin User ID or a new password.' };
  }

  patch.credentialsVersion = (admin.credentialsVersion ?? 0) + 1;
  const updated = store.updateAdmin(patch);
  return { ok: true, admin: updated, changed };
}
