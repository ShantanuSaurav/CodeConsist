/**
 * The progress routes at the HTTP boundary, after their move out of
 * server/index.js into server/progress-routes.js.
 *
 * The first block pins what the routes did BEFORE the move (and must keep
 * doing): the characterization. The rest covers what Phase 1 changed - the
 * first-solve time is kept, the day row counts only awarded XP, the rules
 * come from the settings store, and a merge carries activity idempotently.
 *
 * Real server/db.js with node:fs/promises stubbed (as in drafts.test.mjs),
 * the real shared rules, the real settings and activity services.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('node:fs/promises', () => ({
  readFile: async () => '{}',
  writeFile: async () => {},
  rename: async () => {},
  mkdir: async () => {}
}));

import * as store from '../db.js';
import { PASSING_CODE, resetStore, startLearnerApp } from './learning-fixture.mjs';

let app;

beforeAll(async () => {
  await store.load();
  // With the fixture's units (two lessons, then three), so a unit can be completed.
  app = await startLearnerApp(store, { units: true });
});

afterAll(async () => {
  await app.close();
});

beforeEach(() => {
  resetStore(store);
  app.cleared.length = 0;
});

const solve = (body, extra = {}) => app.call('POST', '/progress/solve', { user: 'u1', body, ...extra });

/* -------------------------------------------------------- characterization */

describe('characterization: what the routes did before the move', () => {
  it('404s for a challenge the server does not have', async () => {
    const res = await solve({ challengeId: 'nope', answer: 1 });
    expect(res.status).toBe(404);
    expect(res.json.error).toBe('Unknown challenge.');
  });

  it('needs a signed-in learner', async () => {
    expect((await app.call('POST', '/progress/solve', { body: { challengeId: 'q-quiz', answer: 1 } })).status).toBe(401);
    expect((await app.call('GET', '/progress')).status).toBe(401);
    expect((await app.call('POST', '/progress/merge', { body: {} })).status).toBe(401);
    expect((await app.call('POST', '/progress/reset')).status).toBe(401);
  });

  it('422s a wrong answer and records nothing', async () => {
    const res = await solve({ challengeId: 'q-quiz', answer: 0 });
    expect(res.status).toBe(422);
    expect(res.json.error).toBe('That submission does not solve the challenge.');
    expect(store.getProgress('u1').completedChallenges).toEqual([]);
  });

  it('422s a correct answer below the pass mark', async () => {
    const res = await solve({ challengeId: 'q-quiz', answer: 1, attempts: 6 });
    expect(res.status).toBe(422);
    expect(res.json).toMatchObject({ reason: 'below-pass-mark', score: 50 });
    expect(res.json.error).toBe('Correct, but below the pass mark of 60%. Retry the lesson for a fresh attempt.');
    expect(store.getProgress('u1').xp).toBe(0);
  });

  it('pays XP once, from its own maths, and ignores any XP the client claims', async () => {
    const first = await solve({ challengeId: 'q-quiz', answer: 1, attempts: 3, xp: 99999, awardedXp: 5000 });
    expect(first.status).toBe(200);
    expect(first.json).toMatchObject({ awardedXp: 32, score: 80, firstSolve: true, verified: true });
    expect(first.json.progress).toMatchObject({ xp: 32, level: 1, streak: 1, bestStreak: 1, completedChallenges: ['q-quiz'] });
    expect(first.json.progress.attempts['q-quiz']).toMatchObject({ challengeId: 'q-quiz', score: 80, attempts: 3, hintsUsed: 0 });

    const again = await solve({ challengeId: 'q-quiz', answer: 1 });
    expect(again.json).toMatchObject({ awardedXp: 0, score: 100, firstSolve: false });
    expect(again.json.progress.xp).toBe(32);
    // The best score is kept, the tries add up.
    expect(again.json.progress.attempts['q-quiz']).toMatchObject({ score: 100, attempts: 4 });
  });

  it('clamps tries and hints like it always did', async () => {
    const res = await solve({ challengeId: 'q-quiz', answer: 1, attempts: 'lots', hintsUsed: -4 });
    expect(res.json).toMatchObject({ awardedXp: 40, score: 100 });
  });

  it('verifies code, and drops the draft on a solve', async () => {
    expect((await solve({ challengeId: 'q-code', code: 'nope' })).status).toBe(422);
    const res = await solve({ challengeId: 'q-code', code: PASSING_CODE });
    expect(res.json.awardedXp).toBe(70);
    expect(app.cleared).toEqual([['u1', 'q-code']]);
  });

  it('re-prices a merge from the server’s own content', async () => {
    const res = await app.call('POST', '/progress/merge', {
      user: 'u1',
      body: {
        progress: {
          xp: 99999,
          level: 80,
          streak: 3,
          bestStreak: 5000,
          lastActiveDay: '2026-01-01',
          completedChallenges: ['q-quiz', 'q-blank', 'not-a-challenge'],
          attempts: { 'q-quiz': { attempts: 3, hintsUsed: 0 }, 'q-blank': { attempts: 1, hintsUsed: 1 } }
        }
      }
    });
    expect(res.status).toBe(200);
    expect(res.json).toMatchObject({ mergedChallenges: 2, awardedXp: 32 + 54 });
    // Stored as before the move. The response now reports the streak as it
    // stands on the learner's today, like GET /progress and /auth/me (the
    // browser adopts it as it is): last active on 1 January, it is over.
    expect(store.getProgress('u1')).toMatchObject({ xp: 86, level: 1, streak: 3, bestStreak: 400 });
    expect(res.json.progress).toMatchObject({ xp: 86, level: 1, streak: 0, bestStreak: 400 });
    expect(res.json.progress.completedChallenges).toEqual(['q-quiz', 'q-blank']);

    // Already paid: a second merge of the same ids pays nothing.
    const again = await app.call('POST', '/progress/merge', { user: 'u1', body: { progress: { completedChallenges: ['q-quiz'] } } });
    expect(again.json).toMatchObject({ mergedChallenges: 0, awardedXp: 0 });
    expect(again.json.progress.xp).toBe(86);
  });

  it('reset starts the row over', async () => {
    await solve({ challengeId: 'q-quiz', answer: 1 });
    const res = await app.call('POST', '/progress/reset', { user: 'u1' });
    expect(res.json.progress).toMatchObject({ xp: 0, level: 1, streak: 0, bestStreak: 0, lastActiveDay: null, completedChallenges: [], completedStages: [], attempts: {}, unitsCompleted: {} });
    // Phase 3: the streak history survives a reset - the run just closed is in it.
    expect(res.json.progress.habit).toMatchObject({ freezes: 0, repair: null, runStart: null });
    expect(res.json.progress.habit.runs).toEqual([expect.objectContaining({ length: 1, ended: 'reset' })]);
    expect(store.getProgress('u1').xp).toBe(0);
  });

  it('GET /progress reports level and streak as they stand', async () => {
    store.setProgress('u1', { ...store.getProgress('u1'), xp: 1000, level: 1, streak: 9, lastActiveDay: '2020-01-01' });
    const res = await app.call('GET', '/progress', { user: 'u1' });
    expect(res.json.progress).toMatchObject({ xp: 1000, level: 5, streak: 0 });
  });
});

