/**
 * The admin units editor's routes end to end - GET, PUT and DELETE
 * /api/admin/content/stages/:id/units - against the REAL content bank
 * (loadContent), the real shared unit rules (src/platform/server-lib.ts) and
 * the real server/units.js, with an in-memory db and the admin session
 * stubbed, as in admin-questions.test.mjs.
 */
import express from 'express';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../admin-auth.js', () => ({
  requireAdminAuth: (req, _res, next) => {
    req.admin = { id: 'admin-1', userId: 'admin' };
    next();
  },
  publicAdmin: (a) => a,
  updateAdminCredentials: async () => ({ ok: false, error: 'stub' })
}));

vi.mock('../excel.js', () => ({
  excelSettingsSummary: () => ({ configured: false }),
  testConnection: async () => ({ ok: false }),
  syncAllUsers: async () => ({ synced: 0, failed: 0 }),
  retryFailed: async () => ({ retried: 0, stillFailing: 0 })
}));

vi.mock('../db.js', () => {
  const EMPTY = () => ({
    users: [],
    progress: {},
    auditLog: [],
    contentOverrides: { stages: {}, challenges: {}, languages: {}, units: {} },
    customChallenges: {},
    conceptCards: {}
  });
  let state = EMPTY();
  return {
    reset: () => {
      state = EMPTY();
    },
    db: () => state,
    load: async () => state,
    persist: () => {},
    allUsers: () => state.users,
    allProgress: () => state.progress,
    getContentOverrides: () => state.contentOverrides,
    setChallengeOverride: (id, patch) => {
      state.contentOverrides.challenges[id] = { ...state.contentOverrides.challenges[id], ...patch };
      return state.contentOverrides.challenges[id];
    },
    getUnitOverride: (id) => (Object.hasOwn(state.contentOverrides.units, id) ? state.contentOverrides.units[id] : null),
    setUnitOverride: (id, record) => {
      if (record === null) delete state.contentOverrides.units[id];
      else state.contentOverrides.units[id] = record;
      return record;
    },
    allCustomChallenges: () => Object.values(state.customChallenges),
    getCustomChallenge: (id) => (typeof id === 'string' && Object.hasOwn(state.customChallenges, id) ? state.customChallenges[id] : null),
    allConceptCards: () => Object.values(state.conceptCards),
    getConceptCard: (key) => (typeof key === 'string' && Object.hasOwn(state.conceptCards, key) ? state.conceptCards[key] : null),
    putConceptCard: (record) => {
      const existing = state.conceptCards[record.key];
      const now = new Date().toISOString();
      state.conceptCards[record.key] = { ...record, createdAt: existing?.createdAt ?? now, updatedAt: now };
      return state.conceptCards[record.key];
    },
    deleteConceptCard: (key) => {
      if (!Object.hasOwn(state.conceptCards, key)) return false;
      delete state.conceptCards[key];
      return true;
    },
    appendAudit: (entry) => {
      const row = { id: `audit-${state.auditLog.length}`, at: new Date().toISOString(), ...entry };
      state.auditLog.push(row);
      return row;
    },
    getExcelSync: () => ({ rowIndexByUserId: {}, lastSyncedAtByUser: {}, lastFullSyncAt: null, failures: [] })
  };
});

import * as store from '../db.js';
import { createAdminRouter } from '../admin.js';
import { loadContent, allChallenges } from '../content.js';
import { createUnitsService } from '../units.js';
import * as lib from '../../src/platform/server-lib.ts';

/** A settings service over the defaults, whose unit rules a test can change. */
const settings = {
  units: lib.DEFAULT_SETTINGS.units,
  rev: 0,
  current() {
    return { ...lib.DEFAULT_SETTINGS, units: this.units };
  },
  revision() {
    return this.rev;
  }
};

const units = createUnitsService({ store, lib, settings });

let server;
let base;

beforeAll(async () => {
  await loadContent();
  const app = express()
    .use(express.json())
    .use('/api/admin', createAdminRouter({ learning: { lib, settings, units } }))
    .use('/api/bare-admin', createAdminRouter({}));
  await new Promise((resolve) => {
    server = app.listen(0, '127.0.0.1', resolve);
  });
  base = `http://127.0.0.1:${server.address().port}/api`;
}, 60_000);

afterAll(async () => {
  await new Promise((resolve) => server?.close(resolve));
});

beforeEach(() => {
  store.reset();
  settings.units = lib.DEFAULT_SETTINGS.units;
  settings.rev = 0;
});

