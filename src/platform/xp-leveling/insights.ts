/* ==========================================================================
   Derived facts about a player's progress that several screens share:
   rank titles, today's activity, the activity heatmap, recent achievements.
   Pure functions over UserStats and content so they are trivial to test.
   ========================================================================== */
import type { ActivityLog, Challenge, DayRecord, Stage, UserStats } from '@/types';
import type { BadgeFamily, BadgeMetric, BadgeSettings } from '../settings/types';
import { fillCopy } from '../settings/copy';
import { dayKey } from './leveling';
import { completedUnitIds, normalizeUnitsCompleted, perfectUnitIds } from './rewards';

/** One rank title and the level it starts at. */
export interface RankRow {
  minLevel: number;
  title: string;
}

/**
 * The default rank titles. The live list is `settings.levels.ranks`; it must
 * start at level 1 and ascend strictly (src/platform/settings/schema.ts).
 */
export const DEFAULT_RANKS: RankRow[] = [
  { minLevel: 1, title: 'Apprentice' },
  { minLevel: 3, title: 'Junior Developer' },
  { minLevel: 6, title: 'Developer' },
  { minLevel: 10, title: 'Senior Developer' },
  { minLevel: 15, title: 'Staff Engineer' },
  { minLevel: 20, title: 'Principal Engineer' }
];

/** A name for each band of levels. Purely cosmetic. */
export function rankTitle(level: number, ranks: RankRow[] = DEFAULT_RANKS): string {
  let title = ranks[0]?.title ?? '';
  for (const rank of ranks) if (level >= rank.minLevel) title = rank.title;
  return title;
}

/** The level at which the next rank title starts, or null at the top. */
export function nextRankLevel(level: number, ranks: RankRow[] = DEFAULT_RANKS): number | null {
  for (const rank of ranks) if (level < rank.minLevel) return rank.minLevel;
  return null;
}

/** What a learner did on one day, from their activity log (zeros for a day with nothing). */
export interface DayTotals {
  xp: number;
  lessons: number;
  tests: number;
  reSolves: number;
  mistakes: number;
  /** Every solve that day, first-time or not. */
  solves: number;
}

/**
 * One day's totals from the activity log. This is what "XP today" reads: the
 * log counts only XP that was actually awarded, so re-solving an old lesson
 * no longer inflates it the way `xpEarnedOn` (a fallback for days before the
 * log existed) did.
 */
export function dayTotals(log: Pick<ActivityLog, 'days'> | null | undefined, day: string): DayTotals {
  const raw: Partial<DayRecord> | undefined =
    log?.days && Object.prototype.hasOwnProperty.call(log.days, day) ? log.days[day] : undefined;
  const n = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : 0);
  const lessons = n(raw?.lessons);
  const tests = n(raw?.tests);
  const reSolves = n(raw?.reSolves);
  return { xp: n(raw?.xp), lessons, tests, reSolves, mistakes: n(raw?.mistakes), solves: lessons + tests + reSolves };
}

/** Local day key for an ISO timestamp. */
export function dayOf(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : dayKey(d);
}

/** Challenge ids solved on a given local day (default today). */
export function solvedOn(stats: UserStats, day: string = dayKey()): string[] {
  return Object.values(stats.attempts)
    .filter((a) => dayOf(a.solvedAt) === day)
    .map((a) => a.challengeId);
}

/** XP earned on a given day, from the challenges' rewards and the recorded score. */
export function xpEarnedOn(stats: UserStats, byId: (id: string) => Challenge | undefined, day: string = dayKey()): number {
  let total = 0;
  for (const a of Object.values(stats.attempts)) {
    if (dayOf(a.solvedAt) !== day) continue;
    const c = byId(a.challengeId);
    if (c) total += Math.round((c.xpReward * a.score) / 100);
  }
  return total;
}

