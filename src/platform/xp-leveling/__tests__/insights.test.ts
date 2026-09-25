import { describe, expect, it } from 'vitest';
import { achievements, activityGrid, solvedOn } from '../insights';
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
