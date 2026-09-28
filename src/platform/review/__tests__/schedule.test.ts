import { describe, expect, it } from 'vitest';
import type { ReviewItemState } from '@/types';
import { DEFAULT_SETTINGS } from '../../settings/defaults';
import { mergeSettings } from '../../settings/merge';
import { validateSettings } from '../../settings/schema';
import { DEFAULT_REVIEW_SETTINGS } from '../defaults';
import { applyReviewResult, clampBox, mergeReviewStates, normalizeReviewMap, outcomeOf, reviewStateOf } from '../schedule';
import { answerReview, creditReviewLog, reviewXpFor, sessionBonusFor } from '../xp';
import type { ReviewSessionRecord } from '../xp';

const rules = DEFAULT_REVIEW_SETTINGS;
const at = '2026-09-20T10:00:00.000Z';

describe('the review defaults', () => {
  it('are the settings section, and valid', () => {
    expect(DEFAULT_SETTINGS.review).toEqual(DEFAULT_REVIEW_SETTINGS);
    expect(DEFAULT_SETTINGS.review.intervalsDays).toEqual([1, 3, 7, 21]);
    expect(validateSettings(DEFAULT_SETTINGS).ok).toBe(true);
  });

  it('refuses intervals that do not climb, boxes past the list and a minimum over the maximum', () => {
    const paths = (patch: object) => validateSettings(mergeSettings(DEFAULT_SETTINGS, { review: patch })).issues.map((i) => i.path);
    expect(paths({ intervalsDays: [1, 3, 3] })).toEqual(['review.intervalsDays.2']);
    expect(paths({ intervalsDays: [1] })).toContain('review.intervalsDays');
    expect(paths({ intervalsDays: [1, 2], initialBox: { clean: 2 } })).toEqual(['review.initialBox.clean']);
    expect(paths({ wrongResetsToBox: 4 })).toEqual(['review.wrongResetsToBox']);
    expect(paths({ sessionSize: { min: 9, max: 8 } })).toEqual(['review.sessionSize.min']);
    expect(paths({ itemTypes: [] })).toEqual(['review.itemTypes']);
    expect(paths({ itemTypes: ['quiz', 'essay'] })).toEqual(['review.itemTypes.1']);
    expect(paths({ itemTypes: ['quiz', 'quiz'] })).toEqual(['review.itemTypes.1']);
    expect(paths({ xp: { dailyCap: 501 } })).toEqual(['review.xp.dailyCap']);
    expect(paths({ itemTypes: ['quiz', 'code_runner'], intervalsDays: [2, 5], initialBox: { clean: 1, assisted: 0 } })).toEqual([]);
  });
});

describe('reviewStateOf', () => {
  const progress = {
    completedChallenges: ['a', 'b', 'c'],
    attempts: {
      a: { score: 100, solvedAt: '2026-09-01T12:00:00.000Z' },
      b: { score: 80, solvedAt: '2026-09-01T12:00:00.000Z' },
      c: { score: 100, solvedAt: '2026-09-01T12:00:00.000Z' }
    },
    review: { c: { box: 3, due: '2026-10-01', last: at } }
  };

  it('derives a clean solve into box 1 and an assisted one into box 0, due from the solve day', () => {
    expect(reviewStateOf(progress, 'a', rules, { zone: 'UTC' })).toEqual({ box: 1, due: '2026-09-04' });
    expect(reviewStateOf(progress, 'b', rules, { zone: 'UTC' })).toEqual({ box: 0, due: '2026-09-02' });
  });

  it('counts the solve day in the learner zone', () => {
    const late = { attempts: { a: { score: 80, solvedAt: '2026-09-01T23:30:00.000Z' } } };
    expect(reviewStateOf(late, 'a', rules, { zone: 'Asia/Kolkata' })?.due).toBe('2026-09-03');
  });

  it('prefers a stored entry, clamping its box when the list got shorter', () => {
    expect(reviewStateOf(progress, 'c', rules)).toEqual({ box: 3, due: '2026-10-01', last: at });
    expect(reviewStateOf(progress, 'c', { ...rules, intervalsDays: [2, 4] })?.box).toBe(1);
  });

  it('knows nothing of an unsolved question', () => {
    expect(reviewStateOf(progress, 'zzz', rules)).toBeNull();
    expect(reviewStateOf(null, 'a', rules)).toBeNull();
  });

  it('never walks the prototype', () => {
    expect(reviewStateOf(progress, '__proto__', rules)).toBeNull();
    expect(reviewStateOf(progress, 'constructor', rules)).toBeNull();
  });
});

