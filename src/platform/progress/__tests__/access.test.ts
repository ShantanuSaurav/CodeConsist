import { describe, expect, it } from 'vitest';
import type { AssessmentRecord, Challenge, Stage, TestOutRecord, UserStats } from '@/types';
import {
  DEFAULT_PLACEMENT_SETTINGS,
  DEFAULT_TEST_OUT_SETTINGS,
  activeAssessment,
  advanceAssessment,
  assessmentRulesFor,
  assessmentView,
  canSolve,
  filterMergeIds,
  maxRunsFor,
  normalizeAssessmentLog,
  placementEligibility,
  placementQueue,
  settleExpired,
  testOutEligibility
} from '../access';
import type { AssessmentLog } from '../access';
import { applyProgress } from '../stages';
import type { StageStats } from '../stages';

/* ------------------------------------------------------------ fixtures */

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

const stats = (solved: string[], extra: Partial<UserStats> = {}): StageStats => ({ completedChallenges: solved, isPremium: false, unlockedStages: [], ...extra });

/** Four stages with their states worked out, the way the server hands them to these rules. */
const pathFor = (s: StageStats, bank: Stage[] = [stage(1), stage(2), stage(3), stage(4)]) => applyProgress(bank, s);

const NOW = new Date('2026-09-28T12:00:00.000Z');
const minutesAgo = (m: number) => new Date(NOW.getTime() - m * 60_000).toISOString();
const minutesAhead = (m: number) => new Date(NOW.getTime() + m * 60_000).toISOString();

const RULES = { ...DEFAULT_TEST_OUT_SETTINGS, disabledStages: [] as string[] };

let seq = 0;
function testOut(stageId: string, status: AssessmentRecord['status'], startedMinutesAgo: number, extra: Partial<AssessmentRecord> = {}): AssessmentRecord {
  seq += 1;
  const startedAt = minutesAgo(startedMinutesAgo);
  return {
    id: `as_${seq}`,
    kind: 'test-out',
    trackId: 'core',
    stageIds: [stageId],
    cursor: status === 'active' ? 0 : 1,
    status,
    results: {},
    rules: { passMark: 80, hintsAllowed: false, maxRuns: 3, xpPercent: 100, clears: true },
    startedAt,
    expiresAt: new Date(Date.parse(startedAt) + 60 * 60_000).toISOString(),
    finishedAt: status === 'active' ? null : minutesAgo(Math.max(0, startedMinutesAgo - 5)),
    ...extra
  };
}

const log = (records: AssessmentRecord[], cooldownClearedAt: Record<string, string> = {}): AssessmentLog => ({ records, cooldownClearedAt });

/* ------------------------------------------------------------- canSolve */

describe('canSolve', () => {
  it('allows a lesson in an open stage and refuses one in a locked stage', () => {
    const s = stats([]);
    const path = pathFor(s);
    expect(canSolve(lesson('s1-a', 'stage-1'), path, s)).toEqual({ ok: true });
    expect(canSolve(lesson('s2-a', 'stage-2'), path, s)).toEqual({ ok: false, reason: 'stage-locked', stageId: 'stage-2' });
  });

  it('refuses a stage test before its lessons are done, and allows it after', () => {
    const early = stats(['s1-a']);
    const test = { ...lesson('s1-test', 'stage-1'), isStageTest: true };
    expect(canSolve(test, pathFor(early), early)).toEqual({ ok: false, reason: 'test-locked', stageId: 'stage-1' });
    const ready = stats(['s1-a', 's1-b']);
    expect(canSolve(test, pathFor(ready), ready)).toEqual({ ok: true });
  });

  it('refuses a stage the learner is not served', () => {
    const s = stats([]);
    expect(canSolve(lesson('x-a', 'stage-hidden'), pathFor(s), s)).toEqual({ ok: false, reason: 'stage-unavailable', stageId: 'stage-hidden' });
  });

  it('always allows something already solved (a re-solve), and a tested-out stage test', () => {
    const s = stats(['s3-test'], { testedOut: { 'stage-3': { at: 'x', via: 'test-out', clears: true, assessmentId: 'as_1' } } });
    const path = pathFor(s);
    expect(canSolve({ ...lesson('s3-test', 'stage-3'), isStageTest: true }, path, s)).toEqual({ ok: true });
    // Its lessons are open too (the stage has a record), and so are the stages before it.
    expect(canSolve(lesson('s3-a', 'stage-3'), path, s)).toEqual({ ok: true });
    expect(canSolve(lesson('s2-a', 'stage-2'), path, s)).toEqual({ ok: true });
  });
});

