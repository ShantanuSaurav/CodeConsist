/**
 * The learner's stats as the browser keeps them, how an old save is brought
 * up to date, and how the server's answers are folded in. Lives outside
 * SessionProvider.tsx because a non-component export from that file breaks
 * React Fast Refresh - and so these rules can be tested without React.
 *
 * The streak is kept RAW everywhere here: `streak`, `bestStreak`,
 * `lastActiveDay` and `habit` exactly as they were stored (by the server, or
 * by this browser's own `learnerSolve`). What a screen shows - the streak
 * with freezes applied, a break, a repair offer - is derived from them by the
 * habits engine (src/platform/habits, the session's `habits`), which never
 * writes. Judging the stored number against a day here, as this file used
 * to, would hide the very missed days the freeze and repair rules work on.
 */
import type { ReviewEvent, ReviewItemState, UserStats } from '@/types';
import { ApiError, OfflineError } from '../api-client/api';
import { learnerDay } from '../time/days';
import { DEFAULT_LEVEL_CURVE, levelFromXp } from '../xp-leveling/leveling';
import type { LevelCurve } from '../xp-leveling/leveling';
import { normalizeUnitsCompleted } from '../xp-leveling/rewards';
import { normalizeReviewMap } from '../review/schedule';
import { REVIEW_LOG_MAX, normalizeReviewEvent } from '../review/xp';
import { normalizeTestedOut } from '../progress/stages';
import { unionConcepts } from './preferences';

export const INITIAL_STATS: UserStats = {
  xp: 0,
  level: 1,
  streak: 0,
  bestStreak: 0,
  lastActiveDay: null,
  completedChallenges: [],
  completedStages: [],
  seenConcepts: [],
  attempts: {},
  unitsCompleted: {},
  review: {},
  testedOut: {},
  isPremium: false,
  unlockedStages: []
};

function plainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

/** A raw stored streak: a whole number, 0 or more. */
function rawStreak(value: unknown): number {
  return Math.max(0, Math.floor(Number(value) || 0));
}

/**
 * Old saves are missing fields added later; fill them in rather than
 * crashing. The level is re-derived from XP with the current curve, so a
 * curve change never leaves a stale level on screen. The streak stays as it
 * was stored (see the top of this file).
 */
export function hydrateStats(raw: unknown, curve: LevelCurve = DEFAULT_LEVEL_CURVE): UserStats {
  const saved = (raw && typeof raw === 'object' ? raw : {}) as Partial<UserStats>;
  const xp = Number(saved.xp) || 0;
  const streak = rawStreak(saved.streak);
  const stats: UserStats = {
    ...INITIAL_STATS,
    ...saved,
    xp,
    level: levelFromXp(xp, curve),
    streak,
    bestStreak: Math.max(rawStreak(saved.bestStreak), streak),
    lastActiveDay: typeof saved.lastActiveDay === 'string' ? saved.lastActiveDay : null,
    completedChallenges: Array.isArray(saved.completedChallenges) ? saved.completedChallenges : [],
    completedStages: Array.isArray(saved.completedStages) ? saved.completedStages : [],
    seenConcepts: Array.isArray(saved.seenConcepts) ? saved.seenConcepts : [],
    attempts: saved.attempts && typeof saved.attempts === 'object' ? saved.attempts : {},
    // A save from before units has none; a mangled one is made safe.
    unitsCompleted: normalizeUnitsCompleted(saved.unitsCompleted),
    // The Practice schedule: a save from before it has none.
    review: normalizeReviewMap(saved.review),
    // Stages tested out of (Phase 5): a save from before has none, so its
    // stages come out exactly as they did.
    testedOut: normalizeTestedOut(saved.testedOut),
    isPremium: Boolean(saved.isPremium),
    // A cached copy of what the server said last time; the next restore overwrites it.
    unlockedStages: Array.isArray(saved.unlockedStages) ? saved.unlockedStages.filter((id) => typeof id === 'string') : []
  };
  // Freezes, repair and streak history: normalized by the habits engine
  // wherever it is read. A save from before them has none.
  if (!plainObject(saved.habit)) delete stats.habit;
  // Solves a merge held back (shown on the Learn page) and a guest's claims.
  const held = Array.isArray(saved.heldChallenges) ? saved.heldChallenges.filter((id): id is string => typeof id === 'string') : [];
  if (held.length) stats.heldChallenges = held;
  else delete stats.heldChallenges;
  if (!plainObject(saved.assessmentClaims)) delete stats.assessmentClaims;
  // Practice answers still to go up with the next merge.
  const pending = pendingReviewLog(saved);
  if (pending.length) stats.unsynced = { reviewLog: pending };
  else delete stats.unsynced;
  return stats;
}

