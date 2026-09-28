import { describe, expect, it } from 'vitest';
import type { ActivityLog, MissEntry, MissSummary } from '@/types';
import {
  activityGridFromLog,
  adoptActivityView,
  applyActivityEvent,
  backfillFromAttempts,
  dayRow,
  emptyActivityLog,
  jsonByteLength,
  markMissesSynced,
  mergeActivityLogs,
  missAllowed,
  normalizeActivityLog,
  normalizeDay,
  pruneDays,
  trimActivityForMerge,
  unsyncedMisses,
  withBackfill
} from '../log';

const RULES = { keepDays: 400, missLogCap: 300 };
const at = (day: string, time = '12:00:00') => `${day}T${time}.000Z`;

function solve(log: ActivityLog, day: string, opts: { id?: string; first?: boolean; test?: boolean; xp?: number; time?: string } = {}) {
  return applyActivityEvent(
    log,
    { type: 'solve', challengeId: opts.id ?? 'c1', isTest: Boolean(opts.test), firstSolve: opts.first ?? true, awardedXp: opts.xp ?? 40 },
    { day, at: at(day, opts.time), rules: RULES }
  );
}

function miss(log: ActivityLog, day: string, id = 'q1', opts: { time?: string; keys?: string[]; final?: boolean; synced?: false } = {}) {
  return applyActivityEvent(
    log,
    { type: 'miss', challengeId: id, context: 'lesson', answer: { kind: 'choice', index: 2 }, keys: opts.keys ?? ['o2'], final: opts.final, synced: opts.synced },
    { day, at: at(day, opts.time), rules: RULES }
  );
}

describe('solve events', () => {
  it('counts a first solve as a lesson and its XP', () => {
    const log = solve(emptyActivityLog(), '2026-09-25', { xp: 40 });
    expect(dayRow(log, '2026-09-25')).toMatchObject({ day: '2026-09-25', xp: 40, lessons: 1, tests: 0, reSolves: 0, source: 'live' });
    expect(log.lastDay).toBe('2026-09-25');
  });

  it('counts a re-solve apart, and it adds no XP', () => {
    let log = solve(emptyActivityLog(), '2026-09-25', { xp: 40 });
    log = solve(log, '2026-09-25', { first: false, xp: 0, time: '13:00:00' });
    expect(dayRow(log, '2026-09-25')).toMatchObject({ xp: 40, lessons: 1, reSolves: 1 });
    expect(dayRow(log, '2026-09-25').lastAt).toBe(at('2026-09-25', '13:00:00'));
  });

  it('counts a stage test as a test', () => {
    const log = solve(emptyActivityLog(), '2026-09-25', { test: true, xp: 150 });
    expect(dayRow(log, '2026-09-25')).toMatchObject({ tests: 1, lessons: 0, xp: 150 });
  });

  it('never mutates the log it was given', () => {
    const before = solve(emptyActivityLog(), '2026-09-25');
    const snapshot = JSON.stringify(before);
    solve(before, '2026-09-25');
    miss(before, '2026-09-25');
    expect(JSON.stringify(before)).toBe(snapshot);
  });
});

