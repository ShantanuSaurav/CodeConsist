/**
 * Phase 6 on the server: the weekly league (server/leagues.js over the pure
 * rules in src/platform/league) and the league XP the pipelines write on each
 * day (`leagueXp`).
 *
 * Over HTTP where the pipeline matters (a solve, a reset, a Practice answer,
 * GET /api/leagues/current), and against the service with an injected `now`
 * where the test needs a whole week to pass (closing, outcomes, last week's
 * result).
 *
 * Real server/db.js with node:fs/promises stubbed (as in drafts.test.mjs),
 * the real shared rules and the real settings, activity, habits and leagues
 * services.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('node:fs/promises', () => ({
  readFile: async () => '{}',
  writeFile: async () => {},
  rename: async () => {},
  mkdir: async () => {}
}));

import * as store from '../db.js';
import { createLeaguesService } from '../leagues.js';
import { lib, resetStore, startLearnerApp, verifySubmission } from './learning-fixture.mjs';

let app;
/** The same routes over the same store, with a server that cannot check answers itself. */
let unchecked;

beforeAll(async () => {
  await store.load();
  app = await startLearnerApp(store);
  unchecked = await startLearnerApp(store, {
    progress: { verifySubmission: async (challenge, body) => ({ ...(await verifySubmission(challenge, body)), verified: false }) }
  });
});

afterAll(async () => {
  await app.close();
  await unchecked.close();
});

beforeEach(() => {
  resetStore(store, ['u1', 'u2', 'u3']);
});

const leagues = () => app.learningDeps.leagues;
const solve = (body, user = 'u1', on = app) => on.call('POST', '/progress/solve', { user, zone: 'UTC', body });
const setRules = (patch) => {
  const service = app.learningDeps.settings;
  const result = service.update({ revision: service.revision(), patch });
  expect(result.ok, JSON.stringify(result.issues ?? result.error)).toBe(true);
};
const today = () => lib.dayKeyIn('UTC', new Date());
const thisWeek = () => lib.weekFor(today(), 1, store.allLeagueWeeks());
const user = (id) => store.findUserById(id);

/** A day of league XP written straight into a learner's log (what the pipelines leave behind). */
function giveDay(userId, day, leagueXp) {
  const log = store.getActivity(userId) ?? { v: 1, lastDay: null, backfilledAt: '2026-01-01T00:00:00.000Z', days: {}, misses: {}, missLog: [] };
  const days = { ...log.days, [day]: { ...lib.emptyDay(), xp: leagueXp, lessons: 1, leagueXp } };
  store.putActivity(userId, { ...log, days, lastDay: log.lastDay && log.lastDay > day ? log.lastDay : day });
}

/* ------------------------------------------------------------- day XP */

