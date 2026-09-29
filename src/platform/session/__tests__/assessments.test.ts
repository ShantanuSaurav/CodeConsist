import { describe, expect, it } from 'vitest';
import type { Challenge, Stage, UserStats } from '@/types';
import { DEFAULT_SETTINGS } from '../../settings/defaults';
import { applyProgress } from '../../progress/stages';
import { normalizeAssessmentLog } from '../../progress/access';
import { DEFAULT_LEVEL_CURVE, xpForTestOut } from '../../xp-leveling/leveling';
import { INITIAL_STATS } from '../stats';
import {
  LOCAL_ASSESSMENT_PREFIX,
  assessmentBlockText,
  describeRetry,
  finishLocalAssessment,
  localPlacementStatus,
  localTestOutStatus,
  recordLocalResult,
  startLocalAssessment,
  viewOf,
  withLocalPass,
  withRecord
} from '../assessments';
import type { TrackChain } from '../assessments';

/* ------------------------------------------------------------ fixtures */

const lesson = (id: string, stageId: string): Challenge =>
  ({ id, stageId, title: id, type: 'quiz', difficulty: 'easy', language: 'javascript', prompt: '?', explanation: '.', xpReward: 10 }) as Challenge;

const stage = (n: number): Stage => ({
  id: `stage-${n}`,
  index: String(n).padStart(2, '0'),
  name: `Stage ${n}`,
  description: '',
  language: 'javascript',
  state: 'Locked',
  challenges: [lesson(`s${n}-a`, `stage-${n}`), lesson(`s${n}-b`, `stage-${n}`)],
  test: { ...lesson(`s${n}-test`, `stage-${n}`), isStageTest: true, xpReward: 150 }
});

const BANK = [stage(1), stage(2), stage(3), stage(4)];
const chainsFor = (s: UserStats): TrackChain[] => [{ trackId: 'core', stages: applyProgress(BANK, s) }];

const NOW = new Date('2026-09-28T12:00:00.000Z');
const later = (minutes: number) => new Date(NOW.getTime() + minutes * 60_000);
const SETTINGS = { testOut: DEFAULT_SETTINGS.testOut, placement: DEFAULT_SETTINGS.placement, xp: DEFAULT_SETTINGS.xp };
const EMPTY_LOG = normalizeAssessmentLog(null);
const guest = (extra: Partial<UserStats> = {}): UserStats => ({ ...INITIAL_STATS, ...extra });

