import { describe, expect, it } from 'vitest';
import type { Challenge, LanguageTrack, Stage, UserStats } from '@/types';
import {
  applyProgress,
  applyProgressByTrack,
  groupIntoStages,
  isPremiumLocked,
  normalizeTestedOut,
  stagesForTrack,
  stageStatus,
  testOutRecordOf
} from '../stages';

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

const statsWith = (solved: string[], isPremium = false, unlockedStages: string[] = []): UserStats => ({
  xp: 0,
  level: 1,
  streak: 0,
  bestStreak: 0,
  lastActiveDay: null,
  completedChallenges: solved,
  completedStages: [],
  seenConcepts: [],
  attempts: {},
  isPremium,
  unlockedStages
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

  it('a premium stage bought on its own opens while another premium stage stays locked', () => {
    const bank = [stage(1), stage(2, { isPremium: true }), stage(3, { isPremium: true })];
    const cleared = ['s1-a', 's1-b', 's1-test'];
    const states = applyProgress(bank, statsWith(cleared, false, ['stage-2'])).map((s) => s.state);
    // Stage 2 is open (In progress), stage 3 is still behind the paywall.
    expect(states).toEqual(['Completed', 'In progress', 'Locked']);
    expect(isPremiumLocked(bank[1], statsWith([], false, ['stage-2']))).toBe(false);
    expect(isPremiumLocked(bank[2], statsWith([], false, ['stage-2']))).toBe(true);
  });

  it('a lifetime licence opens every premium stage', () => {
    const bank = [stage(1), stage(2, { isPremium: true }), stage(3, { isPremium: true })];
    const lifetime = statsWith(['s1-a', 's1-b', 's1-test'], true);
    expect(isPremiumLocked(bank[1], lifetime)).toBe(false);
    expect(isPremiumLocked(bank[2], lifetime)).toBe(false);
    // Stage 3 still waits on stage 2's test - a licence buys access, not progress.
    expect(applyProgress(bank, lifetime).map((s) => s.state)).toEqual(['Completed', 'In progress', 'Locked']);
  });

  it('isPremiumLocked never locks a free stage and tolerates a missing unlockedStages list', () => {
    expect(isPremiumLocked(stage(1), { isPremium: false })).toBe(false);
    expect(isPremiumLocked(stage(2, { isPremium: true }), { isPremium: false })).toBe(true);
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

/* ------------------------------------------- test-out and evidence (Phase 5) */

const record = (clears: boolean, via: 'test-out' | 'placement' = 'test-out') => ({ at: '2026-09-28T10:00:00.000Z', via, clears, assessmentId: 'as_1' });

const withTestedOut = (solved: string[], testedOut: UserStats['testedOut'], extra: Partial<UserStats> = {}): UserStats => ({
  ...statsWith(solved),
  testedOut,
  ...extra
});

describe('stage unlocking with test-outs and evidence', () => {
  const bank = () => [stage(1), stage(2), stage(3), stage(4)];

  it('every existing fixture comes out the same with an empty testedOut map as with none', () => {
    const fixtures: string[][] = [
      [],
      ['s1-a'],
      ['s1-a', 's1-b'],
      ['s1-a', 's1-b', 's1-test'],
      ['s1-a', 's1-b', 's1-test', 's2-a', 's2-b'],
      ['s1-a', 's1-b', 's1-test', 's2-a', 's2-b', 's2-test', 's3-a']
    ];
    for (const solved of fixtures) {
      const without = applyProgress(bank(), statsWith(solved));
      const empty = applyProgress(bank(), withTestedOut(solved, {}));
      expect(empty).toEqual(without);
      // No stage is marked tested out without a record.
      expect(without.some((s) => 'testedOut' in s)).toBe(false);
    }
  });

  it('a record that clears opens the next stage and marks the stage', () => {
    const result = applyProgress(bank(), withTestedOut(['s1-test'], { 'stage-1': record(true) }));
    expect(result.map((s) => s.state)).toEqual(['Completed', 'In progress', 'Locked', 'Locked']);
    expect(result[0].testedOut).toBe(true);
    expect(result[1].testedOut).toBeUndefined();
  });

  it('a record that does not clear opens its own stage, but the next one waits for the lessons', () => {
    const result = applyProgress(bank(), withTestedOut(['s1-test'], { 'stage-1': record(false) }));
    expect(result.map((s) => s.state)).toEqual(['In progress', 'Locked', 'Locked', 'Locked']);
    const done = applyProgress(bank(), withTestedOut(['s1-test', 's1-a', 's1-b'], { 'stage-1': record(false) }));
    expect(done.map((s) => s.state)).toEqual(['Completed', 'In progress', 'Locked', 'Locked']);
  });

  it('a clearing record whose test is not solved does not clear the stage', () => {
    const result = applyProgress(bank(), withTestedOut([], { 'stage-2': record(true) }));
    // Stage 2 is open (it has a record), and stage 1 before it; nothing is cleared.
    expect(result.map((s) => s.state)).toEqual(['In progress', 'In progress', 'Locked', 'Locked']);
  });

  it('skipping ahead opens every stage before the tested-out one', () => {
    const result = applyProgress(bank(), withTestedOut(['s3-test'], { 'stage-3': record(true, 'placement') }));
    expect(result.map((s) => s.state)).toEqual(['In progress', 'In progress', 'Completed', 'In progress']);
  });

  it('premium still wins: nothing opens a premium stage the learner has not unlocked', () => {
    const premiumBank = [stage(1), stage(2, { isPremium: true }), stage(3), stage(4)];
    const skip = withTestedOut(['s3-test'], { 'stage-3': record(true) });
    expect(applyProgress(premiumBank, skip).map((s) => s.state)).toEqual(['In progress', 'Locked', 'Completed', 'In progress']);
    // Evidence does not open it either.
    const evidence = withTestedOut(['s1-a', 's1-b', 's1-test', 's2-a'], {});
    expect(applyProgress(premiumBank, evidence)[1].state).toBe('Locked');
    // Nor a record on the premium stage itself ...
    const onPremium = withTestedOut([], { 'stage-2': record(false) });
    expect(applyProgress(premiumBank, onPremium)[1].state).toBe('Locked');
    // ... until it is unlocked: then the ordinary rules apply.
    expect(applyProgress(premiumBank, { ...onPremium, unlockedStages: ['stage-2'] })[1].state).toBe('In progress');
  });

  it('evidence is sticky: a lesson added to the stage before does not lock a stage already worked in', () => {
    const solved = ['s1-a', 's1-b', 's1-test', 's2-a'];
    expect(applyProgress(bank(), statsWith(solved)).map((s) => s.state)).toEqual(['Completed', 'In progress', 'Locked', 'Locked']);
    // An admin adds a lesson to stage 1: it is no longer cleared ...
    const grown = [stage(1, { challenges: [lesson('s1-a', 'stage-1'), lesson('s1-b', 'stage-1'), lesson('s1-c', 'stage-1')] }), stage(2), stage(3), stage(4)];
    // ... but stage 2, where the learner already solved something, stays open. Stage 3 stays locked.
    expect(applyProgress(grown, statsWith(solved)).map((s) => s.state)).toEqual(['In progress', 'In progress', 'Locked', 'Locked']);
  });

  it('a solved stage test is evidence too, and evidence does not open the stage after it', () => {
    const states = applyProgress(bank(), statsWith(['s3-test'])).map((s) => s.state);
    expect(states).toEqual(['In progress', 'Locked', 'In progress', 'Locked']);
  });

  it('each track chain honours its own test-outs', () => {
    const tracks = [track('core', ['stage-1', 'stage-2', 'stage-3']), track('c', ['stage-4'])];
    const result = applyProgressByTrack(bank(), tracks, withTestedOut(['s2-test'], { 'stage-2': record(true) }));
    expect(result.map((s) => [s.id, s.state])).toEqual([
      ['stage-1', 'In progress'],
      ['stage-2', 'Completed'],
      ['stage-3', 'In progress'],
      ['stage-4', 'In progress']
    ]);
  });

  it('ignores records that are not own properties or not objects', () => {
    const odd = JSON.parse('{"__proto__": {"clears": true}}') as UserStats['testedOut'];
    expect(applyProgress(bank(), withTestedOut([], odd)).map((s) => s.state)).toEqual(['In progress', 'Locked', 'Locked', 'Locked']);
    expect(testOutRecordOf({ testedOut: { 'stage-1': null as never } }, 'stage-1')).toBeNull();
    expect(testOutRecordOf({}, 'stage-1')).toBeNull();
  });
});

describe('normalizeTestedOut', () => {
  it('keeps well-formed records and drops the rest', () => {
    const raw = JSON.parse(
      '{"stage-1": {"at": "x", "via": "placement", "clears": true, "assessmentId": "as_1"}, "stage-2": {"clears": "yes"}, "stage-3": 4, "__proto__": {"clears": true}}'
    );
    const out = normalizeTestedOut(raw);
    expect(Object.keys(out)).toEqual(['stage-1', 'stage-2']);
    expect(out['stage-1']).toEqual({ at: 'x', via: 'placement', clears: true, assessmentId: 'as_1' });
    expect(out['stage-2']).toEqual({ at: '', via: 'test-out', clears: false, assessmentId: '' });
    expect(normalizeTestedOut(null)).toEqual({});
    expect(normalizeTestedOut([1])).toEqual({});
  });
});

describe('groupIntoStages (moved here from session/content.ts)', () => {
  it('groups a flat bank under its stages, splitting out each test', () => {
    const meta = [
      { id: 'stage-1', index: '01', name: 'One', description: '', language: 'javascript' as const },
      { id: 'stage-2', index: '02', name: 'Two', description: '', language: 'javascript' as const }
    ];
    const flat = [lesson('a', 'stage-1'), { ...lesson('t1', 'stage-1'), isStageTest: true }, lesson('b', 'stage-2'), lesson('c', 'stage-1')];
    const grouped = groupIntoStages(meta, flat);
    expect(grouped.map((s) => [s.id, s.state, s.challenges.map((c) => c.id), s.test?.id ?? null])).toEqual([
      ['stage-1', 'Locked', ['a', 'c'], 't1'],
      ['stage-2', 'Locked', ['b'], null]
    ]);
  });
});
