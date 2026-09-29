/* ==========================================================================
   The weekly league's rules (Phase 6) - pure, no I/O, no React. The server
   (server/leagues.js, through server-lib.ts) runs them over the store; the
   browser can run the same ones for what it shows.

   Weeks
     A week is Monday to Sunday (or Sunday to Saturday) on EACH learner's own
     calendar, in the same day keys as the activity log, so one week id covers
     a learner in Kolkata and one in Los Angeles alike. Weeks never overlap:
     a week that would overlap one already stored starts the day after it
     ends (or ends the day before it starts), so changing the start day makes
     one shorter transition week. A week is final at `finalizeAt`: UTC
     midnight after its last day, plus a delay - by then every time zone has
     finished that day.

   Ranking
     Weekly XP descending, then whoever joined the week first, then username.
     Ranks are competition style: equal XP shares a rank (1, 2, 2, 4); the
     tie-breaks only order the rows.

   Tiers (off by default - owner decision 4)
     Learners in a tier are put in groups of `groupSize` (the newest group in
     that tier with room, else a new one). When a week closes, the top
     `promoteCount` of a group with at least `minXpToPromote` move up, and the
     bottom `demoteCount` move down when the group is larger than
     `promoteCount + demoteCount` - never above the top tier or below the
     lowest.
   ========================================================================== */
import type { LeagueOutcome } from '@/types';
import { addDays, daysBetween, isDayKey, weekStartFor } from '../time/days';
import type { LeagueSettings, LeagueTier } from '../settings/types';

const HOUR_MS = 3_600_000;

/** The defaults (src/platform/settings/defaults.ts reads them from here). Tiers ship off. */
export const DEFAULT_LEAGUE_SETTINGS: LeagueSettings = {
  enabled: true,
  weekStartsOn: 1,
  // 12 hours after UTC midnight covers UTC-12, the last zone to finish a day.
  finalizeDelayHours: 12,
  boardSize: 50,
  // Guest and offline merges are not checked by the server as they happen.
  countMergedXp: false,
  countUnverifiedSolves: true,
  countReviewXp: true,
  tiers: {
    enabled: false,
    list: [
      { id: 'bronze', name: 'Bronze' },
      { id: 'silver', name: 'Silver' },
      { id: 'gold', name: 'Gold' },
      { id: 'platinum', name: 'Platinum' },
      { id: 'diamond', name: 'Diamond' }
    ],
    groupSize: 30,
    promoteCount: 7,
    demoteCount: 5,
    minXpToPromote: 1
  }
};

/** A tier id: stored on learners' league records. */
export const LEAGUE_TIER_ID_RE = /^[a-z0-9-]{1,32}$/;

/* -------------------------------------------------------------------- weeks */

/** A week's span. `id` is its first day. */
export interface LeagueWeekSpan {
  id: string;
  startDay: string;
  endDay: string;
}

/** 0 (Sunday) or 1 (Monday); anything else is Monday. */
export function weekStartDay(value: unknown): 0 | 1 {
  return value === 0 ? 0 : 1;
}

/** The plain calendar week `day` is in. */
export function naturalWeek(day: string, weekStartsOn: number): LeagueWeekSpan {
  const startDay = weekStartFor(day, weekStartDay(weekStartsOn));
  return { id: startDay, startDay, endDay: addDays(startDay, 6) };
}

/** Does this week include `day`? */
export function weekCovers(week: Pick<LeagueWeekSpan, 'startDay' | 'endDay'> | null | undefined, day: string): boolean {
  return Boolean(week && isDayKey(day) && week.startDay <= day && day <= week.endDay);
}

function spans(known: unknown): LeagueWeekSpan[] {
  const list = Array.isArray(known) ? known : known ? [known] : [];
  return list.filter(
    (w): w is LeagueWeekSpan => Boolean(w) && isDayKey((w as LeagueWeekSpan).startDay) && isDayKey((w as LeagueWeekSpan).endDay) && (w as LeagueWeekSpan).startDay <= (w as LeagueWeekSpan).endDay
  );
}

/**
 * The week `day` belongs to. A known week that covers it wins (whatever its
 * start day). Otherwise the calendar week under `weekStartsOn`, trimmed so it
 * never overlaps a known week: it starts at least the day after the last
 * known week before `day` ends, and ends before the next known week starts.
 * `known` is the stored weeks (or one of them).
 */
export function weekFor(day: string, weekStartsOn: number, known?: LeagueWeekSpan | LeagueWeekSpan[] | null): LeagueWeekSpan {
  const weeks = spans(known);
  const covering = weeks.find((w) => weekCovers(w, day));
  if (covering) return { id: covering.id ?? covering.startDay, startDay: covering.startDay, endDay: covering.endDay };
  let { startDay, endDay } = naturalWeek(day, weekStartsOn);
  for (const w of weeks) {
    if (w.endDay < day && w.endDay >= startDay) startDay = addDays(w.endDay, 1);
    if (w.startDay > day && w.startDay <= endDay) endDay = addDays(w.startDay, -1);
  }
  return { id: startDay, startDay, endDay };
}