/* --------------------------------------------------------------- phase 1 */

describe('first-solve time', () => {
  it('a re-solve keeps solvedAt and moves lastSolvedAt', async () => {
    const first = await solve({ challengeId: 'q-quiz', answer: 1 });
    const firstAt = first.json.progress.attempts['q-quiz'].solvedAt;
    expect(first.json.progress.attempts['q-quiz']).toMatchObject({ solvedAt: firstAt, lastSolvedAt: firstAt, solves: 1 });

    await new Promise((r) => setTimeout(r, 5));
    const again = await solve({ challengeId: 'q-quiz', answer: 1 });
    const row = again.json.progress.attempts['q-quiz'];
    expect(row.solvedAt).toBe(firstAt);
    expect(row.lastSolvedAt > firstAt).toBe(true);
    expect(row.solves).toBe(2);
  });

  it('counts a row written before `solves` existed as solved once', async () => {
    const old = { challengeId: 'q-quiz', score: 100, attempts: 1, hintsUsed: 0, solvedAt: '2026-01-02T10:00:00.000Z' };
    store.setProgress('u1', { ...store.getProgress('u1'), completedChallenges: ['q-quiz'], attempts: { 'q-quiz': old } });
    const res = await solve({ challengeId: 'q-quiz', answer: 1 });
    expect(res.json.progress.attempts['q-quiz']).toMatchObject({ solvedAt: '2026-01-02T10:00:00.000Z', solves: 2 });
  });
});