/** Practice answers the server has not priced yet (a guest's, or made offline), oldest first. */
export function pendingReviewLog(stats: Pick<UserStats, 'unsynced'> | null | undefined): ReviewEvent[] {
  const raw = stats?.unsynced?.reviewLog;
  return (Array.isArray(raw) ? raw : []).map(normalizeReviewEvent).filter((e): e is ReviewEvent => e !== null);
}

/** One more Practice answer waiting for the server (the newest `REVIEW_LOG_MAX` are kept). */
export function withPendingReview(stats: UserStats, event: ReviewEvent): UserStats {
  return { ...stats, unsynced: { reviewLog: [...pendingReviewLog(stats), event].slice(-REVIEW_LOG_MAX) } };
}

/**
 * One Practice answer priced in this browser, written onto the stats as they
 * are NOW (it is applied in a functional update, so a server answer that
 * landed meanwhile is kept): the question's schedule entry, the XP it paid
 * (a guest's goal bonus included) and the answer kept for the next sync.
 */
export function withLocalReviewAnswer(
  prev: UserStats,
  answer: { challengeId: string; state: ReviewItemState | null; xp: number; event: ReviewEvent | null },
  curve: LevelCurve = DEFAULT_LEVEL_CURVE
): UserStats {
  let next = prev;
  if (answer.state) next = { ...next, review: { ...(next.review ?? {}), [answer.challengeId]: answer.state } };
  const xp = Math.max(0, Math.floor(Number(answer.xp)) || 0);
  if (xp > 0) next = { ...next, xp: next.xp + xp, level: levelFromXp(next.xp + xp, curve) };
  if (answer.event) next = withPendingReview(next, answer.event);
  return next;
}

/** The server has priced these Practice answers (a merge succeeded): no longer pending. */
export function withoutPendingReviews(stats: UserStats, sent: readonly ReviewEvent[]): UserStats {
  if (!stats.unsynced) return stats;
  const gone = new Set(sent.map((e) => `${e.challengeId}|${e.at}`));
  const left = pendingReviewLog(stats).filter((e) => !gone.has(`${e.challengeId}|${e.at}`));
  const next = { ...stats };
  if (left.length) next.unsynced = { reviewLog: left };
  else delete next.unsynced;
  return next;
}

/**
 * The learner's current day in this browser, counted exactly as the server
 * counts it (server/activity.js `todayFor`, both through `learnerDay`): the
 * local day in their zone, but never before their last active day or the
 * last day of their activity log.
 *
 * Without that floor the two disagreed after a flight west: a learner who
 * solved in Auckland on the 27th and reloaded in Los Angeles, where it was
 * still the 26th, saw a streak of 0 (the 27th is neither "today" nor
 * "yesterday" from the 26th), and their next solve restarted it at 1 on the
 * 26th - while the server, whose day never moves back, still counted the 27th.
 */
export function sessionToday(
  zone: string | null | undefined,
  stats: { lastActiveDay?: string | null } | null | undefined,
  activity: { lastDay?: string | null } | null | undefined,
  now: Date = new Date()
): string {
  return learnerDay(zone, [stats?.lastActiveDay, activity?.lastDay], now);
}

/** The part of a server progress row the stats take. */
export type ServerProgressRow = Partial<Omit<UserStats, 'isPremium' | 'unlockedStages' | 'ownerId'>>;

/**
 * Adopt the account's progress as a route handed it over (`/auth/me`,
 * login, a merge). Those routes already worked out the missed days on the
 * learner's own day (the settled row), so the streak fields are taken as they
 * are - judging them again against this browser's day could only disagree
 * with the server. The level follows the current curve.
 */
