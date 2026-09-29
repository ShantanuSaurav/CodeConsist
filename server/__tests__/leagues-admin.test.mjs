/**
 * The administrator's side of Phase 6: the weekly league's admin routes
 * (server/leagues-admin.js, mounted inside createAdminRouter) - the week
 * list, one week's standings, Close week now and Reset week XP (each
 * confirmed by the week id, 409 once closed), exclusions, Move tier (tiers
 * only), the audit trail of each, and the league block of a learner's
 * learning view.
 *
 * Real server/db.js (node:fs/promises stubbed), the real admin router and
 * learning services; admin-auth mocked as in admin-learning.test.mjs. The
 * weeks here are the real current week (the routes close past weeks on
 * every read, as the learner routes do).
 */
import express from 'express';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('node:fs/promises', () => ({
  readFile: async () => '{}',
  writeFile: async () => {},
  rename: async () => {},
  mkdir: async () => {}
}));

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

vi.mock('../content.js', async (importOriginal) => {
  const actual = await importOriginal();
  const { CHALLENGES } = await import('./learning-fixture.mjs');
  const all = Object.values(CHALLENGES);
  const snapshot = {
    stages: [{ id: 'stage-1', index: '01', name: 'Stage one', description: '', language: 'javascript' }],
    challenges: all,
    languageTracks: [{ id: 'core', label: 'Core', stageIds: ['stage-1'] }]
  };
  return {
    ...actual,
    contentSnapshot: () => snapshot,
    allChallenges: () => all,
    getChallenge: (id) => (typeof id === 'string' && Object.hasOwn(CHALLENGES, id) ? CHALLENGES[id] : null)
  };
});

import * as store from '../db.js';
import { createAdminRouter } from '../admin.js';
import { createLearningDeps, lib, resetStore } from './learning-fixture.mjs';

let server;
let base;
let bare;
let learningDeps;

