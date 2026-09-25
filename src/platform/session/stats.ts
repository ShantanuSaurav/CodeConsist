/**
 * The learner's stats as the browser keeps them, how an old save is brought
 * up to date, and how the server's answers are folded in. Lives outside
 * SessionProvider.tsx because a non-component export from that file breaks
 * React Fast Refresh - and so these rules can be tested without React.
 */
import type { UserStats } from '@/types';
import { learnerDay } from '../time/days';
import { DEFAULT_LEVEL_CURVE, currentStreak, levelFromXp } from '../xp-leveling/leveling';
import type { LevelCurve } from '../xp-leveling/leveling';

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
  isPremium: false,
  unlockedStages: []
};

/**
 * Old saves are missing fields added later; fill them in rather than
 * crashing. The level is re-derived from XP with the current curve, so a
 * curve change never leaves a stale level on screen. `today` should be the
 * learner's day from `sessionToday`, so the streak is judged as the server
 * judges it.
 */
export function hydrateStats(raw: unknown, curve: LevelCurve = DEFAULT_LEVEL_CURVE, today?: string): UserStats {
  const saved = (raw && typeof raw === 'object' ? raw : {}) as Partial<UserStats>;
  const xp = Number(saved.xp) || 0;
  return {
    ...INITIAL_STATS,
    ...saved,
    xp,
    level: levelFromXp(xp, curve),
    streak: currentStreak(Number(saved.streak) || 0, saved.lastActiveDay ?? null, today),
    bestStreak: Number(saved.bestStreak) || Number(saved.streak) || 0,
    completedChallenges: Array.isArray(saved.completedChallenges) ? saved.completedChallenges : [],
    completedStages: Array.isArray(saved.completedStages) ? saved.completedStages : [],
    seenConcepts: Array.isArray(saved.seenConcepts) ? saved.seenConcepts : [],
    attempts: saved.attempts && typeof saved.attempts === 'object' ? saved.attempts : {},
    isPremium: Boolean(saved.isPremium),
    // A cached copy of what the server said last time; the next restore overwrites it.
    unlockedStages: Array.isArray(saved.unlockedStages) ? saved.unlockedStages.filter((id) => typeof id === 'string') : []
  };
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
 * login, a merge). Those routes already worked the streak out on the
 * learner's own day, so it is taken as it is - judging it again against this
 * browser's day could only disagree with the server. The level follows the
 * current curve.
 */
export function adoptAccountProgress(prev: UserStats, progress: ServerProgressRow | null | undefined, curve: LevelCurve = DEFAULT_LEVEL_CURVE): UserStats {
  const row = progress ?? {};
  const xp = Number(row.xp) || 0;
  return { ...prev, ...row, xp, level: levelFromXp(xp, curve), streak: Math.max(0, Number(row.streak) || 0) };
}

/**
 * The stats once the server has answered a solve. Its row wins, except that
 * work this tab did while the request was in flight is kept: solves are a
 * union, and XP is the larger of the two - unless the rules changed since
 * this tab priced the solve (`rulesChanged`: the response's settings
 * revision is not the one the tab played by). Then the server's XP is taken
 * as it is (build plan §7), so a lowered reward never lingers in an old tab
 * with too high a level. The streak is the server's, judged on the day the
 * server counted the solve on (`serverDay`).
 */
export function statsAfterSolve(
  prev: UserStats,
  progress: ServerProgressRow,
  options: { rulesChanged: boolean; curve: LevelCurve; serverDay: string }
): UserStats {
  const serverXp = Number(progress.xp) || 0;
  const xp = options.rulesChanged ? serverXp : Math.max(prev.xp, serverXp);
  return {
    ...prev,
    ...progress,
    xp,
    completedChallenges: [...new Set([...prev.completedChallenges, ...(progress.completedChallenges ?? [])])],
    level: levelFromXp(xp, options.curve),
    streak: currentStreak(Number(progress.streak) || 0, progress.lastActiveDay ?? null, options.serverDay),
    // Progress carries no entitlements; keep the ones the profile gave us.
    isPremium: prev.isPremium,
    unlockedStages: prev.unlockedStages
  };
}
