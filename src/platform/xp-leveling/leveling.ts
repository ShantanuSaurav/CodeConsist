/* ==========================================================================
   XP curve, streaks and scoring.

   Kept free of React and DOM APIs so the Node server can compile and import
   this exact file - the client and the server must agree on what a level is.
   ========================================================================== */

/** Total XP required to *reach* a level. Level 1 starts at 0. */
export function xpForLevel(level: number): number {
  if (level <= 1) return 0;
  const n = level - 1;
  // 100, 300, 600, 1000, 1500, ... - each level costs 100 more than the last.
  return 50 * n * (n + 1);
}

export function levelFromXp(xp: number): number {
  let level = 1;
  while (xpForLevel(level + 1) <= xp) level++;
  return level;
}

/** How far through the current level the player is, as 0-100. */
export function levelProgress(xp: number): {
  level: number;
  into: number;
  needed: number;
  percent: number;
} {
  const level = levelFromXp(xp);
  const floor = xpForLevel(level);
  const ceiling = xpForLevel(level + 1);
  const into = xp - floor;
  const needed = ceiling - floor;
  return {
    level,
    into,
    needed,
    percent: needed > 0 ? Math.min(100, Math.round((into / needed) * 100)) : 100
  };
}

/* ------------------------------------------------------------------ dates */

/** Local-time yyyy-mm-dd. Streaks are a human concept, so use local days. */
export function dayKey(date: Date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function previousDayKey(key: string): string {
  const [y, m, d] = key.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  date.setDate(date.getDate() - 1);
  return dayKey(date);
}

/**
 * Advance a streak for activity on `today`.
 * Same day: unchanged. Consecutive day: +1. Any gap: back to 1.
 */
export function nextStreak(
  streak: number,
  lastActiveDay: string | null,
  today: string = dayKey()
): number {
  if (lastActiveDay === today) return Math.max(1, streak);
  if (lastActiveDay && previousDayKey(today) === lastActiveDay) return Math.max(1, streak) + 1;
  return 1;
}

/** A streak is stale once a whole day has been missed. */
export function currentStreak(streak: number, lastActiveDay: string | null, today: string = dayKey()): number {
  if (!lastActiveDay) return 0;
  if (lastActiveDay === today) return streak;
  if (previousDayKey(today) === lastActiveDay) return streak;
  return 0;
}

/* ----------------------------------------------------------------- scoring */

/**
 * Score a solve out of 100. A clean first try is worth full marks; retries and
 * hints cost 10 points each, and we never drop below half credit - the point is
 * to reward finishing, not to punish learning.
 */
export function scoreSolve(attempts: number, hintsUsed: number): number {
  const penalty = Math.max(0, attempts - 1) * 10 + hintsUsed * 10;
  return Math.max(50, 100 - penalty);
}

export function xpForSolve(xpReward: number, attempts: number, hintsUsed: number): number {
  return Math.max(1, Math.round((xpReward * scoreSolve(attempts, hintsUsed)) / 100));
}
