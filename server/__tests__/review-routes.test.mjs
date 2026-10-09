/**
 * Practice sessions at the HTTP boundary: POST /api/review/session and
 * /api/review/answer (server/review-routes.js), and the review step of a
 * guest merge.
 *
 * Real server/db.js with node:fs/promises stubbed, the real shared rules
 * (src/platform/review) and the real settings, activity and habits services.
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('node:fs/promises', () => ({
  readFile: async () => '{}',
  writeFile: async () => {},
  rename: async () => {},
  mkdir: async () => {}
}));

import * as store from '../db.js';
import { lib, resetStore, startLearnerApp } from './learning-fixture.mjs';

let app;

beforeAll(async () => {
  await store.load();
  app = await startLearnerApp(store);
});

afterAll(async () => {
  await app.close();
});

beforeEach(() => {
  resetStore(store);
  // Midday UTC, so "today" and "an hour ago" are always the same day. Only
  // Date is faked: HTTP keeps working.
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-09-20T12:00:00.000Z'));
});

afterEach(() => {
  vi.useRealTimers();
});

const LESSONS = ['q-quiz', 'q-multi', 'q-blank', 'q-order'];
const RIGHT = { 'q-quiz': 1, 'q-multi': [0, 2], 'q-blank': ['x'], 'q-order': ['start', 'loop', 'end'] };
const today = () => lib.dayKeyIn('UTC', new Date());

/** u1 solved every fixture question long ago, first try: all four answer lessons are due now. */
function seedSolved(userId = 'u1', extra = {}) {
  const attempts = {};
  for (const id of [...LESSONS, 'q-code', 't-test']) {
    attempts[id] = { challengeId: id, score: 100, attempts: 1, hintsUsed: 0, solvedAt: '2026-01-01T09:00:00.000Z' };
  }
  store.setProgress(userId, { ...store.getProgress(userId), completedChallenges: [...LESSONS, 'q-code', 't-test'], attempts, ...extra });
}

const session = (body = {}, user = 'u1') => app.call('POST', '/review/session', { user, zone: 'UTC', body });
const answer = (body, user = 'u1') => app.call('POST', '/review/answer', { user, zone: 'UTC', body });
const setRules = (patch) => {
  const service = app.learningDeps.settings;
  const result = service.update({ revision: service.revision(), patch });
  expect(result.ok).toBe(true);
};

describe('POST /api/review/session', () => {
  it('needs a signed-in learner', async () => {
    expect((await app.call('POST', '/review/session', { body: {} })).status).toBe(401);
    expect((await app.call('POST', '/review/answer', { body: {} })).status).toBe(401);
  });

  it('builds a session from the due answer lessons - never the stage test or a code lesson', async () => {
    seedSolved();
    const res = await session();
    expect(res.status).toBe(200);
    expect(res.json.sessionId).toMatch(/^rs-/);
    expect(res.json.items.map((i) => i.challengeId).sort()).toEqual([...LESSONS].sort());
    expect(res.json.items.every((i) => i.reason === 'due')).toBe(true);
    expect(res.json.xp).toEqual({ remainingToday: 60 });
    expect(store.getReviewSession('u1')).toMatchObject({ id: res.json.sessionId, bonusPaid: false });
  });

  it('puts an open mistake from an earlier day first, and leaves one from today out', async () => {
    seedSolved();
    const yesterday = lib.addDays(today(), -1);
    const summary = (day, count) => ({ count, firstAt: `${day}T08:00:00.000Z`, lastAt: `${day}T08:00:00.000Z`, lastDay: day, lastDayCount: 1, open: true, revealed: 0, keys: {}, lastAnswer: null });
    store.putActivity('u1', {
      v: 1,
      lastDay: today(),
      backfilledAt: new Date().toISOString(),
      days: {},
      misses: { 'q-quiz': summary(yesterday, 3), 'q-order': summary(today(), 1) },
      missLog: []
    });
    const res = await session();
    const reasons = Object.fromEntries(res.json.items.map((i) => [i.challengeId, i.reason]));
    expect(reasons['q-quiz']).toBe('mistake');
    expect(reasons['q-order']).toBeUndefined();
  });

  it('says when to come back when there is nothing to practice', async () => {
    // Solved today, first try: box 1, due in 3 days.
    const solved = await app.call('POST', '/progress/solve', { user: 'u1', zone: 'UTC', body: { challengeId: 'q-quiz', answer: 1 } });
    expect(solved.status).toBe(200);
    const res = await session();
    expect(res.json).toMatchObject({ sessionId: null, items: [], nextDueDay: lib.addDays(today(), 3) });
    expect(store.getReviewSession('u1')).toBeNull();
  });

  it('refuses a stage it cannot see, and answers 409 when sessions are off', async () => {
    seedSolved();
    expect((await session({ stageId: 'stage-99' })).status).toBe(400);
    expect((await session({ stageId: 'stage-1' })).status).toBe(200);
    setRules({ review: { enabled: false } });
    expect((await session()).status).toBe(409);
  });
});