export interface HeatCell {
  day: string;
  count: number;
  /** XP credited that day, when the grid was built from the activity log. */
  xp?: number;
  /** 0-4 intensity bucket for colouring. */
  level: 0 | 1 | 2 | 3 | 4;
}

/**
 * GitHub-style activity grid: `weeks` columns of seven days ending today.
 * Returned column-major (weeks[w][d]), oldest week first, Monday first.
 */
export function activityGrid(stats: UserStats, weeks = 14): HeatCell[][] {
  const counts = new Map<string, number>();
  for (const a of Object.values(stats.attempts)) {
    const day = dayOf(a.solvedAt);
    if (day) counts.set(day, (counts.get(day) ?? 0) + 1);
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  // Monday = 0 … Sunday = 6, so the grid lines up with a normal week.
  const weekday = (today.getDay() + 6) % 7;
  const start = new Date(today);
  start.setDate(today.getDate() - weekday - (weeks - 1) * 7);

  const grid: HeatCell[][] = [];
  for (let w = 0; w < weeks; w++) {
    const column: HeatCell[] = [];
    for (let d = 0; d < 7; d++) {
      const date = new Date(start);
      date.setDate(start.getDate() + w * 7 + d);
      const key = dayKey(date);
      const count = date > today ? 0 : counts.get(key) ?? 0;
      const level = count === 0 ? 0 : count <= 2 ? 1 : count <= 5 ? 2 : count <= 9 ? 3 : 4;
      column.push({ day: key, count, level });
    }
    grid.push(column);
  }
  return grid;
}

/* ------------------------------------------------------------- badges */

/**
 * The default badge families. The live list is `settings.badges`; ids stay
 * `${familyId}-${n}`, so `streak-3` and `solved-10` are the ids learners
 * already earned.
 */
export const DEFAULT_BADGES: BadgeSettings = {
  tierNames: ['Bronze', 'Silver', 'Gold', 'Platinum', 'Diamond'],
  families: [
    { id: 'streak', metric: 'bestStreak', enabled: true, title: '{n}-day streak', detail: 'Practiced {n} days in a row', tiers: [3, 7, 14, 30, 100] },
    { id: 'solved', metric: 'solvedCount', enabled: true, title: '{n} challenges solved', detail: 'Cleared {n} lessons and tests', tiers: [10, 50, 100, 200] },
    { id: 'units', metric: 'unitsCompleted', enabled: true, title: 'Unit finisher: {n}', detail: 'Units completed: {n}', tiers: [1, 10, 25, 40] },
    { id: 'perfect', metric: 'perfectUnits', enabled: true, title: 'Perfectionist: {n}', detail: 'Perfect units (first try, no hints): {n}', tiers: [1, 5, 15, 30] },
    { id: 'tests', metric: 'testsPassed', enabled: true, title: 'Test passer: {n}', detail: 'Stage tests passed: {n}', tiers: [1, 3, 6, 12] },
    { id: 'xp', metric: 'xp', enabled: true, title: '{n} XP', detail: 'Earn {n} XP in total', tiers: [1000, 5000, 10000, 15000] }
  ],
  stageBadges: {
    enabled: true,
    coreTitle: 'Stage {index} cleared',
    trackTitle: '{name} cleared'
  }
};

export type AchievementKind = 'streak' | 'stage' | 'first' | 'xp' | 'test' | 'unit' | 'perfect';

/** Where a tiered badge stands: the metric's value now, this tier's threshold and the one before. */
export interface BadgeTierProgress {
  value: number;
  next: number;
  previous: number;
}

export interface Achievement {
  id: string;
  title: string;
  detail: string;
  /** ISO timestamp (or day) it was earned, for ordering; null if not yet. */
  earnedAt: string | null;
  kind: AchievementKind;
  /** The family a tiered badge belongs to (`streak`), absent on the first-solve and stage badges. */
  family?: string;
  metric?: BadgeMetric;
  /** 0-based tier within the family. */
  tier?: number;
  tierName?: string;
  progress?: BadgeTierProgress | null;
}

const KIND_OF: Record<BadgeMetric, AchievementKind> = {
  bestStreak: 'streak',
  // `solved-N` always rendered as the "xp" kind; kept, so nothing moves.
  solvedCount: 'xp',
  unitsCompleted: 'unit',
  perfectUnits: 'perfect',
  xp: 'xp',
  testsPassed: 'test'
};

export interface BadgeOptions {
  /** `units.perfectRequiresNoHints`, for the derived perfect units. */
  perfectRequiresNoHints?: boolean;
}

/** A tier's display name: the configured one, or the last name for a tier past the list. */
export function tierNameFor(tier: number, names: readonly string[]): string {
  if (!names.length) return '';
  return names[Math.min(Math.max(0, tier), names.length - 1)];
}

interface MetricFacts {
  value: number;
  /** When the value reached 1, 2, 3, ... - for "earned on". Absent where history is not stored. */
  timeline?: string[];
  /** XP only: the running total after each solve, so "earned on" is when it first reached n. */
  running?: Array<{ at: string; total: number }>;
}

/** Everything the badge metrics are computed from, once per call. */
function metricFacts(stats: UserStats, stages: readonly Stage[], options: BadgeOptions): Record<BadgeMetric, MetricFacts> {
  const attempts = Object.values(stats.attempts ?? {})
    .filter((a) => a && typeof a.solvedAt === 'string')
    .sort((a, b) => a.solvedAt.localeCompare(b.solvedAt));
  const solved = new Set(stats.completedChallenges ?? []);
  const units = stages.flatMap((s) => s.units ?? []);
  const records = normalizeUnitsCompleted(stats.unitsCompleted);
  const solvedAt = (id: string) => (Object.prototype.hasOwnProperty.call(stats.attempts ?? {}, id) ? stats.attempts[id].solvedAt : null);
  // When a unit counts as done: its recorded completion, else its last solve.
  const unitTime = (id: string) => {
    if (Object.prototype.hasOwnProperty.call(records, id)) return records[id].completedAt;
    const unit = units.find((u) => u.id === id);
    const times = (unit?.challengeIds ?? []).map(solvedAt).filter((t): t is string => Boolean(t)).sort();
    return times[times.length - 1] ?? stats.lastActiveDay ?? null;
  };
  const timesOf = (ids: Set<string>) =>
    [...ids]
      .map(unitTime)
      .filter((t): t is string => Boolean(t))
      .sort();

  const doneUnits = completedUnitIds(units, solved, records);
  const perfect = perfectUnitIds(units, stats.attempts, records, { perfectRequiresNoHints: options.perfectRequiresNoHints ?? true });

  const testIds = new Set(stages.map((s) => s.test?.id).filter((id): id is string => Boolean(id)));
  const tests = attempts.filter((a) => testIds.has(a.challengeId));

  // XP over time, from the solves and the rewards the challenges pay.
  const rewardOf = new Map<string, number>();
  for (const s of stages) {
    for (const c of s.challenges) rewardOf.set(c.id, c.xpReward);
    if (s.test) rewardOf.set(s.test.id, s.test.xpReward);
  }
  const xpTimeline: Array<{ at: string; total: number }> = [];
  let running = 0;
  for (const a of attempts) {
    running += Math.round(((rewardOf.get(a.challengeId) ?? 0) * (Number(a.score) || 0)) / 100);
    xpTimeline.push({ at: a.solvedAt, total: running });
  }

  return {
    bestStreak: { value: Math.max(Number(stats.bestStreak) || 0, Number(stats.streak) || 0) },
    solvedCount: { value: attempts.length, timeline: attempts.map((a) => a.solvedAt) },
    unitsCompleted: { value: doneUnits.size, timeline: timesOf(doneUnits) },
    perfectUnits: { value: perfect.size, timeline: timesOf(perfect) },
    testsPassed: { value: tests.length, timeline: tests.map((a) => a.solvedAt) },
    xp: { value: Number(stats.xp) || 0, running: xpTimeline }
  };
}

/** When the metric first reached `n`, or null if it has not. */
function earnedAtFor(facts: MetricFacts, n: number, fallback: string | null): string | null {
  if (facts.value < n) return null;
  // Bonus XP is not in the solves, so a total reached only through bonuses falls back.
  if (facts.running) return facts.running.find((p) => p.total >= n)?.at ?? fallback;
  return facts.timeline?.[n - 1] ?? fallback;
}

/** A tier threshold as a badge shows it: "1,000 XP", not "1000 XP". */
function tierVars(n: number): Record<string, string> {
  return { n: n.toLocaleString('en-US') };
}

/** One family's tiers, each a badge with the family's `{n}` filled. */
function familyAchievements(family: BadgeFamily, facts: MetricFacts, tierNames: readonly string[], fallback: string | null): Achievement[] {
  return family.tiers.map((n, tier) => ({
    id: `${family.id}-${n}`,
    kind: KIND_OF[family.metric] ?? 'xp',
    title: fillCopy(family.title, tierVars(n)),
    detail: fillCopy(family.detail, tierVars(n)),
    earnedAt: earnedAtFor(facts, n, fallback),
    family: family.id,
    metric: family.metric,
    tier,
    tierName: tierNameFor(tier, tierNames),
    progress: { value: facts.value, next: n, previous: tier > 0 ? family.tiers[tier - 1] : 0 }
  }));
}

/**
 * Milestones with the timestamp they were actually reached, most recent
 * first. Unearned milestones are appended with earnedAt null so a screen can
 * show what is next.
 *
 * `badges` is `settings.badges`: the tiered families (`streak-3`, `solved-10`
 * ... `${family}-${n}`), which tier names they carry, and the stage badges.
 * The unit families count the resolved `stage.units`; a perfect unit is the
 * union of the recorded perfect completions and the units perfect by their
 * attempts, so a replay never takes one away.
 */
export function achievements(stats: UserStats, stages: Stage[], badges: BadgeSettings = DEFAULT_BADGES, options: BadgeOptions = {}): Achievement[] {
  const attempts = Object.values(stats.attempts ?? {})
    .filter((a) => a && typeof a.solvedAt === 'string')
    .sort((a, b) => a.solvedAt.localeCompare(b.solvedAt));
  const facts = metricFacts(stats, stages, options);
  // Streak history is not stored, so the best streak is the only evidence -
  // it is dated by the last active day, like it always was.
  const fallback = stats.lastActiveDay ?? attempts[attempts.length - 1]?.solvedAt ?? null;
  const out: Achievement[] = [];

  out.push({
    id: 'first-solve',
    kind: 'first',
    title: 'First solve',
    detail: 'Solved your first challenge',
    earnedAt: attempts[0]?.solvedAt ?? null
  });

  for (const family of badges.families) {
    if (!family.enabled) continue;
    out.push(...familyAchievements(family, facts[family.metric], badges.tierNames, fallback));
  }

  if (badges.stageBadges.enabled) {
    for (const stage of stages) {
      const test = stage.test;
      const passed = test ? stats.attempts[test.id] : undefined;
      out.push({
        id: `stage-${stage.id}`,
        kind: 'stage',
        // Core stages keep their number; a track stage (C, C++) is named, since
        // every track starts again at 01.
        title: /^stage-\d+$/.test(stage.id)
          ? fillCopy(badges.stageBadges.coreTitle, { index: stage.index })
          : fillCopy(badges.stageBadges.trackTitle, { name: stage.name }),
        detail: test ? `Passed "${test.title}"` : stage.name,
        earnedAt: stage.state === 'Completed' ? passed?.solvedAt ?? attempts[attempts.length - 1]?.solvedAt ?? null : null
      });
    }
  }

  return out.sort((a, b) => {
    if (a.earnedAt && b.earnedAt) return b.earnedAt.localeCompare(a.earnedAt);
    if (a.earnedAt) return -1;
    if (b.earnedAt) return 1;
    return 0;
  });
}

/** One badge family for the Achievements page: every tier, and where the learner stands. */
export interface BadgeFamilyProgress {
  family: BadgeFamily;
  value: number;
  tiers: Array<{ n: number; id: string; tier: number; tierName: string; title: string; earnedAt: string | null }>;
  /** The highest tier earned, or null. */
  current: { n: number; tier: number; tierName: string; title: string } | null;
  /** The next tier to earn, or null at the top. */
  next: { n: number; tier: number; tierName: string; title: string; detail: string } | null;
  /** The threshold of the current tier (0 before the first) - where the progress bar starts. */
  previous: number;
  /** 0-100 of the way from `previous` to `next`. 100 at the top. */
  percent: number;
}

/** The tiered families grouped for display (enabled ones only, in settings order). */
export function badgeProgress(stats: UserStats, stages: Stage[], badges: BadgeSettings = DEFAULT_BADGES, options: BadgeOptions = {}): BadgeFamilyProgress[] {
  const facts = metricFacts(stats, stages, options);
  const attempts = Object.values(stats.attempts ?? {}).map((a) => a?.solvedAt).filter((t): t is string => typeof t === 'string').sort();
  const fallback = stats.lastActiveDay ?? attempts[attempts.length - 1] ?? null;
  return badges.families
    .filter((family) => family.enabled && family.tiers.length > 0)
    .map((family) => {
      const f = facts[family.metric];
      const tiers = familyAchievements(family, f, badges.tierNames, fallback).map((a) => ({
        n: a.progress!.next,
        id: a.id,
        tier: a.tier!,
        tierName: a.tierName!,
        title: a.title,
        earnedAt: a.earnedAt
      }));
      const earned = tiers.filter((t) => t.earnedAt);
      const top = earned[earned.length - 1] ?? null;
      const upcoming = tiers.find((t) => !t.earnedAt) ?? null;
      const previous = top ? top.n : 0;
      const percent = upcoming ? Math.max(0, Math.min(100, Math.round(((f.value - previous) / Math.max(1, upcoming.n - previous)) * 100))) : 100;
      return {
        family,
        value: f.value,
        tiers,
        current: top ? { n: top.n, tier: top.tier, tierName: top.tierName, title: top.title } : null,
        next: upcoming
          ? { n: upcoming.n, tier: upcoming.tier, tierName: upcoming.tierName, title: upcoming.title, detail: fillCopy(family.detail, tierVars(upcoming.n)) }
          : null,
        previous,
        percent
      };
    });
}

/** The family closest to its next tier - the dashboard's "Next badge". Null when every family is at the top. */
export function nextBadge(families: readonly BadgeFamilyProgress[]): BadgeFamilyProgress | null {
  let best: BadgeFamilyProgress | null = null;
  for (const f of families) {
    if (!f.next) continue;
    if (!best || f.percent > best.percent) best = f;
  }
  return best;
}

/** "3 days ago", "today", … for an ISO timestamp. */
export function relativeDay(iso: string, now: Date = new Date()): string {
  const day = dayOf(iso);
  if (!day) return '';
  const then = new Date(day + 'T00:00:00');
  const today = new Date(dayKey(now) + 'T00:00:00');
  const diff = Math.round((today.getTime() - then.getTime()) / 86_400_000);
  if (diff <= 0) return 'today';
  if (diff === 1) return 'yesterday';
  if (diff < 30) return `${diff} days ago`;
  const months = Math.round(diff / 30);
  return months === 1 ? 'a month ago' : `${months} months ago`;
}

/** Time-of-day greeting. */
export function greeting(now: Date = new Date()): string {
  const h = now.getHours();
  if (h < 5) return 'Burning the midnight oil';
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}
