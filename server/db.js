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
/**
 * Where the database lives. `DATA_DIR` in the environment moves it, which is
 * how a development server runs beside the live one without the two writing
 * over each other: each holds the whole state in memory and rewrites the
 * file, so sharing one would mean the last writer silently wins.
 * Unset - which is every normal case - keeps it at server/data.
 */
const DATA_DIR = process.env.DATA_DIR
  ? path.resolve(path.join(HERE, '..'), process.env.DATA_DIR)
  : path.join(HERE, 'data');
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
  /**
   * Questions an administrator wrote in the console, keyed by id. Each is a
   * complete Challenge (validated against the same zod schema the authored
   * TypeScript goes through, and - for code - with its solution executed)
   * plus `createdAt`/`updatedAt`. server/content.js appends them to their
   * stage after the authored lessons, so learners get them through
   * /api/content exactly like everything else.
   */
  customChallenges: {},
  /** State for the optional Microsoft Excel sync - see server/excel.js. */
  excelSync: { rowIndexByUserId: {}, lastSyncedAtByUser: {}, lastFullSyncAt: null, failures: [] },
  /**
   * One-time purchases (lifetime licence, a track, a stage, a certificate),
   * keyed by order id - see server/billing.js for the record shape. What a
   * learner may open is derived from the PAID rows here on every request,
   * never cached on the user; the legacy `user.isPremium` flag still counts
   * as a lifetime licence so nobody loses access they had before this.
   */
  orders: {},
  /**
   * Issued certificates keyed by id. The id doubles as the public
   * verification code (/api/verify/:code), so it is random, not sequential.
   */
  certificates: {},
  /**
   * Admin-set prices in paise, sparse: a missing entry means "the default
   * for that kind" (server/billing.js DEFAULT_PRICES). Shape:
   * { lifetime?, tracks: { [trackId] }, stages: { [stageId] }, certificates: { [trackId] } }.
   */
  pricing: {},
  /**
   * Work in progress: the code a learner has typed but not yet solved, keyed
   * by user id then challenge id -> { code, language, updatedAt }. This is
   * what makes closing the lesson, refreshing, or signing in on another
   * machine stop being the same thing as throwing the work away. Bounded per
   * user (see DRAFT_CODE_MAX / DRAFTS_PER_USER_MAX) so it cannot grow db.json
   * without limit, and dropped entirely when the account is deleted.
   */
  drafts: {}
};

let state = null;
let writeTimer = null;
let writing = Promise.resolve();

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

/** The value if it is a plain object (a keyed map), else a fresh `{}` - arrays and nulls are not maps. */
function plainObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

/**
 * Write one entry into a keyed map, safely for ANY key.
 *
 * `map[key] = value` looks equivalent but is not: for the key '__proto__' it
 * runs Object.prototype's setter instead of creating an own property, so the
 * entry silently vanishes and the object's prototype changes. defineProperty
 * always makes a real own property, which is also exactly what JSON.parse
 * produces when the file is read back.
 */
function defineEntry(map, key, value) {
  Object.defineProperty(map, key, { value, writable: true, enumerable: true, configurable: true });
  return value;
}