describe('applyReviewResult', () => {
  const state: ReviewItemState = { box: 1, due: '2026-09-20', paid: '2026-09-19' };

  it('moves a clean answer up a box, keeps an assisted one, drops a missed one to wrongResetsToBox', () => {
    expect(applyReviewResult(state, 'clean', rules, '2026-09-20', at)).toEqual({ box: 2, due: '2026-09-27', last: at, paid: '2026-09-19' });
    expect(applyReviewResult(state, 'assisted', rules, '2026-09-20', at)).toEqual({ box: 1, due: '2026-09-23', last: at, paid: '2026-09-19' });
    expect(applyReviewResult(state, 'missed', rules, '2026-09-20', at)).toMatchObject({ box: 0, due: '2026-09-21' });
    expect(applyReviewResult(state, 'missed', { ...rules, wrongResetsToBox: 1 }, '2026-09-20', at).box).toBe(1);
  });

  it('never goes past the last box, and clamps when the list shrank', () => {
    expect(applyReviewResult({ box: 3, due: '2026-09-20' }, 'clean', rules, '2026-09-20', at)).toMatchObject({ box: 3, due: '2026-10-11' });
    expect(applyReviewResult({ box: 3, due: '2026-09-20' }, 'assisted', { ...rules, intervalsDays: [1, 2] }, '2026-09-20', at)).toMatchObject({ box: 1, due: '2026-09-22' });
    expect(clampBox(9, { intervalsDays: [1, 2, 3] })).toBe(2);
    expect(clampBox(-1, rules)).toBe(0);
  });

  it('starts an unknown question from the assisted box', () => {
    expect(applyReviewResult(null, 'clean', rules, '2026-09-20', at).box).toBe(1);
  });
});

describe('outcomeOf', () => {
  it('is clean only for a right first answer with no hint and nothing shown', () => {
    expect(outcomeOf({ correct: true, attempts: 1, hintsUsed: 0 })).toBe('clean');
    expect(outcomeOf({ correct: true, attempts: 2 })).toBe('assisted');
    expect(outcomeOf({ correct: true, attempts: 1, hintsUsed: 1 })).toBe('assisted');
    expect(outcomeOf({ correct: true, attempts: 1, revealed: true })).toBe('missed');
    expect(outcomeOf({ correct: false })).toBe('missed');
  });
});

describe('mergeReviewStates', () => {
  const now = new Date('2026-09-20T12:00:00.000Z');
  const ctx = { known: (id: string) => id !== 'gone', rules, today: '2026-09-20', now };

  it('takes the newer entry, never a paid day, and drops unknown or future ones', () => {
    const server = { a: { box: 1, due: '2026-09-22', last: '2026-09-18T00:00:00.000Z', paid: '2026-09-18' }, b: { box: 2, due: '2026-09-25', last: '2026-09-19T00:00:00.000Z' } };
    const incoming = {
      a: { box: 3, due: '2026-10-05', last: '2026-09-19T00:00:00.000Z', paid: '2026-09-20' },
      b: { box: 0, due: '2026-09-21', last: '2026-09-10T00:00:00.000Z' },
      gone: { box: 1, due: '2026-09-21', last: '2026-09-19T00:00:00.000Z' },
      future: { box: 1, due: '2026-09-21', last: '2026-12-01T00:00:00.000Z' },
      far: { box: 9, due: '2027-09-01', last: '2026-09-19T00:00:00.000Z' }
    };
    const merged = mergeReviewStates(server, incoming, { ...ctx, known: (id) => id !== 'gone' });
    expect(merged.a).toEqual({ box: 3, due: '2026-10-05', last: '2026-09-19T00:00:00.000Z', paid: '2026-09-18' });
    expect(merged.b).toEqual(server.b);
    expect(merged.gone).toBeUndefined();
    expect(merged.future).toBeUndefined();
    // Box clamped to the list, due no further than the longest interval.
    expect(merged.far).toEqual({ box: 3, due: '2026-10-11', last: '2026-09-19T00:00:00.000Z' });
  });

  it('keeps __proto__ an ordinary key', () => {
    const map = normalizeReviewMap(JSON.parse('{"__proto__": {"box": 1, "due": "2026-09-21"}}'));
    expect(Object.keys(map)).toEqual(['__proto__']);
    expect(({} as Record<string, unknown>).box).toBeUndefined();
  });
});

