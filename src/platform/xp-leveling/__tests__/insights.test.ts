import { describe, expect, it } from 'vitest';
import { achievements } from '../insights';
import type { Stage, UserStats } from '@/types';

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