const api = async (method, path, body) => {
  const res = await fetch(`${base}${path}`, {
    method,
    headers: body === undefined ? {} : { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  return { status: res.status, json: await res.json() };
};

const lessonsOf = (stageId) => allChallenges().filter((c) => c.stageId === stageId && !c.isStageTest).map((c) => c.id);
const testOf = (stageId) => allChallenges().find((c) => c.stageId === stageId && c.isStageTest).id;

describe('GET /content/stages/:id/units', () => {
  it('gives the default grouping of stage-3: four units of five, in authored order', async () => {
    const res = await api('GET', '/admin/content/stages/stage-3/units');
    expect(res.status).toBe(200);
    expect(res.json.source).toBe('default');
    expect(res.json.units.map((u) => u.id)).toEqual(['stage-3:a1', 'stage-3:a2', 'stage-3:b1', 'stage-3:b2']);
    expect(res.json.units.map((u) => u.size)).toEqual([5, 5, 5, 5]);
    expect(res.json.units.flatMap((u) => u.challengeIds)).toEqual(lessonsOf('stage-3'));
    expect(res.json.units[0]).toMatchObject({ name: 'Unit 1', estMinutes: expect.any(Number), xp: expect.any(Number) });
    expect(res.json.defaults).toEqual(res.json.units);
    expect(res.json.lessons).toHaveLength(20);
    expect(res.json.unassigned).toEqual([]);
  });

  it('404s an unknown stage and 503s without the units service', async () => {
    expect((await api('GET', '/admin/content/stages/stage-99/units')).status).toBe(404);
    expect((await api('GET', '/bare-admin/content/stages/stage-3/units')).status).toBe(503);
  });
});

describe('PUT /content/stages/:id/units', () => {
  const lessons = () => lessonsOf('stage-3');

  it('saves a regrouping, naming new units stage-3:m1, m2, ... and keeping given ids', async () => {
    const ids = lessons();
    const body = {
      units: [
        { id: 'stage-3:a1', name: 'Arrays first', challengeIds: ids.slice(0, 7) },
        { name: 'The middle', description: 'Maps and sets.', challengeIds: ids.slice(7, 14) },
        { name: 'The rest', challengeIds: ids.slice(14) }
      ]
    };
    const res = await api('PUT', '/admin/content/stages/stage-3/units', body);
    expect(res.status).toBe(200);
    expect(res.json.source).toBe('custom');
    expect(res.json.units.map((u) => u.id)).toEqual(['stage-3:a1', 'stage-3:m1', 'stage-3:m2']);
    expect(res.json.units[1]).toMatchObject({ name: 'The middle', description: 'Maps and sets.' });
    expect(store.getUnitOverride('stage-3')).toMatchObject({ nextSeq: 3 });
    expect(store.db().auditLog.at(-1)).toMatchObject({ action: 'content.units.update', target: 'stage-3', details: { stageId: 'stage-3', units: 3 } });

    // Learners get the new grouping.
    expect(units.unitsForStage('stage-3').map((u) => u.name)).toEqual(['Arrays first', 'The middle', 'The rest']);
    expect(units.unitFor(ids[8]).id).toBe('stage-3:m1');

    // Deleting a unit never frees its id: the next new unit is m3.
    const again = await api('PUT', '/admin/content/stages/stage-3/units', {
      units: [
        { id: 'stage-3:a1', name: 'Arrays first', challengeIds: ids.slice(0, 7) },
        { name: 'Everything else', challengeIds: ids.slice(7) }
      ]
    });
    expect(again.json.units.map((u) => u.id)).toEqual(['stage-3:a1', 'stage-3:m3']);
  });

  it('warns about a unit outside the size or time targets, without refusing it', async () => {
    const ids = lessons();
    const res = await api('PUT', '/admin/content/stages/stage-3/units', { units: [{ name: 'All of it', challengeIds: ids }] });
    expect(res.status).toBe(200);
    expect(res.json.warnings.map((w) => w.path)).toContain('units.0');
  });

  it('422s a foreign id, the stage test, a duplicate and a lesson left out - saving nothing', async () => {
    const ids = lessons();
    const cases = [
      { units: [{ name: 'A', challengeIds: [...ids, lessonsOf('stage-4')[0]] }], message: /another stage/ },
      { units: [{ name: 'A', challengeIds: [...ids, testOf('stage-3')] }], message: /stage test/ },
      { units: [{ name: 'A', challengeIds: ids }, { name: 'B', challengeIds: [ids[0]] }], message: /already in unit 1/ },
      { units: [{ name: 'A', challengeIds: ids.slice(1) }], message: /is not in any unit/ },
      { units: [{ name: '', challengeIds: ids }], message: /name/ },
      { units: [{ id: 'stage-4:a1', name: 'A', challengeIds: ids }], message: /stage-3:a1/ },
      { units: [{ name: 'A', challengeIds: ids }, { name: 'Empty', challengeIds: [] }], message: /at least one question/ },
      { units: 'nope', message: /list/ }
    ];
    for (const { units: body, message } of cases) {
      const res = await api('PUT', '/admin/content/stages/stage-3/units', { units: body });
      expect(res.status, JSON.stringify(body).slice(0, 80)).toBe(422);
      expect(res.json.issues.map((i) => i.message).join(' | ')).toMatch(message);
    }
    expect(store.getUnitOverride('stage-3')).toBeNull();
    expect(store.db().auditLog).toEqual([]);
  });

  it('includes hidden lessons: a hidden one must still be placed', async () => {
    const ids = lessons();
    store.setChallengeOverride(ids[0], { hidden: true });
    const view = await api('GET', '/admin/content/stages/stage-3/units');
    expect(view.json.lessons.find((l) => l.id === ids[0]).hidden).toBe(true);
    const missing = await api('PUT', '/admin/content/stages/stage-3/units', { units: [{ name: 'A', challengeIds: ids.slice(1) }] });
    expect(missing.status).toBe(422);
  });
});

describe('DELETE and the stage list', () => {
  it('reverts to the default grouping, and the stage list shows counts and the custom marker', async () => {
    const ids = lessonsOf('stage-3');
    await api('PUT', '/admin/content/stages/stage-3/units', { units: [{ name: 'One', challengeIds: ids.slice(0, 10) }, { name: 'Two', challengeIds: ids.slice(10) }] });

    let stages = (await api('GET', '/admin/content/stages')).json.stages;
    expect(stages.find((s) => s.id === 'stage-3')).toMatchObject({ unitCount: 2, unitsCustomized: true });
    expect(stages.find((s) => s.id === 'stage-4')).toMatchObject({ unitCount: 4, unitsCustomized: false });

    const reset = await api('DELETE', '/admin/content/stages/stage-3/units');
    expect(reset.status).toBe(200);
    expect(reset.json.source).toBe('default');
    expect(store.getUnitOverride('stage-3')).toBeNull();
    expect(store.db().auditLog.at(-1)).toMatchObject({ action: 'content.units.reset', target: 'stage-3' });

    stages = (await api('GET', '/admin/content/stages')).json.stages;
    expect(stages.find((s) => s.id === 'stage-3')).toMatchObject({ unitCount: 4, unitsCustomized: false });
  });
});

describe('units as learners get them (server/units.js)', () => {
  it('leaves a hidden lesson out, and its unit shrinks', () => {
    const ids = lessonsOf('stage-3');
    const before = units.unitsForStage('stage-3');
    expect(before[0].challengeIds).toHaveLength(5);
    store.setChallengeOverride(ids[0], { hidden: true });
    const after = units.unitsForStage('stage-3');
    // Only the hidden lesson's own unit changes: 4/5/5/5, not a re-balanced 5/4/5/5.
    expect(after[0].challengeIds).toEqual(ids.slice(1, 5));
    expect(after.map((u) => u.challengeIds.length)).toEqual([4, 5, 5, 5]);
    expect(after.slice(1)).toEqual(before.slice(1));
    expect(units.unitFor(ids[0])).toBeNull();
    expect(units.unitFor(ids[5]).id).toBe('stage-3:a2');
    // The default ids stay put.
    expect(after.map((u) => u.id)).toEqual(['stage-3:a1', 'stage-3:a2', 'stage-3:b1', 'stage-3:b2']);
  });

  it('with a whole default unit hidden, numbers the rest without a gap', () => {
    const ids = lessonsOf('stage-3');
    for (const id of ids.slice(0, 5)) store.setChallengeOverride(id, { hidden: true });
    const after = units.unitsForStage('stage-3');
    expect(after.map((u) => u.id)).toEqual(['stage-3:a2', 'stage-3:b1', 'stage-3:b2']);
    expect(after.map((u) => u.name)).toEqual(['Unit 1', 'Unit 2', 'Unit 3']);
    expect(after[0].challengeIds).toEqual(ids.slice(5, 10));
  });

  it('gives the admin editor the same default grouping learners get, hidden lessons shown in place', async () => {
    const ids = lessonsOf('stage-3');
    store.setChallengeOverride(ids[0], { hidden: true });
    const view = (await api('GET', '/admin/content/stages/stage-3/units')).json;
    const learner = units.unitsForStage('stage-3');
    expect(view.defaults.map((u) => u.id)).toEqual(learner.map((u) => u.id));
    // The editor lists the hidden lesson in its unit; learners get the rest of it.
    expect(view.defaults.map((u) => u.challengeIds.filter((id) => id !== ids[0]))).toEqual(learner.map((u) => u.challengeIds));
  });

  it('attaches units to every stage of the learner view, the test in none', () => {
    const view = units.attachUnits({ stages: [{ id: 'stage-3' }, { id: 'stage-c1' }], challenges: [] });
    expect(view.stages[0].units).toHaveLength(4);
    expect(view.stages[1].units.map((u) => u.challengeIds.length)).toEqual([5, 5, 5]);
    expect(view.stages[1].units.flatMap((u) => u.challengeIds)).not.toContain(testOf('stage-c1'));
  });

  it('follows the unit settings', () => {
    settings.units = { ...lib.DEFAULT_SETTINGS.units, targetSize: 10, maxSize: 12 };
    settings.rev = 1;
    expect(units.unitsForStage('stage-3').map((u) => u.challengeIds.length)).toEqual([10, 10]);
  });
});
