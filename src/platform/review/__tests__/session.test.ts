import { describe, expect, it } from 'vitest';
import type { ReviewSettings } from '../../settings/types';
import { DEFAULT_REVIEW_SETTINGS } from '../defaults';
import { buildReviewSession, seededShuffle } from '../session';
import type { ReviewBankItem, ReviewMiss } from '../session';
import { describeNextReview, describeReviewSummary, reviewSummary } from '../summary';

const TODAY = '2026-09-20';
const settings: ReviewSettings = DEFAULT_REVIEW_SETTINGS;

/** q1..qN quizzes in stage-1, plus a stage test and a code lesson. */
function bankOf(n: number): ReviewBankItem[] {
  return [
    ...Array.from({ length: n }, (_, i) => ({ id: `q${i + 1}`, type: 'quiz' as const, stageId: i < n / 2 ? 'stage-1' : 'stage-2' })),
    { id: 'test', type: 'quiz', stageId: 'stage-1', isStageTest: true },
    { id: 'code', type: 'code_runner', stageId: 'stage-1' }
  ];
}

/** Solved long ago (so everything derived is due), with a first-try score unless given. */
function progressOf(ids: string[], extra: { score?: Record<string, number>; hints?: Record<string, number>; review?: Record<string, unknown> } = {}) {
  const attempts: Record<string, { score: number; hintsUsed: number; solvedAt: string }> = {};
  for (const id of ids) attempts[id] = { score: extra.score?.[id] ?? 100, hintsUsed: extra.hints?.[id] ?? 0, solvedAt: '2026-01-01T12:00:00.000Z' };
  return { completedChallenges: ids, attempts, review: extra.review ?? {} };
}

const miss = (lastDay: string, count = 1, open = true): ReviewMiss => ({ open, lastDay, count, lastAt: `${lastDay}T10:00:00.000Z` });

/** A schedule entry that is not due for a while (so the question is neither due nor weak). */
const later = { box: 3, due: '2026-12-01', last: '2026-09-01T00:00:00.000Z' };