describe('the day row', () => {
  it('counts only XP that was awarded', async () => {
    const first = await solve({ challengeId: 'q-quiz', answer: 1 }, { zone: 'UTC' });
    expect(first.json.today).toMatchObject({ xp: 40, lessons: 1, reSolves: 0, tests: 0 });
    const again = await solve({ challengeId: 'q-quiz', answer: 1 }, { zone: 'UTC' });
    expect(again.json.today).toMatchObject({ xp: 40, lessons: 1, reSolves: 1 });
    const test = await solve({ challengeId: 't-test', answer: 0 }, { zone: 'UTC' });
    expect(test.json.today).toMatchObject({ xp: 190, lessons: 1, tests: 1, reSolves: 1 });
    expect(test.json.today.day).toBe(first.json.progress.lastActiveDay);
  });

  it('carries the settings revision', async () => {
    const res = await solve({ challengeId: 'q-quiz', answer: 1 });
    expect(res.json.settingsRevision).toBe(0);
  });
});

describe('rules from the settings store', () => {
  it('changing xp.passScore moves the 422 threshold at once', async () => {
    // 4 tries = 70 raw: passes at 60.
    expect((await solve({ challengeId: 'q-quiz', answer: 1, attempts: 4 })).status).toBe(200);

    const update = app.learningDeps.settings.update({ revision: 0, patch: { xp: { passScore: 70 } }, adminId: 'admin' });
    expect(update.ok).toBe(true);

    // 5 tries = 60 raw: now below the mark, and the message says so.
    const below = await solve({ challengeId: 'q-blank', answer: ['x'], attempts: 5 });
    expect(below.status).toBe(422);
    expect(below.json.error).toContain('pass mark of 70%');
    const at = await solve({ challengeId: 'q-blank', answer: ['x'], attempts: 4 });
    expect(at.status).toBe(200);
    expect(at.json.settingsRevision).toBe(1);
  });

  it('prices with the penalties from the store, and levels with its curve', async () => {
    app.learningDeps.settings.update({ revision: 0, patch: { xp: { retryPenalty: 20 }, levels: { thresholds: [0, 10, 20, 30] } } });
    const res = await solve({ challengeId: 'q-quiz', answer: 1, attempts: 2 });
    expect(res.json).toMatchObject({ awardedXp: 32, score: 80 });
    expect(res.json.progress.level).toBe(4);
  });
});

describe('merge with activity', () => {
  // One guest session, fixed in time, so sending it twice sends the same thing.
  const NOW = Date.now();
  const iso = (ago) => new Date(NOW - ago).toISOString();
  const today = iso(0).slice(0, 10);
  const guest = () => ({
    progress: {
      completedChallenges: ['q-quiz'],
      attempts: { 'q-quiz': { attempts: 1, hintsUsed: 0, solvedAt: iso(2 * 86_400_000) } }
    },
    activity: {
      days: {},
      misses: {
        'q-blank': { count: 2, firstAt: iso(3600_000), lastAt: iso(0), lastDay: today, lastDayCount: 2, open: true, revealed: 0, keys: { 'b0:y': 2 }, lastAnswer: { kind: 'blanks', values: ['y'] } }
      },
      missLog: [
        { challengeId: 'q-blank', at: iso(3600_000), day: today, context: 'lesson', answer: { kind: 'blanks', values: ['y'] }, final: false },
        // Correct - a forged "miss" that the server re-grades and drops.
        { challengeId: 'q-blank', at: iso(1800_000), day: today, context: 'lesson', answer: { kind: 'blanks', values: ['x'] }, final: false },
        // A challenge that does not exist.
        { challengeId: 'ghost', at: iso(0), day: today, context: 'lesson', answer: null, final: false }
      ]
    }
  });

  it('is idempotent', async () => {
    const once = await app.call('POST', '/progress/merge', { user: 'u1', zone: 'UTC', body: guest() });
    expect(once.json.awardedXp).toBe(40);
    const logAfterOnce = JSON.stringify(store.getActivity('u1'));

    const twice = await app.call('POST', '/progress/merge', { user: 'u1', zone: 'UTC', body: guest() });
    expect(twice.json.awardedXp).toBe(0);
    expect(twice.json.progress.xp).toBe(40);
    expect(JSON.stringify(store.getActivity('u1'))).toBe(logAfterOnce);
  });

  it('credits the solve on its own day, and keeps only real misses', async () => {
    const res = await app.call('POST', '/progress/merge', { user: 'u1', zone: 'UTC', body: guest() });
    const solvedDay = new Date(Date.now() - 2 * 86_400_000).toISOString().slice(0, 10);
    expect(res.json.activity.days[solvedDay]).toMatchObject({ xp: 40, lessons: 1 });
    expect(res.json.activity.misses['q-blank'].count).toBe(2);
    const log = store.getActivity('u1');
    expect(log.missLog).toHaveLength(1);
    expect(log.missLog[0].answer).toEqual({ kind: 'blanks', values: ['y'] });
  });

  it('clamps a future or ancient solve time to now', async () => {
    const before = Date.now();
    const res = await app.call('POST', '/progress/merge', {
      user: 'u1',
      body: {
        progress: {
          completedChallenges: ['q-quiz', 'q-blank'],
          attempts: { 'q-quiz': { solvedAt: '2099-01-01T00:00:00Z' }, 'q-blank': { solvedAt: '2001-01-01T00:00:00Z' } }
        }
      }
    });
    for (const id of ['q-quiz', 'q-blank']) {
      const at = Date.parse(res.json.progress.attempts[id].solvedAt);
      expect(at).toBeGreaterThanOrEqual(before - 1000);
      expect(at).toBeLessThanOrEqual(Date.now() + 1000);
    }
  });

  it('never lets a merged future day become the learner’s day', async () => {
    const res = await app.call('POST', '/progress/merge', { user: 'u1', zone: 'UTC', body: { progress: { lastActiveDay: '2099-01-01', streak: 3 } } });
    expect(res.json.progress.lastActiveDay).toBeNull();
  });
});

