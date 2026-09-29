import { describe, expect, it } from 'vitest';
import {
  DEFAULT_LEAGUE_SETTINGS,
  assignGroup,
  finalizeAt,
  groupOutcomes,
  groupZones,
  rankLeague,
  solveLeagueXp,
  tierIndexOf,
  tierRulesFrom,
  weekCovers,
  weekFor,
  weekLength,
  weeklyLeagueXp,
  zoneAt
} from '../league';
import type { LeagueWeekSpan } from '../league';
import { addDays } from '../../time/days';
import { DEFAULT_SETTINGS } from '../../settings/defaults';
import { mergeSettings } from '../../settings/merge';
import { validateSettings } from '../../settings/schema';

const span = (startDay: string, endDay: string): LeagueWeekSpan => ({ id: startDay, startDay, endDay });

describe('weekFor', () => {
  it('is the calendar week on the chosen start day', () => {
    // 2026-09-30 is a Wednesday.
    expect(weekFor('2026-09-30', 1, [])).toEqual(span('2026-09-28', '2026-10-04'));
    expect(weekFor('2026-09-30', 0, [])).toEqual(span('2026-09-27', '2026-10-03'));
    // The first and last days belong to their own week.
    expect(weekFor('2026-09-28', 1, null)).toEqual(span('2026-09-28', '2026-10-04'));
    expect(weekFor('2026-10-04', 1, undefined)).toEqual(span('2026-09-28', '2026-10-04'));
    // Across a year end.
    expect(weekFor('2027-01-01', 1, [])).toEqual(span('2026-12-28', '2027-01-03'));
  });

  it('uses a stored week that covers the day, whatever its start day', () => {
    const stored = span('2026-09-27', '2026-10-03'); // a Sunday week
    expect(weekFor('2026-09-30', 1, [stored])).toEqual(stored);
    expect(weekFor('2026-09-30', 1, stored)).toEqual(stored);
  });

  it('makes one shorter week when the start day moves from Sunday to Monday', () => {
    const sundayWeek = span('2026-09-20', '2026-09-26');
    // Sunday the 27th: the Monday week would be 21-27, which overlaps - so it starts on the 27th.
    const transition = weekFor('2026-09-27', 1, [sundayWeek]);
    expect(transition).toEqual(span('2026-09-27', '2026-09-27'));
    expect(weekLength(transition)).toBe(1);
    // From then on, plain Monday weeks.
    expect(weekFor('2026-09-28', 1, [sundayWeek, transition])).toEqual(span('2026-09-28', '2026-10-04'));
  });

  it('makes one shorter week when the start day moves from Monday to Sunday', () => {
    const mondayWeek = span('2026-09-21', '2026-09-27');
    // Monday the 28th: the Sunday week would be 27-03, which overlaps - it starts on the 28th.
    const transition = weekFor('2026-09-28', 0, [mondayWeek]);
    expect(transition).toEqual(span('2026-09-28', '2026-10-03'));
    expect(weekLength(transition)).toBe(6);
    expect(weekFor('2026-10-04', 0, [mondayWeek, transition])).toEqual(span('2026-10-04', '2026-10-10'));
  });

  it('never runs into a later stored week (a learner west of the one who started it)', () => {
    const later = span('2026-09-28', '2026-10-04');
    expect(weekFor('2026-09-27', 1, [later])).toEqual(span('2026-09-21', '2026-09-27'));
    // With Sunday weeks, the 27th would start a week that runs into it: it ends the day before.
    expect(weekFor('2026-09-27', 0, [later])).toEqual(span('2026-09-27', '2026-09-27'));
  });

  it('never makes overlapping weeks, however the start day flips', () => {
    const weeks: LeagueWeekSpan[] = [];
    let day = '2026-01-01';
    for (let i = 0; i < 200; i++) {
      const startsOn = Math.floor(i / 9) % 2; // flips every nine days
      const week = weekFor(day, startsOn, weeks);
      expect(weekCovers(week, day), day).toBe(true);
      if (!weeks.some((w) => w.id === week.id)) weeks.push(week);
      day = addDays(day, 1 + (i % 3)); // not every day has activity
    }
    const sorted = [...weeks].sort((a, b) => a.startDay.localeCompare(b.startDay));
    for (let i = 1; i < sorted.length; i++) expect(sorted[i].startDay > sorted[i - 1].endDay, sorted[i].id).toBe(true);
    for (const w of sorted) expect(weekLength(w)).toBeLessThanOrEqual(7);
  });
});

describe('finalizeAt', () => {
  it('is UTC midnight after the last day, plus the delay', () => {
    expect(finalizeAt('2026-09-27', 12)).toBe(Date.UTC(2026, 8, 28, 12));
    expect(finalizeAt('2026-09-27', 0)).toBe(Date.UTC(2026, 8, 28));
    expect(finalizeAt('2026-02-28', 48)).toBe(Date.UTC(2026, 2, 3));
    expect(finalizeAt('2026-12-31', 1)).toBe(Date.UTC(2027, 0, 1, 1));
    expect(finalizeAt('2026-09-27', -5)).toBe(Date.UTC(2026, 8, 28));
  });
});

