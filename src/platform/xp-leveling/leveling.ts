/* ==========================================================================
   XP curve, streaks and scoring.

   Kept free of React and DOM APIs so the Node server can compile and import
   this exact file - the client and the server must agree on what a level is.

   Every rule takes its numbers as a parameter (`XpRules`, `LevelCurve`) so an
   administrator can change them from the settings store
   (src/platform/settings) without a redeploy. The defaults below are exactly
   the constants this file used before, so a call without them behaves as it
   always did.
   ========================================================================== */
import { addDays } from '../time/days';

/* ------------------------------------------------------------------ levels */

/**
 * The XP needed to reach each level: `thresholds[0]` is level 1 (always 0),
 * `thresholds[i]` is level i + 1. Past the end of the table every further
 * level costs `overflowStep` more XP.
 */
export interface LevelCurve {
  thresholds: number[];
  overflowStep: number;
}

/**
 * The old formula as a table: level L starts at `base·(L−1)·L`. With base 50
 * that is 0, 100, 300, 600, 1000, … - each level costs 100 more than the last.
 */
export function formulaThresholds(base: number, count: number): number[] {
  return Array.from({ length: Math.max(1, Math.floor(count)) }, (_, i) => base * i * (i + 1));
}

/**
 * The curve learners had before the retune: levels 1-40 from the formula,
 * then 4000 XP per level - identical to the old `50·n·(n+1)` curve for every
 * total up to 82,000 XP (level 41). Kept as data: it is the "never lower
 * anyone's level" reference the default below is tested against, and what
 * the admin's "Generate curve" helper reproduces with base 50.
 */
export const FORMULA_LEVEL_CURVE: LevelCurve = { thresholds: formulaThresholds(50, 40), overflowStep: 4000 };

/**
 * The retuned default (owner decision 2): levels 1-10 exactly as before
 * (0, 100, 300, ... 4500), then +900 XP per level up to level 20 at 13,500,
 * and +900 per level after the table. Every level costs no more than it did
 * under the formula (level 11 is 5,400 against 5,500; level 20 is 13,500
 * against 19,000), so a curve change can only move a learner UP - a unit
 * test checks `levelFromXp(x) >= levelFromXp(x, FORMULA_LEVEL_CURVE)`.
 * The top rank (level 20) is now reachable with the free content alone.
 */
export const DEFAULT_LEVEL_CURVE: LevelCurve = {
  thresholds: [0, 100, 300, 600, 1000, 1500, 2100, 2800, 3600, 4500, ...Array.from({ length: 10 }, (_, i) => 5400 + i * 900)],
  overflowStep: 900
};

function tableOf(curve: LevelCurve): number[] {
  return Array.isArray(curve?.thresholds) && curve.thresholds.length > 0 ? curve.thresholds : [0];
}

function stepOf(curve: LevelCurve): number {
  const step = Number(curve?.overflowStep);
  return Number.isFinite(step) && step >= 1 ? step : 1;
}

/** Total XP required to *reach* a level. Level 1 starts at 0. */
export function xpForLevel(level: number, curve: LevelCurve = DEFAULT_LEVEL_CURVE): number {
  if (level <= 1) return 0;
  const table = tableOf(curve);
  if (level <= table.length) return table[level - 1];
  return table[table.length - 1] + (level - table.length) * stepOf(curve);
}

export function levelFromXp(xp: number, curve: LevelCurve = DEFAULT_LEVEL_CURVE): number {
  const table = tableOf(curve);
  const total = Number(xp);
  if (!Number.isFinite(total) || total <= 0) return 1;
  let level = 1;
  for (let i = 1; i < table.length; i++) {
    if (table[i] <= total) level = i + 1;
    else return level;
  }
  // Every level in the table is reached: count the overflow levels on top.
  return level + Math.floor((total - table[table.length - 1]) / stepOf(curve));
}

/** How far through the current level the player is, as 0-100. */
export function levelProgress(
  xp: number,
  curve: LevelCurve = DEFAULT_LEVEL_CURVE
): {
  level: number;
  into: number;
  needed: number;
  percent: number;
} {
  const level = levelFromXp(xp, curve);
  const floor = xpForLevel(level, curve);
  const ceiling = xpForLevel(level + 1, curve);
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

/** The calendar day before `key`. UTC arithmetic, so no zone or DST can move it. */
export function previousDayKey(key: string): string {
  return addDays(key, -1);
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
 * How a solve is scored and paid. `settings.xp` (src/platform/settings) is a
 * superset of this, so it can be passed straight in.
 */
export interface XpRules {
  /** Points off the score for each try after the first. */
  retryPenalty: number;
  /** Points off the score for each hint shown. */
  hintPenalty: number;
  /** The score never drops below this, however many tries it took. */
  scoreFloor: number;
  /** The raw score (before the floor) a correct answer needs to complete the lesson. */
  passScore: number;
  /** The least XP a first solve pays, even for a 0-XP question. */
  minXpPerSolve: number;
}

export const DEFAULT_XP_RULES: XpRules = {
  retryPenalty: 10,
  hintPenalty: 10,
  scoreFloor: 50,
  passScore: 60,
  minXpPerSolve: 1
};

/** The score before the floor - what the pass mark is measured against. */
export function rawScore(attempts: number, hintsUsed: number, rules: XpRules = DEFAULT_XP_RULES): number {
  return Math.max(0, 100 - (Math.max(0, attempts - 1) * rules.retryPenalty + hintsUsed * rules.hintPenalty));
}

/**
 * Score a solve out of 100. A clean first try is worth full marks; retries and
 * hints cost points each, and we never drop below the floor - the point is to
 * reward finishing, not to punish learning. `cap` limits the score (a later
 * phase caps it once the answer has been revealed).
 */
export function scoreSolve(attempts: number, hintsUsed: number, rules: XpRules = DEFAULT_XP_RULES, cap = 100): number {
  return Math.min(cap, Math.max(rules.scoreFloor, rawScore(attempts, hintsUsed, rules)));
}

/**
 * The default pass mark. A correct answer only completes the lesson when the
 * raw score (before the floor above) is still at or above the pass score:
 * with the defaults, up to four retries, or hints, in any mix that costs 40
 * points or fewer. Below it the lesson is not recorded - the learner retries
 * it fresh. The live value is `settings.xp.passScore`.
 */
export const PASS_SCORE = DEFAULT_XP_RULES.passScore;

export function isPassingSolve(attempts: number, hintsUsed: number, rules: XpRules = DEFAULT_XP_RULES): boolean {
  return rawScore(attempts, hintsUsed, rules) >= rules.passScore;
}

export function xpForSolve(
  xpReward: number,
  attempts: number,
  hintsUsed: number,
  rules: XpRules = DEFAULT_XP_RULES,
  cap = 100
): number {
  return Math.max(rules.minXpPerSolve, Math.round((xpReward * scoreSolve(attempts, hintsUsed, rules, cap)) / 100));
}

/**
 * What a stage test passed in a test-out or a placement pays: the solve's
 * own XP (`xpForSolve`, so the same score and floor), scaled by the admin's
 * `xpPercent` (0-100). 0% pays nothing at all - the minimum XP per solve is
 * for solves, and a share of 0 is a deliberate "no XP for skipping".
 */
export function xpForTestOut(
  xpReward: number,
  xpPercent: number,
  attempts: number,
  hintsUsed: number,
  rules: XpRules = DEFAULT_XP_RULES
): number {
  const share = Math.max(0, Math.min(100, Number(xpPercent) || 0));
  if (share === 0) return 0;
  return Math.round((xpForSolve(xpReward, attempts, hintsUsed, rules) * share) / 100);
}