describe('buildReviewSession', () => {
  it('puts mistakes first, then due questions, then weak ones, within the mix', () => {
    const ids = ['q1', 'q2', 'q3', 'q4', 'q5', 'q6', 'q7', 'q8', 'q9', 'q10'];
    const review: Record<string, unknown> = {};
    // q1-q4: open mistakes (scheduled later). q5-q10: never reviewed, solved long ago - due.
    for (const id of ['q1', 'q2', 'q3', 'q4']) review[id] = later;
    const plan = buildReviewSession({
      progress: progressOf(ids, { review }),
      misses: { q1: miss('2026-09-19', 5), q2: miss('2026-09-18', 3), q3: miss('2026-09-17', 1), q4: miss('2026-09-16', 4) },
      bank: bankOf(10),
      settings,
      today: TODAY,
      seed: 1
    });
    const reasons = (reason: string) => plan.items.filter((i) => i.reason === reason).map((i) => i.challengeId).sort();
    // At most 3 mistakes, most missed first: q1 (5), q4 (4), q2 (3).
    expect(reasons('mistake')).toEqual(['q1', 'q2', 'q4']);
    // At most 4 due, longest overdue first (all the same day here, so by id).
    expect(reasons('due')).toEqual(['q10', 'q5', 'q6', 'q7']);
    expect(plan.items).toHaveLength(7);
    expect(plan.pool).toEqual({ mistake: 4, due: 6, weak: 0 });
  });

  it('fills up to the maximum with weak solves, lowest score first', () => {
    const ids = ['q1', 'q2', 'q3', 'q4', 'q5', 'q6', 'q7', 'q8', 'q9', 'q10'];
    // Nothing due (all scheduled later), nothing missed; q3, q5, q7 weak by score, q9 by hints.
    const review: Record<string, unknown> = {};
    for (const id of ids) review[id] = later;
    const plan = buildReviewSession({
      progress: { ...progressOf(ids, { score: { q3: 70, q5: 50, q7: 60 }, hints: { q9: 2 } }), review: { q1: later, q2: later, q4: later, q6: later, q8: later, q10: later } },
      bank: bankOf(10),
      settings: { ...settings, sessionSize: { min: 1, max: 3 } },
      today: TODAY,
      seed: 2
    });
    // q3, q5, q7, q9 have no entry: derived, due long ago - so they are due, not weak.
    expect(plan.items.every((i) => i.reason === 'due')).toBe(true);
    expect(plan.items).toHaveLength(3);

    const fresh = buildReviewSession({
      progress: {
        completedChallenges: ['q1', 'q2', 'q3'],
        attempts: {
          q1: { score: 70, hintsUsed: 0, solvedAt: `${TODAY}T01:00:00.000Z` },
          q2: { score: 50, hintsUsed: 0, solvedAt: `${TODAY}T01:00:00.000Z` },
          q3: { score: 100, hintsUsed: 3, solvedAt: `${TODAY}T01:00:00.000Z` }
        },
        review: {}
      },
      bank: bankOf(3),
      settings,
      today: TODAY,
      seed: 3
    });
    expect(fresh.items.map((i) => [i.challengeId, i.reason]).sort()).toEqual([
      ['q1', 'weak'],
      ['q2', 'weak'],
      ['q3', 'weak']
    ]);
  });

  it('tops a small session up to the minimum from what the mix left out', () => {
    const ids = ['q1', 'q2', 'q3', 'q4', 'q5', 'q6'];
    const plan = buildReviewSession({ progress: progressOf(ids), bank: bankOf(6), settings, today: TODAY, seed: 4 });
    // Six due, no mistakes or weak: the mix allows 4, the minimum wants 5.
    expect(plan.items).toHaveLength(5);
    expect(plan.items.every((i) => i.reason === 'due')).toBe(true);
  });

  it('gives the same session for the same seed, and a different order for another', () => {
    const ids = ['q1', 'q2', 'q3', 'q4', 'q5', 'q6', 'q7', 'q8'];
    const input = { progress: progressOf(ids), bank: bankOf(8), settings: { ...settings, mix: { mistakes: 3, due: 8 } }, today: TODAY };
    const a = buildReviewSession({ ...input, seed: 'x' });
    const b = buildReviewSession({ ...input, seed: 'x' });
    expect(a.items).toEqual(b.items);
    const orders = new Set(['y', 'z', 'w', 'v'].map((seed) => buildReviewSession({ ...input, seed }).items.map((i) => i.challengeId).join()));
    expect(orders.size).toBeGreaterThan(1);
  });

  it('leaves out unsolved questions, stage tests, locked stubs, excluded kinds and today’s mistakes', () => {
    const bank = [...bankOf(4), { id: 'locked', type: 'quiz' as const, stageId: 'stage-1', locked: true }];
    const plan = buildReviewSession({
      progress: progressOf(['q1', 'q2', 'q3', 'test', 'code', 'locked']),
      misses: { q2: miss(TODAY, 2) },
      bank,
      settings,
      today: TODAY,
      seed: 5
    });
    expect(plan.items.map((i) => i.challengeId).sort()).toEqual(['q1', 'q3']);

    // Missed today and nothing else: tomorrow it is an open mistake to practice.
    const onlyToday = buildReviewSession({ progress: progressOf(['q2'], { review: { q2: later } }), misses: { q2: miss(TODAY, 1) }, bank, settings, today: TODAY, seed: 5 });
    expect(onlyToday).toMatchObject({ items: [], nextDueDay: '2026-09-21' });

    const withCode = buildReviewSession({ progress: progressOf(['code']), bank, settings: { ...settings, itemTypes: ['code_runner'] }, today: TODAY, seed: 5 });
    expect(withCode.items.map((i) => i.challengeId)).toEqual(['code']);
  });

  it('leaves out a question already practiced today - an open mistake answered with help comes back tomorrow', () => {
    // q1: an open mistake from yesterday, answered today with a hint (the
    // mistake stays open; the schedule entry was answered today). q2: paid
    // today by a merged offline answer. q3: due, not seen today.
    const answeredToday = { box: 1, due: '2026-09-23', last: `${TODAY}T09:00:00.000Z`, paid: TODAY };
    const paidToday = { box: 0, due: TODAY, last: '2026-09-01T09:00:00.000Z', paid: TODAY };
    const input = {
      progress: progressOf(['q1', 'q2', 'q3'], { review: { q1: answeredToday, q2: paidToday } }),
      misses: { q1: miss('2026-09-19', 2) },
      bank: bankOf(3),
      settings,
      today: TODAY
    };
    const plan = buildReviewSession({ ...input, seed: 9 });
    expect(plan.items).toEqual([{ challengeId: 'q3', reason: 'due' }]);

    // A second session the same day, once q3 is answered too: nothing - back tomorrow (q1's open mistake).
    const after = buildReviewSession({
      ...input,
      progress: progressOf(['q1', 'q2', 'q3'], { review: { q1: answeredToday, q2: paidToday, q3: { box: 2, due: '2026-09-27', last: `${TODAY}T10:00:00.000Z` } } }),
      seed: 10
    });
    expect(after).toMatchObject({ items: [], nextDueDay: '2026-09-21' });

    // "Today" is the learner's: 23:30 UTC on the 19th is already the 20th in Kolkata.
    const lateUtc = { box: 1, due: TODAY, last: '2026-09-19T23:30:00.000Z' };
    const kolkata = buildReviewSession({ ...input, progress: progressOf(['q1'], { review: { q1: lateUtc } }), misses: {}, zone: 'Asia/Kolkata', seed: 11 });
    expect(kolkata.items).toEqual([]);
    const utc = buildReviewSession({ ...input, progress: progressOf(['q1'], { review: { q1: lateUtc } }), misses: {}, zone: 'UTC', seed: 11 });
    expect(utc.items.map((i) => i.challengeId)).toEqual(['q1']);
  });

  it('leaves out mistakes older than the window and ones already closed', () => {
    const review = { q1: later, q2: later };
    const plan = buildReviewSession({
      progress: progressOf(['q1', 'q2'], { review }),
      misses: { q1: miss('2026-07-01', 9), q2: miss('2026-09-19', 3, false) },
      bank: bankOf(2),
      settings,
      today: TODAY,
      seed: 6
    });
    expect(plan.items).toEqual([]);
    expect(plan.nextDueDay).toBe('2026-12-01');
  });

  it('keeps to one stage when asked', () => {
    const plan = buildReviewSession({ progress: progressOf(['q1', 'q2', 'q3', 'q4']), bank: bankOf(4), settings, today: TODAY, seed: 7, stageId: 'stage-2' });
    expect(plan.items.map((i) => i.challengeId).sort()).toEqual(['q3', 'q4']);
  });

  it('says when the next question falls due when there is nothing now', () => {
    const plan = buildReviewSession({
      progress: progressOf(['q1', 'q2'], { review: { q1: { box: 1, due: '2026-09-23' }, q2: { box: 2, due: '2026-09-22' } } }),
      bank: bankOf(2),
      settings,
      today: TODAY,
      seed: 8
    });
    expect(plan).toMatchObject({ items: [], nextDueDay: '2026-09-22' });
  });
});

