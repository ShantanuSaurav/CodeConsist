import { describe, expect, it } from 'vitest';
import type { Challenge, LanguageTrack, Stage, UserStats } from '@/types';
import { applyProgress, applyProgressByTrack, stagesForTrack, stageStatus } from '../stages';

const lesson = (id: string, stageId: string): Challenge =>
  ({ id, stageId, title: id, type: 'quiz', difficulty: 'easy', language: 'javascript', prompt: '?', explanation: '.', xpReward: 10 }) as Challenge;

const stage = (n: number, opts: Partial<Stage> = {}): Stage => ({
  id: `stage-${n}`,
  index: String(n).padStart(2, '0'),
  name: `Stage ${n}`,
  description: '',
  language: 'javascript',
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
  seenConcepts: [],
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

const track = (id: string, stageIds: string[]): LanguageTrack => ({
  id,
  label: id,
  icon: '',
  tagline: '',
  description: '',
  primaryLanguage: 'javascript',
  stageIds
});

describe('language tracks', () => {
  const c1 = stage(1, { id: 'stage-c1', challenges: [lesson('c1-a', 'stage-c1')], test: { ...lesson('c1-test', 'stage-c1'), isStageTest: true } });
  const bank = [stage(1), stage(2), c1];
  const tracks = [track('core', ['stage-1', 'stage-2']), track('c', ['stage-c1'])];

  it('each track has its own lock chain - the C stage never waits on the core path', () => {
    const states = applyProgressByTrack(bank, tracks, statsWith([])).map((s) => [s.id, s.state]);
    expect(states).toEqual([
      ['stage-1', 'In progress'],
      ['stage-2', 'Locked'],
      ['stage-c1', 'In progress']
    ]);
  });

  it('keeps the core path gated exactly as before: stage 2 opens only when stage 1 is cleared', () => {
    const before = applyProgressByTrack(bank, tracks, statsWith(['s1-a', 's1-b'])).find((s) => s.id === 'stage-2');
    const after = applyProgressByTrack(bank, tracks, statsWith(['s1-a', 's1-b', 's1-test'])).find((s) => s.id === 'stage-2');
    expect(before?.state).toBe('Locked');
    expect(after?.state).toBe('In progress');
  });

  it('returns the whole bank in bank order and never drops an untracked stage', () => {
    const orphan = stage(9, { id: 'stage-9' });
    const result = applyProgressByTrack([...bank, orphan], tracks, statsWith([]));
    expect(result.map((s) => s.id)).toEqual(['stage-1', 'stage-2', 'stage-c1', 'stage-9']);
    expect(result[3].state).toBe('In progress');
  });

  it('stagesForTrack follows the track order and skips ids the bank does not have', () => {
    const ordered = stagesForTrack(bank, track('x', ['stage-2', 'missing', 'stage-1']));
    expect(ordered.map((s) => s.id)).toEqual(['stage-2', 'stage-1']);
  });
});
