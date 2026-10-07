/**
 * The migrations of db.json: version 2 added `settings` and `activity`
 * (users gained `preferences`), version 3 added `passwordResets` (users
 * gained `tokenVersion`), version 4 added `contentOverrides.units` and the
 * whole preferences shape, version 5 added `conceptCards` and
 * `reviewSessions`, version 6 added `assessments` (users gained
 * `onboarding`), version 7 added `leagues` - and nothing a learner earned is
 * ever touched.
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

/** Every preference, unset (schema version 4). */
const EMPTY_PREFS = {
  timeZone: null,
  timeZoneSetAt: null,
  dailyGoalId: null,
  soundOn: null,
  trackId: null,
  learningMode: null,
  motivation: null,
  experience: null,
  updatedAt: null
};

describe('migrateState', () => {
  it('adds settings and activity, and leaves progress exactly as it was', () => {
    const next = store.migrateState(clone(OLD_DB));
    expect(next.version).toBe(store.SCHEMA_VERSION);
    expect(store.SCHEMA_VERSION).toBe(8);
    expect(next.settings).toEqual({ overrides: {}, revision: 0, updatedAt: null, updatedBy: null });
    expect(next.activity).toEqual({});
    expect(next.progress).toEqual(OLD_DB.progress);
    expect(JSON.stringify(next.progress)).toBe(JSON.stringify(OLD_DB.progress));
    expect(next.auditLog).toEqual(OLD_DB.auditLog);
  });

  it('gives every user empty preferences, keeping what they had', () => {
    const next = store.migrateState(clone(OLD_DB));
    expect(next.users[0].preferences).toEqual(EMPTY_PREFS);
    expect(next.users[0].role).toBeUndefined();
    expect(next.users[1].identities).toEqual({ google: { providerUserId: 'g1' } });

    const withPrefs = store.migrateState({ users: [{ id: 'u3', preferences: { timeZone: 'Asia/Kolkata', timeZoneSetAt: '2026-09-01T00:00:00Z', later: 'kept' } }] });
    expect(withPrefs.users[0].preferences).toEqual({ ...EMPTY_PREFS, timeZone: 'Asia/Kolkata', timeZoneSetAt: '2026-09-01T00:00:00Z', later: 'kept' });
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
    expect(store.migrateState({ version: 8 }).version).toBe(8);
    expect(store.migrateState({}).version).toBe(8);
  });

  it('adds password resets and token versions (version 3), leaving orders, overrides and progress alone', () => {
    const v2 = {
      ...clone(OLD_DB),
      version: 2,
      settings: { overrides: {}, revision: 1, updatedAt: null, updatedBy: null },
      activity: {},
      orders: { ord_1: { id: 'ord_1', userId: 'u1', status: 'paid', product: { kind: 'lifetime' } } },
      contentOverrides: { stages: { s2: { isPremium: false } }, challenges: {}, languages: {} }
    };
    const next = store.migrateState(clone(v2));
    expect(next.version).toBe(store.SCHEMA_VERSION);
    expect(next.passwordResets).toEqual({});
    expect(next.users.map((u) => u.tokenVersion)).toEqual([0, 0]);
    expect(next.progress).toEqual(v2.progress);
    expect(next.orders).toEqual(v2.orders);
    // Version 4 adds an empty `units` beside the other overrides, which stay as they were.
    expect(next.contentOverrides).toEqual({ ...v2.contentOverrides, units: {} });
  });

  it('keeps stored resets and token versions, and repairs nonsense', () => {
    const reset = { id: 'pr_abc', userId: 'u1', tokenHash: 'h', createdAt: 'x', expiresAt: 'y', createdBy: 'a', usedAt: null, revokedAt: null };
    const kept = store.migrateState({ passwordResets: { pr_abc: reset }, users: [{ id: 'u1', tokenVersion: 4 }] });
    expect(kept.passwordResets).toEqual({ pr_abc: reset });
    expect(kept.users[0].tokenVersion).toBe(4);

    const repaired = store.migrateState({ passwordResets: [1], users: [{ id: 'u1', tokenVersion: -1 }, { id: 'u2', tokenVersion: '3' }, { id: 'u3', tokenVersion: 1.5 }] });
    expect(repaired.passwordResets).toEqual({});
    expect(repaired.users.map((u) => u.tokenVersion)).toEqual([0, 0, 0]);
  });
});