async function listen(app) {
  return new Promise((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
}

beforeAll(async () => {
  await store.load();
  learningDeps = createLearningDeps(store);
  server = await listen(express().use(express.json()).use('/api/admin', createAdminRouter({ learning: learningDeps })));
  base = `http://127.0.0.1:${server.address().port}/api/admin`;
  // The same admin router before boot: no learning services.
  bare = await listen(express().use(express.json()).use('/api/admin', createAdminRouter({})));
});

afterAll(async () => {
  await new Promise((resolve) => server.close(resolve));
  await new Promise((resolve) => bare.close(resolve));
});

async function call(method, path, body, root = base) {
  const res = await fetch(root + path, {
    method,
    headers: body !== undefined ? { 'content-type': 'application/json' } : {},
    body: body !== undefined ? JSON.stringify(body) : undefined
  });
  return { status: res.status, json: await res.json() };
}

const leagues = () => learningDeps.leagues;
const user = (id) => store.findUserById(id);
const today = () => lib.dayKeyIn('UTC', new Date());
const thisWeek = () => lib.weekFor(today(), 1, store.allLeagueWeeks());
const audits = (action) => store.listAudit({ limit: 100 }).filter((row) => row.action === action);
const setRules = (patch) => {
  const service = learningDeps.settings;
  const result = service.update({ revision: service.revision(), patch });
  expect(result.ok, JSON.stringify(result.issues ?? result.error)).toBe(true);
};

/** League XP on today's row (what the pipelines leave behind), and the learner joins the week. */
function play(entries, day = today()) {
  for (const [id, xp] of entries) {
    if (!store.findUserById(id)) store.insertUser({ id, email: `${id}@example.com`, username: id, passwordHash: 'x', identities: {} });
    const log = store.getActivity(id) ?? { v: 1, lastDay: null, backfilledAt: '2026-01-01T00:00:00.000Z', days: {}, misses: {}, missLog: [] };
    const days = { ...log.days, [day]: { ...lib.emptyDay(), xp, lessons: 1, leagueXp: xp } };
    store.putActivity(id, { ...log, days, lastDay: log.lastDay && log.lastDay > day ? log.lastDay : day });
    leagues().noteLeagueXp(user(id), day);
  }
}

beforeEach(() => {
  resetStore(store, ['u1', 'u2', 'u3']);
  for (const id of ['u1', 'u2', 'u3']) {
    store.updateUser(id, { preferences: { ...store.normalizePreferences(null), timeZone: 'UTC', timeZoneSetAt: '2026-01-01T00:00:00.000Z' } });
  }
});

describe('without the learning services', () => {
  it('answers 503 on every league route', async () => {
    const id = thisWeek().id;
    const calls = [
      ['GET', '/leagues/weeks'],
      ['GET', `/leagues/weeks/${id}`],
      ['POST', `/leagues/weeks/${id}/close`, { confirm: id }],
      ['POST', `/leagues/weeks/${id}/reset`, { confirm: id }],
      ['POST', `/leagues/weeks/${id}/exclude`, { userId: 'u1', excluded: true }],
      ['PATCH', '/leagues/members/u1', { tierId: 'silver' }]
    ];
    for (const [method, path, body] of calls) {
      expect((await call(method, path, body, `http://127.0.0.1:${bare.address().port}/api/admin`)).status, `${method} ${path}`).toBe(503);
    }
  });
});

describe('GET /leagues/weeks', () => {
  it('names the current week before anyone has played it', async () => {
    const { status, json } = await call('GET', '/leagues/weeks');
    expect(status).toBe(200);
    expect(json.settings).toMatchObject({ enabled: true, tiersEnabled: false, weekStartsOn: 1, boardSize: 50 });
    expect(json.settings.tiers.map((t) => t.id)).toEqual(['bronze', 'silver', 'gold', 'platinum', 'diamond']);
    expect(json.current).toEqual({ id: thisWeek().id, startDay: thisWeek().startDay, endDay: thisWeek().endDay, stored: false, status: 'open' });
    expect(json.weeks).toEqual([]);
  });

  it('lists stored weeks newest first with participants and total XP', async () => {
    // A closed week from the past, as the timer leaves it.
    store.putLeagueWeek({
      id: '2026-08-03',
      startDay: '2026-08-03',
      endDay: '2026-08-09',
      status: 'closed',
      rules: { tiersEnabled: false, tiers: [] },
      closedAt: '2026-08-10T12:00:00.000Z',
      closedBy: 'auto',
      results: [
        { userId: 'u1', username: 'u1', xp: 70, rank: 1, outcome: 'single' },
        { userId: 'u2', username: 'u2', xp: 30, rank: 2, outcome: 'single' }
      ]
    });
    play([['u1', 40], ['u2', 25]]);
    const { json } = await call('GET', '/leagues/weeks');
    expect(json.current).toMatchObject({ id: thisWeek().id, stored: true, status: 'open' });
    expect(json.weeks.map((w) => [w.id, w.status, w.participants, w.totalXp, w.closedBy])).toEqual([
      [thisWeek().id, 'open', 2, 65, null],
      ['2026-08-03', 'closed', 2, 100, 'auto']
    ]);
    expect(json.weeks[0].finalizeAt).toEqual(expect.any(String));
    expect((await call('GET', '/leagues/weeks?limit=1')).json.weeks).toHaveLength(1);
  });
});

describe('GET /leagues/weeks/:id', () => {
  it('shows every learner with raw XP, baseline, exclusion, time zone and rank', async () => {
    store.updateUser('u2', { preferences: { ...store.normalizePreferences(null), timeZone: 'Asia/Kolkata', timeZoneSetAt: '2026-01-01T00:00:00.000Z' } });
    play([['u1', 40], ['u3', 60]]);
    const { status, json } = await call('GET', `/leagues/weeks/${thisWeek().id}`);
    expect(status).toBe(200);
    expect(json.week).toMatchObject({ id: thisWeek().id, status: 'open', closedAt: null, resets: [] });
    expect(json).toMatchObject({ participants: 2, final: false, groups: [], results: [] });
    expect(json.rows.map((r) => [r.username, r.rank, r.xp, r.rawXp, r.baseline, r.excluded, r.timeZone, r.zone])).toEqual([
      ['u3', 1, 60, 60, 0, null, 'UTC', null],
      ['u1', 2, 40, 40, 0, null, 'UTC', null]
    ]);
    expect(json.rows[0].joinedAt).toEqual(expect.any(String));
  });

  it('answers 404 for a week nobody played', async () => {
    expect((await call('GET', '/leagues/weeks/2020-01-06')).status).toBe(404);
    expect((await call('GET', '/leagues/weeks/__proto__')).status).toBe(404);
  });

  it('with tiers on: the groups, tier names and who would move up or down', async () => {
    setRules({ league: { tiers: { enabled: true, groupSize: 5, promoteCount: 1, demoteCount: 1, minXpToPromote: 1 } } });
    store.setLeagueMember('u1', { tierId: 'silver', since: '2026-09-01T00:00:00.000Z' });
    play([['u1', 90]]);
    play([['u2', 50], ['u3', 20], ['u4', 10]]);
    const { json } = await call('GET', `/leagues/weeks/${thisWeek().id}`);
    expect(json.groups).toEqual([
      { id: 'silver-1', tierId: 'silver', tierName: 'Silver', members: 1 },
      { id: 'bronze-1', tierId: 'bronze', tierName: 'Bronze', members: 3 }
    ]);
    const row = (name) => json.rows.find((r) => r.username === name);
    expect(row('u1')).toMatchObject({ groupId: 'silver-1', tierName: 'Silver', zone: 'up', memberTierId: 'silver' });
    // Bronze of three: the top moves up; the lowest tier never moves down.
    expect(row('u2')).toMatchObject({ groupId: 'bronze-1', tierName: 'Bronze', zone: 'up' });
    expect(row('u3').zone).toBeNull();
    expect(row('u4').zone).toBeNull();
  });
});

describe('POST /leagues/weeks/:id/close', () => {
  it('needs the week id typed again, then closes it with results - audited', async () => {
    play([['u1', 40], ['u2', 60]]);
    const id = thisWeek().id;
    for (const body of [undefined, {}, { confirm: 'yes' }, { confirm: '2020-01-06' }]) {
      const res = await call('POST', `/leagues/weeks/${id}/close`, body);
      expect(res.status).toBe(400);
      expect(res.json.error).toContain(id);
    }
    expect(store.getLeagueWeek(id).status).toBe('open');
    expect(audits('league.week.close')).toEqual([]);

    const res = await call('POST', `/leagues/weeks/${id}/close`, { confirm: id });
    expect(res.status).toBe(200);
    expect(res.json.week).toMatchObject({ id, status: 'closed', closedBy: 'admin-1' });
    expect(res.json.results.map((r) => [r.username, r.rank, r.xp, r.outcome])).toEqual([
      ['u2', 1, 60, 'single'],
      ['u1', 2, 40, 'single']
    ]);
    expect(store.getLeagueWeek(id)).toMatchObject({ status: 'closed', closedBy: 'admin-1' });
    expect(audits('league.week.close')).toEqual([
      expect.objectContaining({ adminId: 'admin-1', target: id, details: { weekId: id, participants: 2 } })
    ]);

    // Closed is closed: 409, and nothing more is written or audited.
    expect((await call('POST', `/leagues/weeks/${id}/close`, { confirm: id })).status).toBe(409);
    expect(audits('league.week.close')).toHaveLength(1);
    expect((await call('GET', '/leagues/weeks')).json.weeks[0]).toMatchObject({ id, status: 'closed', participants: 2, totalXp: 100 });
  });

  it('answers 404 for an unknown week', async () => {
    expect((await call('POST', '/leagues/weeks/2020-01-06/close', { confirm: '2020-01-06' })).status).toBe(404);
  });
});

describe('POST /leagues/weeks/:id/reset', () => {
  it('needs the week id, zeroes the board with a baseline, and is audited', async () => {
    play([['u1', 40], ['u2', 60]]);
    const id = thisWeek().id;
    expect((await call('POST', `/leagues/weeks/${id}/reset`, { confirm: id.slice(1) })).status).toBe(400);
    expect(store.getLeagueWeek(id).baseline).toEqual({});

    const res = await call('POST', `/leagues/weeks/${id}/reset`, { confirm: id });
    expect(res.status).toBe(200);
    expect(res.json).toMatchObject({ affected: 2, participants: 0 });
    expect(res.json.week.resets).toEqual([{ at: expect.any(String), by: 'admin-1' }]);
    expect(res.json.rows.find((r) => r.userId === 'u2')).toMatchObject({ rawXp: 60, baseline: 60, xp: 0, rank: null });
    // The activity log itself is left alone.
    expect(store.getActivity('u2').days[today()].leagueXp).toBe(60);
    expect(audits('league.week.reset')).toEqual([expect.objectContaining({ target: id, details: { weekId: id, affected: 2 } })]);

    await call('POST', `/leagues/weeks/${id}/close`, { confirm: id });
    expect((await call('POST', `/leagues/weeks/${id}/reset`, { confirm: id })).status).toBe(409);
    expect(audits('league.week.reset')).toHaveLength(1);
  });

  it('closes a week past its final time first: its results are kept, and the reset is 409', async () => {
    // Still open because the timer has not run yet since its results became final.
    const id = '2026-09-14';
    store.putLeagueWeek({ id, startDay: id, endDay: '2026-09-20', status: 'open', rules: { tiersEnabled: false, tiers: [] }, joinedAt: {}, results: [] });
    play([['u1', 40], ['u2', 60]], '2026-09-16');
    const res = await call('POST', `/leagues/weeks/${id}/reset`, { confirm: id });
    expect(res.status).toBe(409);
    expect(audits('league.week.reset')).toEqual([]);
    const week = store.getLeagueWeek(id);
    expect(week).toMatchObject({ status: 'closed', closedBy: 'auto', baseline: {} });
    expect(week.results.map((r) => [r.userId, r.xp])).toEqual([['u2', 60], ['u1', 40]]);
    expect((await call('POST', `/leagues/weeks/${id}/exclude`, { userId: 'u1', excluded: true })).status).toBe(409);
    expect((await call('GET', `/leagues/weeks/${id}`)).json.week).toMatchObject({ status: 'closed', closedBy: 'auto' });
  });
});

describe('POST /leagues/weeks/:id/exclude', () => {
  it('refuses a malformed body', async () => {
    play([['u1', 40]]);
    const id = thisWeek().id;
    const cases = [{}, { userId: 'u1' }, { userId: 'u1', excluded: 'yes' }, { userId: 42, excluded: true }, { userId: 'u1', excluded: true, reason: 7 }, { userId: 'u1', excluded: true, reason: 'x'.repeat(201) }];
    for (const body of cases) expect((await call('POST', `/leagues/weeks/${id}/exclude`, body)).status, JSON.stringify(body)).toBe(400);
    expect((await call('POST', `/leagues/weeks/${id}/exclude`, { userId: 'nobody', excluded: true })).status).toBe(404);
    expect((await call('POST', '/leagues/weeks/2020-01-06/exclude', { userId: 'u1', excluded: true })).status).toBe(404);
    expect(store.getLeagueWeek(id).excluded).toEqual({});
    expect(store.listAudit({ limit: 100 })).toEqual([]);
  });

  it('takes a learner off the board and back on, audited each time', async () => {
    play([['u1', 40], ['u2', 60]]);
    const id = thisWeek().id;
    const off = await call('POST', `/leagues/weeks/${id}/exclude`, { userId: 'u2', excluded: true, reason: '  Shared account  ' });
    expect(off.status).toBe(200);
    expect(off.json.rows.find((r) => r.userId === 'u2')).toMatchObject({ rank: null, excluded: { by: 'admin-1', reason: 'Shared account' } });
    expect(off.json.rows.find((r) => r.userId === 'u1')).toMatchObject({ rank: 1 });
    expect(leagues().view(user('u1')).rows.map((r) => r.username)).toEqual(['u1']);
    expect(audits('league.member.exclude')).toEqual([
      expect.objectContaining({ target: 'u2', details: { weekId: id, userId: 'u2', username: 'u2', wasExcluded: false, reason: 'Shared account' } })
    ]);

    const on = await call('POST', `/leagues/weeks/${id}/exclude`, { userId: 'u2', excluded: false });
    expect(on.json.rows.find((r) => r.userId === 'u2')).toMatchObject({ rank: 1, excluded: null });
    expect(audits('league.member.reinstate')).toEqual([
      expect.objectContaining({ target: 'u2', details: { weekId: id, userId: 'u2', username: 'u2', wasExcluded: true } })
    ]);

    await call('POST', `/leagues/weeks/${id}/close`, { confirm: id });
    expect((await call('POST', `/leagues/weeks/${id}/exclude`, { userId: 'u2', excluded: true })).status).toBe(409);
  });
});

describe('PATCH /leagues/members/:userId', () => {
  it('is refused while tiers are off', async () => {
    const res = await call('PATCH', '/leagues/members/u1', { tierId: 'silver' });
    expect(res.status).toBe(409);
    expect(store.getLeagueMember('u1') ?? null).toBeNull();
    expect(audits('league.member.tier')).toEqual([]);
  });

  it('moves a learner to a tier from the next week - audited with before and after', async () => {
    setRules({ league: { tiers: { enabled: true } } });
    expect((await call('PATCH', '/leagues/members/u1', {})).status).toBe(400);
    expect((await call('PATCH', '/leagues/members/u1', { tierId: 'mythic' })).status).toBe(400);
    expect((await call('PATCH', '/leagues/members/nobody', { tierId: 'gold' })).status).toBe(404);

    const res = await call('PATCH', '/leagues/members/u1', { tierId: 'gold' });
    expect(res.status).toBe(200);
    expect(res.json).toMatchObject({ member: { userId: 'u1', tierId: 'gold', since: expect.any(String) }, before: null });
    expect(store.getLeagueMember('u1')).toMatchObject({ tierId: 'gold' });
    await call('PATCH', '/leagues/members/u1', { tierId: 'silver' });
    expect(audits('league.member.tier').map((row) => row.details)).toEqual([
      { userId: 'u1', username: 'u1', from: 'gold', to: 'silver' },
      { userId: 'u1', username: 'u1', from: null, to: 'gold' }
    ]);
  });
});

describe('GET /users/:id/learning', () => {
  it("adds the learner's tier and their place this week", async () => {
    play([['u1', 40], ['u2', 60]]);
    const { status, json } = await call('GET', '/users/u1/learning');
    expect(status).toBe(200);
    expect(json.league).toEqual({
      enabled: true,
      tiersEnabled: false,
      tierId: null,
      tierName: null,
      week: { id: thisWeek().id, startDay: thisWeek().startDay, endDay: thisWeek().endDay, xp: 40, rank: 2, excluded: false }
    });
    setRules({ league: { tiers: { enabled: true } } });
    store.setLeagueMember('u3', { tierId: 'gold', since: '2026-09-01T00:00:00.000Z' });
    expect((await call('GET', '/users/u3/learning')).json.league).toMatchObject({ tiersEnabled: true, tierId: 'gold', tierName: 'Gold', week: { xp: 0, rank: null } });
  });
});