describe('miss events', () => {
  it('updates the day, the summary and the log', () => {
    let log = miss(emptyActivityLog(), '2026-09-25', 'q1', { time: '10:00:00' });
    log = miss(log, '2026-09-25', 'q1', { time: '11:00:00', final: true });
    expect(dayRow(log, '2026-09-25').mistakes).toBe(2);
    expect(log.misses.q1).toMatchObject({
      count: 2,
      firstAt: at('2026-09-25', '10:00:00'),
      lastAt: at('2026-09-25', '11:00:00'),
      lastDay: '2026-09-25',
      lastDayCount: 2,
      open: true,
      revealed: 1,
      keys: { o2: 2 },
      lastAnswer: { kind: 'choice', index: 2 }
    });
    expect(log.missLog).toHaveLength(2);
    expect(log.missLog[1]).toMatchObject({ challengeId: 'q1', final: true, day: '2026-09-25' });
  });

  it('keeps only the top five wrong-answer keys', () => {
    let log = emptyActivityLog();
    ['a', 'b', 'c', 'd', 'e', 'f', 'a'].forEach((k, i) => (log = miss(log, '2026-09-25', 'q1', { keys: [k], time: `10:0${i}:00` })));
    expect(Object.keys(log.misses.q1.keys)).toHaveLength(5);
    expect(log.misses.q1.keys.a).toBe(2);
  });

  it('caps the miss log, newest last', () => {
    let log = emptyActivityLog();
    for (let i = 0; i < 5; i++) {
      log = applyActivityEvent(
        log,
        { type: 'miss', challengeId: `q${i}`, context: 'lesson', answer: null },
        { day: '2026-09-25', at: at('2026-09-25', `10:0${i}:00`), rules: { keepDays: 400, missLogCap: 3 } }
      );
    }
    expect(log.missLog.map((e) => e.challengeId)).toEqual(['q2', 'q3', 'q4']);
    expect(Object.keys(log.misses)).toHaveLength(5); // summaries are never evicted
  });

  it('knows the daily caps', () => {
    let log = emptyActivityLog();
    log = miss(log, '2026-09-25', 'q1');
    log = miss(log, '2026-09-25', 'q1', { time: '13:00:00' });
    expect(missAllowed(log, 'q1', '2026-09-25', { perDay: 10, perItemPerDay: 2 })).toBe(false);
    expect(missAllowed(log, 'q2', '2026-09-25', { perDay: 10, perItemPerDay: 2 })).toBe(true);
    expect(missAllowed(log, 'q2', '2026-09-25', { perDay: 2, perItemPerDay: 20 })).toBe(false);
    expect(missAllowed(log, 'q1', '2026-09-26', { perDay: 10, perItemPerDay: 2 })).toBe(true);
  });

  it('treats __proto__ as an ordinary challenge id', () => {
    const log = miss(emptyActivityLog(), '2026-09-25', '__proto__');
    expect(Object.keys(log.misses)).toEqual(['__proto__']);
    expect(({} as any).count).toBeUndefined();
  });
});