describe('a guest’s test-out, by the shared rules', () => {
  it('starts on a locked stage with the rules copied onto it, and only one at a time', () => {
    const stats = guest();
    const started = startLocalAssessment({ request: { kind: 'test-out', stageId: 'stage-3' }, chains: chainsFor(stats), log: EMPTY_LOG, settings: SETTINGS, stats, now: NOW });
    expect(started.ok).toBe(true);
    if (!started.ok) return;
    expect(started.record.id.startsWith(LOCAL_ASSESSMENT_PREFIX)).toBe(true);
    expect(started.record).toMatchObject({ kind: 'test-out', trackId: 'core', stageIds: ['stage-3'], status: 'active', cursor: 0 });
    expect(started.record.rules).toMatchObject({ passMark: 80, maxRuns: 3, hintsAllowed: false, clears: true, xpPercent: 100 });
    expect(Date.parse(started.record.expiresAt) - NOW.getTime()).toBe(60 * 60_000);
    expect(viewOf(started.record, NOW).current).toBe('stage-3');

    const again = startLocalAssessment({ request: { kind: 'test-out', stageId: 'stage-2' }, chains: chainsFor(stats), log: started.log, settings: SETTINGS, stats, now: NOW });
    expect(again).toMatchObject({ ok: false, reason: 'active-exists' });
  });

  it('refuses what the rules refuse: an unknown stage, a stage already cleared, a cooldown after a failure', () => {
    const stats = guest();
    expect(startLocalAssessment({ request: { kind: 'test-out', stageId: 'stage-9' }, chains: chainsFor(stats), log: EMPTY_LOG, settings: SETTINGS, stats, now: NOW })).toMatchObject({
      ok: false,
      reason: 'unknown-stage'
    });
    const cleared = guest({ completedChallenges: ['s1-a', 's1-b', 's1-test'] });
    expect(startLocalAssessment({ request: { kind: 'test-out', stageId: 'stage-1' }, chains: chainsFor(cleared), log: EMPTY_LOG, settings: SETTINGS, stats: cleared, now: NOW })).toMatchObject({
      ok: false,
      reason: 'already-cleared'
    });

    const started = startLocalAssessment({ request: { kind: 'test-out', stageId: 'stage-2' }, chains: chainsFor(stats), log: EMPTY_LOG, settings: SETTINGS, stats, now: NOW });
    if (!started.ok) throw new Error('should start');
    const failed = recordLocalResult(started.record, { stageId: 'stage-2', correct: false, attempts: 3, hintsUsed: 0, xp: SETTINGS.xp, at: later(5).toISOString() });
    expect(failed.record.status).toBe('failed');
    const log = withRecord(started.log, failed.record);
    const status = localTestOutStatus({ stageId: 'stage-2', chains: chainsFor(stats), log, rules: SETTINGS.testOut, stats, now: later(10) });
    expect(status).toMatchObject({ allowed: false, reason: 'cooldown', attemptsLeft: 2 });
    expect(Date.parse(status!.retryAt!)).toBe(later(65).getTime());
    // After the wait, it may start again.
    expect(localTestOutStatus({ stageId: 'stage-2', chains: chainsFor(stats), log, rules: SETTINGS.testOut, stats, now: later(66) })).toMatchObject({ allowed: true });
  });

  it('passes within the runs the pass mark allows, and not after; hints where none are allowed never pass', () => {
    const stats = guest();
    const started = startLocalAssessment({ request: { kind: 'test-out', stageId: 'stage-2' }, chains: chainsFor(stats), log: EMPTY_LOG, settings: SETTINGS, stats, now: NOW });
    if (!started.ok) throw new Error('should start');
    const at = NOW.toISOString();
    expect(recordLocalResult(started.record, { stageId: 'stage-2', correct: true, attempts: 3, hintsUsed: 0, xp: SETTINGS.xp, at })).toMatchObject({ passed: true, score: 80 });
    expect(recordLocalResult(started.record, { stageId: 'stage-2', correct: true, attempts: 4, hintsUsed: 0, xp: SETTINGS.xp, at })).toMatchObject({ passed: false, score: 70 });
    const hinted = recordLocalResult(started.record, { stageId: 'stage-2', correct: true, attempts: 1, hintsUsed: 1, xp: SETTINGS.xp, at });
    expect(hinted.passed).toBe(false);
    expect(hinted.record.status).toBe('failed');
    expect(hinted.record.results['stage-2']).toMatchObject({ outcome: 'failed', runs: 1, hintsUsed: 1 });
  });
});

describe('a guest’s pass, written like the server writes one', () => {
  const test = BANK[2].test!;
  const record = { id: 'local-abc', kind: 'test-out' as const, rules: { passMark: 80, hintsAllowed: false, maxRuns: 3, xpPercent: 50, clears: true } };

  it('solves the test via the test-out, pays xpForTestOut, records testedOut and keeps the passing answer as a claim', () => {
    const out = withLocalPass(guest(), {
      challenge: test,
      stageId: 'stage-3',
      record,
      attempts: 2,
      hintsUsed: 0,
      submission: { answer: 1 },
      xp: SETTINGS.xp,
      levels: DEFAULT_LEVEL_CURVE,
      at: NOW.toISOString()
    });
    expect(out.firstSolve).toBe(true);
    expect(out.awarded).toBe(xpForTestOut(150, 50, 2, 0, SETTINGS.xp));
    expect(out.stats.xp).toBe(out.awarded);
    expect(out.stats.completedChallenges).toEqual(['s3-test']);
    expect(out.stats.attempts['s3-test']).toMatchObject({ via: 'test-out', attempts: 2, solves: 1, solvedAt: NOW.toISOString() });
    expect(out.stats.testedOut).toEqual({ 'stage-3': { at: NOW.toISOString(), via: 'test-out', clears: true, assessmentId: 'local-abc' } });
    expect(out.stats.assessmentClaims).toEqual({
      'stage-3': { kind: 'test-out', stageId: 'stage-3', testId: 's3-test', attempts: 2, hintsUsed: 0, answer: 1, at: NOW.toISOString() }
    });
    // The path now opens every stage before it, and clears this one.
    const states = applyProgress(BANK, out.stats).map((s) => s.state);
    expect(states[2]).toBe('Completed');
    expect(states[3]).toBe('In progress');
  });

  it('pays nothing and claims nothing for a test already solved', () => {
    const solved = guest({ completedChallenges: ['s3-test'], xp: 100 });
    const out = withLocalPass(solved, { challenge: test, stageId: 'stage-3', record, attempts: 1, hintsUsed: 0, submission: { code: 'x' }, xp: SETTINGS.xp, levels: DEFAULT_LEVEL_CURVE, at: NOW.toISOString() });
    expect(out).toMatchObject({ awarded: 0, firstSolve: false });
    expect(out.stats.xp).toBe(100);
    expect(out.stats.assessmentClaims).toBeUndefined();
  });
});