/* --------------------------------------------------------- the log itself */

describe('assessment records', () => {
  it('maxRunsFor follows the pass mark and the retry penalty', () => {
    expect(maxRunsFor(80)).toBe(3);
    expect(maxRunsFor(70)).toBe(4);
    expect(maxRunsFor(100)).toBe(1);
    expect(maxRunsFor(50, 25)).toBe(3);
    expect(maxRunsFor(80, 0)).toBe(50);
  });

  it('assessmentRulesFor copies the rules of its kind', () => {
    const settings = { placement: { ...DEFAULT_PLACEMENT_SETTINGS, passMark: 60 }, testOut: { ...DEFAULT_TEST_OUT_SETTINGS, countsAsCleared: false }, xp: { retryPenalty: 10 } };
    expect(assessmentRulesFor('test-out', settings)).toEqual({ passMark: 80, hintsAllowed: false, maxRuns: 3, xpPercent: 100, clears: false });
    expect(assessmentRulesFor('placement', settings)).toEqual({ passMark: 60, hintsAllowed: false, maxRuns: 5, xpPercent: 100, clears: false, stopOnFirstFail: true });
  });

  it('settleExpired turns an active record past its time into an expired one', () => {
    const late = testOut('stage-2', 'active', 90);
    const live = testOut('stage-3', 'active', 10);
    const [a, b] = settleExpired([late, live], NOW);
    expect(a).toMatchObject({ status: 'expired', finishedAt: late.expiresAt });
    expect(b).toBe(live);
    expect(activeAssessment(log([late, live]), NOW)?.id).toBe(live.id);
    expect(activeAssessment(log([late]), NOW)).toBeNull();
    expect(assessmentView(live, NOW).current).toBe('stage-3');
    expect(assessmentView(late, NOW)).toMatchObject({ status: 'expired', current: null });
  });

  it('advanceAssessment ends a test-out, and moves a placement on or stops it', () => {
    const one = { kind: 'test-out' as const, cursor: 0, stageIds: ['stage-2'], rules: { passMark: 80, hintsAllowed: false, maxRuns: 3, xpPercent: 100, clears: true } };
    expect(advanceAssessment(one, true, 'T')).toEqual({ cursor: 1, status: 'passed', finishedAt: 'T' });
    expect(advanceAssessment(one, false, 'T')).toEqual({ cursor: 1, status: 'failed', finishedAt: 'T' });
    const placement = { ...one, kind: 'placement' as const, stageIds: ['stage-1', 'stage-2', 'stage-3'], rules: { ...one.rules, stopOnFirstFail: true } };
    expect(advanceAssessment(placement, true, 'T')).toEqual({ cursor: 1, status: 'active', finishedAt: null });
    expect(advanceAssessment(placement, false, 'T')).toEqual({ cursor: 1, status: 'finished', finishedAt: 'T' });
    const goOn = { ...placement, rules: { ...placement.rules, stopOnFirstFail: false } };
    expect(advanceAssessment(goOn, false, 'T')).toEqual({ cursor: 1, status: 'active', finishedAt: null });
    expect(advanceAssessment({ ...goOn, cursor: 2 }, false, 'T')).toEqual({ cursor: 3, status: 'finished', finishedAt: 'T' });
  });

  it('normalizeAssessmentLog keeps well-formed records and own cooldown keys only', () => {
    const good = testOut('stage-2', 'failed', 30);
    const raw = JSON.parse(
      JSON.stringify({ records: [good, { id: 1 }, null, { ...good, id: 'as_x', kind: 'exam' }], cooldownClearedAt: { 'stage-2': NOW.toISOString(), 'stage-3': 'soon' } })
    );
    raw.cooldownClearedAt = JSON.parse(`{"__proto__": "${NOW.toISOString()}", "stage-2": "${NOW.toISOString()}"}`);
    const out = normalizeAssessmentLog(raw);
    expect(out.records.map((r) => r.id)).toEqual([good.id]);
    expect(Object.keys(out.cooldownClearedAt)).toEqual(['stage-2']);
    expect(normalizeAssessmentLog(null)).toEqual({ records: [], cooldownClearedAt: {} });
  });
});