describe('mergeActivityLogs', () => {
  const guest = (): ActivityLog => {
    let log = emptyActivityLog();
    log = solve(log, '2026-09-20', { id: 'c1', xp: 999 });
    log = solve(log, '2026-09-21', { id: 'c1', first: false, xp: 0 });
    log = miss(log, '2026-09-21', 'q1', { time: '09:00:00' });
    log = miss(log, '2026-09-21', 'q1', { time: '09:05:00' });
    return log;
  };
  const ctx = { today: '2026-09-25', rules: RULES };

  it('takes XP, lessons and tests only from the credits, never the received rows', () => {
    const merged = mergeActivityLogs(emptyActivityLog(), guest(), {
      ...ctx,
      credits: [{ challengeId: 'c1', day: '2026-09-20', at: at('2026-09-20'), isTest: false, awardedXp: 40 }]
    });
    expect(dayRow(merged, '2026-09-20')).toMatchObject({ xp: 40, lessons: 1, source: 'merge' });
    expect(dayRow(merged, '2026-09-21')).toMatchObject({ xp: 0, lessons: 0, reSolves: 1, mistakes: 2 });
  });

  it('merging twice equals merging once', () => {
    const server = solve(emptyActivityLog(), '2026-09-21', { id: 'c9', xp: 70 });
    const once = mergeActivityLogs(server, guest(), {
      ...ctx,
      credits: [{ challengeId: 'c1', day: '2026-09-20', at: at('2026-09-20'), isTest: false, awardedXp: 40 }]
    });
    // The second time round the solve is already on the account, so there is no credit.
    const twice = mergeActivityLogs(once, guest(), ctx);
    expect(twice).toEqual(once);
  });

  it('takes the larger count per day and per question, never the sum', () => {
    let server = emptyActivityLog();
    server = miss(server, '2026-09-21', 'q1', { time: '08:00:00' });
    server = miss(server, '2026-09-21', 'q1', { time: '08:30:00' });
    server = miss(server, '2026-09-21', 'q1', { time: '08:45:00' });
    const merged = mergeActivityLogs(server, guest(), ctx);
    expect(dayRow(merged, '2026-09-21').mistakes).toBe(3);
    expect(merged.misses.q1.count).toBe(3);
    expect(merged.misses.q1.firstAt).toBe(at('2026-09-21', '08:00:00'));
    expect(merged.misses.q1.lastAt).toBe(at('2026-09-21', '09:05:00'));
  });

  it('unions the miss log without duplicates', () => {
    const g = guest();
    const merged = mergeActivityLogs(g, g, ctx);
    expect(merged.missLog).toHaveLength(2);
  });

  it('lets the caller drop entries (the server re-grades them)', () => {
    const merged = mergeActivityLogs(emptyActivityLog(), guest(), { ...ctx, acceptEntry: (e: MissEntry) => (e.at.includes('09:05') ? null : e) });
    expect(merged.missLog.map((e) => e.at)).toEqual([at('2026-09-21', '09:00:00')]);
  });

  it('checks the window on the day the caller gives an entry, not the day it was sent with', () => {
    // Sent as the 21st; the caller works the day out again and puts it on the 24th.
    const merged = mergeActivityLogs(emptyActivityLog(), guest(), { ...ctx, acceptEntry: (e: MissEntry) => ({ ...e, day: '2026-09-24' }) });
    expect(merged.missLog.map((e) => e.day)).toEqual(['2026-09-24', '2026-09-24']);
    // ...and one it moves outside the window is dropped.
    expect(mergeActivityLogs(emptyActivityLog(), guest(), { ...ctx, acceptEntry: (e: MissEntry) => ({ ...e, day: '2026-09-26' }) }).missLog).toEqual([]);
  });

  it('lets the caller check, rewrite or drop each received summary (the server re-checks keys and answers)', () => {
    const merged = mergeActivityLogs(emptyActivityLog(), guest(), {
      ...ctx,
      acceptMiss: (id: string, s: MissSummary) => (id === 'q1' ? { ...s, keys: {}, lastAnswer: null } : null)
    });
    expect(merged.misses.q1).toMatchObject({ count: 2, keys: {}, lastAnswer: null });
    expect(mergeActivityLogs(emptyActivityLog(), guest(), { ...ctx, acceptMiss: () => null }).misses).toEqual({});
  });

  it('with the daily caps, nothing received counts past them', () => {
    const forged = normalizeActivityLog({
      days: { '2026-09-24': { mistakes: 999_999 } },
      misses: {
        q1: { count: 999_999, firstAt: at('2026-09-24'), lastAt: at('2026-09-24'), lastDay: '2026-09-24', lastDayCount: 999_999, revealed: 999_999, keys: { o2: 999_999 } }
      },
      missLog: [
        ...[0, 1, 2, 3].map((i) => ({ challengeId: 'q1', at: at('2026-09-24', `10:0${i}:00`), day: '2026-09-24', answer: null })),
        ...[4, 5].map((i) => ({ challengeId: 'q2', at: at('2026-09-24', `10:0${i}:00`), day: '2026-09-24', answer: null }))
      ]
    });
    const capped = { ...ctx, caps: { perDay: 4, perItemPerDay: 3 } };
    const merged = mergeActivityLogs(emptyActivityLog(), forged, capped);
    expect(dayRow(merged, '2026-09-24').mistakes).toBe(4);
    // First miss on the 24th, today the 25th: two days plus one of slack, at 3 a day.
    expect(merged.misses.q1).toMatchObject({ count: 9, lastDayCount: 3, revealed: 9, keys: { o2: 9 } });
    // Three for q1 (the per-question cap), then q2 fills the day's last place.
    expect(merged.missLog.map((e) => e.challengeId)).toEqual(['q1', 'q1', 'q1', 'q2']);
    // Still idempotent.
    expect(mergeActivityLogs(merged, forged, capped)).toEqual(merged);
  });

  it('ignores days after today and outside the window', () => {
    let incoming = emptyActivityLog();
    incoming = miss(incoming, '2026-10-01', 'q1');
    incoming = miss(incoming, '2020-01-01', 'q2');
    const merged = mergeActivityLogs(emptyActivityLog(), incoming, ctx);
    expect(Object.keys(merged.days)).toEqual([]);
    expect(merged.missLog).toEqual([]);
    expect(merged.misses.q1).toBeUndefined();
  });

  it('drops the pending flag once the server has an entry', () => {
    const offline = miss(emptyActivityLog(), '2026-09-24', 'q1', { synced: false });
    expect(unsyncedMisses(offline)).toHaveLength(1);
    const merged = mergeActivityLogs(emptyActivityLog(), offline, ctx);
    expect(unsyncedMisses(merged)).toHaveLength(0);
    expect(unsyncedMisses(markMissesSynced(offline))).toHaveLength(0);
  });
});