describe('review XP', () => {
  const xp = rules.xp;

  it('pays by the first outcome, once per question per day, under the daily cap', () => {
    expect(reviewXpFor({ correct: true, outcome: 'clean' }, { dayTotal: 0, paidToday: false }, xp)).toBe(5);
    expect(reviewXpFor({ correct: true, outcome: 'assisted' }, { dayTotal: 0, paidToday: false }, xp)).toBe(2);
    expect(reviewXpFor({ correct: true, outcome: 'missed' }, { dayTotal: 0, paidToday: false }, xp)).toBe(2);
    expect(reviewXpFor({ correct: false, outcome: 'clean' }, { dayTotal: 0, paidToday: false }, xp)).toBe(0);
    expect(reviewXpFor({ correct: true, outcome: 'clean' }, { dayTotal: 0, paidToday: true }, xp)).toBe(0);
    expect(reviewXpFor({ correct: true, outcome: 'clean' }, { dayTotal: 58, paidToday: false }, xp)).toBe(2);
    expect(reviewXpFor({ correct: true, outcome: 'clean' }, { dayTotal: 60, paidToday: false }, xp)).toBe(0);
  });

  it('fits the session bonus under the cap', () => {
    expect(sessionBonusFor(0, xp)).toBe(5);
    expect(sessionBonusFor(57, xp)).toBe(3);
    expect(sessionBonusFor(70, xp)).toBe(0);
  });
});

describe('answerReview', () => {
  const session: ReviewSessionRecord = {
    id: 's1',
    createdAt: at,
    items: [
      { challengeId: 'a', reason: 'due' },
      { challengeId: 'b', reason: 'mistake' }
    ],
    answered: {},
    bonusPaid: false
  };
  const ctx = (extra = {}) => ({ state: { box: 1, due: '2026-09-20' } as ReviewItemState, dayReviewXp: 0, today: '2026-09-20', at, settings: rules, ...extra });

  it('decides the outcome on the first answer and pays once; a replay pays nothing', () => {
    const first = answerReview(session, { challengeId: 'a', correct: true, attempts: 1 }, ctx());
    expect(first).toMatchObject({ outcome: 'clean', replay: false, firstAnswer: true, awardedXp: 5, bonusXp: 0, closesMistake: true, complete: false });
    expect(first.state).toEqual({ box: 2, due: '2026-09-27', last: at, paid: '2026-09-20' });
    const again = answerReview(first.session, { challengeId: 'a', correct: true, attempts: 1 }, ctx({ state: first.state }));
    expect(again).toMatchObject({ replay: true, awardedXp: 0, bonusXp: 0 });
  });

  it('keeps a missed first answer, then resolves it with the smaller reward', () => {
    const miss = answerReview(session, { challengeId: 'b', correct: false }, ctx());
    expect(miss).toMatchObject({ outcome: 'missed', awardedXp: 0, firstAnswer: true });
    expect(miss.state).toMatchObject({ box: 0, due: '2026-09-21' });
    const right = answerReview(miss.session, { challengeId: 'b', correct: true, attempts: 1 }, ctx({ state: miss.state }));
    expect(right).toMatchObject({ outcome: 'missed', awardedXp: 2, firstAnswer: false, closesMistake: false });
    // Its schedule did not move again.
    expect(right.state).toMatchObject({ box: 0, due: '2026-09-21', paid: '2026-09-20' });
  });

  it('pays the session bonus once, when every question is answered right', () => {
    const a = answerReview(session, { challengeId: 'a', correct: true, attempts: 1 }, ctx());
    const b = answerReview(a.session, { challengeId: 'b', correct: true, attempts: 1 }, ctx({ dayReviewXp: 5 }));
    expect(b).toMatchObject({ awardedXp: 5, bonusXp: 5, complete: true });
    expect(b.session.bonusPaid).toBe(true);
    const replay = answerReview(b.session, { challengeId: 'b', correct: true }, ctx({ dayReviewXp: 15 }));
    expect(replay.bonusXp).toBe(0);
  });

  it('does not pay a question already paid for today', () => {
    const r = answerReview(session, { challengeId: 'a', correct: true, attempts: 1 }, ctx({ state: { box: 1, due: '2026-09-20', paid: '2026-09-20' } }));
    expect(r.awardedXp).toBe(0);
  });
});