describe('reset and activity', () => {
  it('clears the misses and keeps the days', async () => {
    await solve({ challengeId: 'q-quiz', answer: 1 }, { zone: 'UTC' });
    await app.call('POST', '/activity/misses', { user: 'u1', zone: 'UTC', body: { misses: [{ challengeId: 'q-blank', answer: ['nope'] }] } });
    const before = store.getActivity('u1');
    expect(Object.keys(before.misses)).toEqual(['q-blank']);

    await app.call('POST', '/progress/reset', { user: 'u1' });
    const after = store.getActivity('u1');
    expect(after.misses).toEqual({});
    expect(after.missLog).toEqual([]);
    expect(after.days).toEqual(before.days);
  });
});

/* --------------------------------------------------------------- phase 2 */

/** Change the rules the way an admin's save does, on whatever revision is current. */
const setRules = (patch) => app.learningDeps.settings.update({ revision: app.learningDeps.settings.revision(), patch });

// The daily goal (Phase 3) pays its own bonus once a day's XP reaches it;
// these blocks are about the unit bonus alone, so goals are off in them.
const goalsOff = () => setRules({ goals: { enabled: false } });

describe('units: the perfect-unit bonus on a solve', () => {
  beforeEach(goalsOff);

  it('pays the bonus once, when a first solve completes a unit cleared first try', async () => {
    const first = await solve({ challengeId: 'q-quiz', answer: 1 }, { zone: 'UTC' });
    expect(first.json).toMatchObject({ bonuses: [], bonusXp: 0, unitCompleted: null });

    const done = await solve({ challengeId: 'q-multi', answer: [0, 2] }, { zone: 'UTC' });
    expect(done.status).toBe(200);
    expect(done.json).toMatchObject({
      awardedXp: 50,
      bonusXp: 25,
      bonuses: [{ kind: 'perfect-unit', unitId: 'stage-1:m1', xp: 25 }],
      unitCompleted: 'stage-1:m1',
      unitPerfect: true
    });
    expect(done.json.progress.xp).toBe(40 + 50 + 25);
    expect(done.json.progress.unitsCompleted['stage-1:m1']).toMatchObject({ perfect: true, bonusXp: 25 });
    // The day row: the bonus is in the day's XP and counted on its own.
    expect(done.json.today).toMatchObject({ xp: 115, lessons: 2, units: 1, perfectBonusXp: 25 });
    expect(store.getProgress('u1').xp).toBe(115);

    // A replay pays nothing more.
    const again = await solve({ challengeId: 'q-multi', answer: [0, 2] }, { zone: 'UTC' });
    expect(again.json).toMatchObject({ awardedXp: 0, bonusXp: 0, bonuses: [], unitCompleted: null });
    expect(again.json.progress.xp).toBe(115);
  });

  it('records a completion without a bonus when a lesson took a retry or a hint', async () => {
    await solve({ challengeId: 'q-blank', answer: ['x'], attempts: 2 });
    await solve({ challengeId: 'q-order', answer: ['start', 'loop', 'end'] });
    const done = await solve({ challengeId: 'q-code', code: PASSING_CODE });
    expect(done.json).toMatchObject({ bonusXp: 0, bonuses: [], unitCompleted: 'stage-1:m2', unitPerfect: false });
    expect(done.json.progress.unitsCompleted['stage-1:m2']).toMatchObject({ perfect: false, bonusXp: 0 });

    await solve({ challengeId: 'q-quiz', answer: 1, hintsUsed: 1 });
    const hinted = await solve({ challengeId: 'q-multi', answer: [0, 2] });
    expect(hinted.json).toMatchObject({ bonusXp: 0, unitCompleted: 'stage-1:m1', unitPerfect: false });
  });

  it('pays what units.perfectBonusXp says, and counts hints only while perfectRequiresNoHints is on', async () => {
    setRules({ units: { perfectBonusXp: 40, perfectRequiresNoHints: false } });
    await solve({ challengeId: 'q-quiz', answer: 1, hintsUsed: 1 });
    const done = await solve({ challengeId: 'q-multi', answer: [0, 2] });
    expect(done.json).toMatchObject({ bonusXp: 40, bonuses: [{ kind: 'perfect-unit', unitId: 'stage-1:m1', xp: 40 }] });
  });

  it('levels with the bonus included, on the curve from the store', async () => {
    setRules({ levels: { thresholds: [0, 50, 100, 110, 200], overflowStep: 100 } });
    await solve({ challengeId: 'q-quiz', answer: 1 });
    const done = await solve({ challengeId: 'q-multi', answer: [0, 2] });
    // 115 XP: past 110 (level 4) only because of the bonus.
    expect(done.json.progress).toMatchObject({ xp: 115, level: 4 });
  });

  it('never takes XP, a bonus or a completion from the request', async () => {
    const res = await solve({ challengeId: 'q-quiz', answer: 1, bonusXp: 500, unitsCompleted: { 'stage-1:m1': { perfect: true, bonusXp: 500 } } });
    expect(res.json.progress.xp).toBe(40);
    expect(res.json.progress.unitsCompleted).toEqual({});
  });

  it('reset clears the completions', async () => {
    await solve({ challengeId: 'q-quiz', answer: 1 });
    await solve({ challengeId: 'q-multi', answer: [0, 2] });
    await app.call('POST', '/progress/reset', { user: 'u1' });
    expect(store.getProgress('u1').unitsCompleted).toEqual({});
  });
});