/* ------------------------------------------------------- testOutEligibility */

describe('testOutEligibility', () => {
  const s = stats(['s1-a', 's1-b', 's1-test']);
  const path = pathFor(s); // Completed, In progress, Locked, Locked
  const check = (stageIndex: number, opts: { rules?: Partial<typeof RULES>; records?: AssessmentRecord[]; cleared?: Record<string, string>; st?: StageStats; bank?: Stage[] } = {}) => {
    const st = opts.st ?? s;
    const p = opts.bank ? pathFor(st, opts.bank) : opts.st ? pathFor(st) : path;
    return testOutEligibility({ stage: p[stageIndex], trackStages: p, log: log(opts.records ?? [], opts.cleared), rules: { ...RULES, ...opts.rules }, stats: st, now: NOW });
  };

  it('allows a locked stage, and says how many tries are left', () => {
    expect(check(2)).toEqual({ allowed: true, reason: null, retryAt: null, attemptsLeft: 3 });
  });

  it('is disabled when switched off, for an excluded stage, and on an open stage when that is off', () => {
    expect(check(2, { rules: { enabled: false } }).reason).toBe('disabled');
    expect(check(2, { rules: { disabledStages: ['stage-3'] } }).reason).toBe('disabled');
    expect(check(1).allowed).toBe(true);
    expect(check(1, { rules: { allowOnOpenStage: false } }).reason).toBe('disabled');
  });

  it('needs a stage test', () => {
    const bank = [stage(1), stage(2), stage(3, { test: undefined }), stage(4)];
    expect(check(2, { bank }).reason).toBe('no-test');
  });

  it('refuses a premium stage the learner has not unlocked', () => {
    const bank = [stage(1), stage(2), stage(3, { isPremium: true }), stage(4)];
    expect(check(2, { bank }).reason).toBe('premium');
    expect(check(2, { bank, st: stats(['s1-a', 's1-b', 's1-test'], { unlockedStages: ['stage-3'] }) }).allowed).toBe(true);
  });

  it('refuses a cleared stage, and points a finished stage at its own test', () => {
    expect(check(0).reason).toBe('already-cleared');
    const ready = stats(['s1-a', 's1-b', 's1-test', 's2-a', 's2-b']);
    expect(check(1, { st: ready }).reason).toBe('test-pending');
  });

  it('with skip-ahead off, allows only the first locked stage of the track', () => {
    expect(check(2, { rules: { allowSkipAhead: false } }).allowed).toBe(true);
    expect(check(3, { rules: { allowSkipAhead: false } }).reason).toBe('not-reachable');
    expect(check(3).allowed).toBe(true);
  });

  it('counts tries in the window: the limit, with when it ends', () => {
    const records = [testOut('stage-3', 'failed', 600), testOut('stage-3', 'abandoned', 300), testOut('stage-3', 'failed', 120)];
    const result = check(2, { records });
    expect(result).toMatchObject({ allowed: false, reason: 'limit', attemptsLeft: 0 });
    // The oldest of the three leaves the 24-hour window first.
    expect(result.retryAt).toBe(new Date(Date.parse(records[0].startedAt) + 24 * 3_600_000).toISOString());
    // Tries at another stage, or passed ones, do not count.
    expect(check(3, { records }).allowed).toBe(true);
    // Outside the window they no longer count.
    expect(check(2, { records, rules: { attemptWindowHours: 1, cooldownMinutes: 0 } }).allowed).toBe(true);
  });

  it('makes a learner wait after a failed try', () => {
    const failed = testOut('stage-3', 'failed', 20);
    const result = check(2, { records: [failed] });
    expect(result).toMatchObject({ allowed: false, reason: 'cooldown', attemptsLeft: 2 });
    expect(result.retryAt).toBe(new Date(Date.parse(failed.finishedAt!) + 60 * 60_000).toISOString());
    expect(check(2, { records: [failed], rules: { cooldownMinutes: 0 } }).allowed).toBe(true);
  });

  it('counts an active record past its time as a failure', () => {
    const expired = testOut('stage-3', 'active', 70); // expired 10 minutes ago
    const result = check(2, { records: [expired] });
    expect(result.reason).toBe('cooldown');
    expect(result.retryAt).toBe(new Date(Date.parse(expired.expiresAt) + 60 * 60_000).toISOString());
  });

  it("forgets every try before an admin's clear (for the stage, or for everything)", () => {
    const records = [testOut('stage-3', 'failed', 20), testOut('stage-3', 'failed', 40), testOut('stage-3', 'failed', 60)];
    expect(check(2, { records }).allowed).toBe(false);
    expect(check(2, { records, cleared: { 'stage-3': minutesAgo(1) } })).toEqual({ allowed: true, reason: null, retryAt: null, attemptsLeft: 3 });
    expect(check(2, { records, cleared: { '*': minutesAgo(1) } }).allowed).toBe(true);
    // A clear from before the tries changes nothing.
    expect(check(2, { records, cleared: { 'stage-3': minutesAgo(600) } }).allowed).toBe(false);
  });
});