describe('POST /api/review/answer', () => {
  async function open() {
    seedSolved();
    const res = await session();
    expect(res.json.sessionId).toBeTruthy();
    return res.json.sessionId;
  }

  it('pays XP once, moves the schedule, counts the day and the streak - and a replay pays nothing', async () => {
    const sessionId = await open();
    const res = await answer({ sessionId, challengeId: 'q-quiz', answer: 1, attempts: 1 });
    expect(res.status).toBe(200);
    expect(res.json).toMatchObject({ correct: true, outcome: 'clean', awardedXp: 5, bonusXp: 0, resolved: true, xpRemainingToday: 55 });
    expect(res.json.today).toMatchObject({ day: today(), reviews: 1, reviewXp: 5, xp: 5 });
    // Derived box 1 (first-try solve), one up: box 2, due in 7 days.
    expect(res.json.progress.review['q-quiz']).toMatchObject({ box: 2, due: lib.addDays(today(), 7), paid: today() });
    expect(res.json.progress).toMatchObject({ streak: 1, lastActiveDay: today() });
    expect(store.getProgress('u1').xp).toBe(5);

    const replay = await answer({ sessionId, challengeId: 'q-quiz', answer: 1 });
    expect(replay.json).toMatchObject({ awardedXp: 0, bonusXp: 0, replay: true });
    expect(store.getProgress('u1').xp).toBe(5);
  });

  it('decides the outcome on the first answer: wrong, then right, pays the smaller reward', async () => {
    const sessionId = await open();
    const wrong = await answer({ sessionId, challengeId: 'q-quiz', answer: 0 });
    expect(wrong.json).toMatchObject({ correct: false, outcome: 'missed', awardedXp: 0, resolved: false });
    expect(wrong.json.progress.review['q-quiz']).toMatchObject({ box: 0, due: lib.addDays(today(), 1) });
    const right = await answer({ sessionId, challengeId: 'q-quiz', answer: 1, attempts: 1 });
    expect(right.json).toMatchObject({ correct: true, outcome: 'missed', awardedXp: 2 });
    // The schedule did not move a second time.
    expect(right.json.progress.review['q-quiz']).toMatchObject({ box: 0, due: lib.addDays(today(), 1) });
  });

  it('clears an open mistake only on a clean answer', async () => {
    const sessionId = await open();
    store.putActivity('u1', {
      ...app.learningDeps.activity.load(store.findUserById('u1')),
      misses: {
        'q-multi': { count: 1, firstAt: '2026-01-02T00:00:00.000Z', lastAt: '2026-01-02T00:00:00.000Z', lastDay: '2026-01-02', lastDayCount: 1, open: true, revealed: 0, keys: {}, lastAnswer: null },
        'q-blank': { count: 1, firstAt: '2026-01-02T00:00:00.000Z', lastAt: '2026-01-02T00:00:00.000Z', lastDay: '2026-01-02', lastDayCount: 1, open: true, revealed: 0, keys: {}, lastAnswer: null }
      }
    });
    await answer({ sessionId, challengeId: 'q-multi', answer: [0, 2], attempts: 1 });
    await answer({ sessionId, challengeId: 'q-blank', answer: ['x'], attempts: 2 });
    const misses = store.getActivity('u1').misses;
    expect(misses['q-multi'].open).toBe(false);
    expect(misses['q-blank'].open).toBe(true);
  });

  it('stops at the daily cap', async () => {
    setRules({ review: { xp: { dailyCap: 7 } } });
    const sessionId = await open();
    const paid = [];
    for (const id of ['q-quiz', 'q-multi', 'q-blank']) paid.push((await answer({ sessionId, challengeId: id, answer: RIGHT[id], attempts: 1 })).json);
    expect(paid.map((p) => p.awardedXp)).toEqual([5, 2, 0]);
    expect(paid[2].xpRemainingToday).toBe(0);
    expect(store.getProgress('u1').xp).toBe(7);
  });

  it('pays the session bonus once, when every question is answered right', async () => {
    const sessionId = await open();
    const results = [];
    for (const id of LESSONS) results.push((await answer({ sessionId, challengeId: id, answer: RIGHT[id], attempts: 1 })).json);
    expect(results.map((r) => r.bonusXp)).toEqual([0, 0, 0, 5]);
    expect(results[3].sessionComplete).toBe(true);
    expect(store.getProgress('u1').xp).toBe(4 * 5 + 5);
    const again = await answer({ sessionId, challengeId: 'q-order', answer: RIGHT['q-order'] });
    expect(again.json).toMatchObject({ awardedXp: 0, bonusXp: 0 });
    expect(store.getActivity('u1').days[today()]).toMatchObject({ reviews: 4, reviewXp: 25 });
  });

  it('pays a question once a day, and does not serve it again that day', async () => {
    const first = await open();
    expect((await answer({ sessionId: first, challengeId: 'q-quiz', answer: 1 })).json.awardedXp).toBe(5);
    // Due again today (the schedule says so): still not served again today.
    const progress = store.getProgress('u1');
    store.setProgress('u1', { ...progress, review: { ...progress.review, 'q-quiz': { ...progress.review['q-quiz'], due: today() } } });
    const second = await session();
    expect(second.json.sessionId).not.toBe(first);
    expect(second.json.items.map((i) => i.challengeId)).not.toContain('q-quiz');
    // And a session that did hold it would pay nothing more for it today.
    store.putReviewSession('u1', { id: 'rs-held', createdAt: new Date().toISOString(), stageId: null, items: [{ challengeId: 'q-quiz', reason: 'due' }], answered: {}, bonusPaid: false });
    expect((await answer({ sessionId: 'rs-held', challengeId: 'q-quiz', answer: 1 })).json.awardedXp).toBe(0);
  });

  it('does not serve a question answered with help again the same day, so its session bonus is paid once', async () => {
    seedSolved();
    // Everything scheduled weeks out, and one open mistake from yesterday.
    const far = { box: 3, due: lib.addDays(today(), 30), last: '2026-09-01T09:00:00.000Z' };
    store.setProgress('u1', { ...store.getProgress('u1'), review: Object.fromEntries(LESSONS.map((id) => [id, far])) });
    const yesterday = lib.addDays(today(), -1);
    store.putActivity('u1', {
      v: 1,
      lastDay: yesterday,
      backfilledAt: new Date().toISOString(),
      days: {},
      misses: { 'q-quiz': { count: 1, firstAt: `${yesterday}T08:00:00.000Z`, lastAt: `${yesterday}T08:00:00.000Z`, lastDay: yesterday, lastDayCount: 1, open: true, revealed: 0, keys: {}, lastAnswer: null } },
      missLog: []
    });
    const first = await session();
    expect(first.json.items).toEqual([{ challengeId: 'q-quiz', reason: 'mistake' }]);
    const res = await answer({ sessionId: first.json.sessionId, challengeId: 'q-quiz', answer: 1, attempts: 2 });
    expect(res.json).toMatchObject({ outcome: 'assisted', awardedXp: 2, bonusXp: 5, sessionComplete: true });
    // Answered with help: the mistake stays open - and comes back tomorrow, not now.
    expect(store.getActivity('u1').misses['q-quiz'].open).toBe(true);
    for (let i = 0; i < 3; i++) {
      expect((await session()).json).toMatchObject({ sessionId: null, items: [], nextDueDay: lib.addDays(today(), 1) });
    }
    expect(store.getProgress('u1').xp).toBe(7);
    expect(store.getActivity('u1').days[today()]).toMatchObject({ reviews: 1, reviewXp: 7 });
  });

  it('404s an expired, replaced or unknown session, and 400s a question not in it', async () => {
    const sessionId = await open();
    expect((await answer({ sessionId: 'rs-nope', challengeId: 'q-quiz', answer: 1 })).status).toBe(404);
    expect((await answer({ sessionId, challengeId: 'q-code', code: 'x' })).status).toBe(400);
    const stored = store.getReviewSession('u1');
    store.putReviewSession('u1', { ...stored, createdAt: new Date(Date.now() - 13 * 3_600_000).toISOString() });
    const expired = await answer({ sessionId, challengeId: 'q-quiz', answer: 1 });
    expect(expired.status).toBe(404);
    expect(expired.json.reason).toBe('expired');
    // Another learner cannot answer in it.
    seedSolved('u2');
    expect((await answer({ sessionId, challengeId: 'q-quiz', answer: 1 }, 'u2')).status).toBe(404);
  });

  it('a progress reset closes the open session', async () => {
    const sessionId = await open();
    await app.call('POST', '/progress/reset', { user: 'u1' });
    expect(store.getReviewSession('u1')).toBeNull();
    expect((await answer({ sessionId, challengeId: 'q-quiz', answer: 1 })).status).toBe(404);
  });
});