describe('load() of a version 1 file', () => {
  beforeAll(async () => {
    await store.load();
  });

  it('keeps a byte-for-byte copy of the old file before migrating', () => {
    // Named after the version it migrates TO (a file from before version 7).
    const copy = files.written.find((w) => /db\.json\.pre-v8-\d+$/.test(w.file));
    expect(copy, 'db.json.pre-v8-<ts>').toBeTruthy();
    expect(copy.text).toBe(JSON.stringify(OLD_DB));
    // Not treated as corrupt.
    expect(files.renamed.filter((r) => r.to.includes('.corrupt-'))).toEqual([]);
  });

  it('writes the migrated file at once, so the copy is made only once', () => {
    const saved = files.written.find((w) => /db\.json\.tmp$/.test(w.file));
    expect(saved, 'db.json.tmp written during load').toBeTruthy();
    expect(JSON.parse(saved.text).version).toBe(8);
    expect(JSON.parse(saved.text).progress).toEqual(OLD_DB.progress);
    expect(files.renamed.some((r) => /db\.json\.tmp$/.test(r.from) && /db\.json$/.test(r.to))).toBe(true);
  });

  it('loads the migrated state with progress untouched', () => {
    expect(store.db().version).toBe(8);
    expect(store.db().progress).toEqual(OLD_DB.progress);
    expect(store.getSettingsRecord().revision).toBe(0);
    expect(store.allActivity()).toEqual({});
    expect(store.db().passwordResets).toEqual({});
    expect(store.findUserById('u2').tokenVersion).toBe(0);
  });

  it('deleteUser takes the learner’s activity and reset links with it', () => {
    store.putActivity('u1', { v: 1, lastDay: '2026-09-20', backfilledAt: null, days: {}, misses: {}, missLog: [] });
    store.putActivity('u2', { v: 1, lastDay: null, backfilledAt: null, days: {}, misses: {}, missLog: [] });
    const link = (id, userId) => ({ id, userId, tokenHash: `hash-${id}`, createdAt: '2026-09-20T00:00:00.000Z', expiresAt: '2026-09-21T00:00:00.000Z', createdBy: 'admin-1', usedAt: null, revokedAt: null });
    store.putPasswordReset(link('pr_one', 'u1'));
    store.putPasswordReset(link('pr_two', 'u2'));
    expect(store.getActivity('u1')).not.toBeNull();

    expect(store.deleteUser('u1')).toBe(true);
    expect(store.getActivity('u1')).toBeNull();
    expect(store.getActivity('u2')).not.toBeNull();
    expect(store.getActivity('__proto__')).toBeNull();
    expect(store.getActivity('constructor')).toBeNull();
    expect(store.getPasswordReset('pr_one')).toBeNull();
    expect(store.passwordResetsForUser('u1')).toEqual([]);
    expect(store.getPasswordReset('pr_two')).toMatchObject({ userId: 'u2' });
    expect(store.findPasswordResetByTokenHash('hash-pr_two')).toMatchObject({ id: 'pr_two' });
  });

  it('deleteUser takes the learner’s test-out and placement log with it (Phase 5)', () => {
    const log = (id) => ({ records: [{ id, kind: 'test-out', stageIds: ['s1'], status: 'failed' }], cooldownClearedAt: {} });
    store.insertUser({ id: 'u8', email: 'h@example.com', username: 'hal', passwordHash: 'hash' });
    store.putAssessmentLog('u8', log('as_8'));
    store.putAssessmentLog('u9', log('as_9'));
    expect(store.deleteUser('u8')).toBe(true);
    expect(store.getAssessmentLog('u8')).toBeNull();
    expect(store.getAssessmentLog('u9')).toMatchObject({ records: [{ id: 'as_9' }] });
  });

  it('deleteUser takes the learner’s open Practice session with it', () => {
    const session = (id) => ({ id, createdAt: '2026-09-27T00:00:00.000Z', items: [], answered: {}, bonusPaid: false });
    store.insertUser({ id: 'u7', email: 'g@example.com', username: 'gus', passwordHash: 'hash' });
    store.putReviewSession('u7', session('rs-7'));
    store.putReviewSession('u9', session('rs-9'));
    expect(store.getReviewSession('u7')).toMatchObject({ id: 'rs-7' });
    expect(store.deleteUser('u7')).toBe(true);
    expect(store.getReviewSession('u7')).toBeNull();
    expect(store.getReviewSession('u9')).toMatchObject({ id: 'rs-9' });
    expect(store.getReviewSession('__proto__')).toBeNull();
    expect(store.deleteReviewSession('u9')).toBe(true);
    expect(store.deleteReviewSession('u9')).toBe(false);
  });
});