describe('pruning', () => {
  it('drops days older than the window', () => {
    let log = solve(emptyActivityLog(), '2026-01-01');
    log = solve(log, '2026-09-25');
    expect(Object.keys(log.days).sort()).toEqual(['2026-01-01', '2026-09-25']);
    expect(Object.keys(pruneDays(log, 30, '2026-09-25').days)).toEqual(['2026-09-25']);
    // Recording a new day prunes as it goes.
    const kept = applyActivityEvent(log, { type: 'solve', challengeId: 'c', isTest: false, firstSolve: true, awardedXp: 1 }, { day: '2026-09-26', at: at('2026-09-26'), rules: { keepDays: 10, missLogCap: 300 } });
    expect(Object.keys(kept.days).sort()).toEqual(['2026-09-25', '2026-09-26']);
  });
});

describe('backfill', () => {
  const lookup = (id: string) => (id === 't1' ? { isStageTest: true, xpReward: 150 } : id === 'gone' ? null : { xpReward: 40 });
  const attempts = {
    c1: { challengeId: 'c1', score: 100, attempts: 1, hintsUsed: 0, solvedAt: '2026-09-25T20:00:00Z' },
    c2: { challengeId: 'c2', score: 80, attempts: 3, hintsUsed: 0, solvedAt: '2026-09-25T10:00:00Z' },
    t1: { challengeId: 't1', score: 100, attempts: 1, hintsUsed: 0, solvedAt: '2026-09-20T10:00:00Z' },
    gone: { challengeId: 'gone', score: 100, attempts: 1, hintsUsed: 0, solvedAt: '2026-09-19T10:00:00Z' },
    bad: { challengeId: 'bad', solvedAt: 'not a date' }
  };

  it('rebuilds days from solvedAt in the given zone', () => {
    const days = backfillFromAttempts(attempts, lookup, 'Asia/Kolkata');
    // 20:00Z is already the 26th in Kolkata.
    expect(days['2026-09-26']).toMatchObject({ lessons: 1, xp: 40, source: 'backfill' });
    expect(days['2026-09-25']).toMatchObject({ lessons: 1, xp: 32 });
    expect(days['2026-09-20']).toMatchObject({ tests: 1, xp: 150 });
    expect(days['2026-09-19']).toMatchObject({ lessons: 1, xp: 0 });
    expect(Object.keys(days)).toHaveLength(4);
  });

  it('never overwrites a day the log already has', () => {
    const live = solve(emptyActivityLog(), '2026-09-26', { xp: 5 });
    const log = withBackfill(live, backfillFromAttempts(attempts, lookup, 'Asia/Kolkata'), '2026-09-26T00:00:00Z');
    expect(dayRow(log, '2026-09-26')).toMatchObject({ xp: 5, source: 'live' });
    expect(dayRow(log, '2026-09-25').source).toBe('backfill');
    expect(log.backfilledAt).toBe('2026-09-26T00:00:00Z');
  });
});

describe('the heatmap from the log', () => {
  it('ends on today, Monday first, with XP intensity', () => {
    let log = solve(emptyActivityLog(), '2026-09-25', { xp: 300 });
    log = solve(log, '2026-09-22', { first: false, xp: 0 });
    const grid = activityGridFromLog(log.days, 2, '2026-09-25', (day) => (day === '2026-09-15' ? 4 : 0));
    expect(grid).toHaveLength(2);
    expect(grid[0][0].day).toBe('2026-09-14'); // a Monday
    const cells = grid.flat();
    expect(cells.find((c) => c.day === '2026-09-25')).toMatchObject({ count: 1, xp: 300, level: 3 });
    expect(cells.find((c) => c.day === '2026-09-22')).toMatchObject({ count: 1, xp: 0, level: 1 });
    expect(cells.find((c) => c.day === '2026-09-15')).toMatchObject({ count: 4, level: 2 }); // from the fallback
    expect(cells.find((c) => c.day === '2026-09-27')).toMatchObject({ count: 0, level: 0 }); // after today
  });
});