/* ------------------------------------------------------------- placement */

describe('placementQueue', () => {
  it('starts at the first stage not cleared and takes at most maxStages', () => {
    const s = stats(['s1-a', 's1-b', 's1-test']);
    expect(placementQueue(pathFor(s), { maxStages: 2, stagesByTrack: {} }, { trackId: 'core', stats: s })).toEqual(['stage-2', 'stage-3']);
    expect(placementQueue(pathFor(s), { maxStages: 20, stagesByTrack: {} }, { trackId: 'core', stats: s })).toEqual(['stage-2', 'stage-3', 'stage-4']);
  });

  it('skips premium stages the learner has not unlocked and stages without a test', () => {
    const bank = [stage(1), stage(2, { isPremium: true }), stage(3, { test: undefined }), stage(4), stage(5)];
    const s = stats([]);
    expect(placementQueue(pathFor(s, bank), { maxStages: 3, stagesByTrack: {} }, { trackId: 'core', stats: s })).toEqual(['stage-1', 'stage-4', 'stage-5']);
  });

  it('keeps to the stages the admin listed for the track', () => {
    const s = stats([]);
    const rules = { maxStages: 3, stagesByTrack: { core: ['stage-2', 'stage-4'], c: ['stage-9'] } };
    expect(placementQueue(pathFor(s), rules, { trackId: 'core', stats: s })).toEqual(['stage-2', 'stage-4']);
    // Another track's list does not apply.
    expect(placementQueue(pathFor(s), { ...rules, stagesByTrack: { c: ['stage-9'] } }, { trackId: 'core', stats: s })).toEqual(['stage-1', 'stage-2', 'stage-3']);
  });

  it('is empty once everything is cleared', () => {
    const all = stats(['s1-a', 's1-b', 's1-test', 's2-a', 's2-b', 's2-test']);
    expect(placementQueue(pathFor(all, [stage(1), stage(2)]), { maxStages: 3, stagesByTrack: {} }, { trackId: 'core', stats: all })).toEqual([]);
  });
});