describe('version 5: teaching cards, Practice sessions, the review schedule', () => {
  it('adds conceptCards and reviewSessions, keeping stored ones and repairing nonsense', () => {
    const next = store.migrateState(clone(OLD_DB));
    expect(next.conceptCards).toEqual({});
    expect(next.reviewSessions).toEqual({});
    // Progress is carried over exactly: `review` appears only on read.
    expect(JSON.stringify(next.progress)).toBe(JSON.stringify(OLD_DB.progress));
    const cards = { 'variables-let': { key: 'variables-let', hidden: true } };
    const sessions = { u1: { id: 'rs-1', items: [] } };
    const kept = store.migrateState({ conceptCards: cards, reviewSessions: sessions });
    expect(kept.conceptCards).toEqual(cards);
    expect(kept.reviewSessions).toEqual(sessions);
    expect(store.migrateState({ conceptCards: [1], reviewSessions: 'x' })).toMatchObject({ conceptCards: {}, reviewSessions: {} });
  });

  it('keeps feedback overrides on built-in questions as they were stored', () => {
    const overrides = {
      stages: {},
      languages: {},
      units: {},
      challenges: { q1: { optionFeedback: ['', 'Not quite'], feedbackBasis: '["a","b"]' }, q2: { hidden: true } }
    };
    expect(store.migrateState({ contentOverrides: clone(overrides) }).contentOverrides).toEqual(overrides);
  });

  it('stores teaching cards by key (any key, own properties only) and keeps them when a learner is deleted', () => {
    store.putConceptCard({ key: 'concept-a-0000', concept: { id: 'concept-a-0000' }, anchor: { kind: 'lesson', challengeId: 'q1' } });
    store.putConceptCard({ key: '__proto__', hidden: true, anchor: { kind: 'lesson', challengeId: 'q2' } });
    const first = store.getConceptCard('concept-a-0000');
    expect(first).toMatchObject({ key: 'concept-a-0000', createdAt: expect.any(String), updatedAt: expect.any(String) });
    expect(store.getConceptCard('__proto__')).toMatchObject({ hidden: true });
    expect(store.getConceptCard('constructor')).toBeNull();
    expect(({}).hidden).toBeUndefined();
    // A replacement keeps the creation time.
    const again = store.putConceptCard({ key: 'concept-a-0000', concept: { id: 'concept-a-0000-r1' }, anchor: first.anchor });
    expect(again.createdAt).toBe(first.createdAt);
    expect(store.allConceptCards().map((c) => c.key).sort()).toEqual(['__proto__', 'concept-a-0000']);
    expect(store.deleteConceptCard('__proto__')).toBe(true);
    expect(store.deleteConceptCard('__proto__')).toBe(false);
    expect(store.deleteConceptCard('concept-a-0000')).toBe(true);
  });

  it('fills review on read without rewriting the stored row', () => {
    // A row written before version 5 (no `review`).
    store.setProgress('u8', clone(OLD_DB.progress.u1));
    const before = JSON.stringify(store.db().progress.u8);
    const row = store.getProgress('u8');
    expect(row.review).toEqual({});
    row.review.c1 = { box: 2, due: '2026-10-01' };
    expect(JSON.stringify(store.db().progress.u8)).toBe(before);
    expect(store.getProgress('u8').review).toEqual({});
  });
});

