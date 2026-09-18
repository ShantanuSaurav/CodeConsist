import { describe, expect, it } from 'vitest';
import { currentStreak, dayKey, levelFromXp, levelProgress, nextStreak, previousDayKey, scoreSolve, xpForLevel, xpForSolve } from '../leveling';
import { achievements, activityGrid, rankTitle, solvedOn } from '../insights';
import type { Stage, UserStats } from '@/types';

describe('level curve', () => {
  it('costs 100 more XP per level', () => {
    expect([1, 2, 3, 4, 5].map(xpForLevel)).toEqual([0, 100, 300, 600, 1000]);
    expect(levelFromXp(0)).toBe(1);
    expect(levelFromXp(99)).toBe(1);
    expect(levelFromXp(100)).toBe(2);
    expect(levelFromXp(1000)).toBe(5);
  });

  it('reports progress within the level', () => {
    expect(levelProgress(150)).toEqual({ level: 2, into: 50, needed: 200, percent: 25 });
  });
});

describe('streaks', () => {
  it('extends on consecutive days, keeps on the same day, resets after a gap', () => {
    const today = '2026-09-17';
    expect(nextStreak(3, previousDayKey(today), today)).toBe(4);
    expect(nextStreak(3, today, today)).toBe(3);
    expect(nextStreak(3, '2026-09-01', today)).toBe(1);
    expect(nextStreak(0, null, today)).toBe(1);
  });

  it('currentStreak drops to zero once a day is missed', () => {
    const today = '2026-09-17';
    expect(currentStreak(5, previousDayKey(today), today)).toBe(5);
    expect(currentStreak(5, '2026-09-10', today)).toBe(0);
  });

  it('dayKey is local yyyy-mm-dd', () => {
    expect(dayKey(new Date(2026, 0, 5))).toBe('2026-01-05');
  });
});

describe('scoring', () => {
  it('penalises retries and hints but never below half credit', () => {
    expect(scoreSolve(1, 0)).toBe(100);
    expect(scoreSolve(2, 1)).toBe(80);
    expect(scoreSolve(9, 9)).toBe(50);
    expect(xpForSolve(40, 1, 0)).toBe(40);
    expect(xpForSolve(40, 3, 0)).toBe(32);
  });
});

describe('insights', () => {
  const stats: UserStats = {
    xp: 40,
    level: 1,
    streak: 1,
    bestStreak: 1,
    lastActiveDay: dayKey(),
    completedChallenges: ['c1'],
    completedStages: [],
        seenConcepts: [],
    attempts: { c1: { challengeId: 'c1', score: 100, attempts: 1, hintsUsed: 0, solvedAt: new Date().toISOString() } }
  };

  it('counts today and lays out a 14-week grid ending today', () => {
    expect(solvedOn(stats)).toEqual(['c1']);
    const grid = activityGrid(stats, 14);
    expect(grid).toHaveLength(14);
    expect(grid.every((col) => col.length === 7)).toBe(true);
    const todayCell = grid.flat().find((c) => c.day === dayKey());
    expect(todayCell?.count).toBe(1);
  });

  it('marks the first solve earned and later milestones pending', () => {
    const badges = achievements(stats, [] as Stage[]);
    expect(badges.find((b) => b.id === 'first-solve')?.earnedAt).toBeTruthy();
    expect(badges.find((b) => b.id === 'solved-10')?.earnedAt).toBeNull();
    expect(badges[0].id).toBe('first-solve');
  });

  it('names ranks by level band', () => {
    expect(rankTitle(1)).toBe('Apprentice');
    expect(rankTitle(10)).toBe('Senior Developer');
  });
});