/** Own-property read from a keyed map - the companion to defineEntry above. */
function ownEntry(map, key) {
  return typeof key === 'string' && map && Object.hasOwn(map, key) ? map[key] : null;
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
  next.customChallenges =
    loaded.customChallenges && typeof loaded.customChallenges === 'object' && !Array.isArray(loaded.customChallenges)
      ? loaded.customChallenges
      : {};
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
  next.orders = plainObject(loaded.orders);
  next.certificates = plainObject(loaded.certificates);
  next.pricing = plainObject(loaded.pricing);
  next.drafts = plainObject(loaded.drafts);
  next.users = (loaded.users ?? []).map((u) => {
    // `role` was a field from the old, retired admin-via-user-account
    // system. It is no longer read anywhere - administrators now live
    // entirely in `admin` above - so it is dropped here rather than left
    // sitting in the database where a stale 'admin' value could confuse a
    // future reader of this file.
    const { role, ...rest } = u;
    return {
      ...rest,
      // Every row predating Google/GitHub sign-in has neither field. `null`
      // rather than `undefined` so "this account has no password" is a state
      // the login route can check, not a missing key it has to guess at.
      passwordHash: rest.passwordHash ?? null,
      identities: plainObject(rest.identities)
    };
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
  // Their unsolved work in progress goes too - it is their code, and nothing
  // else in the database refers to it.
  deleteDraftsForUser(id);

  forgetBillingIdentity(db(), id);

  persist();
  return db().users.length < before;
}

/* ------------------------------------------------------------- identities */

/**
 * A linked provider account: `identities` maps a provider id ('google',
 * 'github') to { providerUserId, email, linkedAt, avatarUrl?, name? }. Rows
 * written before provider sign-in existed have no such field at all, so every
 * read here treats a missing one as `{}`.
 */
function identitiesOf(user) {
  if (!user) return {};
  if (!user.identities || typeof user.identities !== 'object' || Array.isArray(user.identities)) user.identities = {};
  return user.identities;
}

/** The provider ids linked to an account, e.g. ['google'] - never the records themselves. */
export function identityProviders(user) {
  return Object.keys(identitiesOf(user));
}

/**
 * The account a provider identity belongs to, matched on the provider's own
 * immutable user id - never on the email, which people change.
 */
export function findUserByIdentity(provider, providerUserId) {
  const id = String(providerUserId ?? '');
  if (!provider || !id) return null;
  return (
    db().users.find((u) => {
      const identity = ownEntry(identitiesOf(u), String(provider));
      return identity ? String(identity.providerUserId) === id : false;
    }) ?? null
  );
}

/** Attach (or refresh) one provider identity on an account. `linkedAt` keeps its original value. */
export function linkIdentity(userId, provider, identity) {
  const user = findUserById(userId);
  if (!user) return null;
  const identities = identitiesOf(user);
  const existing = ownEntry(identities, String(provider));
  const record = {
    ...identity,
    providerUserId: String(identity?.providerUserId ?? ''),
    linkedAt: existing?.linkedAt ?? identity?.linkedAt ?? new Date().toISOString()
  };
  defineEntry(identities, String(provider), record);
  persist();
  return record;
}

/**
 * Remove one provider identity - but never the last way into an account. An
 * OAuth-only learner who disconnects their only provider would be locked out
 * of their own progress with no route back, so that is refused with a reason
 * the UI can show instead.
 */
export function unlinkIdentity(userId, provider) {
  const user = findUserById(userId);
  if (!user) return { ok: false, reason: 'No such account.' };
  const identities = identitiesOf(user);
  const key = String(provider);
  if (!ownEntry(identities, key)) return { ok: false, reason: 'That account is not connected.' };

  const others = Object.keys(identities).filter((id) => id !== key);
  if (!user.passwordHash && others.length === 0) {
    return {
      ok: false,
      reason: 'This is the only way you can sign in. Set a password first, then disconnect it.'
    };
  }

  delete identities[key];
  persist();
  return { ok: true, user };
}

/* ------------------------------------------------------- sign-in bookkeeping */

/** How often `lastSeenAt` may be rewritten - a chatty client must not rewrite db.json on every poll. */
const LAST_SEEN_THROTTLE_MS = 5 * 60_000;

/** Stamp a successful sign-in - password or provider, they count the same. */
export function recordLogin(userId, at = new Date().toISOString()) {
  const user = findUserById(userId);
  if (!user) return null;
  user.lastLoginAt = at;
  user.lastSeenAt = at;
  persist();
  return user;
}

/** Stamp "this account was active", at most once every five minutes. */
export function touchLastSeen(userId, now = Date.now()) {
  const user = findUserById(userId);
  if (!user) return null;
  const last = Date.parse(user.lastSeenAt ?? '');
  if (Number.isFinite(last) && now - last < LAST_SEEN_THROTTLE_MS) return user;
  user.lastSeenAt = new Date(now).toISOString();
  persist();
  return user;
}

/**
 * What a deleted account leaves behind in the billing records.
 *
 * Certificates go with the account: the code is public, so keeping one would
 * keep serving a name for someone who is no longer here. The ORDERS stay -
 * they are the money record, and revenue does not un-happen - but the name
 * that was to be printed on a certificate is personal, so that field does not.
 * Pure over the state object, so it is testable without touching db.json.
 */
export function forgetBillingIdentity(state, userId) {
  const removed = [];
  for (const [certificateId, certificate] of Object.entries(state.certificates ?? {})) {
    if (certificate?.userId === userId) {
      delete state.certificates[certificateId];
      removed.push(certificateId);
    }
  }
  for (const order of Object.values(state.orders ?? {})) {
    if (order?.userId !== userId) continue;
    order.certificateName = null;
    order.certificateId = null;
  }
  return removed;
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

/* ----------------------------------------------------------------- drafts */

/**
 * Unsolved work in progress - the code a learner typed into a lesson and has
 * not solved yet. Two caps keep this from being a way to write unbounded data
 * into db.json: one draft is at most DRAFT_CODE_MAX characters (the route
 * rejects anything longer by name), and one account keeps at most
 * DRAFTS_PER_USER_MAX of them, the least recently updated being dropped first.
 */
export const DRAFT_CODE_MAX = 20_000;
export const DRAFTS_PER_USER_MAX = 200;

/** A user's drafts bucket, created on demand. Own-property lookups only - see defineEntry/ownEntry. */
function draftsBucket(userId, create = false) {
  const all = db().drafts;
  const existing = ownEntry(all, String(userId ?? ''));
  if (existing) return existing;
  if (!create) return null;
  return defineEntry(all, String(userId), {});
}

/** Every draft this learner has, keyed by challenge id - one call restores a whole session. */
export function getDrafts(userId) {
  return draftsBucket(userId) ?? {};
}

export function getDraft(userId, challengeId) {
  return ownEntry(getDrafts(userId), String(challengeId ?? ''));
}

/** Insert or replace one draft, evicting this learner's stalest ones past the cap. */
export function putDraft(userId, challengeId, { code, language } = {}) {
  const bucket = draftsBucket(userId, true);
  const id = String(challengeId);
  const draft = {
    code: String(code ?? ''),
    language: language ? String(language) : null,
    updatedAt: new Date().toISOString()
  };
  defineEntry(bucket, id, draft);

  const ids = Object.keys(bucket);
  if (ids.length > DRAFTS_PER_USER_MAX) {
    const stalest = ids
      .sort((a, b) => String(bucket[a]?.updatedAt ?? '').localeCompare(String(bucket[b]?.updatedAt ?? '')))
      .slice(0, ids.length - DRAFTS_PER_USER_MAX);
    for (const stale of stalest) delete bucket[stale];
  }

  persist();
  return draft;
}

export function deleteDraft(userId, challengeId) {
  const bucket = draftsBucket(userId);
  const id = String(challengeId ?? '');
  if (!bucket || !Object.hasOwn(bucket, id)) return false;
  delete bucket[id];
  // An emptied bucket is dropped rather than left as `{}` forever.
  if (Object.keys(bucket).length === 0) delete db().drafts[String(userId)];
  persist();
  return true;
}

export function deleteDraftsForUser(userId) {
  const id = String(userId ?? '');
  if (!Object.hasOwn(db().drafts, id)) return false;
  delete db().drafts[id];
  persist();
  return true;
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

/* ------------------------------------------------------- custom challenges */

/** Every admin-authored question, in creation order. */
export function allCustomChallenges() {
  return Object.values(db().customChallenges);
}

/**
 * Own-property lookups only: `customChallenges` is a plain object, so a
 * bracket lookup for 'constructor' or '__proto__' would hand back something
 * truthy from Object.prototype and the caller would treat it as a question.
 */
export function getCustomChallenge(id) {
  const all = db().customChallenges;
  return typeof id === 'string' && Object.hasOwn(all, id) ? all[id] : null;
}

/** Insert or replace one admin-authored question (validated by the caller). */
export function putCustomChallenge(challenge) {
  const existing = getCustomChallenge(challenge.id);
  const now = new Date().toISOString();
  db().customChallenges[challenge.id] = {
    ...challenge,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now
  };
  persist();
  return db().customChallenges[challenge.id];
}

/** Remove one admin-authored question, along with any presentational override on it. */
export function deleteCustomChallenge(id) {
  const existed = Boolean(getCustomChallenge(id));
  if (!existed) return false;
  delete db().customChallenges[id];
  if (Object.hasOwn(db().contentOverrides.challenges, id)) delete db().contentOverrides.challenges[id];
  persist();
  return true;
}

/* ---------------------------------------------------------------- billing */

const PRICE_KINDS = ['tracks', 'stages', 'certificates'];

/** Own-property lookup in a keyed map - see getCustomChallenge for why a bare bracket lookup is not enough. */
function lookup(map, id) {
  return typeof id === 'string' && Object.hasOwn(map, id) ? map[id] : null;
}

/** Sparse admin prices in paise; resolve defaults with server/billing.js's priceFor(). */
export function getPricing() {
  return db().pricing;
}

/**
 * Merge a price patch per kind. A number sets a price, `null` clears that
 * key back to the default, anything else is ignored - the range and
 * integer checks live in server/admin.js so the admin gets a message
 * naming the field, not a silently dropped value.
 */
export function setPricing(patch = {}) {
  const pricing = db().pricing;
  if (patch.lifetime === null) delete pricing.lifetime;
  else if (typeof patch.lifetime === 'number') pricing.lifetime = patch.lifetime;

  for (const kind of PRICE_KINDS) {
    const entries = patch[kind];
    if (!entries || typeof entries !== 'object' || Array.isArray(entries)) continue;
    const bucket = pricing[kind] && typeof pricing[kind] === 'object' ? pricing[kind] : {};
    for (const [id, value] of Object.entries(entries)) {
      if (value === null) delete bucket[id];
      else if (typeof value === 'number') bucket[id] = value;
    }
    // An emptied bucket is dropped rather than left as `{}` forever.
    if (Object.keys(bucket).length) pricing[kind] = bucket;
    else delete pricing[kind];
  }
  persist();
  return pricing;
}

export function getOrder(id) {
  return lookup(db().orders, id);
}

/** Insert or replace one order (built and validated by server/billing.js). */
export function putOrder(order) {
  db().orders[order.id] = order;
  persist();
  return order;
}

/** A learner's orders, newest first. */
export function ordersForUser(userId) {
  return allOrders().filter((o) => o.userId === userId);
}

/** Every order, newest first. */
export function allOrders() {
  return Object.values(db().orders).sort((a, b) => String(b.createdAt ?? '').localeCompare(String(a.createdAt ?? '')));
}

export function getCertificate(id) {
  return lookup(db().certificates, id);
}

/** Insert or replace one certificate (issued by server/billing.js). */
export function putCertificate(certificate) {
  db().certificates[certificate.id] = certificate;
  persist();
  return certificate;
}

/** A learner's certificates, newest first, revoked ones included. */
export function certificatesForUser(userId) {
  return allCertificates().filter((c) => c.userId === userId);
}

/** Every certificate, newest first. */
export function allCertificates() {
  return Object.values(db().certificates).sort((a, b) => String(b.issuedAt ?? '').localeCompare(String(a.issuedAt ?? '')));
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
