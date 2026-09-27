import { describe, expect, it } from 'vitest';
import {
  DEFAULT_LEVEL_CURVE,
  DEFAULT_XP_RULES,
  FORMULA_LEVEL_CURVE,
  PASS_SCORE,
  currentStreak,
  dayKey,
  formulaThresholds,
  isPassingSolve,
  levelFromXp,
  levelProgress,
  nextStreak,
  previousDayKey,
  rawScore,
  scoreSolve,
  xpForLevel,
  xpForSolve
} from '../leveling';
import type { LevelCurve, XpRules } from '../leveling';
import { DEFAULT_RANKS, achievements, activityGrid, dayTotals, nextRankLevel, rankTitle, solvedOn } from '../insights';
import type { Stage, UserStats } from '@/types';

describe('level curve', () => {
  it('costs 100 more XP per level', () => {
    expect([1, 2, 3, 4, 5].map((level) => xpForLevel(level))).toEqual([0, 100, 300, 600, 1000]);
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

describe('pass mark', () => {
  it('measures the raw score, without the half-credit floor', () => {
    expect(rawScore(1, 0)).toBe(100);
    expect(rawScore(5, 0)).toBe(60);
    expect(rawScore(6, 0)).toBe(50);
    expect(rawScore(3, 3)).toBe(50);
    expect(rawScore(20, 0)).toBe(0);
  });

  it('passes at or above PASS_SCORE and fails below it', () => {
    expect(PASS_SCORE).toBe(60);
    expect(isPassingSolve(1, 0)).toBe(true);
    expect(isPassingSolve(5, 0)).toBe(true); // 60: exactly the mark
    expect(isPassingSolve(3, 2)).toBe(true); // 60
    expect(isPassingSolve(6, 0)).toBe(false); // 50
    expect(isPassingSolve(2, 4)).toBe(false); // 50
  });
});

/* ------------------------------------------------ parameterized, same answers */

/** The formulas exactly as they were before the settings store existed. */
const OLD = {
  xpForLevel: (level: number) => (level <= 1 ? 0 : 50 * (level - 1) * level),
  levelFromXp(xp: number) {
    let level = 1;
    while (OLD.xpForLevel(level + 1) <= xp) level++;
    return level;
  },
  scoreSolve: (a: number, h: number) => Math.max(50, 100 - (Math.max(0, a - 1) * 10 + h * 10)),
  rawScore: (a: number, h: number) => Math.max(0, 100 - (Math.max(0, a - 1) * 10 + h * 10)),
  xpForSolve: (reward: number, a: number, h: number) => Math.max(1, Math.round((reward * OLD.scoreSolve(a, h)) / 100)),
  rankTitle(level: number) {
    if (level >= 20) return 'Principal Engineer';
    if (level >= 15) return 'Staff Engineer';
    if (level >= 10) return 'Senior Developer';
    if (level >= 6) return 'Developer';
    if (level >= 3) return 'Junior Developer';
    return 'Apprentice';
  },
  nextRankLevel(level: number) {
    for (const threshold of [3, 6, 10, 15, 20]) if (level < threshold) return threshold;
    return null;
  }
};

describe('the formula curve and the default rules reproduce the old constants exactly', () => {
  it('gives the old level for every XP total from 0 to 82,000', () => {
    for (let xp = 0; xp <= 82_000; xp++) {
      const level = levelFromXp(xp, FORMULA_LEVEL_CURVE);
      if (level !== OLD.levelFromXp(xp)) throw new Error(`level differs at ${xp} XP: ${level} vs ${OLD.levelFromXp(xp)}`);
    }
    for (let level = 1; level <= 41; level++) expect(xpForLevel(level, FORMULA_LEVEL_CURVE)).toBe(OLD.xpForLevel(level));
  });

  it('gives the old progress within a level', () => {
    for (const xp of [0, 50, 99, 100, 150, 5_432, 44_999, 77_999, 78_000, 80_000]) {
      const level = OLD.levelFromXp(xp);
      const floor = OLD.xpForLevel(level);
      const needed = OLD.xpForLevel(level + 1) - floor;
      expect(levelProgress(xp, FORMULA_LEVEL_CURVE)).toEqual({
        level,
        into: xp - floor,
        needed,
        percent: Math.min(100, Math.round(((xp - floor) / needed) * 100))
      });
    }
  });

  it('scores and pays exactly as before', () => {
    for (let a = 1; a <= 12; a++) {
      for (let h = 0; h <= 10; h++) {
        expect(scoreSolve(a, h)).toBe(OLD.scoreSolve(a, h));
        expect(rawScore(a, h)).toBe(OLD.rawScore(a, h));
        expect(isPassingSolve(a, h)).toBe(OLD.rawScore(a, h) >= 60);
        for (const reward of [0, 10, 40, 75, 150]) expect(xpForSolve(reward, a, h)).toBe(OLD.xpForSolve(reward, a, h));
      }
    }
  });

  it('names ranks exactly as before', () => {
    for (let level = 1; level <= 40; level++) {
      expect(rankTitle(level)).toBe(OLD.rankTitle(level));
      expect(nextRankLevel(level)).toBe(OLD.nextRankLevel(level));
    }
  });

  it('keeps the curve and rules as data', () => {
    expect(DEFAULT_XP_RULES).toEqual({ retryPenalty: 10, hintPenalty: 10, scoreFloor: 50, passScore: 60, minXpPerSolve: 1 });
    expect(FORMULA_LEVEL_CURVE.thresholds).toHaveLength(40);
    expect(FORMULA_LEVEL_CURVE.overflowStep).toBe(4000);
    expect(DEFAULT_RANKS.map((r) => r.minLevel)).toEqual([1, 3, 6, 10, 15, 20]);
  });
});

describe('the retuned default curve (Phase 2)', () => {
  it('is levels 1-10 as before, then 900 XP per level to 13,500 at level 20, then 900 per level', () => {
    expect(DEFAULT_LEVEL_CURVE.thresholds).toEqual([0, 100, 300, 600, 1000, 1500, 2100, 2800, 3600, 4500, 5400, 6300, 7200, 8100, 9000, 9900, 10800, 11700, 12600, 13500]);
    expect(DEFAULT_LEVEL_CURVE.overflowStep).toBe(900);
    for (let level = 1; level <= 10; level++) expect(xpForLevel(level)).toBe(OLD.xpForLevel(level));
    expect(xpForLevel(20)).toBe(13_500);
    expect(xpForLevel(21)).toBe(14_400);
    expect(levelFromXp(13_499)).toBe(19);
    expect(levelFromXp(13_500)).toBe(20);
  });

  it('never puts anyone at a lower level than the formula did (0 - 100,000 XP, every 50)', () => {
    for (let xp = 0; xp <= 100_000; xp += 50) {
      const retuned = levelFromXp(xp, DEFAULT_LEVEL_CURVE);
      const formula = levelFromXp(xp, FORMULA_LEVEL_CURVE);
      if (retuned < formula) throw new Error(`at ${xp} XP the retuned curve gives level ${retuned}, the formula ${formula}`);
    }
    // And no level costs more than it used to.
    for (let level = 1; level <= 60; level++) expect(xpForLevel(level, DEFAULT_LEVEL_CURVE)).toBeLessThanOrEqual(xpForLevel(level, FORMULA_LEVEL_CURVE));
  });
});

describe('custom rules', () => {
  const strict: XpRules = { retryPenalty: 20, hintPenalty: 25, scoreFloor: 30, passScore: 70, minXpPerSolve: 5 };

  it('scores with the given penalties, floor and pass mark', () => {
    expect(rawScore(2, 1, strict)).toBe(55);
    expect(scoreSolve(2, 1, strict)).toBe(55);
    expect(scoreSolve(5, 5, strict)).toBe(30);
    expect(isPassingSolve(2, 0, strict)).toBe(true); // 80
    expect(isPassingSolve(2, 1, strict)).toBe(false); // 55
    expect(xpForSolve(100, 2, 0, strict)).toBe(80);
    expect(xpForSolve(0, 1, 0, strict)).toBe(5);
  });

  it('caps the score when asked to', () => {
    expect(scoreSolve(1, 0, DEFAULT_XP_RULES, 60)).toBe(60);
    expect(xpForSolve(100, 1, 0, DEFAULT_XP_RULES, 60)).toBe(60);
  });

  it('follows a threshold table, then the overflow step', () => {
    const curve: LevelCurve = { thresholds: [0, 100, 300, 600], overflowStep: 500 };
    expect(levelFromXp(0, curve)).toBe(1);
    expect(levelFromXp(299, curve)).toBe(2);
    expect(levelFromXp(600, curve)).toBe(4);
    expect(levelFromXp(1099, curve)).toBe(4);
    expect(levelFromXp(1100, curve)).toBe(5);
    expect(levelFromXp(2600, curve)).toBe(8);
    expect(xpForLevel(5, curve)).toBe(1100);
    expect(levelProgress(850, curve)).toEqual({ level: 4, into: 250, needed: 500, percent: 50 });
  });

  it('uses custom rank titles', () => {
    const ranks = [
      { minLevel: 1, title: 'Seedling' },
      { minLevel: 5, title: 'Sprout' }
    ];
    expect(rankTitle(4, ranks)).toBe('Seedling');
    expect(rankTitle(5, ranks)).toBe('Sprout');
    expect(nextRankLevel(4, ranks)).toBe(5);
    expect(nextRankLevel(5, ranks)).toBeNull();
  });
});

describe('formulaThresholds', () => {
  it('is the old formula as a table', () => {
    expect(formulaThresholds(50, 6)).toEqual([0, 100, 300, 600, 1000, 1500]);
    expect(formulaThresholds(10, 3)).toEqual([0, 20, 60]);
    expect(formulaThresholds(50, 40)[39]).toBe(78_000);
  });
});

describe('dayTotals', () => {
  it("reads one day's counters from the activity log, zeros when absent", () => {
    const log = { days: { '2026-09-25': { xp: 120, lessons: 2, tests: 1, reSolves: 3, mistakes: 4 } } } as any;
    expect(dayTotals(log, '2026-09-25')).toEqual({ xp: 120, lessons: 2, tests: 1, reSolves: 3, mistakes: 4, solves: 6 });
    expect(dayTotals(log, '2026-09-24')).toEqual({ xp: 0, lessons: 0, tests: 0, reSolves: 0, mistakes: 0, solves: 0 });
    expect(dayTotals(null, '2026-09-24').xp).toBe(0);
  });
});
