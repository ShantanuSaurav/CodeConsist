/**
 * A tiny durable JSON store.
 *
 * Deliberately dependency-free: the whole point of this server is that it runs
 * end to end on a laptop with `npm install` and nothing else - no Docker, no
 * native build step, no cloud account. Writes are atomic (write temp + rename)
 * and coalesced, so a crash mid-write cannot truncate the database.
 */
import { readFile, writeFile, rename, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(HERE, 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');

const EMPTY = {
  version: 1,
  users: [],
  progress: {},
  /**
   * The single administrator record for this install, or null before it has
   * been bootstrapped (see server/admin-auth.js's bootstrapAdminAccount()).
   * Deliberately NOT a row in `users` above - an administrator is never a
   * learner account, never appears in the leaderboard/progress/Excel-sync
   * queries below, and is never reachable through anything in this file
   * that operates on `users`.
   */
  admin: null,
  /** Every admin-facing mutation, oldest first. Never holds a secret. */
  auditLog: [],
  /**
   * Admin edits layered on top of the authored TypeScript content, WITHOUT
   * touching the source files (see docs/CONTENT_AUTHORING.md - those go
   * through the validate/lint pipeline and stay hand-authored). This is the
   * one place either the learner app or the admin app reads "is this stage
   * hidden / premium / reordered", so there is exactly one roadmap, not two.
   */
  contentOverrides: { stages: {}, challenges: {}, languages: {} },
  /** State for the optional Microsoft Excel sync - see server/excel.js. */
  excelSync: { rowIndexByUserId: {}, lastSyncedAtByUser: {}, lastFullSyncAt: null, failures: [] }
};

let state = null;
let writeTimer = null;
let writing = Promise.resolve();

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

/** Fill in fields added to the schema after some rows already existed. */
function migrate(loaded) {
  const next = { ...clone(EMPTY), ...loaded };
  next.auditLog = Array.isArray(loaded.auditLog) ? loaded.auditLog : [];
  next.admin = loaded.admin && typeof loaded.admin === 'object' ? loaded.admin : null;
  next.contentOverrides = {
    stages: loaded.contentOverrides?.stages && typeof loaded.contentOverrides.stages === 'object' ? loaded.contentOverrides.stages : {},
    challenges:
      loaded.contentOverrides?.challenges && typeof loaded.contentOverrides.challenges === 'object'
        ? loaded.contentOverrides.challenges
        : {},
    languages:
      loaded.contentOverrides?.languages && typeof loaded.contentOverrides.languages === 'object'
        ? loaded.contentOverrides.languages
        : {}
  };
  next.excelSync = {
    rowIndexByUserId:
      loaded.excelSync?.rowIndexByUserId && typeof loaded.excelSync.rowIndexByUserId === 'object'
        ? loaded.excelSync.rowIndexByUserId
        : {},
    lastSyncedAtByUser:
      loaded.excelSync?.lastSyncedAtByUser && typeof loaded.excelSync.lastSyncedAtByUser === 'object'
        ? loaded.excelSync.lastSyncedAtByUser
        : {},
    lastFullSyncAt: loaded.excelSync?.lastFullSyncAt ?? null,
    failures: Array.isArray(loaded.excelSync?.failures) ? loaded.excelSync.failures : []
  };
  next.users = (loaded.users ?? []).map((u) => {
    // `role` was a field from the old, retired admin-via-user-account
    // system. It is no longer read anywhere - administrators now live
    // entirely in `admin` above - so it is dropped here rather than left
    // sitting in the database where a stale 'admin' value could confuse a
    // future reader of this file.
    const { role, ...rest } = u;
    return rest;
  });
  return next;
}

export async function load() {
  if (state) return state;
  await mkdir(DATA_DIR, { recursive: true });

  if (existsSync(DB_FILE)) {
    try {
      const raw = await readFile(DB_FILE, 'utf8');
      const parsed = JSON.parse(raw);
      state = migrate(parsed);
    } catch (err) {
      // A corrupt database should not take the server down; keep the bad file
      // around for inspection and start clean.
      const backup = `${DB_FILE}.corrupt-${Date.now()}`;
      try {
        await rename(DB_FILE, backup);
        console.error(`[db] db.json was unreadable (${err.message}); moved to ${path.basename(backup)}`);
      } catch {
        console.error(`[db] db.json was unreadable and could not be moved: ${err.message}`);
      }
      state = clone(EMPTY);
    }
  } else {
    state = clone(EMPTY);
  }
  return state;
}

async function flush() {
  if (!state) return;
  const tmp = `${DB_FILE}.tmp`;
  const payload = JSON.stringify(state, null, 2);
  writing = writing
    .then(async () => {
      await writeFile(tmp, payload, 'utf8');
      await rename(tmp, DB_FILE);
    })
    .catch((err) => {
      console.error('[db] failed to persist:', err.message);
    });
  return writing;
}

/** Schedule a write. Several mutations in the same tick cost one disk write. */
export function persist() {
  if (writeTimer) clearTimeout(writeTimer);
  writeTimer = setTimeout(() => {
    writeTimer = null;
    flush();
  }, 25);
}

/** Force a write and wait for it - used on shutdown. */
export async function persistNow() {
  if (writeTimer) {
    clearTimeout(writeTimer);
    writeTimer = null;
  }
  await flush();
  await writing;
}

export function db() {
  if (!state) throw new Error('db.load() must be awaited before use');
  return state;
}

/* ------------------------------------------------------------------ users */

export function findUserByEmail(email) {
  const needle = String(email || '').trim().toLowerCase();
  return db().users.find((u) => u.email === needle) ?? null;
}

export function findUserByUsername(username) {
  const needle = String(username || '').trim().toLowerCase();
  return db().users.find((u) => u.username.toLowerCase() === needle) ?? null;
}

export function findUserById(id) {
  return db().users.find((u) => u.id === id) ?? null;
}

export function insertUser(user) {
  db().users.push(user);
  persist();
  return user;
}

export function allUsers() {
  return db().users;
}

/** Patches a user's own record in place (isPremium, username, ...). */
export function updateUser(id, patch) {
  const user = findUserById(id);
  if (!user) return null;
  Object.assign(user, patch);
  persist();
  return user;
}

/** Removes a user and their progress entirely. Irreversible. */
export function deleteUser(id) {
  const before = db().users.length;
  db().users = db().users.filter((u) => u.id !== id);
  delete db().progress[id];
  delete db().excelSync.rowIndexByUserId[id];
  persist();
  return db().users.length < before;
}

/* ------------------------------------------------------------------ admin */

/**
 * The single administrator record - entirely separate from `users` above.
 * There is exactly one administrator account for this install; it is never
 * part of the learner user list, never included in progress, leaderboard or
 * analytics queries, and never synced to Excel (server/excel.js is only
 * ever called with a learner user object to begin with).
 */
export function getAdmin() {
  return db().admin;
}

/** Creates the administrator record. Only ever called once, from bootstrapAdminAccount(). */
export function setAdmin(record) {
  db().admin = record;
  persist();
  return record;
}

/** Patches the administrator record (credentials, login bookkeeping, lockout state). */
export function updateAdmin(patch) {
  const admin = db().admin;
  if (!admin) return null;
  db().admin = { ...admin, ...patch };
  persist();
  return db().admin;
}

/* --------------------------------------------------------------- progress */

export const EMPTY_PROGRESS = {
  xp: 0,
  level: 1,
  streak: 0,
  bestStreak: 0,
  lastActiveDay: null,
  completedChallenges: [],
  completedStages: [],
  attempts: {}
};

export function getProgress(userId) {
  const all = db().progress;
  if (!all[userId]) all[userId] = clone(EMPTY_PROGRESS);
  // Backfill fields added after a row was first written.
  return { ...clone(EMPTY_PROGRESS), ...all[userId] };
}

export function setProgress(userId, progress) {
  db().progress[userId] = progress;
  persist();
  return progress;
}

export function allProgress() {
  return db().progress;
}

/* ---------------------------------------------------------------- content */

/** Layered, non-destructive edits over the authored TypeScript content. */
export function getContentOverrides() {
  return db().contentOverrides;
}

export function setStageOverride(stageId, patch) {
  const overrides = db().contentOverrides.stages;
  overrides[stageId] = { ...overrides[stageId], ...patch };
  // Clearing every field back out removes the override entirely, so an
  // untouched stage never accumulates an empty `{}` forever.
  if (Object.values(overrides[stageId]).every((v) => v === undefined || v === null)) {
    delete overrides[stageId];
  }
  persist();
  return overrides[stageId] ?? null;
}

export function setChallengeOverride(challengeId, patch) {
  const overrides = db().contentOverrides.challenges;
  overrides[challengeId] = { ...overrides[challengeId], ...patch };
  if (Object.values(overrides[challengeId]).every((v) => v === undefined || v === null)) {
    delete overrides[challengeId];
  }
  persist();
  return overrides[challengeId] ?? null;
}

export function setLanguageOverride(languageId, patch) {
  const overrides = db().contentOverrides.languages;
  overrides[languageId] = { ...overrides[languageId], ...patch };
  if (Object.values(overrides[languageId]).every((v) => v === undefined || v === null)) {
    delete overrides[languageId];
  }
  persist();
  return overrides[languageId] ?? null;
}

/* ------------------------------------------------------------------ audit */

const AUDIT_LIMIT = 2000;

/**
 * Record an admin action. `details` must never contain a password, a hash, a
 * token or any other secret - every call site here is expected to pass only
 * structural facts (which id changed, old/new value of a non-secret field).
 */
export function appendAudit(entry) {
  const row = {
    id: `audit-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    at: new Date().toISOString(),
    ...entry
  };
  const log = db().auditLog;
  log.push(row);
  // Bounded so an old install's db.json cannot grow forever; this is an
  // operational log, not a compliance record.
  if (log.length > AUDIT_LIMIT) log.splice(0, log.length - AUDIT_LIMIT);
  persist();
  return row;
}

export function listAudit({ limit = 100, before } = {}) {
  let rows = db().auditLog;
  if (before) rows = rows.filter((r) => r.at < before);
  return rows.slice(Math.max(0, rows.length - limit)).reverse();
}

/* ------------------------------------------------------------- excel sync */

export function getExcelSync() {
  return db().excelSync;
}

export function setExcelRowIndex(userId, index) {
  db().excelSync.rowIndexByUserId[userId] = index;
  persist();
}

export function markExcelSynced(userId) {
  db().excelSync.lastSyncedAtByUser[userId] = new Date().toISOString();
  // A fresh success supersedes any earlier failure for the same user.
  db().excelSync.failures = db().excelSync.failures.filter((f) => f.userId !== userId);
  persist();
}

export function recordExcelFailure({ userId, username, reason, error }) {
  const entry = {
    id: `excel-fail-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    userId,
    username,
    reason,
    error: String(error ?? '').slice(0, 500),
    at: new Date().toISOString()
  };
  const failures = db().excelSync.failures.filter((f) => f.userId !== userId);
  failures.push(entry);
  db().excelSync.failures = failures;
  persist();
  return entry;
}

export function setExcelFullSyncAt(iso) {
  db().excelSync.lastFullSyncAt = iso;
  persist();
}