describe('version 6: test-outs, placements and the first-run setup', () => {
  it('adds assessments and users[].onboarding, leaving progress exactly as it was', () => {
    const v5 = { ...clone(OLD_DB), version: 5, conceptCards: {}, reviewSessions: {} };
    const next = store.migrateState(clone(v5));
    expect(next.version).toBe(store.SCHEMA_VERSION);
    expect(next.assessments).toEqual({});
    expect(next.users.map((u) => u.onboarding)).toEqual([null, null]);
    // No progress row is rewritten: `testedOut` and `seenConcepts` appear only on read.
    expect(JSON.stringify(next.progress)).toBe(JSON.stringify(OLD_DB.progress));
  });

  it('keeps stored assessments and onboarding, and repairs nonsense', () => {
    const logs = { u1: { records: [{ id: 'as_1' }], cooldownClearedAt: {} } };
    const kept = store.migrateState({
      assessments: logs,
      users: [
        { id: 'u1', onboarding: { completedAt: '2026-09-28T10:00:00.000Z', dismissedAt: null } },
        { id: 'u2', onboarding: { completedAt: null, dismissedAt: '2026-09-28T11:00:00.000Z' } },
        { id: 'u3', onboarding: { completedAt: 4 } },
        { id: 'u4', onboarding: 'done' },
        { id: 'u5', onboarding: [1] }
      ]
    });
    expect(kept.assessments).toEqual(logs);
    expect(kept.users.map((u) => u.onboarding)).toEqual([
      { completedAt: '2026-09-28T10:00:00.000Z', dismissedAt: null },
      { completedAt: null, dismissedAt: '2026-09-28T11:00:00.000Z' },
      null,
      null,
      null
    ]);
    expect(store.migrateState({ assessments: [1] }).assessments).toEqual({});
    expect(store.migrateState({ assessments: 'x' }).assessments).toEqual({});
  });

  it('is idempotent', () => {
    const once = store.migrateState({ ...clone(OLD_DB), users: [{ id: 'u1', onboarding: { completedAt: '2026-09-28T10:00:00.000Z' } }] });
    expect(store.migrateState(clone(once))).toEqual(once);
  });

  it('fills testedOut and seenConcepts on read without rewriting the stored row', () => {
    store.setProgress('u10', clone(OLD_DB.progress.u1));
    const before = JSON.stringify(store.db().progress.u10);
    const row = store.getProgress('u10');
    expect(row.testedOut).toEqual({});
    expect(row.seenConcepts).toEqual([]);
    row.testedOut['stage-1'] = { clears: true };
    row.seenConcepts.push('x');
    expect(JSON.stringify(store.db().progress.u10)).toBe(before);
    expect(store.getProgress('u10').testedOut).toEqual({});
    expect(store.getProgress('u10').seenConcepts).toEqual([]);
    // A stored list is kept, minus anything that is not an id.
    store.setProgress('u10', { ...clone(OLD_DB.progress.u1), seenConcepts: ['a', 4, 'b'], testedOut: { 'stage-2': { clears: false } } });
    expect(store.getProgress('u10').seenConcepts).toEqual(['a', 'b']);
    expect(store.getProgress('u10').testedOut).toEqual({ 'stage-2': { clears: false } });
  });

  it('stores a learner’s assessment log safely for any id, and deleteUser takes it with them', () => {
    store.insertUser({ id: 'u11', email: 'k@example.com', username: 'kay', passwordHash: 'hash' });
    const entry = { records: [], cooldownClearedAt: { '*': '2026-09-28T10:00:00.000Z' } };
    store.putAssessmentLog('u11', entry);
    store.putAssessmentLog('u12', entry);
    store.putAssessmentLog('__proto__', entry);
    expect(store.getAssessmentLog('u11')).toEqual(entry);
    expect(store.getAssessmentLog('constructor')).toBeNull();
    expect(Object.getPrototypeOf(store.allAssessmentLogs())).toBe(Object.prototype);
    expect(store.deleteUser('u11')).toBe(true);
    expect(store.getAssessmentLog('u11')).toBeNull();
    expect(store.getAssessmentLog('u12')).toEqual(entry);
    expect(store.deleteAssessmentsForUser('__proto__')).toBe(true);
    expect(store.deleteAssessmentsForUser('__proto__')).toBe(false);
  });
});