describe('a merged review log', () => {
  const merge = (body) => app.call('POST', '/progress/merge', { user: 'u1', zone: 'UTC', body });

  it('prices right answers inside the window, once per question per day, under the cap - never a bonus', async () => {
    seedSolved();
    const at = (daysBack, hour = 9) => `${lib.addDays(today(), -daysBack)}T${String(hour).padStart(2, '0')}:00:00.000Z`;
    const event = (challengeId, iso, outcome = 'clean', correct = true) => ({ challengeId, sessionId: 'local-1', at: iso, day: iso.slice(0, 10), outcome, correct });
    const res = await merge({
      progress: { completedChallenges: [], attempts: {} },
      reviewLog: [
        event('q-quiz', at(0, 1)),
        event('q-quiz', at(0, 2)),
        event('q-multi', at(1), 'assisted'),
        event('q-blank', at(5)),
        event('q-order', at(0, 3), 'clean', false),
        event('q-code', at(0, 4)),
        event('nope', at(0, 5))
      ]
    });
    expect(res.status).toBe(200);
    // q-quiz today (5), q-multi yesterday (2). q-blank is outside the 2-day
    // window, q-order was wrong, and q-code is a kind sessions do not use.
    expect(res.json.awardedReviewXp).toBe(5 + 2);
    expect(store.getProgress('u1').xp).toBe(7);
    expect(store.getProgress('u1').review['q-quiz'].paid).toBe(today());

    // The same log again pays nothing more.
    const again = await merge({ progress: { completedChallenges: [], attempts: {} }, reviewLog: [event('q-quiz', at(0, 1))] });
    expect(again.json.awardedReviewXp).toBe(0);
  });

  it('pays a log over two days once, however often it is merged - and never an older day after a live answer', async () => {
    seedSolved();
    const yesterday = lib.addDays(today(), -1);
    const event = (challengeId, iso) => ({ challengeId, sessionId: 'local-1', at: iso, day: iso.slice(0, 10), outcome: 'clean', correct: true });
    // The browser lost the first response, so it sends the same log again (and again).
    const body = { progress: { completedChallenges: [], attempts: {} }, reviewLog: [event('q-quiz', `${yesterday}T09:00:00.000Z`), event('q-quiz', `${today()}T09:00:00.000Z`)] };
    expect((await merge(body)).json.awardedReviewXp).toBe(10);
    expect((await merge(body)).json.awardedReviewXp).toBe(0);
    expect((await merge(body)).json.awardedReviewXp).toBe(0);
    expect(store.getProgress('u1').xp).toBe(10);
    // Each answer it paid is one of its day's Practice answers - once.
    const days = store.getActivity('u1').days;
    expect(days[yesterday]).toMatchObject({ reviews: 1, reviewXp: 5 });
    expect(days[today()]).toMatchObject({ reviews: 1, reviewXp: 5 });

    // q-multi: answered live today, then yesterday's offline answer arrives.
    const live = await session();
    expect(live.json.items.map((i) => i.challengeId)).toContain('q-multi');
    expect((await answer({ sessionId: live.json.sessionId, challengeId: 'q-multi', answer: [0, 2], attempts: 1 })).json.awardedXp).toBe(5);
    const late = await merge({ progress: { completedChallenges: [], attempts: {} }, reviewLog: [event('q-multi', `${yesterday}T10:00:00.000Z`)] });
    expect(late.json.awardedReviewXp).toBe(0);
    expect(store.getProgress('u1').xp).toBe(15);
  });

  it('counts only the Practice answers it pays towards the daily goal - never a count the browser sends', async () => {
    setRules({ goals: { options: [{ id: 'two', label: 'Two', blurb: '', metric: 'lessons', target: 2, bonusXp: 30, enabled: true }], defaultOptionId: 'two' } });
    const t = today();
    const solved = { completedChallenges: ['q-quiz'], attempts: { 'q-quiz': { challengeId: 'q-quiz', score: 100, attempts: 1, hintsUsed: 0, solvedAt: `${t}T10:00:00.000Z` } } };
    // A new account: one real solve, and 50 Practice answers the browser says it made.
    const made = await merge({ progress: solved, activity: { days: { [t]: { reviews: 50, reSolves: 0 } } } });
    expect(made.status).toBe(200);
    expect(made.json.bonuses).toEqual([]);
    expect(store.getActivity('u1').days[t]).toMatchObject({ lessons: 1, reviews: 0, goalBonusXp: 0 });

    // An honest guest: the same solve and one Practice answer in the review log -
    // priced here, so it counts, and the goal the merge replays is met.
    const honest = await app.call('POST', '/progress/merge', {
      user: 'u2',
      zone: 'UTC',
      body: { progress: solved, reviewLog: [{ challengeId: 'q-quiz', sessionId: 'local-1', at: `${t}T11:00:00.000Z`, day: t, outcome: 'clean', correct: true }] }
    });
    expect(honest.json.awardedReviewXp).toBe(5);
    expect(honest.json.bonuses).toEqual([{ kind: 'daily-goal', day: t, xp: 30 }]);
    expect(store.getActivity('u2').days[t]).toMatchObject({ lessons: 1, reviews: 1, goalBonusXp: 30 });
  });

  it('replays a day with only offline Practice on it for the streak and the goal, as a live answer counts', async () => {
    setRules({ goals: { options: [{ id: 'one', label: 'One', blurb: '', metric: 'lessons', target: 1, bonusXp: 10, enabled: true }], defaultOptionId: 'one' } });
    seedSolved();
    const yesterday = lib.addDays(today(), -1);
    const res = await merge({
      progress: { completedChallenges: [], attempts: {} },
      reviewLog: [{ challengeId: 'q-quiz', sessionId: 'local-1', at: `${yesterday}T09:00:00.000Z`, day: yesterday, outcome: 'clean', correct: true }]
    });
    expect(res.status).toBe(200);
    expect(res.json.awardedReviewXp).toBe(5);
    expect(res.json.bonuses).toEqual([{ kind: 'daily-goal', day: yesterday, xp: 10 }]);
    expect(store.getProgress('u1')).toMatchObject({ lastActiveDay: yesterday, streak: 1, xp: 15 });
    expect(store.getActivity('u1').days[yesterday]).toMatchObject({ reviews: 1, reviewXp: 5, goalBonusXp: 10 });
    // The same log again: nothing paid, nothing replayed.
    const again = await merge({
      progress: { completedChallenges: [], attempts: {} },
      reviewLog: [{ challengeId: 'q-quiz', sessionId: 'local-1', at: `${yesterday}T09:00:00.000Z`, day: yesterday, outcome: 'clean', correct: true }]
    });
    expect(again.json).toMatchObject({ awardedReviewXp: 0, bonuses: [] });
    expect(store.getProgress('u1')).toMatchObject({ streak: 1, xp: 15 });
  });

  it('takes a newer schedule entry, never a paid day, and ignores questions it does not know', async () => {
    seedSolved();
    const last = new Date().toISOString();
    const res = await merge({
      progress: {
        completedChallenges: [],
        attempts: {},
        review: { 'q-quiz': { box: 3, due: lib.addDays(today(), 21), last, paid: today() }, nope: { box: 1, due: today(), last } }
      }
    });
    expect(res.status).toBe(200);
    const review = store.getProgress('u1').review;
    expect(review['q-quiz']).toEqual({ box: 3, due: lib.addDays(today(), 21), last });
    expect(review.nope).toBeUndefined();
  });

  it('only pays questions the account has solved, and applies the daily cap', async () => {
    setRules({ review: { xp: { dailyCap: 6 } } });
    store.setProgress('u1', { ...store.getProgress('u1'), completedChallenges: ['q-quiz', 'q-multi'] });
    const iso = new Date().toISOString();
    const res = await merge({
      progress: { completedChallenges: [], attempts: {} },
      reviewLog: ['q-quiz', 'q-multi', 'q-blank'].map((challengeId) => ({ challengeId, sessionId: 'local-1', at: iso, day: iso.slice(0, 10), outcome: 'clean', correct: true }))
    });
    expect(res.json.awardedReviewXp).toBe(6);
  });

  it('a clean answer made offline fixes a mistake it came after - not one missed again since', async () => {
    seedSolved();
    const u1 = store.findUserById('u1');
    const yesterday = lib.addDays(today(), -1);
    const miss = (challengeId, at) => ({ challengeId, answer: { kind: 'choice', index: 0 }, keys: ['o0'], context: 'lesson', final: false, at });
    app.learningDeps.activity.recordMisses(u1, [miss('q-quiz', `${yesterday}T08:00:00.000Z`), miss('q-multi', `${yesterday}T08:00:00.000Z`)]);
    // q-multi was missed again after its offline answer.
    app.learningDeps.activity.recordMisses(u1, [miss('q-multi', `${today()}T10:00:00.000Z`)]);
    const event = (challengeId, iso) => ({ challengeId, sessionId: 'local-1', at: iso, day: iso.slice(0, 10), outcome: 'clean', correct: true });
    const res = await merge({
      progress: { completedChallenges: [], attempts: {} },
      reviewLog: [event('q-quiz', `${yesterday}T09:00:00.000Z`), event('q-multi', `${yesterday}T09:00:00.000Z`)]
    });
    expect(res.status).toBe(200);
    const misses = app.learningDeps.activity.load(u1).misses;
    expect(misses['q-quiz'].open).toBe(false);
    expect(misses['q-multi'].open).toBe(true);
  });
});
