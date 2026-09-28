import { describe, expect, it } from 'vitest';
import { DEFAULT_BADGES, achievements, activityGrid, badgeProgress, nextBadge, solvedOn } from '../insights';
import { dayKey } from '../leveling';
import { activityGridFromLog, applyActivityEvent, backfillFromAttempts, emptyActivityLog, withBackfill } from '../../activity/log';
import type { Stage, UserStats } from '@/types';

describe('re-solving an old challenge', () => {
  // Solved first eight days ago, re-solved today. `solvedAt` keeps the first
  // solve now; it used to be overwritten, which moved the old lesson onto
  // today in the heatmap and "solved today".
  const today = new Date();
  const eightDaysAgo = new Date(today.getTime() - 8 * 86_400_000);
  const stats: UserStats = {
    xp: 40,
    level: 1,
    streak: 1,
    bestStreak: 1,
    lastActiveDay: dayKey(today),
    completedChallenges: ['c1'],
    completedStages: [],
    seenConcepts: [],
    attempts: {
      c1: { challengeId: 'c1', score: 100, attempts: 2, hintsUsed: 0, solvedAt: eightDaysAgo.toISOString(), lastSolvedAt: today.toISOString(), solves: 2 }
    }
  };

  it('does not move its heatmap day', () => {
    const cells = activityGrid(stats, 14).flat();
    expect(cells.find((c) => c.day === dayKey(eightDaysAgo))?.count).toBe(1);
    expect(cells.find((c) => c.day === dayKey(today))?.count).toBe(0);
    expect(solvedOn(stats)).toEqual([]);
  });

  it('keeps the first day in the log-built heatmap too, and counts today as a re-solve', () => {
    let log = withBackfill(emptyActivityLog(), backfillFromAttempts(stats.attempts, () => ({ xpReward: 40 }), null), today.toISOString());
    log = applyActivityEvent(
      log,
      { type: 'solve', challengeId: 'c1', isTest: false, firstSolve: false, awardedXp: 0 },
      { day: dayKey(today), at: today.toISOString() }
    );
    const cells = activityGridFromLog(log.days, 14, dayKey(today)).flat();
    // Backfilled XP is re-derived from the recorded tries: 2 tries of a 40 XP lesson.
    expect(cells.find((c) => c.day === dayKey(eightDaysAgo))).toMatchObject({ count: 1, xp: 36 });
    expect(cells.find((c) => c.day === dayKey(today))).toMatchObject({ count: 1, xp: 0 });
  });
});

const stats: UserStats = {
  xp: 0,
  level: 1,
  streak: 0,
  bestStreak: 0,
  lastActiveDay: null,
  completedChallenges: [],
  completedStages: [],
  seenConcepts: [],
  attempts: {}
};

function stage(id: string, index: string, name: string): Stage {
  return { id, index, name, state: 'Locked', description: '', language: 'javascript', challenges: [] };
}

describe('stage badges', () => {
  it('numbers a core stage and names a track stage', () => {
    const badges = achievements(stats, [stage('stage-3', '03', 'Data Structures'), stage('stage-c1', '01', 'C Fundamentals')]);

    // The regex used to be /^stage-d+$/ (a literal "d"), so every core stage
    // fell through to its name.
    expect(badges.find((b) => b.id === 'stage-stage-3')?.title).toBe('Stage 03 cleared');
    // Every track starts again at 01, so "Stage 01 cleared" would be ambiguous.
    expect(badges.find((b) => b.id === 'stage-stage-c1')?.title).toBe('C Fundamentals cleared');
  });

  it('keeps the badge ids, so badges already seen stay seen', () => {
    const ids = achievements(stats, [stage('stage-10', '10', 'Capstone')]).map((b) => b.id);
    expect(ids).toContain('stage-stage-10');
    expect(ids).toContain('first-solve');
    expect(ids).toContain('solved-10');
    expect(ids).toContain('streak-3');
  });
});

/* ------------------------------------------------------ badge tiers (P2) */