describe('version 4: units and preferences', () => {
  it('adds contentOverrides.units, keeping a stored grouping and repairing nonsense', () => {
    expect(store.migrateState(clone(OLD_DB)).contentOverrides.units).toEqual({});
    const grouping = { 'stage-3': { units: [{ id: 'stage-3:m1', name: 'Warm-up', challengeIds: ['stage-3-a01'] }], nextSeq: 2, updatedAt: 'x' } };
    const kept = store.migrateState({ contentOverrides: { stages: {}, challenges: {}, languages: {}, units: grouping } });
    expect(kept.contentOverrides.units).toEqual(grouping);
    expect(store.migrateState({ contentOverrides: { units: [1, 2] } }).contentOverrides.units).toEqual({});
  });

  it('normalizes preferences: only a boolean is a sound choice, only learn/practice a mode', () => {
    const next = store.migrateState({
      users: [
        { id: 'u1', preferences: { soundOn: false, learningMode: 'learn' } },
        { id: 'u2', preferences: { soundOn: 'yes', learningMode: 'fast' } }
      ]
    });
    expect(next.users[0].preferences).toMatchObject({ soundOn: false, learningMode: 'learn' });
    expect(next.users[1].preferences).toMatchObject({ soundOn: null, learningMode: null });
  });

  it('fills unitsCompleted on read without rewriting the stored row', () => {
    const before = JSON.stringify(store.db().progress.u2);
    const row = store.getProgress('u2');
    expect(row.unitsCompleted).toEqual({});
    // A fresh object: writing into it cannot reach the stored row.
    row.unitsCompleted['stage-1:a1'] = { completedAt: 'x', perfect: true, bonusXp: 25 };
    expect(JSON.stringify(store.db().progress.u2)).toBe(before);
    expect(store.getProgress('u2').unitsCompleted).toEqual({});
  });

  it('stores, reads and drops a stage grouping, safely for any key', () => {
    const record = { units: [{ id: 'stage-3:m1', name: 'A', challengeIds: ['x'] }], nextSeq: 2, updatedAt: '2026-09-27T00:00:00.000Z' };
    store.setUnitOverride('stage-3', record);
    expect(store.getUnitOverride('stage-3')).toEqual(record);
    expect(store.getUnitOverride('constructor')).toBeNull();

    store.setUnitOverride('__proto__', record);
    expect(Object.hasOwn(store.getContentOverrides().units, '__proto__')).toBe(true);
    expect(Object.getPrototypeOf(store.getContentOverrides().units)).toBe(Object.prototype);

    store.setUnitOverride('stage-3', null);
    store.setUnitOverride('__proto__', null);
    expect(store.getUnitOverride('stage-3')).toBeNull();
    expect(Object.keys(store.getContentOverrides().units)).toEqual([]);
  });
});