describe('a guest’s placement', () => {
  it('queues the stage tests from the first stage not cleared, moves on after a pass and stops at the first failure', () => {
    const stats = guest();
    const placement = localPlacementStatus({ trackId: 'core', chains: chainsFor(stats), log: EMPTY_LOG, rules: SETTINGS.placement, stats, now: NOW });
    expect(placement).toMatchObject({ eligible: true, queue: ['stage-1', 'stage-2', 'stage-3'] });
    const started = startLocalAssessment({ request: { kind: 'placement', trackId: 'core' }, chains: chainsFor(stats), log: EMPTY_LOG, settings: SETTINGS, stats, now: NOW });
    if (!started.ok) throw new Error('should start');
    expect(started.record.rules).toMatchObject({ passMark: 70, maxRuns: 4, stopOnFirstFail: true });
    expect(Date.parse(started.record.expiresAt) - NOW.getTime()).toBe(3 * 60 * 60_000);

    const at = NOW.toISOString();
    const first = recordLocalResult(started.record, { stageId: 'stage-1', correct: true, attempts: 1, hintsUsed: 0, xp: SETTINGS.xp, at });
    expect(first.record).toMatchObject({ status: 'active', cursor: 1 });
    expect(viewOf(first.record, NOW).current).toBe('stage-2');
    const second = recordLocalResult(first.record, { stageId: 'stage-2', correct: false, attempts: 4, hintsUsed: 0, xp: SETTINGS.xp, at });
    expect(second.record).toMatchObject({ status: 'finished', cursor: 2 });
    expect(viewOf(second.record, NOW).current).toBeNull();

    // Taken again only after `retakeAfterDays`.
    const log = withRecord(started.log, second.record);
    expect(localPlacementStatus({ trackId: 'core', chains: chainsFor(stats), log, rules: SETTINGS.placement, stats, now: later(60) })).toMatchObject({ eligible: false, reason: 'cooldown' });
  });

  it('can be ended early', () => {
    const stats = guest();
    const started = startLocalAssessment({ request: { kind: 'placement', trackId: 'core' }, chains: chainsFor(stats), log: EMPTY_LOG, settings: SETTINGS, stats, now: NOW });
    if (!started.ok) throw new Error('should start');
    expect(finishLocalAssessment(started.record, NOW.toISOString())).toMatchObject({ status: 'finished', finishedAt: NOW.toISOString() });
    expect(startLocalAssessment({ request: { kind: 'placement', trackId: 'java' }, chains: chainsFor(stats), log: EMPTY_LOG, settings: SETTINGS, stats, now: NOW })).toMatchObject({
      ok: false,
      reason: 'unknown-track'
    });
  });
});

describe('the words about waiting', () => {
  it('says when, in plain words', () => {
    expect(describeRetry(null)).toBeNull();
    expect(describeRetry(later(-1).toISOString(), NOW)).toBe('now');
    expect(describeRetry(later(1).toISOString(), NOW)).toBe('in 1 minute');
    expect(describeRetry(later(45).toISOString(), NOW)).toBe('in 45 minutes');
    expect(describeRetry(later(180).toISOString(), NOW)).toBe('in 3 hours');
    expect(describeRetry(later(60 * 24 * 10).toISOString(), NOW)).toMatch(/^on /);
  });

  it('explains every refusal without developer words', () => {
    for (const reason of ['cooldown', 'limit', 'premium', 'not-reachable', 'already-cleared', 'test-pending', 'no-test', 'nothing-to-place', 'unverifiable', 'active-exists', 'offline', 'disabled', null]) {
      const text = assessmentBlockText(reason, 'in 5 minutes');
      expect(text.length).toBeGreaterThan(10);
      expect(text).not.toMatch(/undefined|null|reason|403|409|429/);
    }
    expect(assessmentBlockText('offline')).toBe('Test-outs need a connection so the unlock is saved to your account.');
  });
});