describe('units: a merge pays only for units the new ids complete', () => {
  beforeEach(goalsOff);

  const merge = (progress, extra = {}) => app.call('POST', '/progress/merge', { user: 'u1', zone: 'UTC', body: { progress, ...extra } });
  const clean = (ids) => Object.fromEntries(ids.map((id) => [id, { attempts: 1, hintsUsed: 0 }]));

  it('pays a unit the merge completes, once', async () => {
    const res = await merge({ completedChallenges: ['q-quiz', 'q-multi'], attempts: clean(['q-quiz', 'q-multi']), xp: 99999, unitsCompleted: { forged: {} } });
    expect(res.json).toMatchObject({ awardedXp: 90, bonusXp: 25, bonuses: [{ kind: 'perfect-unit', unitId: 'stage-1:m1', xp: 25 }] });
    expect(res.json.progress.xp).toBe(115);
    expect(Object.keys(res.json.progress.unitsCompleted)).toEqual(['stage-1:m1']);
    // The bonus is on the day of the completing solve.
    const day = Object.values(res.json.activity.days).find((d) => d.units === 1);
    expect(day).toMatchObject({ perfectBonusXp: 25, xp: 115 });

    const again = await merge({ completedChallenges: ['q-quiz', 'q-multi'], attempts: clean(['q-quiz', 'q-multi']) });
    expect(again.json).toMatchObject({ awardedXp: 0, bonusXp: 0 });
    expect(again.json.progress.xp).toBe(115);
  });

  it('pays when a new id finishes a unit the account had started', async () => {
    await solve({ challengeId: 'q-quiz', answer: 1 });
    const res = await merge({ completedChallenges: ['q-multi'], attempts: clean(['q-multi']) });
    expect(res.json).toMatchObject({ bonusXp: 25 });
  });

  it('pays nothing for a unit that was complete before the merge', async () => {
    // Complete before units were recorded: no record, and no new id in it.
    store.setProgress('u1', {
      ...store.getProgress('u1'),
      completedChallenges: ['q-quiz', 'q-multi'],
      attempts: { 'q-quiz': { challengeId: 'q-quiz', score: 100, attempts: 1, hintsUsed: 0, solvedAt: new Date().toISOString() }, 'q-multi': { challengeId: 'q-multi', score: 100, attempts: 1, hintsUsed: 0, solvedAt: new Date().toISOString() } }
    });
    const res = await merge({ completedChallenges: ['q-quiz', 'q-multi', 'q-blank'], attempts: clean(['q-blank']) });
    expect(res.json).toMatchObject({ mergedChallenges: 1, bonusXp: 0 });
    expect(res.json.progress.unitsCompleted).toEqual({});
  });
});