describe('version 7: the weekly league', () => {
  it('adds leagues, leaving progress exactly as it was', () => {
    const v6 = { ...clone(OLD_DB), version: 6, conceptCards: {}, reviewSessions: {}, assessments: {} };
    const next = store.migrateState(clone(v6));
    expect(next.version).toBe(8);
    expect(next.leagues).toEqual({ members: {}, weeks: {} });
    // No progress row is rewritten: `everSolved` appears only on read.
    expect(JSON.stringify(next.progress)).toBe(JSON.stringify(OLD_DB.progress));
  });

  it('keeps stored weeks and members, and repairs nonsense', () => {
    const leagues = {
      members: { u1: { tierId: 'silver', since: '2026-09-21T00:00:00.000Z' } },
      weeks: { '2026-09-21': { id: '2026-09-21', startDay: '2026-09-21', endDay: '2026-09-27', status: 'open', joinedAt: { u1: '2026-09-21T10:00:00.000Z' } } }
    };
    expect(store.migrateState({ leagues: clone(leagues) }).leagues).toEqual(leagues);
    expect(store.migrateState({ leagues: [1] }).leagues).toEqual({ members: {}, weeks: {} });
    expect(store.migrateState({ leagues: { members: 'x', weeks: [2] } }).leagues).toEqual({ members: {}, weeks: {} });
  });

  it('is idempotent', () => {
    const once = store.migrateState({ ...clone(OLD_DB), leagues: { members: { u1: { tierId: 'gold' } }, weeks: {} } });
    expect(store.migrateState(clone(once))).toEqual(once);
  });

  it('reads everSolved as the solves of a row that has none, without rewriting the row', () => {
    store.setProgress('u20', clone(OLD_DB.progress.u1));
    const before = JSON.stringify(store.db().progress.u20);
    const row = store.getProgress('u20');
    expect(row.everSolved).toEqual(['c1', 'c2']);
    row.everSolved.push('x');
    expect(JSON.stringify(store.db().progress.u20)).toBe(before);
    // A stored list is kept and never reads as less than what is solved now.
    store.setProgress('u20', { ...clone(OLD_DB.progress.u1), completedChallenges: ['c2', 'c3'], everSolved: ['c1', 'c2', 7] });
    expect(store.getProgress('u20').everSolved).toEqual(['c1', 'c2', 'c3']);
  });

  it('stores weeks and members safely for any key, and deleteUser forgets the learner in every week', () => {
    store.insertUser({ id: 'u21', email: 'l@example.com', username: 'lin', passwordHash: 'hash' });
    const week = {
      id: '2026-09-21',
      startDay: '2026-09-21',
      endDay: '2026-09-27',
      status: 'closed',
      joinedAt: { u21: '2026-09-21T10:00:00.000Z', u22: '2026-09-22T10:00:00.000Z' },
      baseline: { u21: 40 },
      excluded: {},
      groups: { 'bronze-1': { tierId: 'bronze', memberIds: ['u21', 'u22'] } },
      results: [
        { userId: 'u22', username: 'max', xp: 90, rank: 1 },
        { userId: 'u21', username: 'lin', xp: 60, rank: 2 }
      ]
    };
    store.putLeagueWeek(week);
    store.putLeagueWeek({ id: '2026-09-14', startDay: '2026-09-14', endDay: '2026-09-20', status: 'closed' });
    store.putLeagueWeek({ id: '__proto__', startDay: '2026-08-31', endDay: '2026-09-06', status: 'closed' });
    expect(store.getLeagueWeek('2026-09-21')).toEqual(week);
    expect(store.getLeagueWeek('constructor')).toBeNull();
    expect(store.getLeagueWeek('__proto__')).toMatchObject({ startDay: '2026-08-31' });
    expect(store.allLeagueWeeks().map((w) => w.id)).toEqual(['__proto__', '2026-09-14', '2026-09-21']);
    expect(store.deleteLeagueWeek('__proto__')).toBe(true);
    expect(store.deleteLeagueWeek('__proto__')).toBe(false);

    expect(store.getLeagueMember('u21')).toBeNull();
    expect(store.setLeagueMember('u21', { tierId: 'silver', since: 'a' })).toEqual({ tierId: 'silver', since: 'a' });
    expect(store.setLeagueMember('u21', { tierId: 'gold' })).toEqual({ tierId: 'gold', since: 'a' });
    store.setLeagueMember('u22', { tierId: 'bronze' });

    expect(store.deleteUser('u21')).toBe(true);
    expect(store.getLeagueMember('u21')).toBeNull();
    expect(store.getLeagueMember('u22')).toEqual({ tierId: 'bronze' });
    const after = store.getLeagueWeek('2026-09-21');
    expect(after.joinedAt).toEqual({ u22: '2026-09-22T10:00:00.000Z' });
    expect(after.baseline).toEqual({});
    expect(after.groups['bronze-1'].memberIds).toEqual(['u22']);
    // The row stays (the others' ranks were worked out with it), nameless.
    expect(after.results).toEqual([
      { userId: 'u22', username: 'max', xp: 90, rank: 1 },
      { userId: null, username: null, xp: 60, rank: 2 }
    ]);
  });
});
