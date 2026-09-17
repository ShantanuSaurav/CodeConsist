import { describe, expect, it } from 'vitest';
import type { Challenge, Stage, UserStats } from '@/types';
import { applyProgress, stageStatus } from '../stages';

const lesson = (id: string, stageId: string): Challenge =>
  ({ id, stageId, title: id, type: 'quiz', difficulty: 'easy', language: 'javascript', prompt: '?', explanation: '.', xpReward: 10 }) as Challenge;

const stage = (n: number, opts: Partial<Stage> = {}): Stage => ({
  id: `stage-${n}`,
  index: String(n).padStart(2, '0'),
  name: `Stage ${n}`,
  description: '',
  state: 'Locked',
  challenges: [lesson(`s${n}-a`, `stage-${n}`), lesson(`s${n}-b`, `stage-${n}`)],
  test: { ...lesson(`s${n}-test`, `stage-${n}`), isStageTest: true },
  ...opts
});

const statsWith = (solved: string[], isPremium = false): UserStats => ({
  xp: 0,
  level: 1,
  streak: 0,
  bestStreak: 0,
  lastActiveDay: null,
  completedChallenges: solved,
  completedStages: [],
  attempts: {},
  isPremium
});

describe('stage unlocking', () => {
  it('opens the first stage and locks the rest', () => {
    const states = applyProgress([stage(1), stage(2), stage(3)], statsWith([])).map((s) => s.state);
    expect(states).toEqual(['In progress', 'Locked', 'Locked']);
  });

  it('lessons done but test not passed = Test pending, and the next stage stays locked', () => {
    const states = applyProgress([stage(1), stage(2)], statsWith(['s1-a', 's1-b'])).map((s) => s.state);
    expect(states).toEqual(['Test pending', 'Locked']);
  });

  it('the test opens the next stage', () => {
    const states = applyProgress([stage(1), stage(2)], statsWith(['s1-a', 's1-b', 's1-test'])).map((s) => s.state);
    expect(states).toEqual(['Completed', 'In progress']);
  });

  it('a premium stage stays locked for free accounts but does not dam the stages after it', () => {
    const states = applyProgress(
      [stage(1), stage(2, { isPremium: true }), stage(3)],
      statsWith(['s1-a', 's1-b', 's1-test'])
    ).map((s) => s.state);
    expect(states).toEqual(['Completed', 'Locked', 'In progress']);
  });

  it('stageStatus reports lessons, test and unlock state', () => {
    const s = stageStatus(stage(1), statsWith(['s1-a']));
    expect(s).toMatchObject({ done: 1, total: 2, percent: 50, lessonsDone: false, hasTest: true, testPassed: false, testUnlocked: false });
    expect(stageStatus(stage(1), statsWith(['s1-a', 's1-b'])).testUnlocked).toBe(true);
  });
});
