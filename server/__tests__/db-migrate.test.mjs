/**
 * The version 1 -> 2 migration of db.json: `settings` and `activity` are
 * added, users gain `preferences`, and nothing a learner earned is touched.
 *
 * `migrateState` is pure over the loaded object (like forgetBillingIdentity
 * in db-forget.test.mjs). `load()` is exercised with the file system mocked,
 * so the one-time copy of the old file can be seen without a real db.json.
 */
import { beforeAll, describe, expect, it, vi } from 'vitest';

const files = vi.hoisted(() => ({ written: [], renamed: [] }));

const OLD_DB = {
  version: 1,
  users: [
    { id: 'u1', email: 'a@example.com', username: 'ada', passwordHash: 'hash', role: 'admin', createdAt: '2025-01-01T00:00:00.000Z' },
    { id: 'u2', email: 'b@example.com', username: 'bob', passwordHash: 'hash', identities: { google: { providerUserId: 'g1' } } }
  ],
  progress: {
    u1: {
      xp: 132,
      level: 2,
      streak: 3,
      bestStreak: 7,
      lastActiveDay: '2026-09-20',
      completedChallenges: ['c1', 'c2'],
      completedStages: [],
      attempts: {
        c1: { challengeId: 'c1', score: 100, attempts: 1, hintsUsed: 0, solvedAt: '2026-09-18T10:00:00.000Z' },
        c2: { challengeId: 'c2', score: 80, attempts: 3, hintsUsed: 0, solvedAt: '2026-09-20T10:00:00.000Z' }
      }
    },
    u2: { xp: 0, level: 1, streak: 0, bestStreak: 0, lastActiveDay: null, completedChallenges: [], completedStages: [], attempts: {} }
  },
  admin: null,
  auditLog: [{ id: 'audit-1', at: '2026-01-01T00:00:00.000Z', action: 'x' }],
  contentOverrides: { stages: {}, challenges: {}, languages: {} },
  customChallenges: {},
  excelSync: { rowIndexByUserId: {}, lastSyncedAtByUser: {}, lastFullSyncAt: null, failures: [] },
  orders: {},
  certificates: {},
  pricing: {},
  drafts: {}
};

vi.mock('node:fs', () => ({ existsSync: () => true }));
vi.mock('node:fs/promises', () => ({
  readFile: async () => JSON.stringify(OLD_DB),
  writeFile: async (file, text) => {
    files.written.push({ file: String(file), text });
  },
  rename: async (from, to) => {
    files.renamed.push({ from: String(from), to: String(to) });
  },
  mkdir: async () => {}
}));

import * as store from '../db.js';

const clone = (v) => JSON.parse(JSON.stringify(v));

describe('migrateState', () => {
  it('adds settings and activity, and leaves progress exactly as it was', () => {
    const next = store.migrateState(clone(OLD_DB));
    expect(next.version).toBe(store.SCHEMA_VERSION);
    expect(store.SCHEMA_VERSION).toBe(2);
    expect(next.settings).toEqual({ overrides: {}, revision: 0, updatedAt: null, updatedBy: null });
    expect(next.activity).toEqual({});
    expect(next.progress).toEqual(OLD_DB.progress);
    expect(JSON.stringify(next.progress)).toBe(JSON.stringify(OLD_DB.progress));
    expect(next.auditLog).toEqual(OLD_DB.auditLog);
  });

  it('gives every user empty preferences, keeping what they had', () => {
    const next = store.migrateState(clone(OLD_DB));
    expect(next.users[0].preferences).toEqual({ timeZone: null, timeZoneSetAt: null, updatedAt: null });
    expect(next.users[0].role).toBeUndefined();
    expect(next.users[1].identities).toEqual({ google: { providerUserId: 'g1' } });

    const withPrefs = store.migrateState({ users: [{ id: 'u3', preferences: { timeZone: 'Asia/Kolkata', timeZoneSetAt: '2026-09-01T00:00:00Z', later: 'kept' } }] });
    expect(withPrefs.users[0].preferences).toEqual({ timeZone: 'Asia/Kolkata', timeZoneSetAt: '2026-09-01T00:00:00Z', updatedAt: null, later: 'kept' });
  });

  it('is idempotent', () => {
    const once = store.migrateState(clone(OLD_DB));
    const twice = store.migrateState(clone(once));
    expect(twice).toEqual(once);
  });

  it('keeps stored settings and activity, and repairs nonsense', () => {
    const stored = {
      ...clone(OLD_DB),
      version: 2,
      settings: { overrides: { xp: { passScore: 70 } }, revision: 4, updatedAt: '2026-09-01T00:00:00Z', updatedBy: 'admin' },
      activity: { u1: { v: 1, days: {} } }
    };
    const next = store.migrateState(stored);
    expect(next.settings).toEqual(stored.settings);
    expect(next.activity).toEqual(stored.activity);
    expect(store.migrateState({ settings: { overrides: [1], revision: -2 }, activity: [1] })).toMatchObject({
      settings: { overrides: {}, revision: 0 },
      activity: {}
    });
  });

  it('never lets a newer version number go backwards', () => {
    expect(store.migrateState({ version: 7 }).version).toBe(7);
    expect(store.migrateState({}).version).toBe(2);
  });
});

describe('load() of a version 1 file', () => {
  beforeAll(async () => {
    await store.load();
  });

  it('keeps a byte-for-byte copy of the old file before migrating', () => {
    const copy = files.written.find((w) => /db\.json\.pre-v2-\d+$/.test(w.file));
    expect(copy, 'db.json.pre-v2-<ts>').toBeTruthy();
    expect(copy.text).toBe(JSON.stringify(OLD_DB));
    // Not treated as corrupt.
    expect(files.renamed.filter((r) => r.to.includes('.corrupt-'))).toEqual([]);
  });

  it('loads the migrated state with progress untouched', () => {
    expect(store.db().version).toBe(2);
    expect(store.db().progress).toEqual(OLD_DB.progress);
    expect(store.getSettingsRecord().revision).toBe(0);
    expect(store.allActivity()).toEqual({});
  });

  it('deleteUser takes the learner’s activity with it', () => {
    store.putActivity('u1', { v: 1, lastDay: '2026-09-20', backfilledAt: null, days: {}, misses: {}, missLog: [] });
    store.putActivity('u2', { v: 1, lastDay: null, backfilledAt: null, days: {}, misses: {}, missLog: [] });
    expect(store.getActivity('u1')).not.toBeNull();

    expect(store.deleteUser('u1')).toBe(true);
    expect(store.getActivity('u1')).toBeNull();
    expect(store.getActivity('u2')).not.toBeNull();
    expect(store.getActivity('__proto__')).toBeNull();
    expect(store.getActivity('constructor')).toBeNull();
  });
});