describe('creditReviewLog', () => {
  const now = new Date('2026-09-20T12:00:00.000Z');
  const base = { solved: new Set(['a', 'b', 'c']), review: {}, dayTotal: () => 0, settings: rules, zone: 'UTC', today: '2026-09-20', now };
  const event = (challengeId: string, iso: string, outcome = 'clean', correct = true) => ({ challengeId, sessionId: 'local-1', at: iso, day: iso.slice(0, 10), outcome, correct });

  it('pays right answers inside the window, one per question per day, never the bonus', () => {
    const { credits } = creditReviewLog(
      [
        event('a', '2026-09-20T08:00:00.000Z'),
        event('a', '2026-09-20T09:00:00.000Z'),
        event('b', '2026-09-19T09:00:00.000Z', 'assisted'),
        event('c', '2026-09-10T09:00:00.000Z'),
        event('c', '2026-09-20T09:30:00.000Z', 'clean', false),
        event('zzz', '2026-09-20T09:00:00.000Z')
      ],
      base
    );
    expect(credits).toEqual([
      { challengeId: 'b', day: '2026-09-19', at: '2026-09-19T09:00:00.000Z', xp: 2 },
      { challengeId: 'a', day: '2026-09-20', at: '2026-09-20T08:00:00.000Z', xp: 5 }
    ]);
  });

  it('stops at the daily cap, and skips a day the question was paid on', () => {
    const events = ['a', 'b', 'c'].map((id) => event(id, '2026-09-20T08:00:00.000Z'));
    const capped = creditReviewLog(events, { ...base, dayTotal: () => 52 });
    expect(capped.credits.map((c) => c.xp)).toEqual([5, 3]);
    const paid = creditReviewLog(events, { ...base, review: { a: { box: 1, due: '2026-09-21', paid: '2026-09-20' } } });
    expect(paid.credits.map((c) => c.challengeId)).toEqual(['b', 'c']);
    expect(paid.review.a.paid).toBe('2026-09-20');
  });

  it('never pays a day on or before the question’s last paid day, so the same log merged twice pays once', () => {
    const log = [event('a', '2026-09-19T09:00:00.000Z'), event('a', '2026-09-20T09:00:00.000Z')];
    // `a` has no stored entry: its derived one (from its solve) records the day.
    const first = creditReviewLog(log, { ...base, stateOf: () => ({ box: 1, due: '2026-09-20' }) });
    expect(first.credits.map((c) => c.day)).toEqual(['2026-09-19', '2026-09-20']);
    expect(first.review.a.paid).toBe('2026-09-20');
    expect(creditReviewLog(log, { ...base, review: first.review }).credits).toEqual([]);
    // Answered live today first: yesterday's offline answer, arriving after, is not paid either.
    const liveToday = { a: { box: 2, due: '2026-09-27', paid: '2026-09-20' } };
    expect(creditReviewLog([event('a', '2026-09-19T09:00:00.000Z')], { ...base, review: liveToday }).credits).toEqual([]);
  });

  it('works the day out again from the time, and refuses a time in the future', () => {
    const { credits } = creditReviewLog([{ ...event('a', '2026-09-19T20:00:00.000Z'), day: '2026-09-20' }, event('b', '2026-09-21T09:00:00.000Z')], {
      ...base,
      zone: 'Asia/Kolkata'
    });
    expect(credits).toEqual([{ challengeId: 'a', day: '2026-09-20', at: '2026-09-19T20:00:00.000Z', xp: 5 }]);
  });
});