describe('ranking', () => {
  const entry = (userId: string, xp: number, joinedAt: string | null = null, username = userId) => ({ userId, username, xp, joinedAt });

  it('ranks competition style: equal XP shares a rank', () => {
    const ranked = rankLeague([entry('a', 50), entry('b', 100), entry('c', 80, '2026-09-22T00:00:00Z'), entry('d', 80, '2026-09-21T00:00:00Z')]);
    expect(ranked.map((r) => [r.userId, r.rank])).toEqual([
      ['b', 1],
      ['d', 2],
      ['c', 2],
      ['a', 4]
    ]);
  });

  it('orders a tie by who joined first, then by username; an unknown join comes last', () => {
    const ranked = rankLeague([
      entry('u1', 30, null, 'amy'),
      entry('u2', 30, '2026-09-22T10:00:00Z', 'zed'),
      entry('u3', 30, '2026-09-22T10:00:00Z', 'bob'),
      entry('u4', 30, '2026-09-21T10:00:00Z', 'yan')
    ]);
    expect(ranked.map((r) => r.username)).toEqual(['yan', 'bob', 'zed', 'amy']);
    expect(ranked.every((r) => r.rank === 1)).toBe(true);
  });

  it('leaves the input alone', () => {
    const input = [entry('a', 1), entry('b', 2)];
    rankLeague(input);
    expect(input.map((e) => e.userId)).toEqual(['a', 'b']);
    expect(rankLeague([])).toEqual([]);
  });
});

describe('groups', () => {
  it('fills the newest group of a tier, then opens another', () => {
    let groups = {};
    const ids: string[] = [];
    for (const user of ['a', 'b', 'c', 'd', 'e']) {
      const placed = assignGroup(groups, 'bronze', user, 2);
      groups = placed.groups;
      ids.push(placed.groupId);
    }
    expect(ids).toEqual(['bronze-1', 'bronze-1', 'bronze-2', 'bronze-2', 'bronze-3']);
    expect(groups).toEqual({
      'bronze-1': { tierId: 'bronze', memberIds: ['a', 'b'] },
      'bronze-2': { tierId: 'bronze', memberIds: ['c', 'd'] },
      'bronze-3': { tierId: 'bronze', memberIds: ['e'] }
    });
  });

  it('keeps tiers apart, keeps a learner where they are, and never changes its input', () => {
    const start = { 'bronze-1': { tierId: 'bronze', memberIds: ['a'] } };
    const silver = assignGroup(start, 'silver', 'b', 30);
    expect(silver.groupId).toBe('silver-1');
    expect(start).toEqual({ 'bronze-1': { tierId: 'bronze', memberIds: ['a'] } });
    const again = assignGroup(silver.groups, 'silver', 'a', 30);
    expect(again.groupId).toBe('bronze-1');
    expect(again.groups['silver-1'].memberIds).toEqual(['b']);
  });

  it('falls back to the lowest tier for a tier that no longer exists', () => {
    const tiers = DEFAULT_LEAGUE_SETTINGS.tiers.list;
    expect(tierIndexOf(tiers, 'gold')).toBe(2);
    expect(tierIndexOf(tiers, 'mithril')).toBe(0);
    expect(tierIndexOf(tiers, null)).toBe(0);
  });
});

describe('promotion and demotion', () => {
  const rules = { ...tierRulesFrom(DEFAULT_LEAGUE_SETTINGS), promoteCount: 3, demoteCount: 2, minXpToPromote: 10 };
  const group = (xps: number[]) => xps.map((xp, i) => ({ userId: `u${i + 1}`, xp }));
  const outcomes = (xps: number[], tierIndex: number) => groupOutcomes(group(xps), tierIndex, rules).map((o) => o.outcome);

  it('moves the top up and the bottom down, in a middle tier', () => {
    const result = groupOutcomes(group([90, 80, 70, 60, 50, 40, 30]), 2, rules);
    expect(result.map((o) => o.outcome)).toEqual(['promoted', 'promoted', 'promoted', 'stayed', 'stayed', 'demoted', 'demoted']);
    expect(result.map((o) => o.toTierId)).toEqual(['platinum', 'platinum', 'platinum', 'gold', 'gold', 'silver', 'silver']);
  });

  it('never promotes out of the top tier or demotes out of the lowest', () => {
    expect(outcomes([90, 80, 70, 60, 50, 40, 30], 4)).toEqual(['stayed', 'stayed', 'stayed', 'stayed', 'stayed', 'demoted', 'demoted']);
    expect(outcomes([90, 80, 70, 60, 50, 40, 30], 0)).toEqual(['promoted', 'promoted', 'promoted', 'stayed', 'stayed', 'stayed', 'stayed']);
  });

  it('demotes nobody in a group no larger than up and down together', () => {
    expect(outcomes([90, 80, 70, 60, 50], 2)).toEqual(['promoted', 'promoted', 'promoted', 'stayed', 'stayed']);
    expect(outcomes([90, 80], 2)).toEqual(['promoted', 'promoted']);
    expect(groupZones(5, rules)).toEqual({ promote: 3, demote: 0 });
    expect(groupZones(6, rules)).toEqual({ promote: 3, demote: 2 });
  });

  it('promotes only with enough XP that week', () => {
    expect(outcomes([90, 9, 0, 0, 0, 0], 1)).toEqual(['promoted', 'stayed', 'stayed', 'stayed', 'demoted', 'demoted']);
    expect(zoneAt(0, 9, 6, 1, rules)).toBeNull();
    expect(zoneAt(0, 10, 6, 1, rules)).toBe('up');
    expect(zoneAt(5, 0, 6, 1, rules)).toBe('down');
  });

  it('snapshots the tier rules a week keeps', () => {
    expect(tierRulesFrom(DEFAULT_LEAGUE_SETTINGS)).toEqual({
      tiersEnabled: false,
      tiers: DEFAULT_LEAGUE_SETTINGS.tiers.list,
      groupSize: 30,
      promoteCount: 7,
      demoteCount: 5,
      minXpToPromote: 1
    });
  });
});