describe('league XP on a solve', () => {
  // No daily-goal bonus in the way (it counts too - see its own test).
  beforeEach(() => setRules({ goals: { enabled: false } }));

  it('counts a first solve, and the learner joins the week', async () => {
    const res = await solve({ challengeId: 'q-quiz', answer: 1 });
    expect(res.status).toBe(200);
    expect(res.json.today).toMatchObject({ xp: 40, leagueXp: 40 });
    expect(res.json.progress.everSolved).toEqual(['q-quiz']);
    const week = store.getLeagueWeek(thisWeek().id);
    expect(week).toMatchObject({ status: 'open', startDay: thisWeek().startDay, endDay: thisWeek().endDay });
    expect(Object.keys(week.joinedAt)).toEqual(['u1']);
    // The tier rules are kept with the week (tiers are off by default).
    expect(week.rules.tiersEnabled).toBe(false);
  });

  it('never counts XP earned again after a progress reset', async () => {
    await solve({ challengeId: 'q-quiz', answer: 1 });
    const reset = await app.call('POST', '/progress/reset', { user: 'u1' });
    expect(reset.status).toBe(200);
    // The reset keeps what was ever solved.
    expect(reset.json.progress).toMatchObject({ xp: 0, completedChallenges: [], everSolved: ['q-quiz'] });
    expect(store.getProgress('u1').everSolved).toEqual(['q-quiz']);

    const again = await solve({ challengeId: 'q-quiz', answer: 1 });
    // Paid again (a first solve of the fresh row) - but not for the league.
    expect(again.json).toMatchObject({ awardedXp: 40, firstSolve: true });
    expect(again.json.today).toMatchObject({ xp: 80, leagueXp: 40 });
    // A lesson never solved before still counts.
    const fresh = await solve({ challengeId: 'q-multi', answer: [0, 2] });
    expect(fresh.json.today.leagueXp).toBe(90);
    expect(store.getProgress('u1').everSolved).toEqual(['q-quiz', 'q-multi']);
    expect(leagues().standings(thisWeek().id).rows[0]).toMatchObject({ userId: 'u1', xp: 90, rank: 1 });
  });

  it('pays nothing for a re-solve', async () => {
    await solve({ challengeId: 'q-quiz', answer: 1 });
    const again = await solve({ challengeId: 'q-quiz', answer: 1 });
    expect(again.json).toMatchObject({ awardedXp: 0, firstSolve: false });
    expect(again.json.today.leagueXp).toBe(40);
  });

  it('counts an unchecked solve only while countUnverifiedSolves is on', async () => {
    const on = await solve({ challengeId: 'q-quiz', answer: 1 }, 'u1', unchecked);
    expect(on.json).toMatchObject({ verified: false, today: { leagueXp: 40 } });
    setRules({ league: { countUnverifiedSolves: false } });
    const off = await solve({ challengeId: 'q-multi', answer: [0, 2] }, 'u1', unchecked);
    expect(off.json).toMatchObject({ verified: false, awardedXp: 50, today: { xp: 90, leagueXp: 40 } });
    // A checked one still counts.
    const checked = await solve({ challengeId: 'q-blank', answer: ['x'] });
    expect(checked.json.today.leagueXp).toBe(100);
  });

  it('adds the daily goal bonus', async () => {
    setRules({ goals: { enabled: true, options: [{ id: 'tiny', label: 'Tiny', blurb: '', metric: 'lessons', target: 1, bonusXp: 7, enabled: true }], defaultOptionId: 'tiny' } });
    const res = await solve({ challengeId: 'q-quiz', answer: 1 });
    expect(res.json).toMatchObject({ bonusXp: 7, today: { xp: 40, goalBonusXp: 7, leagueXp: 47 } });
  });

  it('records the XP but opens no week while the league is off', async () => {
    setRules({ league: { enabled: false } });
    const res = await solve({ challengeId: 'q-quiz', answer: 1 });
    expect(res.json.today.leagueXp).toBe(40);
    expect(store.allLeagueWeeks()).toEqual([]);
    expect((await app.call('GET', '/leagues/current', { user: 'u1' })).json).toMatchObject({ enabled: false, week: null, rows: [] });
  });
});

describe('league XP from Practice and merges', () => {
  const LESSONS = ['q-quiz', 'q-multi', 'q-blank', 'q-order'];
  function seedSolved(userId = 'u1') {
    const attempts = {};
    for (const id of LESSONS) attempts[id] = { challengeId: id, score: 100, attempts: 1, hintsUsed: 0, solvedAt: '2026-01-01T09:00:00.000Z' };
    store.setProgress(userId, { ...store.getProgress(userId), completedChallenges: [...LESSONS], attempts });
  }
  async function answerOne() {
    seedSolved();
    const opened = await app.call('POST', '/review/session', { user: 'u1', zone: 'UTC', body: {} });
    expect(opened.json.sessionId).toBeTruthy();
    return app.call('POST', '/review/answer', { user: 'u1', zone: 'UTC', body: { sessionId: opened.json.sessionId, challengeId: 'q-quiz', answer: 1, attempts: 1 } });
  }

  it('counts Practice XP while countReviewXp is on', async () => {
    const res = await answerOne();
    expect(res.json).toMatchObject({ awardedXp: 5, today: { reviewXp: 5, leagueXp: 5 } });
    expect(Object.keys(store.getLeagueWeek(thisWeek().id).joinedAt)).toEqual(['u1']);
  });

  it('leaves Practice XP out while countReviewXp is off', async () => {
    setRules({ league: { countReviewXp: false } });
    const res = await answerOne();
    expect(res.json).toMatchObject({ awardedXp: 5, today: { reviewXp: 5, leagueXp: 0 } });
    expect(store.allLeagueWeeks()).toEqual([]);
  });

  const merge = (body) => app.call('POST', '/progress/merge', { user: 'u1', zone: 'UTC', body });
  const guest = () => ({
    progress: {
      completedChallenges: ['q-quiz'],
      attempts: { 'q-quiz': { attempts: 1, hintsUsed: 0, solvedAt: new Date().toISOString() } }
    }
  });

  it('gives merged days no league XP unless countMergedXp is on', async () => {
    const res = await merge(guest());
    expect(res.status).toBe(200);
    expect(res.json.awardedXp).toBe(40);
    expect(store.getActivity('u1').days[today()]).toMatchObject({ xp: 40, leagueXp: 0 });
    expect(store.getProgress('u1').everSolved).toEqual(['q-quiz']);
    expect(store.allLeagueWeeks()).toEqual([]);
  });

  it('counts merged first solves when countMergedXp is on - never one paid before a reset', async () => {
    setRules({ league: { countMergedXp: true } });
    store.setProgress('u1', { ...store.getProgress('u1'), everSolved: ['q-multi'] });
    const res = await merge({
      progress: {
        completedChallenges: ['q-quiz', 'q-multi'],
        attempts: {
          'q-quiz': { attempts: 1, hintsUsed: 0, solvedAt: new Date().toISOString() },
          'q-multi': { attempts: 1, hintsUsed: 0, solvedAt: new Date().toISOString() }
        }
      }
    });
    expect(res.json.awardedXp).toBe(90);
    expect(store.getActivity('u1').days[today()]).toMatchObject({ xp: 90, leagueXp: 40 });
    expect(Object.keys(store.getLeagueWeek(thisWeek().id).joinedAt)).toEqual(['u1']);
  });
});