export function adoptAccountProgress(prev: UserStats, progress: ServerProgressRow | null | undefined, curve: LevelCurve = DEFAULT_LEVEL_CURVE): UserStats {
  const row = progress ?? {};
  const xp = Number(row.xp) || 0;
  const next: UserStats = {
    ...prev,
    ...row,
    xp,
    level: levelFromXp(xp, curve),
    streak: rawStreak(row.streak),
    // The account's own test-outs (an older server has none): a guest's
    // local ones were sent with the merge as claims, or do not belong here.
    testedOut: normalizeTestedOut(row.testedOut),
    // Unioned, never overwritten: the server's list starts empty, and the
    // teaching this browser already showed must not be shown again.
    seenConcepts: unionConcepts(prev.seenConcepts, row.seenConcepts)
  };
  // An older server sends no `habit`: none is better than the previous
  // account's (or a guest's) left behind in this browser.
  if (!plainObject(row.habit)) delete next.habit;
  // A guest's claims go up with the merge and never stay on an account's copy.
  delete next.assessmentClaims;
  return next;
}

/**
 * The stats once the server has answered a solve. Its row wins, except that
 * work this tab did while the request was in flight is kept: solves are a
 * union, and XP is the larger of the two - unless the rules changed since
 * this tab priced the solve (`rulesChanged`: the response's settings
 * revision is not the one the tab played by). Then the server's XP is taken
 * as it is (build plan §7), so a lowered reward never lingers in an old tab
 * with too high a level. The streak fields are the server's, raw.
 */
export function statsAfterSolve(prev: UserStats, progress: ServerProgressRow, options: { rulesChanged: boolean; curve: LevelCurve }): UserStats {
  const serverXp = Number(progress.xp) || 0;
  const xp = options.rulesChanged ? serverXp : Math.max(prev.xp, serverXp);
  return {
    ...prev,
    ...progress,
    xp,
    completedChallenges: [...new Set([...prev.completedChallenges, ...(progress.completedChallenges ?? [])])],
    // Unioned like the solves: the server's list may be behind this tab's.
    seenConcepts: unionConcepts(prev.seenConcepts, progress.seenConcepts),
    testedOut: progress.testedOut !== undefined ? normalizeTestedOut(progress.testedOut) : prev.testedOut,
    level: levelFromXp(xp, options.curve),
    streak: rawStreak(progress.streak),
    // An older server sends no `habit`: keep the one this tab worked out.
    habit: plainObject(progress.habit) ? progress.habit : prev.habit,
    // Progress carries no entitlements; keep the ones the profile gave us.
    isPremium: prev.isPremium,
    unlockedStages: prev.unlockedStages
  };
}

/**
 * A solve the server turned away without judging it: too many solves in a
 * row (429) or every code-runner slot busy while it re-ran the code (503
 * `busy`). Nothing was recorded and the answer was not found wrong, so the
 * solve stays in this browser and goes up with the next sync, like one made
 * offline - it is not "rejected". Any other refusal is a verdict.
 */
export function solveWasDeferred(err: unknown): err is ApiError {
  return err instanceof ApiError && (err.status === 429 || (err.status === 503 && err.reason === 'busy'));
}

/**
 * What to do with a Practice answer `POST /api/review/answer` did not take:
 *   'local'      - unreachable, or turned away without a verdict (429, the
 *                  code runner busy): priced here, sent with the next sync;
 *   'expired'    - the session is over on the server (a 404 that says so):
 *                  start a new one;
 *   'signed-out' - the account's session ended (401);
 *   'failed'     - anything else (an error, a question no longer in the
 *                  bank - its 404 is not "expired"): nothing was recorded.
 */
export type ReviewAnswerFailure = 'local' | 'expired' | 'signed-out' | 'failed';

export function reviewAnswerFailure(err: unknown): ReviewAnswerFailure {
  if (err instanceof OfflineError || solveWasDeferred(err)) return 'local';
  if (err instanceof ApiError && err.status === 404 && err.reason === 'expired') return 'expired';
  if (err instanceof ApiError && err.status === 401) return 'signed-out';
  return 'failed';
}
