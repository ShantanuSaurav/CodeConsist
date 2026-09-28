/* ==========================================================================
   What a Practice session pays, and how one answer in it is recorded.

   XP (`review.xp`):
     - a right answer pays `correctFirstTry` when the question's first answer
       in the session was clean, else `correctAfterMiss`;
     - once per question per day (`progress.review[id].paid`);
     - the day's review XP never passes `dailyCap`;
     - the session bonus is paid once, when every question in it has been
       answered right - under the same cap.
   A question's schedule outcome is decided by its FIRST answer in the
   session; later answers only resolve it. A replay of a resolved question
   pays nothing.

   Pure and shared: the server (POST /api/review/answer and the merge's
   review-log pricing) and the browser (a guest's or an offline session).
   ========================================================================== */
import type { ReviewEvent, ReviewItem, ReviewItemState, ReviewOutcome } from '@/types';
import type { ReviewSettings } from '../settings/types';
import { addDays, dayKeyIn, daysBetween, isDayKey } from '../time/days';
import { applyReviewResult, outcomeOf } from './schedule';

const OUTCOMES: readonly ReviewOutcome[] = ['clean', 'assisted', 'missed'];
/** The most review-log events one merge reads. */
export const REVIEW_LOG_MAX = 200;

type XpRules = ReviewSettings['xp'];

function hasOwn(map: object | null | undefined, key: string): boolean {
  return Boolean(map) && Object.prototype.hasOwnProperty.call(map, key);
}

function define<T>(map: Record<string, T>, key: string, value: T): void {
  Object.defineProperty(map, key, { value, writable: true, enumerable: true, configurable: true });
}