/* ---------------------------------------------------------- standings */

describe('standings', () => {
  beforeEach(() => setRules({ goals: { enabled: false } }));

  it('ranks this week from the days, with the viewer marked', async () => {
    await solve({ challengeId: 'q-quiz', answer: 1 }, 'u1');
    await solve({ challengeId: 'q-multi', answer: [0, 2] }, 'u1');
    await solve({ challengeId: 'q-multi', answer: [0, 2] }, 'u2');
    await solve({ challengeId: 'q-quiz', answer: 1 }, 'u3');

    const res = await app.call('GET', '/leagues/current', { user: 'u3' });
    expect(res.status).toBe(200);
    const view = res.json;
    expect(view).toMatchObject({ enabled: true, tiersEnabled: false, tier: null, zones: null, participants: 3, lastResult: null });
    expect(view.week).toMatchObject({ id: thisWeek().id, startDay: thisWeek().startDay, endDay: thisWeek().endDay, status: 'open' });
    expect(view.week.endsInMs).toBeGreaterThan(0);
    expect(view.week.endsInMs).toBeLessThanOrEqual(7 * 86_400_000);
    expect(view.week.finalizesInMs).toBeGreaterThan(view.week.endsInMs - 86_400_000);
    expect(view.rows).toEqual([
      { rank: 1, username: 'u1', xp: 90, streak: 1, isYou: false, zone: null },
      { rank: 2, username: 'u2', xp: 50, streak: 1, isYou: false, zone: null },
      { rank: 3, username: 'u3', xp: 40, streak: 1, isYou: true, zone: null }
    ]);
    expect(view.me).toEqual({ rank: 3, xp: 40, zone: null, inRows: true });
  });

  it('shows the viewer their own place outside the rows', async () => {
    setRules({ league: { boardSize: 10 } });
    const ids = Array.from({ length: 12 }, (_, i) => `p${i + 1}`);
    for (const id of ids) store.insertUser({ id, email: `${id}@example.com`, username: id, passwordHash: 'x', identities: {} });
    ids.forEach((id, i) => giveDay(id, today(), 100 - i));
    const view = leagues().view(user('p12'));
    expect(view.rows).toHaveLength(10);
    expect(view.rows.some((r) => r.isYou)).toBe(false);
    expect(view.me).toEqual({ rank: 12, xp: 89, zone: null, inRows: false });
    expect(view.participants).toBe(12);
  });

  it('gives a guest the board, unranked, in the zone they ask for - and refuses a bad zone', async () => {
    await solve({ challengeId: 'q-quiz', answer: 1 }, 'u1');
    const guest = await app.call('GET', '/leagues/current?tz=UTC');
    expect(guest.status).toBe(200);
    expect(guest.json).toMatchObject({ enabled: true, me: null, lastResult: null, participants: 1 });
    expect(guest.json.rows).toEqual([{ rank: 1, username: 'u1', xp: 40, streak: 1, isYou: false, zone: null }]);
    // Their "today" (and so their week) is in the zone they sent.
    const kolkata = await app.call('GET', '/leagues/current?tz=Asia/Kolkata');
    expect(kolkata.status).toBe(200);
    expect(kolkata.json.week.id).toBe(lib.weekFor(lib.dayKeyIn('Asia/Kolkata', new Date()), 1, store.allLeagueWeeks()).id);
    expect((await app.call('GET', '/leagues/current?tz=Mars/Olympus')).status).toBe(400);
    expect((await app.call('GET', '/leagues/current?tz=a&tz=b')).status).toBe(400);
    expect((await app.call('GET', '/leagues/current')).status).toBe(200);
  });

  it('zeroes the board with an admin reset: the baseline is the XP so far', async () => {
    await solve({ challengeId: 'q-quiz', answer: 1 }, 'u1');
    await solve({ challengeId: 'q-multi', answer: [0, 2] }, 'u2');
    const id = thisWeek().id;
    const reset = leagues().resetWeek(id, 'admin-1');
    expect(reset).toMatchObject({ ok: true, affected: 2 });
    expect(store.getLeagueWeek(id).baseline).toEqual({ u1: 40, u2: 50 });
    expect(store.getLeagueWeek(id).resets).toEqual([{ at: expect.any(String), by: 'admin-1' }]);
    expect(leagues().view(user('u1')).rows).toEqual([]);
    // The days themselves are untouched.
    expect(store.getActivity('u1').days[today()].leagueXp).toBe(40);

    // Only what is earned from now on counts.
    await solve({ challengeId: 'q-blank', answer: ['x'] }, 'u1');
    expect(leagues().view(user('u1')).rows).toEqual([{ rank: 1, username: 'u1', xp: 60, streak: 1, isYou: true, zone: null }]);
    const lines = leagues().standings(id).rows;
    expect(lines.find((l) => l.userId === 'u1')).toMatchObject({ rawXp: 100, baseline: 40, xp: 60, rank: 1 });
    expect(lines.find((l) => l.userId === 'u2')).toMatchObject({ rawXp: 50, baseline: 50, xp: 0, rank: null });

    expect(leagues().resetWeek('2020-01-06', 'admin-1')).toMatchObject({ ok: false, status: 404 });
  });

  it('never shows negative weekly XP', () => {
    const day = today();
    giveDay('u1', day, 30);
    leagues().noteLeagueXp(user('u1'), day);
    const week = store.getLeagueWeek(thisWeek().id);
    store.putLeagueWeek({ ...week, baseline: { u1: 1000 } });
    const line = leagues().standings(week.id).rows.find((l) => l.userId === 'u1');
    expect(line).toMatchObject({ rawXp: 30, baseline: 1000, xp: 0, rank: null });
    expect(leagues().view(user('u1'))).toMatchObject({ rows: [], me: null, participants: 0 });
  });

  it('takes an excluded learner off the board, and puts them back', async () => {
    await solve({ challengeId: 'q-quiz', answer: 1 }, 'u1');
    await solve({ challengeId: 'q-multi', answer: [0, 2] }, 'u2');
    const id = thisWeek().id;
    expect(leagues().exclude(id, 'u2', true, { by: 'admin-1', reason: 'x'.repeat(300) })).toMatchObject({ ok: true, before: null });
    expect(store.getLeagueWeek(id).excluded.u2).toMatchObject({ by: 'admin-1', reason: 'x'.repeat(200) });
    const without = leagues().view(user('u2'));
    expect(without.rows.map((r) => r.username)).toEqual(['u1']);
    expect(without.me).toBeNull();
    expect(leagues().standings(id).rows.find((l) => l.userId === 'u2')).toMatchObject({ xp: 50, rank: null, excluded: { by: 'admin-1' } });

    expect(leagues().exclude(id, 'u2', false, { by: 'admin-1' })).toMatchObject({ ok: true });
    expect(leagues().view(user('u2')).rows.map((r) => r.username)).toEqual(['u2', 'u1']);
    expect(leagues().exclude(id, 'nobody', true, {})).toMatchObject({ ok: false, status: 404 });
  });
});