describe('weekly XP', () => {
  it('counts a solve only the first time ever, and an unchecked one only when allowed', () => {
    const on = { countUnverifiedSolves: true };
    const off = { countUnverifiedSolves: false };
    expect(solveLeagueXp({ firstEver: true, verified: true, awardedXp: 40 }, off)).toBe(40);
    expect(solveLeagueXp({ firstEver: false, verified: true, awardedXp: 40 }, on)).toBe(0);
    expect(solveLeagueXp({ firstEver: true, verified: false, awardedXp: 40 }, on)).toBe(40);
    expect(solveLeagueXp({ firstEver: true, verified: false, awardedXp: 40 }, off)).toBe(0);
    expect(solveLeagueXp({ firstEver: true, verified: true, awardedXp: -3 }, on)).toBe(0);
  });

  it('is the days summed, less the baseline - never negative', () => {
    expect(weeklyLeagueXp([40, 0, 60])).toBe(100);
    expect(weeklyLeagueXp([40, 60], 70)).toBe(30);
    expect(weeklyLeagueXp([40, 60], 500)).toBe(0);
    expect(weeklyLeagueXp([40, -20, Number.NaN], -5)).toBe(40);
  });
});

describe('league settings', () => {
  const check = (patch: object) => validateSettings(mergeSettings(DEFAULT_SETTINGS, patch)).issues.map((i) => i.path);

  it('ship with tiers off, and pass their own schema', () => {
    expect(DEFAULT_SETTINGS.league).toEqual(DEFAULT_LEAGUE_SETTINGS);
    expect(DEFAULT_SETTINGS.league).toMatchObject({ enabled: true, weekStartsOn: 1, finalizeDelayHours: 12, boardSize: 50, countMergedXp: false, countUnverifiedSolves: true, countReviewXp: true });
    expect(DEFAULT_SETTINGS.league.tiers.enabled).toBe(false);
    expect(DEFAULT_SETTINGS.retention.leagueWeeksKept).toBe(26);
    expect(DEFAULT_SETTINGS.reminders.leagueResult.enabled).toBe(true);
    expect(check({})).toEqual([]);
  });

  it('keeps moving up and down below the group size', () => {
    expect(check({ league: { tiers: { groupSize: 10, promoteCount: 5, demoteCount: 5 } } })).toEqual(['league.tiers.promoteCount']);
    expect(check({ league: { tiers: { groupSize: 11, promoteCount: 5, demoteCount: 5 } } })).toEqual([]);
  });

  it('wants distinct slug tier ids and 2-10 tiers', () => {
    const tiers = (list: object[]) => ({ league: { tiers: { list } } });
    expect(check(tiers([{ id: 'a', name: 'A' }, { id: 'a', name: 'B' }]))).toEqual(['league.tiers.list.1.id']);
    expect(check(tiers([{ id: 'Gold!', name: 'A' }, { id: 'b', name: 'B' }]))).toEqual(['league.tiers.list.0.id']);
    expect(check(tiers([{ id: 'a', name: 'A' }]))).toEqual(['league.tiers.list']);
    expect(check(tiers([{ id: 'a', name: 'A {rank}' }, { id: 'b', name: 'B' }]))).toEqual(['league.tiers.list.0.name']);
  });

  it('bounds the numbers and the start day', () => {
    expect(check({ league: { weekStartsOn: 2 } })).toEqual(['league.weekStartsOn']);
    expect(check({ league: { finalizeDelayHours: 49, boardSize: 5 } })).toEqual(['league.finalizeDelayHours', 'league.boardSize']);
    expect(check({ retention: { leagueWeeksKept: 3 } })).toEqual(['retention.leagueWeeksKept']);
  });

  it('keeps the result messages to their tokens', () => {
    expect(check({ reminders: { leagueResult: { single: 'You were #{rank} in {tier}' } } })).toEqual(['reminders.leagueResult.single']);
    expect(check({ reminders: { leagueResult: { promoted: 'Up to {tier}: #{rank}, {xp} XP' } } })).toEqual([]);
  });
});