/** How many days a week has (7, or fewer for a transition week). */
export function weekLength(week: Pick<LeagueWeekSpan, 'startDay' | 'endDay'>): number {
  return daysBetween(week.startDay, week.endDay) + 1;
}

/** When a week ending on `endDay` becomes final: UTC midnight after it, plus `delayHours` (ms since the epoch). */
export function finalizeAt(endDay: string, delayHours: number): number {
  const [y, m, d] = endDay.split('-').map(Number);
  const hours = Number.isFinite(delayHours) ? Math.max(0, delayHours) : 0;
  return Date.UTC(y, m - 1, d + 1) + hours * HOUR_MS;
}

/* ------------------------------------------------------------------ ranking */

export interface LeagueEntry {
  userId: string;
  username: string;
  xp: number;
  /** When the learner first earned league XP this week (ISO), or null. */
  joinedAt: string | null;
}

export type RankedLeagueEntry<T extends LeagueEntry = LeagueEntry> = T & { rank: number };

function joinedMs(value: string | null | undefined): number {
  const ms = typeof value === 'string' ? Date.parse(value) : NaN;
  return Number.isFinite(ms) ? ms : Number.POSITIVE_INFINITY;
}

function textOrder(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** The board order: XP descending, then earlier `joinedAt` (unknown last), then username, then id. */
export function compareLeagueEntries(a: LeagueEntry, b: LeagueEntry): number {
  return (
    b.xp - a.xp ||
    joinedMs(a.joinedAt) - joinedMs(b.joinedAt) ||
    textOrder(String(a.username ?? ''), String(b.username ?? '')) ||
    textOrder(String(a.userId ?? ''), String(b.userId ?? ''))
  );
}

/** Sorted and ranked, competition style: equal XP shares a rank (1, 2, 2, 4). The input is untouched. */
export function rankLeague<T extends LeagueEntry>(entries: readonly T[]): Array<RankedLeagueEntry<T>> {
  const sorted = [...entries].sort(compareLeagueEntries);
  const out: Array<RankedLeagueEntry<T>> = [];
  sorted.forEach((entry, i) => {
    const rank = i > 0 && sorted[i - 1].xp === entry.xp ? out[i - 1].rank : i + 1;
    out.push({ ...entry, rank });
  });
  return out;
}

/* -------------------------------------------------------------------- tiers */

export interface LeagueGroup {
  tierId: string;
  memberIds: string[];
}

/** The tier a stored id names, or the lowest tier when it names none (a renamed or removed tier). */
export function tierIndexOf(tiers: readonly LeagueTier[], tierId: string | null | undefined): number {
  const at = tiers.findIndex((t) => t.id === tierId);
  return at === -1 ? 0 : at;
}

/** The group `userId` is in, or null. */
export function groupOf(groups: Record<string, LeagueGroup> | null | undefined, userId: string): string | null {
  for (const id of Object.keys(groups ?? {})) {
    if (groups![id]?.memberIds?.includes(userId)) return id;
  }
  return null;
}

/**
 * Put a learner in a group of their tier: the one they are already in, else
 * the newest group of that tier with room, else a new one
 * (`<tierId>-<n>`). Returns the groups after it (the input is untouched) and
 * the group id.
 */
export function assignGroup(
  groups: Record<string, LeagueGroup> | null | undefined,
  tierId: string,
  userId: string,
  groupSize: number
): { groups: Record<string, LeagueGroup>; groupId: string } {
  const next: Record<string, LeagueGroup> = {};
  for (const id of Object.keys(groups ?? {})) {
    Object.defineProperty(next, id, { value: { ...groups![id], memberIds: [...(groups![id]?.memberIds ?? [])] }, writable: true, enumerable: true, configurable: true });
  }
  const already = groupOf(next, userId);
  if (already) return { groups: next, groupId: already };
  const size = Math.max(1, Math.floor(groupSize));
  const ofTier = Object.keys(next).filter((id) => next[id].tierId === tierId);
  const newest = ofTier[ofTier.length - 1];
  if (newest && next[newest].memberIds.length < size) {
    next[newest].memberIds.push(userId);
    return { groups: next, groupId: newest };
  }
  let n = ofTier.length + 1;
  while (Object.prototype.hasOwnProperty.call(next, `${tierId}-${n}`)) n += 1;
  const groupId = `${tierId}-${n}`;
  Object.defineProperty(next, groupId, { value: { tierId, memberIds: [userId] }, writable: true, enumerable: true, configurable: true });
  return { groups: next, groupId };
}

/** The tier rules a week keeps from the day it starts (tier changes apply from the next week). */
export interface LeagueTierRules {
  tiersEnabled: boolean;
  tiers: LeagueTier[];
  groupSize: number;
  promoteCount: number;
  demoteCount: number;
  minXpToPromote: number;
}

export function tierRulesFrom(league: LeagueSettings): LeagueTierRules {
  return {
    tiersEnabled: league.tiers.enabled === true,
    tiers: league.tiers.list.map((t) => ({ id: t.id, name: t.name })),
    groupSize: league.tiers.groupSize,
    promoteCount: league.tiers.promoteCount,
    demoteCount: league.tiers.demoteCount,
    minXpToPromote: league.tiers.minXpToPromote
  };
}

/** How many rows of a group of `size` move up and down. Nobody moves down in a group of `promote + demote` or fewer. */
export function groupZones(size: number, rules: Pick<LeagueTierRules, 'promoteCount' | 'demoteCount'>): { promote: number; demote: number } {
  const promote = Math.max(0, Math.min(size, Math.floor(rules.promoteCount)));
  const demote = size > rules.promoteCount + rules.demoteCount ? Math.max(0, Math.floor(rules.demoteCount)) : 0;
  return { promote, demote };
}

/**
 * The zone of one row of a ranked group (by its position, 0-based): 'up' when
 * it would move up (in the top `promote`, with enough XP, not already in the
 * top tier), 'down' when it would move down (in the bottom `demote`, not
 * already in the lowest tier), else null.
 */
export function zoneAt(
  position: number,
  xp: number,
  size: number,
  tierIndex: number,
  rules: Pick<LeagueTierRules, 'promoteCount' | 'demoteCount' | 'minXpToPromote' | 'tiers'>
): 'up' | 'down' | null {
  const { promote, demote } = groupZones(size, rules);
  if (position < promote && xp >= rules.minXpToPromote && tierIndex < rules.tiers.length - 1) return 'up';
  if (demote > 0 && position >= size - demote && tierIndex > 0) return 'down';
  return null;
}

export interface LeagueGroupOutcome {
  userId: string;
  outcome: Exclude<LeagueOutcome, 'single'>;
  toTierId: string;
}

/**
 * What closing a week does to one group: `ranked` is the group's learners in
 * board order (rankLeague), all in the tier at `tierIndex`.
 */
export function groupOutcomes(
  ranked: ReadonlyArray<Pick<LeagueEntry, 'userId' | 'xp'>>,
  tierIndex: number,
  rules: Pick<LeagueTierRules, 'promoteCount' | 'demoteCount' | 'minXpToPromote' | 'tiers'>
): LeagueGroupOutcome[] {
  const tiers = rules.tiers;
  const here = Math.max(0, Math.min(tiers.length - 1, tierIndex));
  return ranked.map((entry, position) => {
    const zone = zoneAt(position, entry.xp, ranked.length, here, rules);
    if (zone === 'up') return { userId: entry.userId, outcome: 'promoted', toTierId: tiers[here + 1].id };
    if (zone === 'down') return { userId: entry.userId, outcome: 'demoted', toTierId: tiers[here - 1].id };
    return { userId: entry.userId, outcome: 'stayed', toTierId: tiers[here]?.id ?? '' };
  });
}

/* ---------------------------------------------------------------- weekly XP */

/**
 * The league XP a solve earns: its XP when it is the first time this account
 * was ever paid for the challenge (`firstEver` - never again after a progress
 * reset) and the server checked the answer itself, or unchecked solves
 * count (`league.countUnverifiedSolves`); else 0.
 */
export function solveLeagueXp(
  solve: { firstEver: boolean; verified: boolean; awardedXp: number },
  league: Pick<LeagueSettings, 'countUnverifiedSolves'>
): number {
  const xp = Math.max(0, Math.floor(Number(solve.awardedXp) || 0));
  return solve.firstEver && (solve.verified || league.countUnverifiedSolves) ? xp : 0;
}

/** A week's XP for one learner: the league XP of its days, less the admin's reset baseline - never negative. */
export function weeklyLeagueXp(dayXp: readonly number[], baseline = 0): number {
  const total = dayXp.reduce((sum, xp) => sum + (Number.isFinite(xp) && xp > 0 ? xp : 0), 0);
  return Math.max(0, total - (Number.isFinite(baseline) && baseline > 0 ? baseline : 0));
}

/**
 * The XP a learner earned in `week` (their days' `xp` and goal bonus) that
 * is not league XP - a guest's merged XP or an offline solve, with
 * `league.countMergedXp` off (the default), or XP earned again after a
 * progress reset. The board uses it to explain why that XP is missing.
 */
export function uncountedLeagueXp(
  days: Record<string, { xp?: number; goalBonusXp?: number; leagueXp?: number }> | null | undefined,
  week: Pick<LeagueWeekSpan, 'startDay' | 'endDay'> | null | undefined
): number {
  const n = (value: unknown) => (typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : 0);
  let total = 0;
  for (const [day, row] of Object.entries(days ?? {})) {
    if (!weekCovers(week, day)) continue;
    total += Math.max(0, n(row?.xp) + n(row?.goalBonusXp) - n(row?.leagueXp));
  }
  return total;
}