describe('between server and browser', () => {
  it('trims what goes up with a merge', () => {
    let log = emptyActivityLog();
    log = solve(log, '2024-01-01');
    for (let i = 0; i < 5; i++) log = miss(log, '2026-09-25', `q${i}`, { time: `10:0${i}:00` });
    const trimmed = trimActivityForMerge(log, '2026-09-25', { keepDays: 400, missLogCap: 2 });
    expect(Object.keys(trimmed.days)).toEqual(['2026-09-25']);
    expect(trimmed.missLog).toHaveLength(2);
    expect(Object.keys(trimmed.misses)).toHaveLength(5);
  });

  describe('trimming to a size', () => {
    // Twenty days of solves, then forty misses with three long typed blanks each.
    const heavy = () => {
      let log = emptyActivityLog();
      for (let d = 1; d <= 20; d++) log = solve(log, `2026-09-${String(d).padStart(2, '0')}`);
      const long = 'z'.repeat(190);
      for (let i = 0; i < 40; i++) {
        log = applyActivityEvent(
          log,
          { type: 'miss', challengeId: `q${i % 5}`, context: 'lesson', answer: { kind: 'blanks', values: [long, long, long] }, keys: [] },
          { day: '2026-09-25', at: at('2026-09-25', `10:${String(i).padStart(2, '0')}:00`), rules: RULES }
        );
      }
      return log;
    };

    it('measures JSON in UTF-8 bytes, as the request body carries it', () => {
      for (const value of [{ a: 'plain' }, { a: 'é ü' }, { a: '日本語' }, { a: 'emoji 🎉' }, ['x', 1, null]]) {
        expect(jsonByteLength(value)).toBe(new TextEncoder().encode(JSON.stringify(value)).length);
      }
    });

    it('drops the oldest entries first, and stops once it fits', () => {
      const log = heavy();
      expect(jsonByteLength(trimActivityForMerge(log, '2026-09-25', RULES))).toBeGreaterThan(20_000);
      const trimmed = trimActivityForMerge(log, '2026-09-25', RULES, { maxBytes: 10_000 });
      expect(jsonByteLength(trimmed)).toBeLessThanOrEqual(10_000);
      expect(trimmed.missLog.length).toBeGreaterThan(0);
      expect(trimmed.missLog.length).toBeLessThan(40);
      expect(trimmed.missLog[trimmed.missLog.length - 1]).toEqual(log.missLog[log.missLog.length - 1]); // the newest stay
      expect(Object.keys(trimmed.days)).toHaveLength(21); // dropping entries was enough
      expect(Object.keys(trimmed.misses)).toHaveLength(5);
    });

    it('then the oldest days, then the stalest summaries', () => {
      const log = heavy();
      const tight = trimActivityForMerge(log, '2026-09-25', RULES, { maxBytes: 3_500 });
      expect(jsonByteLength(tight)).toBeLessThanOrEqual(3_500);
      expect(tight.missLog).toEqual([]);
      expect(Object.keys(tight.days)).not.toContain('2026-09-01');
      const nothing = trimActivityForMerge(log, '2026-09-25', RULES, { maxBytes: 0 });
      expect(nothing).toEqual({ days: {}, misses: {}, missLog: [] });
    });

    it("sends only what the server has not taken for a signed-in learner's own log", () => {
      let log = emptyActivityLog();
      log = solve(log, '2026-01-10');
      log = solve(log, '2026-09-20', { first: false, xp: 0 }); // an offline re-solve, say
      log = miss(log, '2026-09-01', 'q1'); // taken by the server already
      log = miss(log, '2026-09-02', 'q2', { synced: false });
      const pending = trimActivityForMerge(log, '2026-09-25', RULES, { pendingOnly: true });
      expect(pending.missLog.map((e) => e.challengeId)).toEqual(['q2']);
      expect(Object.keys(pending.misses)).toEqual(['q2']);
      // The day the pending miss touched, and the last two weeks.
      expect(Object.keys(pending.days).sort()).toEqual(['2026-09-02', '2026-09-20']);
    });
  });

  it("adopts the server's view inside its window and keeps older local days", () => {
    let local = solve(emptyActivityLog(), '2026-01-01', { xp: 7 });
    local = solve(local, '2026-09-25', { xp: 1 });
    const adopted = adoptActivityView(
      local,
      { timeZone: 'UTC', today: '2026-09-25', from: '2026-06-20', days: { '2026-09-25': normalizeDay({ xp: 40, lessons: 1 }) }, misses: {}, lastDay: '2026-09-25' },
      { ownerId: 'u1', synced: true }
    );
    expect(dayRow(adopted, '2026-09-25').xp).toBe(40);
    expect(dayRow(adopted, '2026-01-01').xp).toBe(7);
    expect(adopted.ownerId).toBe('u1');
  });

  it('normalizes anything it is handed', () => {
    const log = normalizeActivityLog({ days: { 'not-a-day': {}, '2026-09-25': { xp: -5, lessons: '2' } }, missLog: [{ nope: 1 }], misses: { q: { count: 0 } } });
    expect(Object.keys(log.days)).toEqual(['2026-09-25']);
    expect(dayRow(log, '2026-09-25')).toMatchObject({ xp: 0, lessons: 2 });
    expect(log.missLog).toEqual([]);
    expect(log.misses).toEqual({});
  });
});