describe('badge tiers and progress', () => {
  const unitOf = (id: string, ids: string[]) =>
    ({ id, name: id, challengeIds: ids, stageId: 'stage-3', index: 0, challenges: [], estMinutes: 1, xp: 1, source: 'default' }) as NonNullable<Stage['units']>[number];
  const solvedAt = (i: number) => `2026-09-1${i}T10:00:00.000Z`;

  it('gives Bronze at a best streak of 5, with 5 of 7 to Silver', () => {
    const learner: UserStats = { ...stats, bestStreak: 5, streak: 5, lastActiveDay: '2026-09-20' };
    const streak = badgeProgress(learner, []).find((f) => f.family.id === 'streak')!;
    expect(streak.current).toMatchObject({ n: 3, tierName: 'Bronze' });
    expect(streak.next).toMatchObject({ n: 7, tierName: 'Silver', title: '7-day streak' });
    expect(streak.value).toBe(5);
    expect(streak.percent).toBe(50);
    expect(achievements(learner, []).find((b) => b.id === 'streak-3')).toMatchObject({ tier: 0, tierName: 'Bronze', family: 'streak' });
  });

  it('counts perfect units as the union of the records and the units perfect by their attempts', () => {
    const grouped = { ...stage('stage-3', '03', 'Data Structures'), units: [unitOf('u1', ['a', 'b']), unitOf('u2', ['c', 'd'])] };
    const learner: UserStats = {
      ...stats,
      completedChallenges: ['a', 'b', 'c', 'd'],
      attempts: {
        // u1: perfect by its attempts. u2: replayed (2 tries on c) but recorded perfect.
        a: { challengeId: 'a', score: 100, attempts: 1, hintsUsed: 0, solvedAt: solvedAt(1) },
        b: { challengeId: 'b', score: 100, attempts: 1, hintsUsed: 0, solvedAt: solvedAt(2) },
        c: { challengeId: 'c', score: 100, attempts: 2, hintsUsed: 0, solvedAt: solvedAt(3) },
        d: { challengeId: 'd', score: 100, attempts: 1, hintsUsed: 0, solvedAt: solvedAt(4) }
      },
      unitsCompleted: { u2: { completedAt: solvedAt(4), perfect: true, bonusXp: 25 } }
    };
    const families = badgeProgress(learner, [grouped]);
    expect(families.find((f) => f.family.metric === 'perfectUnits')!.value).toBe(2);
    expect(families.find((f) => f.family.metric === 'unitsCompleted')!.value).toBe(2);
    expect(achievements(learner, [grouped]).find((b) => b.id === 'units-1')?.earnedAt).toBe(solvedAt(2));
  });

  it('leaves a disabled family out, and uses the configured tier names and stage titles', () => {
    const badges = {
      ...DEFAULT_BADGES,
      tierNames: ['Wood', 'Stone'],
      families: DEFAULT_BADGES.families.map((f) => (f.id === 'xp' ? { ...f, enabled: false } : f)),
      stageBadges: { enabled: true, coreTitle: 'Cleared stage {index}', trackTitle: 'Cleared {name}' }
    };
    const list = achievements(stats, [stage('stage-3', '03', 'Data Structures')], badges);
    expect(list.some((b) => b.family === 'xp')).toBe(false);
    expect(list.find((b) => b.id === 'streak-7')?.tierName).toBe('Stone');
    // Past the list, the last name repeats.
    expect(list.find((b) => b.id === 'streak-100')?.tierName).toBe('Stone');
    expect(list.find((b) => b.id === 'stage-stage-3')?.title).toBe('Cleared stage 03');
    expect(achievements(stats, [stage('stage-3', '03', 'X')], { ...badges, stageBadges: { ...badges.stageBadges, enabled: false } }).some((b) => b.kind === 'stage')).toBe(false);
  });

  it('writes a tier with thousands separators, keeping the plain id', () => {
    const xp = achievements(stats, []).find((b) => b.id === 'xp-1000');
    expect(xp?.title).toBe('1,000 XP');
    expect(xp?.detail).toBe('Earn 1,000 XP in total');
  });

  it('picks the family closest to its next tier for "Next badge"', () => {
    const learner: UserStats = { ...stats, bestStreak: 6, streak: 6, lastActiveDay: '2026-09-20' };
    expect(nextBadge(badgeProgress(learner, []))?.family.id).toBe('streak');
  });
});