/* ----------------------------------------------------- closing a week */

describe('closing weeks', () => {
  // The week of Monday 21 to Sunday 27 September 2026.
  const WEEK = '2026-09-21';
  const during = new Date('2026-09-23T10:00:00.000Z');

  function playLastWeek() {
    giveDay('u1', '2026-09-22', 120);
    giveDay('u2', '2026-09-23', 80);
    giveDay('u2', '2026-09-24', 40);
    giveDay('u3', '2026-09-25', 30);
    for (const [id, day] of [['u1', '2026-09-22'], ['u2', '2026-09-23'], ['u3', '2026-09-25']]) {
      leagues().noteLeagueXp(user(id), day, new Date(`${day}T10:00:00.000Z`));
    }
  }

  it('closes a week only once its results are final, and only once', () => {
    playLastWeek();
    expect(store.getLeagueWeek(WEEK)).toMatchObject({ status: 'open', startDay: WEEK, endDay: '2026-09-27' });
    // UTC midnight after Sunday, plus 12 hours.
    expect(leagues().closeDueWeeks(new Date('2026-09-28T11:59:59.000Z'))).toEqual([]);
    expect(store.getLeagueWeek(WEEK).status).toBe('open');
    expect(leagues().closeDueWeeks(new Date('2026-09-28T12:00:00.000Z'))).toEqual([WEEK]);
    expect(leagues().closeDueWeeks(new Date('2026-09-29T12:00:00.000Z'))).toEqual([]);

    const closed = store.getLeagueWeek(WEEK);
    expect(closed).toMatchObject({ status: 'closed', closedBy: 'auto', closedAt: '2026-09-28T12:00:00.000Z' });
    // u1 and u2 tie on 120 XP: u1 joined first, and they share rank 1.
    expect(closed.results).toEqual([
      { userId: 'u1', username: 'u1', xp: 120, rank: 1, groupId: null, tierId: null, outcome: 'single', toTierId: null },
      { userId: 'u2', username: 'u2', xp: 120, rank: 1, groupId: null, tierId: null, outcome: 'single', toTierId: null },
      { userId: 'u3', username: 'u3', xp: 30, rank: 3, groupId: null, tierId: null, outcome: 'single', toTierId: null }
    ]);
    expect(leagues().closeWeek(WEEK, 'admin-1')).toMatchObject({ ok: false, status: 409 });
    expect(leagues().resetWeek(WEEK, 'admin-1')).toMatchObject({ ok: false, status: 409 });
    expect(leagues().exclude(WEEK, 'u1', true, {})).toMatchObject({ ok: false, status: 409 });
    expect(leagues().closeWeek('2020-01-06', 'admin-1')).toMatchObject({ ok: false, status: 404 });
  });

  it('follows the delay the admin sets', () => {
    setRules({ league: { finalizeDelayHours: 0 } });
    playLastWeek();
    expect(leagues().closeDueWeeks(new Date('2026-09-27T23:59:59.000Z'))).toEqual([]);
    expect(leagues().closeDueWeeks(new Date('2026-09-28T00:00:00.000Z'))).toEqual([WEEK]);
  });

  it('adds no XP to a closed week, and never reopens a week that is already final', () => {
    playLastWeek();
    leagues().closeDueWeeks(new Date('2026-09-28T12:00:00.000Z'));
    const before = JSON.stringify(store.getLeagueWeek(WEEK));
    giveDay('u3', '2026-09-26', 500);
    expect(leagues().noteLeagueXp(user('u3'), '2026-09-26', new Date('2026-09-28T13:00:00.000Z'))).toBeNull();
    expect(JSON.stringify(store.getLeagueWeek(WEEK))).toBe(before);
    // A merged day from an older week that never had a board opens none.
    giveDay('u3', '2026-09-08', 50);
    expect(leagues().noteLeagueXp(user('u3'), '2026-09-08', new Date('2026-09-28T13:00:00.000Z'))).toBeNull();
    expect(store.allLeagueWeeks().map((w) => w.id)).toEqual([WEEK]);
  });

  it('shows a week closed early by its results, whatever is earned on its days afterwards', () => {
    playLastWeek();
    expect(leagues().closeWeek(WEEK, 'admin-1', during)).toMatchObject({ ok: true });
    giveDay('u3', '2026-09-26', 500);
    const view = leagues().view(user('u3'), { now: new Date('2026-09-26T10:00:00.000Z') });
    expect(view.week).toMatchObject({ id: WEEK, status: 'closed', endsInMs: 0 });
    expect(view.rows.map((r) => [r.username, r.xp, r.rank, r.isYou])).toEqual([
      ['u1', 120, 1, false],
      ['u2', 120, 1, false],
      ['u3', 30, 3, true]
    ]);
    expect(view.me).toEqual({ rank: 3, xp: 30, zone: null, inRows: true });
    expect(view.participants).toBe(3);
  });

  it("shows last week's result once the week has closed", () => {
    playLastWeek();
    const next = new Date('2026-09-30T10:00:00.000Z');
    // Read lazily: the board read closes the week that is due.
    const view = leagues().view(user('u3'), { now: next });
    expect(store.getLeagueWeek(WEEK).status).toBe('closed');
    expect(view.week).toMatchObject({ id: '2026-09-28', startDay: '2026-09-28', endDay: '2026-10-04', status: 'open' });
    expect(view.rows).toEqual([]);
    expect(view.lastResult).toEqual({ weekId: WEEK, rank: 3, xp: 30, outcome: 'single', tierName: null });
    expect(leagues().view(null, { now: next }).lastResult).toBeNull();
  });

  it("shows no result from an older week as last week's", () => {
    playLastWeek();
    // Nobody played the week of 28 September, so the week of 5 October has no "last week".
    const later = leagues().view(user('u3'), { now: new Date('2026-10-07T10:00:00.000Z') });
    expect(store.getLeagueWeek(WEEK).status).toBe('closed');
    expect(later.week).toMatchObject({ id: '2026-10-05', startDay: '2026-10-05' });
    expect(later.lastResult).toBeNull();
    // Nor from the week before last while last week is still open (Monday morning, before it closes).
    giveDay('u3', '2026-10-05', 20);
    leagues().noteLeagueXp(user('u3'), '2026-10-05', new Date('2026-10-05T10:00:00.000Z'));
    const monday = leagues().view(user('u3'), { now: new Date('2026-10-12T06:00:00.000Z') });
    expect(store.getLeagueWeek('2026-10-05').status).toBe('open');
    expect(monday.week.id).toBe('2026-10-12');
    expect(monday.lastResult).toBeNull();
  });

  it('refuses a reset or an exclusion once the results are final, even before the close has run', () => {
    playLastWeek();
    const final = new Date('2026-09-28T12:00:00.000Z');
    expect(leagues().resetWeek(WEEK, 'admin-1', final)).toMatchObject({ ok: false, status: 409 });
    expect(leagues().exclude(WEEK, 'u1', true, { by: 'admin-1' }, final)).toMatchObject({ ok: false, status: 409 });
    expect(store.getLeagueWeek(WEEK)).toMatchObject({ status: 'open', baseline: {}, excluded: {} });
    // The close then writes the results as they were.
    expect(leagues().closeDueWeeks(final)).toEqual([WEEK]);
    expect(store.getLeagueWeek(WEEK).results.map((r) => [r.userId, r.xp])).toEqual([['u1', 120], ['u2', 120], ['u3', 30]]);
  });

  it('keeps only the newest closed weeks', () => {
    setRules({ retention: { leagueWeeksKept: 4 } });
    let day = '2026-06-01';
    for (let i = 0; i < 6; i++) {
      giveDay('u1', day, 10);
      leagues().noteLeagueXp(user('u1'), day, new Date(`${day}T10:00:00.000Z`));
      day = lib.addDays(day, 7);
    }
    expect(store.allLeagueWeeks()).toHaveLength(6);
    expect(leagues().closeDueWeeks(new Date('2026-09-01T00:00:00.000Z'))).toHaveLength(6);
    expect(store.allLeagueWeeks().map((w) => w.id)).toEqual(['2026-06-15', '2026-06-22', '2026-06-29', '2026-07-06']);
  });

  it('never throws - a damaged week is skipped, a failing store is logged', () => {
    store.putLeagueWeek({ id: 'broken', startDay: 'x', endDay: 'y', status: 'open' });
    expect(leagues().closeDueWeeks(new Date())).toEqual([]);

    const errors = [];
    const failing = createLeaguesService({
      lib,
      store: {
        ...store,
        allLeagueWeeks: () => [{ id: WEEK, startDay: WEEK, endDay: '2026-09-27', status: 'open' }],
        getLeagueWeek: () => {
          throw new Error('disk on fire');
        }
      },
      settings: app.learningDeps.settings,
      activity: app.learningDeps.activity,
      logError: (msg) => errors.push(msg)
    });
    expect(failing.closeDueWeeks(new Date('2026-10-01T00:00:00.000Z'))).toEqual([]);
    expect(errors).toEqual([`[leagues] could not close week ${WEEK}: disk on fire`]);
    const broken = createLeaguesService({
      lib,
      store: { ...store, allLeagueWeeks: () => { throw new Error('gone'); } },
      settings: app.learningDeps.settings,
      activity: app.learningDeps.activity,
      logError: (msg) => errors.push(msg)
    });
    expect(broken.closeDueWeeks(new Date())).toEqual([]);
    expect(errors[1]).toBe('[leagues] could not check for weeks to close: gone');
  });
});