describe('units in the day row (Phase 2)', () => {
  it('counts a unit completed by a solve, and its bonus inside the day’s XP', () => {
    const log = applyActivityEvent(
      emptyActivityLog(),
      { type: 'solve', challengeId: 'c1', isTest: false, firstSolve: true, awardedXp: 40, unitCompleted: true, perfectBonusXp: 25 },
      { day: '2026-09-25', at: at('2026-09-25'), rules: RULES }
    );
    expect(dayRow(log, '2026-09-25')).toMatchObject({ xp: 65, lessons: 1, units: 1, perfectBonusXp: 25 });
    // Older rows have neither field: they read as 0.
    expect(normalizeDay({ xp: 10 })).toMatchObject({ units: 0, perfectBonusXp: 0 });
  });

  it('carries a merged completion on its credit', () => {
    const merged = mergeActivityLogs(emptyActivityLog(), null, {
      today: '2026-09-25',
      rules: RULES,
      credits: [{ challengeId: 'c1', day: '2026-09-24', at: at('2026-09-24'), isTest: false, awardedXp: 40, unitCompleted: true, perfectBonusXp: 25 }]
    });
    expect(dayRow(merged, '2026-09-24')).toMatchObject({ xp: 65, units: 1, perfectBonusXp: 25 });
  });
});

describe('Practice answers in the day row (Phase 4)', () => {
  const miss = (log: ActivityLog) =>
    applyActivityEvent(log, { type: 'miss', challengeId: 'c1', context: 'lesson', answer: { kind: 'choice', index: 0 } }, { day: '2026-09-24', at: at('2026-09-24'), rules: RULES });

  it('counts a right answer, its review XP inside the day XP, and a bonus with no question', () => {
    let log = applyActivityEvent(emptyActivityLog(), { type: 'review', challengeId: 'c1', answered: true, xp: 5 }, { day: '2026-09-25', at: at('2026-09-25'), rules: RULES });
    log = applyActivityEvent(log, { type: 'review', challengeId: null, answered: false, xp: 5 }, { day: '2026-09-25', at: at('2026-09-25', '13:00:00'), rules: RULES });
    expect(dayRow(log, '2026-09-25')).toMatchObject({ reviews: 1, reviewXp: 10, xp: 10, lessons: 0 });
    // Older rows have neither field.
    expect(normalizeDay({ xp: 3 })).toMatchObject({ reviews: 0, reviewXp: 0 });
  });

  it('closes an open mistake only on a clean answer', () => {
    const missed = miss(emptyActivityLog());
    const assisted = applyActivityEvent(missed, { type: 'review', challengeId: 'c1', answered: true, xp: 2 }, { day: '2026-09-25', at: at('2026-09-25'), rules: RULES });
    expect(assisted.misses.c1.open).toBe(true);
    const clean = applyActivityEvent(missed, { type: 'review', challengeId: 'c1', answered: true, xp: 5, clean: true }, { day: '2026-09-25', at: at('2026-09-25'), rules: RULES });
    expect(clean.misses.c1).toMatchObject({ open: false, count: 1 });
    // A later miss opens it again.
    expect(miss(clean).misses.c1.open).toBe(true);
  });

  it('never takes the answer count or the review XP a browser claims (the goal counts answers)', () => {
    const incoming = { days: { '2026-09-24': { reviews: 50, reviewXp: 500, xp: 500 }, '2026-09-23': { reviews: 3, reSolves: 1 } } };
    const merged = mergeActivityLogs(emptyActivityLog(), incoming, { today: '2026-09-25', rules: RULES });
    // A day with nothing else to believe is not even created.
    expect(merged.days['2026-09-24']).toBeUndefined();
    expect(dayRow(merged, '2026-09-23')).toMatchObject({ reviews: 0, reSolves: 1, reviewXp: 0, xp: 0 });
    // A day the server already has keeps its own count.
    const own = applyActivityEvent(emptyActivityLog(), { type: 'review', challengeId: 'c1', answered: true, xp: 5 }, { day: '2026-09-24', at: at('2026-09-24'), rules: RULES });
    const onto = mergeActivityLogs(own, incoming, { today: '2026-09-25', rules: RULES });
    expect(dayRow(onto, '2026-09-24')).toMatchObject({ reviews: 1, reviewXp: 5, xp: 5 });
  });
});
