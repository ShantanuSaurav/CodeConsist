/**
 * Wrong answers and days in the learner's own time zone, at the HTTP
 * boundary: POST /api/activity/misses, GET /api/activity, and the zone
 * capture every write route does.
 *
 * Real server/db.js with node:fs/promises stubbed, the real shared rules and
 * services. Only `Date` is faked in the zone tests, so HTTP keeps working.
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('node:fs/promises', () => ({
  readFile: async () => '{}',
  writeFile: async () => {},
  rename: async () => {},
  mkdir: async () => {}
}));

import * as store from '../db.js';
import { resetStore, startLearnerApp } from './learning-fixture.mjs';

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
});

afterEach(() => {
  vi.useRealTimers();
});

const misses = (list, extra = {}) => app.call('POST', '/activity/misses', { user: 'u1', zone: 'UTC', body: { misses: list }, ...extra });
const setRules = (patch) => {
  const service = app.learningDeps.settings;
  const result = service.update({ revision: service.revision(), patch });
  expect(result.ok).toBe(true);
};

describe('POST /api/activity/misses', () => {
  it('needs a signed-in learner', async () => {
    const res = await app.call('POST', '/activity/misses', { body: { misses: [{ challengeId: 'q-quiz', answer: 0 }] } });
    expect(res.status).toBe(401);
  });

  it('records a wrong answer - and never as an attempt', async () => {
    const res = await misses([{ challengeId: 'q-quiz', answer: 2 }]);
    expect(res.status).toBe(200);
    expect(res.json).toMatchObject({ accepted: 1, dropped: 0 });
    expect(res.json.today).toMatchObject({ mistakes: 1, xp: 0 });
    expect(res.json.misses['q-quiz']).toMatchObject({ count: 1, keys: { o2: 1 }, lastAnswer: { kind: 'choice', index: 2 }, open: true });
    // Badges are derived from `attempts`; a miss must never create one.
    expect(store.getProgress('u1').attempts).toEqual({});
  });

  it('404s a single unknown challenge', async () => {
    const res = await misses([{ challengeId: 'nope', answer: 1 }]);
    expect(res.status).toBe(404);
  });

  it('refuses a correct answer', async () => {
    const res = await misses([{ challengeId: 'q-blank', answer: ['x'] }]);
    expect(res.status).toBe(400);
    expect(res.json.error).toBe('That answer is correct - record it through /progress/solve.');
    expect(store.getActivity('u1')).toBeNull();
  });

  it('refuses a correct answer sent already reduced, in the form a miss is stored in', async () => {
    // The grader does not read `{ kind, ... }`; the route grades the reduced
    // answer too, so none of these can be stored as a miss.
    const correct = [
      { challengeId: 'q-quiz', answer: { kind: 'choice', index: 1 } },
      { challengeId: 'q-multi', answer: { kind: 'multi', indices: [0, 2] } },
      { challengeId: 'q-blank', answer: { kind: 'blanks', values: ['x'] } },
      { challengeId: 'q-order', answer: { kind: 'order', lines: [0, 1, 2] } },
      // The raw form of an ordering answer is the lines as text.
      { challengeId: 'q-order', answer: ['start', 'loop', 'end'] }
    ];
    for (const item of correct) {
      const res = await misses([item]);
      expect(res.status, JSON.stringify(item)).toBe(400);
      expect(res.json.error).toBe('That answer is correct - record it through /progress/solve.');
    }
    expect(store.getActivity('u1')).toBeNull();

    // Wrong answers in the same form are still misses.
    const wrong = await misses([
      { challengeId: 'q-quiz', answer: { kind: 'choice', index: 2 } },
      { challengeId: 'q-multi', answer: { kind: 'multi', indices: [0] } },
      { challengeId: 'q-blank', answer: { kind: 'blanks', values: ['y'] } },
      { challengeId: 'q-order', answer: { kind: 'order', lines: [2, 1, 0] } }
    ]);
    expect(wrong.json).toMatchObject({ accepted: 4, dropped: 0 });
    expect(wrong.json.misses['q-quiz'].keys).toEqual({ o2: 1 });
    expect(wrong.json.misses['q-order'].keys).toEqual({ order: 1 });
  });

  it('accepts a batch and drops what does not fit, counting both', async () => {
    const res = await misses([
      { challengeId: 'q-quiz', answer: 0, context: 'lesson' },
      { challengeId: 'q-multi', answer: [1, 3], context: 'library' },
      { challengeId: 'q-code', code: { passed: 1, total: 3 } },
      { challengeId: 'q-code', code: { passed: 3, total: 3 } }, // a pass is not a miss
      { challengeId: 'nope', answer: 1 }, // unknown, in a batch: dropped
      { challengeId: 'q-quiz', answer: 9 }, // malformed
      { challengeId: 'q-blank' } // no answer
    ]);
    expect(res.status).toBe(200);
    expect(res.json).toMatchObject({ accepted: 3, dropped: 4 });
    expect(res.json.misses['q-code']).toMatchObject({ codeOnly: true, lastAnswer: { kind: 'code', passed: 1, total: 3 } });
    const log = store.getActivity('u1');
    expect(log.missLog.map((e) => e.context)).toEqual(['lesson', 'library', 'lesson']);
    // Code is never stored - only a pass count.
    expect(JSON.stringify(log)).not.toContain('function');
  });

  it('wants 1 to 50 items', async () => {
    expect((await misses([])).status).toBe(400);
    expect((await misses(Array.from({ length: 51 }, () => ({ challengeId: 'q-quiz', answer: 0 })))).status).toBe(400);
    expect((await app.call('POST', '/activity/misses', { user: 'u1', body: { misses: 'nope' } })).status).toBe(400);
  });

  it('applies the per-question daily cap', async () => {
    setRules({ retention: { missesPerItemPerDay: 2 } });
    const t = Date.now();
    const res = await misses([0, 1, 2].map((i) => ({ challengeId: 'q-quiz', answer: 0, at: new Date(t - i * 1000).toISOString() })));
    expect(res.json).toMatchObject({ accepted: 2, dropped: 1 });
    // Another question still has room.
    expect((await misses([{ challengeId: 'q-multi', answer: [1] }])).json.accepted).toBe(1);
  });

  it('applies the per-day cap', async () => {
    setRules({ retention: { missesPerDay: 2 } });
    const res = await misses([
      { challengeId: 'q-quiz', answer: 0 },
      { challengeId: 'q-multi', answer: [1] },
      { challengeId: 't-test', answer: 1 }
    ]);
    expect(res.json).toMatchObject({ accepted: 2, dropped: 1 });
    expect(res.json.today.mistakes).toBe(2);
  });

  it('cuts typed answers to the length cap', async () => {
    setRules({ retention: { answerMaxChars: 20 } });
    await misses([{ challengeId: 'q-blank', answer: ['y'.repeat(300)] }]);
    expect(store.getActivity('u1').missLog[0].answer).toEqual({ kind: 'blanks', values: ['y'.repeat(20)] });
  });

  it('clamps a claimed time to the last week', async () => {
    const res = await misses([{ challengeId: 'q-quiz', answer: 0, at: '2001-01-01T00:00:00Z' }]);
    expect(res.json.accepted).toBe(1);
    const at = Date.parse(store.getActivity('u1').missLog[0].at);
    expect(Date.now() - at).toBeLessThanOrEqual(7 * 86_400_000 + 1000);
  });

  it('does not count the same miss twice', async () => {
    const at = new Date().toISOString();
    await misses([{ challengeId: 'q-quiz', answer: 0, at }]);
    const again = await misses([{ challengeId: 'q-quiz', answer: 0, at }]);
    expect(again.json).toMatchObject({ accepted: 0, dropped: 1 });
  });
});

describe('days in the learner’s time zone', () => {
  // 20:00Z on the 25th is 01:30 on the 26th in Kolkata and 13:00 on the 25th in Los Angeles.
  const EVENING = new Date('2026-09-25T20:00:00Z');

  it('GET /activity returns days in the learner’s zone', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(EVENING);
    const solve = await app.call('POST', '/progress/solve', { user: 'u1', zone: 'Asia/Kolkata', body: { challengeId: 'q-quiz', answer: 1 } });
    expect(solve.json.today.day).toBe('2026-09-26');

    const view = await app.call('GET', '/activity', { user: 'u1' });
    expect(view.json).toMatchObject({ timeZone: 'Asia/Kolkata', today: '2026-09-26', from: '2026-06-21' });
    expect(Object.keys(view.json.days)).toEqual(['2026-09-26']);

    const narrow = await app.call('GET', '/activity?from=2026-09-26', { user: 'u1' });
    expect(narrow.json.from).toBe('2026-09-26');
    expect((await app.call('GET', '/activity?from=yesterday', { user: 'u1' })).status).toBe(400);
  });

  it('the first header sets the zone, and a change inside the cooldown is ignored', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(EVENING);
    await misses([{ challengeId: 'q-quiz', answer: 0 }], { zone: 'Asia/Kolkata' });
    expect(store.findUserById('u1').preferences).toMatchObject({ timeZone: 'Asia/Kolkata', timeZoneSetAt: EVENING.toISOString() });

    await misses([{ challengeId: 'q-quiz', answer: 2 }], { zone: 'America/Los_Angeles' });
    expect(store.findUserById('u1').preferences.timeZone).toBe('Asia/Kolkata');

    // 21 hours later the 20-hour cooldown is over.
    vi.setSystemTime(new Date(EVENING.getTime() + 21 * 3_600_000));
    await misses([{ challengeId: 'q-multi', answer: [1] }], { zone: 'America/Los_Angeles' });
    expect(store.findUserById('u1').preferences.timeZone).toBe('America/Los_Angeles');
  });

  it('an invalid header is ignored', async () => {
    await misses([{ challengeId: 'q-quiz', answer: 0 }], { zone: 'Mars/Olympus_Mons' });
    expect(store.findUserById('u1').preferences?.timeZone ?? null).toBeNull();
    await misses([{ challengeId: 'q-quiz', answer: 2 }], { zone: 'Asia/Kolkata; DROP TABLE' });
    expect(store.findUserById('u1').preferences?.timeZone ?? null).toBeNull();
  });

  it('reads never change the zone', async () => {
    await app.call('GET', '/activity', { user: 'u1', zone: 'Asia/Tokyo' });
    await app.call('GET', '/progress', { user: 'u1', zone: 'Asia/Tokyo' });
    expect(store.findUserById('u1').preferences?.timeZone ?? null).toBeNull();
  });

  it('the day never moves backwards across a zone flip', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(EVENING);
    setRules({ streak: { timeZoneChangeCooldownHours: 0 } });

    const east = await app.call('POST', '/progress/solve', { user: 'u1', zone: 'Asia/Kolkata', body: { challengeId: 'q-quiz', answer: 1 } });
    expect(east.json.today.day).toBe('2026-09-26');

    // Flip west, where it is still the 25th: the learner's day stays the 26th,
    // so the 25th cannot be replayed.
    const west = await app.call('POST', '/progress/solve', { user: 'u1', zone: 'America/Los_Angeles', body: { challengeId: 'q-multi', answer: [0, 2] } });
    expect(store.findUserById('u1').preferences.timeZone).toBe('America/Los_Angeles');
    expect(west.json.today.day).toBe('2026-09-26');
    expect(west.json.progress.lastActiveDay).toBe('2026-09-26');
    expect(west.json.progress.streak).toBe(1);

    const view = await app.call('GET', '/activity', { user: 'u1' });
    expect(view.json.today).toBe('2026-09-26');
    expect(Object.keys(view.json.days)).toEqual(['2026-09-26']);
    expect(view.json.days['2026-09-26']).toMatchObject({ lessons: 2, xp: 90 });
  });

  it('falls back to the default zone setting, then the server’s own', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(EVENING);
    // No header ever sent: the fixture's server zone is UTC.
    expect((await app.call('GET', '/activity', { user: 'u1' })).json).toMatchObject({ timeZone: 'UTC', today: '2026-09-25' });
    setRules({ streak: { defaultTimeZone: 'Asia/Kolkata' } });
    expect((await app.call('GET', '/activity', { user: 'u1' })).json).toMatchObject({ timeZone: 'Asia/Kolkata', today: '2026-09-26' });
  });
});

describe('a merged activity log is re-checked, not trusted', () => {
  // 20:00Z on the 25th; the learner's zone is UTC, so their day is the 25th.
  const NOW = new Date('2026-09-25T20:00:00Z');
  const ago = (ms) => new Date(NOW.getTime() - ms).toISOString();
  const merge = (activity) => app.call('POST', '/progress/merge', { user: 'u1', zone: 'UTC', body: { progress: {}, activity } });
  const summary = (over = {}) => ({
    count: 1,
    firstAt: ago(3_600_000),
    lastAt: ago(60_000),
    lastDay: '2026-09-25',
    lastDayCount: 1,
    open: true,
    revealed: 0,
    keys: {},
    lastAnswer: null,
    ...over
  });

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW);
  });

  it('keeps only real wrong-answer keys, and never a correct last answer', async () => {
    const res = await merge({
      days: {},
      missLog: [],
      misses: {
        // o1 is the right answer, o9 is no option, a blank key is not a quiz key.
        'q-quiz': summary({ count: 6, keys: { o1: 5, o2: 1, o9: 3, 'b0:free text': 2 }, lastAnswer: { kind: 'choice', index: 1 }, codeOnly: true }),
        'q-blank': summary({ count: 3, keys: { 'b0:x': 2, 'b0:y': 1 }, lastAnswer: { kind: 'blanks', values: ['x'] } }),
        'q-code': summary({ count: 2, keys: { order: 2 }, lastAnswer: { kind: 'code', passed: 1, total: 3 } }),
        ghost: summary()
      }
    });
    expect(res.status).toBe(200);
    const { misses: stored } = store.getActivity('u1');
    expect(stored['q-quiz']).toMatchObject({ count: 6, keys: { o2: 1 }, lastAnswer: null });
    expect(stored['q-quiz'].codeOnly).toBeUndefined();
    expect(stored['q-blank']).toMatchObject({ keys: { 'b0:y': 1 }, lastAnswer: null });
    expect(stored['q-code']).toMatchObject({ keys: {}, codeOnly: true, lastAnswer: { kind: 'code', passed: 1, total: 3 } });
    expect(stored.ghost).toBeUndefined();
  });

  it('caps what a summary can claim at the daily cap over the days it spans', async () => {
    await merge({
      days: {},
      missLog: [],
      misses: { 'q-quiz': summary({ count: 1_000_000, lastDayCount: 1_000_000, revealed: 1_000_000, keys: { o2: 1_000_000 } }) }
    });
    // missesPerItemPerDay (20) for two days: its first miss today, plus a day of slack for zones.
    expect(store.getActivity('u1').misses['q-quiz']).toMatchObject({ count: 40, lastDayCount: 20, revealed: 40, keys: { o2: 40 } });
  });

  it('refuses a summary or an entry from the future', async () => {
    const later = new Date(NOW.getTime() + 3_600_000).toISOString();
    await merge({
      days: {},
      misses: { 'q-quiz': summary({ lastAt: later }) },
      missLog: [{ challengeId: 'q-quiz', at: later, day: '2026-09-25', context: 'lesson', answer: { kind: 'choice', index: 2 }, final: false }]
    });
    const log = store.getActivity('u1');
    expect(log.misses['q-quiz']).toBeUndefined();
    expect(log.missLog).toEqual([]);
  });

  it('works each entry’s day out again from its time, and applies the daily caps', async () => {
    setRules({ retention: { missesPerItemPerDay: 2, missesPerDay: 4 } });
    const entry = (challengeId, msAgo, day, answer) => ({ challengeId, at: ago(msAgo), day, context: 'lesson', answer, final: false });
    await merge({
      days: { '2026-09-25': { mistakes: 1_000_000 } },
      misses: {},
      missLog: [
        // Claimed for the 25th; it happened three days earlier.
        entry('q-blank', 3 * 86_400_000, '2026-09-25', { kind: 'blanks', values: ['z'] }),
        entry('q-quiz', 300_000, '2026-09-25', { kind: 'choice', index: 0 }),
        entry('q-quiz', 240_000, '2026-09-25', { kind: 'choice', index: 2 }),
        entry('q-quiz', 180_000, '2026-09-25', { kind: 'choice', index: 0 }), // a third for q-quiz today: over the per-question cap
        entry('q-multi', 120_000, '2026-09-25', { kind: 'multi', indices: [1] }),
        // Claimed for the 20th; it happened a minute ago.
        entry('q-blank', 60_000, '2026-09-20', { kind: 'blanks', values: ['y'] }),
        entry('q-multi', 30_000, '2026-09-25', { kind: 'multi', indices: [3] }) // a fifth today: over the per-day cap
      ]
    });
    const log = store.getActivity('u1');
    expect(log.missLog.map((e) => `${e.challengeId}@${e.day}`)).toEqual([
      'q-blank@2026-09-22',
      'q-quiz@2026-09-25',
      'q-quiz@2026-09-25',
      'q-multi@2026-09-25',
      'q-blank@2026-09-25'
    ]);
    // A day's mistakes are capped too.
    expect(log.days['2026-09-25'].mistakes).toBe(4);
  });
});