describe('placementEligibility', () => {
  const s = stats([]);
  const input = (records: AssessmentRecord[] = [], rules = DEFAULT_PLACEMENT_SETTINGS, cleared: Record<string, string> = {}) => ({
    trackId: 'core',
    trackStages: pathFor(s),
    log: log(records, cleared),
    rules,
    stats: s,
    now: NOW
  });
  const placement = (status: AssessmentRecord['status'], minutes: number): AssessmentRecord => ({
    ...testOut('stage-1', status, minutes),
    kind: 'placement',
    stageIds: ['stage-1', 'stage-2', 'stage-3']
  });

  it('offers the queue', () => {
    expect(placementEligibility(input())).toEqual({ eligible: true, reason: null, retryAt: null, queue: ['stage-1', 'stage-2', 'stage-3'] });
  });

  it('is refused when switched off, or when there is nothing to place', () => {
    expect(placementEligibility(input([], { ...DEFAULT_PLACEMENT_SETTINGS, enabled: false })).reason).toBe('disabled');
    const done = stats(['s1-a', 's1-b', 's1-test']);
    const one = [stage(1)];
    expect(placementEligibility({ ...input(), trackStages: pathFor(done, one), stats: done }).reason).toBe('nothing-to-place');
  });

  it('waits retakeAfterDays after the last placement on the track', () => {
    const last = placement('finished', 60);
    const result = placementEligibility(input([last]));
    expect(result.reason).toBe('cooldown');
    expect(result.retryAt).toBe(new Date(Date.parse(last.finishedAt!) + 7 * 86_400_000).toISOString());
    // Another track's placement does not count; an admin's clear forgets it.
    expect(placementEligibility(input([{ ...last, trackId: 'c' }])).eligible).toBe(true);
    expect(placementEligibility(input([last], DEFAULT_PLACEMENT_SETTINGS, { '*': minutesAgo(1) })).eligible).toBe(true);
    expect(placementEligibility(input([last], { ...DEFAULT_PLACEMENT_SETTINGS, retakeAfterDays: 0 })).eligible).toBe(true);
  });
});

/* ---------------------------------------------------------- filterMergeIds */

describe('filterMergeIds', () => {
  const chains = () => [[stage(1), stage(2), stage(3)], [stage(7, { id: 'stage-c1', challenges: [lesson('c1-a', 'stage-c1')], test: { ...lesson('c1-test', 'stage-c1'), isStageTest: true } })]];

  it('lets legitimate progress in order through', () => {
    const incoming = ['s1-a', 's1-b', 's1-test', 's2-a', 's2-b', 's2-test', 's3-a'];
    expect(filterMergeIds(chains(), [], incoming, stats([]))).toEqual({ accepted: incoming, dropped: [] });
  });

  it('drops a forged lesson in a later stage - it is not its own evidence', () => {
    const result = filterMergeIds(chains(), [], ['s1-a', 's3-a', 's3-b'], stats([]));
    expect(result).toEqual({ accepted: ['s1-a'], dropped: ['s3-a', 's3-b'] });
  });

  it('drops a stage test whose lessons are not all accepted', () => {
    const result = filterMergeIds(chains(), [], ['s1-a', 's1-test'], stats([]));
    expect(result).toEqual({ accepted: ['s1-a'], dropped: ['s1-test'] });
  });

  it('builds on what the account already has, and on its test-outs', () => {
    expect(filterMergeIds(chains(), ['s1-a', 's1-b', 's1-test'], ['s2-a'], stats(['s1-a', 's1-b', 's1-test'])).accepted).toEqual(['s2-a']);
    const testedOut: Record<string, TestOutRecord> = { 'stage-2': { at: 'x', via: 'test-out', clears: true, assessmentId: 'as_1' } };
    const result = filterMergeIds(chains(), ['s2-test'], ['s1-a', 's3-a'], stats(['s2-test'], { testedOut }));
    expect(result).toEqual({ accepted: ['s1-a', 's3-a'], dropped: [] });
  });

  it('judges each track on its own, and lets ids in no stage through', () => {
    const result = filterMergeIds(chains(), [], ['c1-a', 's2-a', 'nowhere'], stats([]));
    expect(result).toEqual({ accepted: ['c1-a', 'nowhere'], dropped: ['s2-a'] });
  });

  it('judges a premium stage as if unlocked, so it never dams the stages after it', () => {
    const premium = () => [[stage(1), stage(2, { isPremium: true }), stage(3)]];
    const result = filterMergeIds(premium(), [], ['s1-a', 's1-b', 's1-test', 's2-a', 's2-b', 's2-test', 's3-a'], stats([]));
    expect(result.dropped).toEqual([]);
  });

  it('ignores ids the account already has', () => {
    expect(filterMergeIds(chains(), ['s1-a'], ['s1-a', 's1-b'], stats(['s1-a']))).toEqual({ accepted: ['s1-b'], dropped: [] });
  });
});

describe('activeAssessment', () => {
  it('keeps a record whose time has not run out', () => {
    const live = testOut('stage-2', 'active', 1, { expiresAt: minutesAhead(30) });
    expect(activeAssessment(log([live]), NOW)?.id).toBe(live.id);
  });
});