/* -------------------------------------------------------------- tiers */

describe('tiers', () => {
  const WEEK = '2026-09-21';

  beforeEach(() => {
    setRules({ league: { tiers: { enabled: true, groupSize: 5, promoteCount: 1, demoteCount: 1, minXpToPromote: 1 } } });
  });

  function play(entries, day = '2026-09-23') {
    for (const [id, xp] of entries) {
      if (!store.findUserById(id)) store.insertUser({ id, email: `${id}@example.com`, username: id, passwordHash: 'x', identities: {} });
      giveDay(id, day, xp);
      leagues().noteLeagueXp(user(id), day, new Date(`${day}T10:00:00.000Z`));
    }
  }

  it('puts each learner in a group of their tier, the lowest to start with', () => {
    play([['u1', 50], ['u2', 40], ['u3', 30]]);
    const week = store.getLeagueWeek(WEEK);
    expect(week.rules).toMatchObject({ tiersEnabled: true, groupSize: 5, promoteCount: 1, demoteCount: 1 });
    expect(week.groups).toEqual({ 'bronze-1': { tierId: 'bronze', memberIds: ['u1', 'u2', 'u3'] } });
    expect(store.getLeagueMember('u1')).toMatchObject({ tierId: 'bronze' });
  });

  it('moves the top of a group up and the bottom down at close', () => {
    for (const id of ['s1', 's2', 's3']) store.setLeagueMember(id, { tierId: 'silver', since: '2026-09-01T00:00:00.000Z' });
    play([['s1', 90], ['s2', 60], ['s3', 10], ['u1', 50], ['u2', 5]]);
    expect(Object.keys(store.getLeagueWeek(WEEK).groups)).toEqual(['silver-1', 'bronze-1']);
    leagues().closeDueWeeks(new Date('2026-09-28T12:00:00.000Z'));
    const results = store.getLeagueWeek(WEEK).results;
    expect(results.map((r) => [r.userId, r.rank, r.outcome, r.toTierId])).toEqual([
      ['s1', 1, 'promoted', 'gold'],
      ['s2', 2, 'stayed', 'silver'],
      // A group of three is larger than up + down (2): its last moves down...
      ['s3', 3, 'demoted', 'bronze'],
      // ...a group of two is not: its top moves up and nobody moves down.
      ['u1', 1, 'promoted', 'silver'],
      ['u2', 2, 'stayed', 'bronze']
    ]);
    expect(store.getLeagueMember('s1').tierId).toBe('gold');
    expect(store.getLeagueMember('s3').tierId).toBe('bronze');
    expect(store.getLeagueMember('u1').tierId).toBe('silver');
    expect(store.getLeagueMember('u2').tierId).toBe('bronze');

    // Next week they play in their new tiers, and see how the last one went.
    play([['u1', 20]], '2026-09-30');
    expect(store.getLeagueWeek('2026-09-28').groups).toEqual({ 'silver-1': { tierId: 'silver', memberIds: ['u1'] } });
    const view = leagues().view(user('u1'), { now: new Date('2026-09-30T11:00:00.000Z') });
    expect(view).toMatchObject({ tiersEnabled: true, tier: { id: 'silver', name: 'Silver', index: 1, count: 5 }, zones: { promote: 1, demote: 0 } });
    expect(view.rows).toEqual([{ rank: 1, username: 'u1', xp: 20, streak: 0, isYou: true, zone: 'up' }]);
    expect(view.lastResult).toEqual({ weekId: WEEK, rank: 1, xp: 50, outcome: 'promoted', tierName: 'Silver' });
  });

  it('demotes the bottom of a full group, and shows the zones', () => {
    store.setLeagueMember('u1', { tierId: 'gold' });
    for (const id of ['g2', 'g3', 'g4']) store.setLeagueMember(id, { tierId: 'gold' });
    play([['u1', 90], ['g2', 70], ['g3', 50], ['g4', 30]]);
    const view = leagues().view(user('u1'), { now: new Date('2026-09-23T11:00:00.000Z') });
    expect(view.zones).toEqual({ promote: 1, demote: 1 });
    expect(view.rows.map((r) => r.zone)).toEqual(['up', null, null, 'down']);
    leagues().closeDueWeeks(new Date('2026-09-28T12:00:00.000Z'));
    expect(store.getLeagueWeek(WEEK).results.map((r) => r.outcome)).toEqual(['promoted', 'stayed', 'stayed', 'demoted']);
    expect(store.getLeagueMember('g4').tierId).toBe('silver');
  });

  it('moves a learner who joined the next week before the close to a group of their new tier', () => {
    play([['u1', 50], ['u2', 40]]);
    // Monday morning, before last week closes at 12:00 UTC: both earn XP in the new week.
    play([['u1', 20], ['u2', 10]], '2026-09-28');
    expect(store.getLeagueWeek('2026-09-28').groups).toEqual({ 'bronze-1': { tierId: 'bronze', memberIds: ['u1', 'u2'] } });

    expect(leagues().closeDueWeeks(new Date('2026-09-28T12:00:00.000Z'))).toEqual([WEEK]);
    expect(store.getLeagueMember('u1').tierId).toBe('silver');
    expect(store.getLeagueWeek('2026-09-28').groups).toEqual({
      'bronze-1': { tierId: 'bronze', memberIds: ['u2'] },
      'silver-1': { tierId: 'silver', memberIds: ['u1'] }
    });
    const view = leagues().view(user('u1'), { now: new Date('2026-09-28T13:00:00.000Z') });
    expect(view.tier).toMatchObject({ id: 'silver' });
    expect(view.rows.map((r) => r.username)).toEqual(['u1']);
    expect(view.lastResult).toMatchObject({ outcome: 'promoted', tierName: 'Silver' });

    // Their week in Silver closes as Silver: a group of one moves up to Gold.
    leagues().closeDueWeeks(new Date('2026-10-05T12:00:00.000Z'));
    expect(store.getLeagueWeek('2026-09-28').results.map((r) => [r.userId, r.tierId, r.outcome])).toEqual([
      ['u2', 'bronze', 'promoted'],
      ['u1', 'silver', 'promoted']
    ]);
    expect(store.getLeagueMember('u1').tierId).toBe('gold');
  });

  it("keeps an admin's Move tier made during the week when the week closes", () => {
    play([['u1', 50], ['u2', 40], ['u3', 30]]);
    // u1 would move up to Silver, u2 would stay in Bronze; the admin moves both mid-week.
    leagues().setTier('u1', 'gold', new Date('2026-09-24T10:00:00.000Z'));
    leagues().setTier('u2', 'silver', new Date('2026-09-24T10:00:00.000Z'));
    leagues().closeDueWeeks(new Date('2026-09-28T12:00:00.000Z'));
    expect(store.getLeagueMember('u1').tierId).toBe('gold');
    expect(store.getLeagueMember('u2').tierId).toBe('silver');
    expect(store.getLeagueMember('u3').tierId).toBe('bronze');
    expect(store.getLeagueWeek(WEEK).results.map((r) => [r.userId, r.outcome, r.toTierId])).toEqual([
      ['u1', 'promoted', 'gold'],
      ['u2', 'promoted', 'silver'],
      ['u3', 'stayed', 'bronze']
    ]);
  });

  it('closes a group over the learners its board shows - a member at 0 XP after a reset stays put', () => {
    for (const id of ['s1', 's2', 's3', 's4']) store.setLeagueMember(id, { tierId: 'silver', since: '2026-09-01T00:00:00.000Z' });
    play([['s1', 90], ['s2', 70], ['s3', 50], ['s4', 30]]);
    expect(leagues().resetWeek(WEEK, 'admin-1', new Date('2026-09-23T12:00:00.000Z'))).toMatchObject({ ok: true, affected: 4 });
    // After the reset, three of the four earn XP again; s4 does not.
    giveDay('s1', '2026-09-24', 10);
    giveDay('s2', '2026-09-24', 20);
    giveDay('s3', '2026-09-24', 30);
    const at = { now: new Date('2026-09-24T12:00:00.000Z') };
    const view = leagues().view(user('s1'), at);
    expect(view.zones).toEqual({ promote: 1, demote: 1 });
    expect(view.rows.map((r) => [r.username, r.zone])).toEqual([['s3', 'up'], ['s2', null], ['s1', 'down']]);
    expect(view.me).toMatchObject({ zone: 'down' });

    leagues().closeDueWeeks(new Date('2026-09-28T12:00:00.000Z'));
    // The close does what the board showed.
    expect(store.getLeagueWeek(WEEK).results.map((r) => [r.userId, r.rank, r.outcome])).toEqual([
      ['s3', 1, 'promoted'],
      ['s2', 2, 'stayed'],
      ['s1', 3, 'demoted']
    ]);
    expect(store.getLeagueMember('s1').tierId).toBe('bronze');
    expect(store.getLeagueMember('s4').tierId).toBe('silver');
  });

  it('keeps the tier rules a week started with', () => {
    play([['u1', 50]]);
    setRules({ league: { tiers: { enabled: false } } });
    play([['u2', 40]]);
    // Still a tiered week: u2 joins a group too.
    expect(store.getLeagueWeek(WEEK).groups['bronze-1'].memberIds).toEqual(['u1', 'u2']);
  });

  it('lets an admin move a learner to a tier of the list', () => {
    expect(leagues().setTier('u1', 'gold')).toMatchObject({ ok: true, before: null, member: { tierId: 'gold' } });
    expect(leagues().setTier('u1', 'silver')).toMatchObject({ ok: true, before: 'gold' });
    expect(leagues().setTier('u1', 'mithril')).toMatchObject({ ok: false, status: 400 });
    expect(leagues().setTier('nobody', 'gold')).toMatchObject({ ok: false, status: 404 });
  });
});
