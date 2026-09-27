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
import type { UserStats } from '@/types';
import { ApiError } from '../api-client/api';
import { learnerDay } from '../time/days';
import { DEFAULT_LEVEL_CURVE, levelFromXp } from '../xp-leveling/leveling';
import type { LevelCurve } from '../xp-leveling/leveling';
import { normalizeUnitsCompleted } from '../xp-leveling/rewards';

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
    isPremium: Boolean(saved.isPremium),
    // A cached copy of what the server said last time; the next restore overwrites it.
    unlockedStages: Array.isArray(saved.unlockedStages) ? saved.unlockedStages.filter((id) => typeof id === 'string') : []
  };
  // Freezes, repair and streak history: normalized by the habits engine
  // wherever it is read. A save from before them has none.
  if (!plainObject(saved.habit)) delete stats.habit;
  return stats;
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
  const next: UserStats = { ...prev, ...row, xp, level: levelFromXp(xp, curve), streak: rawStreak(row.streak) };
  // An older server sends no `habit`: none is better than the previous
  // account's (or a guest's) left behind in this browser.
  if (!plainObject(row.habit)) delete next.habit;
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