function points(value: unknown): number {
  const n = Math.floor(Number(value));
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/** Review XP still payable today under the daily cap. */
export function reviewXpRemaining(dayTotal: number, xp: XpRules): number {
  return Math.max(0, points(xp.dailyCap) - points(dayTotal));
}

/**
 * What one right answer pays: by the question's first outcome in the
 * session, nothing when it was already paid for today, and never past the
 * daily cap. A wrong answer pays nothing.
 */
export function reviewXpFor(
  answer: { correct: boolean; outcome: ReviewOutcome },
  day: { dayTotal: number; paidToday: boolean },
  xp: XpRules
): number {
  if (!answer.correct || day.paidToday) return 0;
  const base = answer.outcome === 'clean' ? points(xp.correctFirstTry) : points(xp.correctAfterMiss);
  return Math.min(base, reviewXpRemaining(day.dayTotal, xp));
}

/** The session bonus, once every question is answered right - under what is left of the cap. */
export function sessionBonusFor(dayTotal: number, xp: XpRules): number {
  return Math.min(points(xp.sessionBonus), reviewXpRemaining(dayTotal, xp));
}

/** One question's record in a session. */
export interface ReviewAnswered {
  /** Decided by its first answer. */
  outcome: ReviewOutcome;
  /** Answered right (at any point in the session). */
  resolved: boolean;
  /** Review XP it paid in this session. */
  xp: number;
}

/** A Practice session as it is stored (`db.reviewSessions[userId]`, or the browser's local one). */
export interface ReviewSessionRecord {
  id: string;
  createdAt: string;
  stageId?: string | null;
  items: ReviewItem[];
  answered: Record<string, ReviewAnswered>;
  bonusPaid: boolean;
}

export interface ReviewAnswerInput {
  challengeId: string;
  correct: boolean;
  attempts?: number;
  hintsUsed?: number;
  revealed?: boolean;
}

export interface ReviewAnswerResult {
  session: ReviewSessionRecord;
  outcome: ReviewOutcome;
  /** The question was already answered right in this session: nothing changes, nothing is paid. */
  replay: boolean;
  /** This was the question's first answer in the session (its schedule moved). */
  firstAnswer: boolean;
  awardedXp: number;
  bonusXp: number;
  /** The question's schedule entry after this answer (null only on a replay). */
  state: ReviewItemState | null;
  /** A clean answer clears the question's open mistake. */
  closesMistake: boolean;
  /** Every question in the session is now answered right. */
  complete: boolean;
}

/** Is every question of the session answered right? */
export function sessionComplete(session: Pick<ReviewSessionRecord, 'items' | 'answered'>): boolean {
  return session.items.length > 0 && session.items.every((item) => hasOwn(session.answered, item.challengeId) && session.answered[item.challengeId].resolved);
}

/**
 * Record one answer in a session. `state` is the question's schedule entry
 * now (`reviewStateOf`), `dayReviewXp` the review XP already paid today.
 */
export function answerReview(
  session: ReviewSessionRecord,
  input: ReviewAnswerInput,
  ctx: { state: ReviewItemState | null; dayReviewXp: number; today: string; at: string; settings: ReviewSettings }
): ReviewAnswerResult {
  const id = input.challengeId;
  const prev = hasOwn(session.answered, id) ? session.answered[id] : null;
  if (prev?.resolved) {
    return { session, outcome: prev.outcome, replay: true, firstAnswer: false, awardedXp: 0, bonusXp: 0, state: ctx.state, closesMistake: false, complete: sessionComplete(session) };
  }
  const outcome = prev ? prev.outcome : outcomeOf(input);
  let state = prev ? ctx.state : applyReviewResult(ctx.state, outcome, ctx.settings, ctx.today, ctx.at);
  const awardedXp = reviewXpFor({ correct: input.correct, outcome }, { dayTotal: ctx.dayReviewXp, paidToday: state?.paid === ctx.today }, ctx.settings.xp);
  if (awardedXp > 0 && state) state = { ...state, paid: ctx.today };

  const answered: Record<string, ReviewAnswered> = {};
  for (const key of Object.keys(session.answered ?? {})) define(answered, key, session.answered[key]);
  define(answered, id, { outcome, resolved: input.correct, xp: (prev?.xp ?? 0) + awardedXp });
  let next: ReviewSessionRecord = { ...session, answered };

  let bonusXp = 0;
  const complete = sessionComplete(next);
  if (complete && !next.bonusPaid) {
    bonusXp = sessionBonusFor(ctx.dayReviewXp + awardedXp, ctx.settings.xp);
    next = { ...next, bonusPaid: true };
  }
  return {
    session: next,
    outcome,
    replay: false,
    firstAnswer: !prev,
    awardedXp,
    bonusXp,
    state,
    closesMistake: input.correct && outcome === 'clean',
    complete
  };
}

/** A received review-log event made safe, or null. */
export function normalizeReviewEvent(raw: unknown): ReviewEvent | null {
  const src = raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const challengeId = typeof src.challengeId === 'string' ? src.challengeId : '';
  const at = typeof src.at === 'string' && !Number.isNaN(Date.parse(src.at)) ? src.at : '';
  if (!challengeId || challengeId.length > 200 || !at || !OUTCOMES.includes(src.outcome as ReviewOutcome)) return null;
  return {
    challengeId,
    sessionId: typeof src.sessionId === 'string' ? src.sessionId.slice(0, 64) : '',
    at,
    day: isDayKey(src.day) ? src.day : at.slice(0, 10),
    outcome: src.outcome as ReviewOutcome,
    correct: src.correct === true
  };
}

/** One review-log answer the merge pays for. */
export interface ReviewCredit {
  challengeId: string;
  day: string;
  at: string;
  xp: number;
}

/**
 * Price a guest's (or an offline) review log on the server. Only right
 * answers to questions the account has solved (`solved`), made inside the
 * last `guestMergeWindowDays` days, count - one per question per day, never
 * past the daily cap (`dayTotal(day)` is what that day already paid), and
 * never for a day on or before the question's last paid day (`paid`): the
 * schedule keeps only that latest day, so an earlier one cannot be told
 * apart from a day an earlier merge already paid - merging the same log
 * twice pays once. The day is worked out again from each answer's time in
 * the account's zone. The session bonus is never merged. Returns the
 * credits and the schedule entries with `paid` set.
 */
export function creditReviewLog(
  log: unknown,
  ctx: {
    solved: ReadonlySet<string>;
    review: Record<string, ReviewItemState>;
    /** The schedule entry of a question with none stored (derived from its solve), so its `paid` day can be kept. */
    stateOf?: (id: string) => ReviewItemState | null;
    dayTotal: (day: string) => number;
    settings: ReviewSettings;
    zone: string | null;
    today: string;
    now: Date;
  }
): { credits: ReviewCredit[]; review: Record<string, ReviewItemState> } {
  const events = (Array.isArray(log) ? log.slice(-REVIEW_LOG_MAX) : [])
    .map(normalizeReviewEvent)
    .filter((e): e is ReviewEvent => e !== null && e.correct)
    .sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
  const latestMs = ctx.now.getTime() + 5 * 60_000;
  const window = Math.max(0, Math.floor(Number(ctx.settings.guestMergeWindowDays) || 0));
  const from = addDays(ctx.today, -window);
  const review: Record<string, ReviewItemState> = {};
  for (const id of Object.keys(ctx.review)) define(review, id, ctx.review[id]);
  const totals = new Map<string, number>();
  const seen = new Set<string>();
  const credits: ReviewCredit[] = [];

  for (const e of events) {
    if (!ctx.solved.has(e.challengeId) || Date.parse(e.at) > latestMs) continue;
    let day = dayKeyIn(ctx.zone, new Date(e.at));
    if (day > ctx.today) day = ctx.today;
    if (day < from || daysBetween(day, ctx.today) > window) continue;
    const key = `${e.challengeId}|${day}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const state = hasOwn(review, e.challengeId) ? review[e.challengeId] : ctx.stateOf?.(e.challengeId) ?? null;
    // Paid on this day or a later one: nothing more (see above).
    if (state?.paid && day <= state.paid) continue;
    const dayTotal = totals.has(day) ? totals.get(day)! : points(ctx.dayTotal(day));
    const xp = reviewXpFor({ correct: true, outcome: e.outcome }, { dayTotal, paidToday: false }, ctx.settings.xp);
    totals.set(day, dayTotal + xp);
    if (xp <= 0) continue;
    credits.push({ challengeId: e.challengeId, day, at: e.at, xp });
    if (state) define(review, e.challengeId, { ...state, paid: day });
  }
  return { credits, review };
}