describe('requeued and revealed (Phase 4)', () => {
  it('a plain body pays exactly what it did before the flags existed', async () => {
    const res = await solve({ challengeId: 'q-quiz', answer: 1, attempts: 2 });
    expect(res.json).toMatchObject({ awardedXp: 36, score: 90 });
  });

  it('requeued skips the pass mark: the floored score is paid', async () => {
    // 6 tries is 50 raw - below the mark of 60 on a first pass.
    expect((await solve({ challengeId: 'q-quiz', answer: 1, attempts: 6 })).status).toBe(422);
    // Only exactly true counts.
    expect((await solve({ challengeId: 'q-quiz', answer: 1, attempts: 6, requeued: 'yes' })).status).toBe(422);
    const res = await solve({ challengeId: 'q-quiz', answer: 1, attempts: 6, requeued: true });
    expect(res.status).toBe(200);
    expect(res.json).toMatchObject({ awardedXp: 20, score: 50, firstSolve: true });
    // A wrong answer is still refused, requeued or not.
    expect((await solve({ challengeId: 'q-multi', answer: [0], requeued: true })).status).toBe(422);
  });

  it('revealed caps the score by learning mode - Practice when none is sent', async () => {
    const practice = await solve({ challengeId: 'q-quiz', answer: 1, revealed: true, learningMode: 'practice' });
    expect(practice.json).toMatchObject({ awardedXp: 24, score: 60 });
    expect(practice.json.progress.attempts['q-quiz'].score).toBe(60);

    const learn = await solve({ challengeId: 'q-multi', answer: [0, 2], revealed: true, learningMode: 'learn' });
    expect(learn.json).toMatchObject({ awardedXp: 40, score: 80 });

    const none = await solve({ challengeId: 'q-blank', answer: ['x'], revealed: true });
    expect(none.json).toMatchObject({ awardedXp: 36, score: 60 });
  });

  it('the floor still holds under the cap, and a re-solve pays nothing', async () => {
    const res = await solve({ challengeId: 'q-quiz', answer: 1, attempts: 7, revealed: true, requeued: true, learningMode: 'learn' });
    expect(res.json).toMatchObject({ awardedXp: 20, score: 50 });
    const again = await solve({ challengeId: 'q-quiz', answer: 1, revealed: true, requeued: true });
    expect(again.json).toMatchObject({ awardedXp: 0, firstSolve: false });
    expect(again.json.progress.xp).toBe(20);
  });

  it('the cap is the admin setting at the time of the solve', async () => {
    const update = app.learningDeps.settings.update({ revision: 0, patch: { feedback: { requeue: { maxScoreAfterReveal: { practice: 90 } } } }, adminId: 'admin' });
    expect(update.ok).toBe(true);
    const res = await solve({ challengeId: 'q-quiz', answer: 1, revealed: true, learningMode: 'practice' });
    expect(res.json).toMatchObject({ awardedXp: 36, score: 90 });
  });
});

describe('a guest solve made after its answer was shown (Phase 4)', () => {
  it('merges under the cap it was paid under locally - never more', async () => {
    const res = await app.call('POST', '/progress/merge', {
      user: 'u1',
      body: { progress: { completedChallenges: ['q-quiz', 'q-multi'], attempts: { 'q-quiz': { attempts: 1, hintsUsed: 0, scoreCap: 60 }, 'q-multi': { attempts: 1, hintsUsed: 0, scoreCap: 'lots' } } } }
    });
    expect(res.status).toBe(200);
    // 40 XP at 60% is 24; the nonsense cap is ignored (50 XP in full).
    expect(res.json.awardedXp).toBe(24 + 50);
    expect(store.getProgress('u1').attempts['q-quiz']).toMatchObject({ score: 60, scoreCap: 60 });
    expect(store.getProgress('u1').attempts['q-multi']).not.toHaveProperty('scoreCap');
  });
});
