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
  progress: {}
};

let state = null;
let writeTimer = null;
let writing = Promise.resolve();

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

export async function load() {
  if (state) return state;
  await mkdir(DATA_DIR, { recursive: true });

  if (existsSync(DB_FILE)) {
    try {
      const raw = await readFile(DB_FILE, 'utf8');
      const parsed = JSON.parse(raw);
      state = { ...clone(EMPTY), ...parsed };
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