describe('the summary', () => {
  it('counts what the next session would hold', () => {
    const summary = reviewSummary({
      progress: progressOf(['q1', 'q2', 'q3'], { review: { q1: later } }),
      misses: { q1: miss('2026-09-19', 2) },
      bank: bankOf(3),
      settings,
      today: TODAY
    });
    expect(summary).toMatchObject({ enabled: true, total: 3, mistakes: 1, due: 2, weak: 0 });
    expect(describeReviewSummary(summary)).toBe('3 to practice: 1 mistake, 2 due');
    expect(describeReviewSummary({ total: 0, mistakes: 0, due: 0, weak: 0 })).toBeNull();
  });

  it('is empty when sessions are off', () => {
    expect(reviewSummary({ progress: progressOf(['q1']), bank: bankOf(1), settings: { ...settings, enabled: false }, today: TODAY }).enabled).toBe(false);
  });

  it('describes the next review day', () => {
    expect(describeNextReview('2026-09-21', TODAY)).toBe('tomorrow');
    expect(describeNextReview('2026-09-25', TODAY)).toBe('in 5 days');
    expect(describeNextReview(null, TODAY)).toBeNull();
  });
});

describe('seededShuffle', () => {
  it('keeps every item', () => {
    expect(seededShuffle([1, 2, 3, 4, 5], 'seed').sort()).toEqual([1, 2, 3, 4, 5]);
  });
});
