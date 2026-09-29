/**
 * Who may do what on the path: solve a lesson, take a stage's test, test out
 * of a stage, take a placement - and which guest solves a merge may credit.
 *
 * Pure over the shared types, and every function takes `now` from its
 * caller, so the server (server/progression.js, server/assessment-routes.js,
 * through the compiled server-lib) and a guest's local engine run exactly the
 * same rules. The lock chain itself is `applyProgress` (./stages); this file
 * reads the states it gives.
 *
 * The premium lock is not decided here: a premium stage the learner has not
 * unlocked is refused by its own gate (server/billing.js premiumGate), and
 * the functions below only report it where a learner needs a reason.
 */
import type { AssessmentKind, AssessmentRecord, AssessmentRules, AssessmentStatus, AssessmentView, Challenge, Stage } from '@/types';
import type { PlacementSettings, TestOutSettings } from '../settings/types';
import type { XpRules } from '../xp-leveling/leveling';
import { applyProgress, isPremiumLocked } from './stages';
import type { StageStats } from './stages';

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

/** Test-out, as the admin finds it before changing anything. */
export const DEFAULT_TEST_OUT_SETTINGS: TestOutSettings = {
  enabled: true,
  allowOnOpenStage: true,
  allowSkipAhead: true,
  countsAsCleared: true,
  countsTowardCertificate: false,
  passMark: 80,
  hintsAllowed: false,
  maxAttempts: 3,
  attemptWindowHours: 24,
  cooldownMinutes: 60,
  sessionMinutes: 60,
  xpPercent: 100,
  disabledStages: [],
  copy: {
    buttonLabel: 'Test out',
    confirmTitle: 'Test out of {stage}?',
    confirmBody:
      'Take the stage test now. Score {passMark}% or more - at most {maxRuns} runs - and {stage} is marked as tested out, so you can move on. No hints, and the answer is not shown.',
    rulesLine: 'Pass mark {passMark}% · at most {maxRuns} runs',
    passTitle: 'You tested out of {stage}',
    // Neutral: the next stage may be premium, the last of its track, or not
    // opened by a test-out at all (`countsAsCleared` off). The result screen's
    // button says where to go when it is open.
    passBody: '{stage} is marked as tested out. Its lessons stay there if you want them.',
    failTitle: 'Not this time',
    failBody: 'You can try again {when}, or work through the lessons in {stage} first.',
    cooldownLabel: 'Try again {when}'
  }
};

/** Placement, as the admin finds it before changing anything. */
export const DEFAULT_PLACEMENT_SETTINGS: PlacementSettings = {
  enabled: true,
  offerOnLearnPage: true,
  maxStages: 3,
  stopOnFirstFail: true,
  passMark: 70,
  hintsAllowed: false,
  xpPercent: 100,
  retakeAfterDays: 7,
  stagesByTrack: {},
  copy: {
    introTitle: 'Find your level',
    introBody:
      'Take a few stage tests in a row. Each one you pass with {passMark}% or more - at most {maxRuns} runs - marks that stage as tested out, and you start after it.',
    passTitle: 'Passed: {stage}',
    passBody: '{stage} is marked as tested out.',
    failTitle: 'Your level: {stage}',
    failBody: 'Start with the lessons in {stage}. You can take the placement again {when}.',
    learnPageLink: 'Already know some of this? Find your level'
  }
};

/** Runs that can still reach the pass mark: 100, minus `retryPenalty` a run after the first. */
export function maxRunsFor(passMark: number, retryPenalty = 10): number {
  const mark = Math.max(0, Math.min(100, Number(passMark) || 0));
  const penalty = Number(retryPenalty) || 0;
  if (penalty <= 0) return 50;
  return Math.max(1, Math.floor((100 - mark) / penalty) + 1);
}

/** The rules an assessment of this kind starts under - copied onto its record, so an admin's later change never touches it. */
export function assessmentRulesFor(
  kind: AssessmentKind,
  settings: { placement: PlacementSettings; testOut: TestOutSettings; xp: Pick<XpRules, 'retryPenalty'> }
): AssessmentRules {
  const own = kind === 'placement' ? settings.placement : settings.testOut;
  return {
    passMark: own.passMark,
    hintsAllowed: own.hintsAllowed,
    maxRuns: maxRunsFor(own.passMark, settings.xp.retryPenalty),
    xpPercent: own.xpPercent,
    // A passed test clears its stage (the next one opens) for both kinds.
    clears: settings.testOut.countsAsCleared,
    ...(kind === 'placement' ? { stopOnFirstFail: settings.placement.stopOnFirstFail } : {})
  };
}

/**
 * Where an assessment goes after one of its tests: a test-out is over
 * (`passed` or `failed`); a placement moves to its next test, or ends
 * (`finished`) after its last one - or at a test not passed, when it stops
 * on the first failure. Returns the record's new `cursor`, `status` and
 * `finishedAt`.
 */
export function advanceAssessment(
  record: Pick<AssessmentRecord, 'kind' | 'cursor' | 'stageIds' | 'rules'>,
  passed: boolean,
  at: string
): Pick<AssessmentRecord, 'cursor' | 'status' | 'finishedAt'> {
  if (record.kind === 'test-out') return { cursor: record.cursor + 1, status: passed ? 'passed' : 'failed', finishedAt: at };
  const cursor = record.cursor + 1;
  const stop = !passed && record.rules.stopOnFirstFail !== false;
  if (stop || cursor >= record.stageIds.length) return { cursor, status: 'finished', finishedAt: at };
  return { cursor, status: 'active', finishedAt: null };
}

/* ------------------------------------------------------------- solving */

/** Why a solve is refused by the lock order. */
export type SolveBlock = 'stage-locked' | 'stage-unavailable' | 'test-locked';

/**
 * May this challenge be solved, given the stages as `applyProgress` left
 * them? A lesson needs its stage open; a stage test also needs every lesson
 * of the stage done, unless the test is already solved (a re-solve, or a
 * tested-out stage). Something already solved may always be solved again.
 * A stage the learner is not served (hidden, or not in their view) is
 * `stage-unavailable`.
 */
export function canSolve(
  challenge: Pick<Challenge, 'id' | 'stageId'> & { isStageTest?: boolean },
  stagesWithState: readonly Stage[],
  stats: Pick<StageStats, 'completedChallenges'>
): { ok: true } | { ok: false; reason: SolveBlock; stageId: string } {
  const solved = new Set(stats.completedChallenges);
  if (solved.has(challenge.id)) return { ok: true };
  const stage = stagesWithState.find((s) => s.id === challenge.stageId);
  if (!stage) return { ok: false, reason: 'stage-unavailable', stageId: challenge.stageId };
  if (stage.state === 'Locked') return { ok: false, reason: 'stage-locked', stageId: stage.id };
  const isTest = Boolean(challenge.isStageTest) || stage.test?.id === challenge.id;
  if (isTest) {
    const lessonsDone = stage.challenges.every((c) => solved.has(c.id));
    if (!lessonsDone) return { ok: false, reason: 'test-locked', stageId: stage.id };
  }
  return { ok: true };
}

/* ------------------------------------------------------------ the log */

/** A learner's assessments: the newest records, and when an admin last cleared their cooldowns (by stage id, or `*` for all). */
export interface AssessmentLog {
  records: AssessmentRecord[];
  cooldownClearedAt: Record<string, string>;
}

export const ASSESSMENT_RECORDS_KEPT = 100;

const STATUSES: AssessmentStatus[] = ['active', 'passed', 'failed', 'finished', 'abandoned', 'expired'];

function ownValue<T>(map: unknown, key: string): T | undefined {
  return map && typeof map === 'object' && Object.prototype.hasOwnProperty.call(map, key) ? ((map as Record<string, T>)[key] as T) : undefined;
}

function iso(value: unknown): string | null {
  return typeof value === 'string' && Number.isFinite(Date.parse(value)) ? value : null;
}

/** A stored log made safe: well-formed records only, the newest `ASSESSMENT_RECORDS_KEPT`. */
export function normalizeAssessmentLog(raw: unknown): AssessmentLog {
  const src = raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const records = (Array.isArray(src.records) ? src.records : [])
    .filter((r): r is AssessmentRecord => {
      const rec = r as Partial<AssessmentRecord> | null;
      return (
        Boolean(rec) &&
        typeof rec!.id === 'string' &&
        (rec!.kind === 'test-out' || rec!.kind === 'placement') &&
        Array.isArray(rec!.stageIds) &&
        STATUSES.includes(rec!.status as AssessmentStatus) &&
        iso(rec!.startedAt) !== null
      );
    })
    .slice(-ASSESSMENT_RECORDS_KEPT);
  const cleared: Record<string, string> = {};
  const rawCleared = src.cooldownClearedAt;
  if (rawCleared && typeof rawCleared === 'object' && !Array.isArray(rawCleared)) {
    for (const key of Object.keys(rawCleared)) {
      const at = iso((rawCleared as Record<string, unknown>)[key]);
      if (at && key !== '__proto__') Object.defineProperty(cleared, key, { value: at, writable: true, enumerable: true, configurable: true });
    }
  }
  return { records, cooldownClearedAt: cleared };
}

/**
 * Records as they stand at `now`: an active one past its `expiresAt` is
 * `expired` - which counts as a failure (for the limit and the cooldown).
 */
export function settleExpired(records: readonly AssessmentRecord[], now: Date): AssessmentRecord[] {
  const t = now.getTime();
  return records.map((r) => {
    if (r.status !== 'active') return r;
    const end = Date.parse(r.expiresAt);
    return Number.isFinite(end) && end <= t ? { ...r, status: 'expired' as const, finishedAt: r.expiresAt } : r;
  });
}

/** The learner's one open assessment at `now`, if any. */
export function activeAssessment(log: AssessmentLog, now: Date): AssessmentRecord | null {
  return settleExpired(log.records, now).find((r) => r.status === 'active') ?? null;
}

/** What a learner is sent about an assessment: the record, and the stage test it is on (null once it is over). */
export function assessmentView(record: AssessmentRecord, now: Date): AssessmentView {
  const [settled] = settleExpired([record], now);
  const current = settled.status === 'active' ? settled.stageIds[settled.cursor] ?? null : null;
  return { ...settled, current };
}

/** When an admin last cleared this key's cooldowns (the key, or `*`), as ms; -Infinity when never. */
function clearedSince(log: AssessmentLog, key: string): number {
  const times = [ownValue<string>(log.cooldownClearedAt, key), ownValue<string>(log.cooldownClearedAt, '*')]
    .map((v) => (typeof v === 'string' ? Date.parse(v) : NaN))
    .filter((n) => Number.isFinite(n));
  return times.length ? Math.max(...times) : -Infinity;
}

/* ------------------------------------------------------------ test-out */

export type TestOutBlock = 'disabled' | 'no-test' | 'premium' | 'already-cleared' | 'test-pending' | 'not-reachable' | 'limit' | 'cooldown';

export interface TestOutEligibility {
  allowed: boolean;
  reason: TestOutBlock | null;
  /** When a `limit` or `cooldown` ends. */
  retryAt: string | null;
  /** Test-outs of this stage still possible in the current window. */
  attemptsLeft: number;
}

/**
 * May the learner test out of `stage` now? `trackStages` is its track, with
 * the states `applyProgress` gives; `log` their assessments. In order:
 *   disabled        test-out is off, or this stage is excluded (or it is
 *                   open and `allowOnOpenStage` is off);
 *   no-test         the stage has no test;
 *   premium         a premium stage they have not unlocked;
 *   already-cleared cleared, or its test already solved;
 *   test-pending    the lessons are done: take the test itself;
 *   not-reachable   locked, `allowSkipAhead` is off and it is not the first
 *                   locked stage of the track;
 *   limit           `maxAttempts` test-outs of this stage in the window;
 *   cooldown        a failed one ended less than `cooldownMinutes` ago.
 * An admin's "clear cooldowns" forgets every attempt before it.
 */
export function testOutEligibility(input: {
  stage: Stage;
  trackStages: readonly Stage[];
  log: AssessmentLog;
  rules: TestOutSettings;
  stats: StageStats;
  now: Date;
}): TestOutEligibility {
  const { stage, trackStages, log, rules, stats, now } = input;
  const blocked = (reason: TestOutBlock, retryAt: string | null = null, attemptsLeft = 0): TestOutEligibility => ({
    allowed: false,
    reason,
    retryAt,
    attemptsLeft
  });
  if (!rules.enabled || rules.disabledStages.includes(stage.id)) return blocked('disabled');
  if (!stage.test) return blocked('no-test');
  if (isPremiumLocked(stage, { isPremium: stats.isPremium, unlockedStages: stats.unlockedStages })) return blocked('premium');
  const solved = new Set(stats.completedChallenges);
  if (stage.state === 'Completed' || solved.has(stage.test.id)) return blocked('already-cleared');
  if (stage.state === 'Test pending') return blocked('test-pending');
  if (stage.state !== 'Locked' && !rules.allowOnOpenStage) return blocked('disabled');
  if (stage.state === 'Locked' && !rules.allowSkipAhead) {
    const firstLocked = trackStages.find((s) => s.state === 'Locked' && !isPremiumLocked(s, { isPremium: stats.isPremium, unlockedStages: stats.unlockedStages }));
    if (firstLocked?.id !== stage.id) return blocked('not-reachable');
  }

  const t = now.getTime();
  const since = clearedSince(log, stage.id);
  const mine = settleExpired(log.records, now).filter(
    (r) => r.kind === 'test-out' && r.stageIds[0] === stage.id && r.status !== 'passed' && Date.parse(r.startedAt) > since
  );
  const windowMs = rules.attemptWindowHours * HOUR_MS;
  const inWindow = mine
    .map((r) => Date.parse(r.startedAt))
    .filter((start) => start > t - windowMs)
    .sort((a, b) => a - b);
  const attemptsLeft = Math.max(0, rules.maxAttempts - inWindow.length);

  let cooldownEnd = -Infinity;
  for (const r of mine) {
    if (r.status === 'active') continue;
    const end = Date.parse(r.finishedAt ?? r.startedAt);
    if (Number.isFinite(end)) cooldownEnd = Math.max(cooldownEnd, end + rules.cooldownMinutes * MINUTE_MS);
  }

  if (inWindow.length >= rules.maxAttempts) {
    const limitEnd = inWindow[inWindow.length - rules.maxAttempts] + windowMs;
    return blocked('limit', new Date(Math.max(limitEnd, cooldownEnd > t ? cooldownEnd : -Infinity)).toISOString(), 0);
  }
  if (cooldownEnd > t) return blocked('cooldown', new Date(cooldownEnd).toISOString(), attemptsLeft);
  return { allowed: true, reason: null, retryAt: null, attemptsLeft };
}

/* ----------------------------------------------------------- placement */

/**
 * The stage tests a placement on this track would hold: from the first stage
 * the learner has not cleared (a premium stage they have not unlocked does
 * not count), every stage with a test they have not solved - skipping
 * premium-locked stages, and keeping to `stagesByTrack` when the admin
 * listed stages for this track - at most `maxStages` of them, in track order.
 */
export function placementQueue(
  trackStages: readonly Stage[],
  rules: Pick<PlacementSettings, 'maxStages' | 'stagesByTrack'>,
  ctx: { trackId: string; stats: StageStats }
): string[] {
  const { stats } = ctx;
  const premium = (s: Stage) => isPremiumLocked(s, { isPremium: stats.isPremium, unlockedStages: stats.unlockedStages });
  const listed = ownValue<unknown>(rules.stagesByTrack, ctx.trackId);
  const only = Array.isArray(listed) && listed.length ? new Set(listed.filter((id): id is string => typeof id === 'string')) : null;
  const solved = new Set(stats.completedChallenges);
  const start = trackStages.findIndex((s) => s.state !== 'Completed' && !premium(s));
  if (start === -1) return [];
  const queue: string[] = [];
  for (const stage of trackStages.slice(start)) {
    if (queue.length >= rules.maxStages) break;
    if (stage.state === 'Completed' || !stage.test || premium(stage) || solved.has(stage.test.id)) continue;
    if (only && !only.has(stage.id)) continue;
    queue.push(stage.id);
  }
  return queue;
}

/** Why a placement cannot start. `unverifiable` comes from the server only: it cannot check even the first test in the queue. */
export type PlacementBlock = 'disabled' | 'nothing-to-place' | 'cooldown' | 'unverifiable';

export interface PlacementEligibility {
  eligible: boolean;
  reason: PlacementBlock | null;
  retryAt: string | null;
  queue: string[];
}

/**
 * May the learner take a placement on this track now? Not when placement is
 * off, when there is nothing to place (`placementQueue` is empty), or within
 * `retakeAfterDays` of the end of their last placement on it (an admin's
 * "clear cooldowns" for everything - `*` - forgets it).
 */
export function placementEligibility(input: {
  trackId: string;
  trackStages: readonly Stage[];
  log: AssessmentLog;
  rules: PlacementSettings;
  stats: StageStats;
  now: Date;
}): PlacementEligibility {
  const { trackId, trackStages, log, rules, stats, now } = input;
  const queue = rules.enabled ? placementQueue(trackStages, rules, { trackId, stats }) : [];
  if (!rules.enabled) return { eligible: false, reason: 'disabled', retryAt: null, queue };
  if (queue.length === 0) return { eligible: false, reason: 'nothing-to-place', retryAt: null, queue };
  const since = clearedSince(log, `placement:${trackId}`);
  let end = -Infinity;
  for (const r of settleExpired(log.records, now)) {
    if (r.kind !== 'placement' || r.trackId !== trackId || r.status === 'active' || Date.parse(r.startedAt) <= since) continue;
    const at = Date.parse(r.finishedAt ?? r.startedAt);
    if (Number.isFinite(at)) end = Math.max(end, at + rules.retakeAfterDays * DAY_MS);
  }
  if (end > now.getTime()) return { eligible: false, reason: 'cooldown', retryAt: new Date(end).toISOString(), queue };
  return { eligible: true, reason: null, retryAt: null, queue };
}

/* ---------------------------------------------------------------- merge */

/**
 * Which of a guest's (or an offline copy's) solved ids a merge may credit,
 * by the lock order. `bankOrder` is the stage chains (`stageChains`: each
 * track's stages in order, then the untracked ones); `accepted` what the
 * account has already (after any verified test-out claims); `incoming` the
 * new ids.
 *
 * The chains are walked in order. A lesson is accepted when its stage is open
 * given what has been accepted SO FAR; a stage test when, in addition, every
 * lesson of its stage has been accepted. Evidence (a solve in the stage)
 * therefore only ever comes from ids already accepted - never from the
 * incoming claim itself, so a forged solve in a later stage cannot open it.
 * The premium lock is its own gate: a premium stage is judged here as if it
 * were unlocked, and still never dams the stages after it.
 *
 * Ids that are in no stage of the chains are not this rule's to judge and are
 * accepted. Both lists come back in the order `incoming` gave them.
 */
export function filterMergeIds(
  bankOrder: readonly (readonly Stage[])[],
  accepted: readonly string[],
  incoming: readonly string[],
  stats: StageStats
): { accepted: string[]; dropped: string[] } {
  const acc = new Set(accepted);
  const want = new Set(incoming.filter((id) => !acc.has(id)));
  const keep = new Set<string>();
  const drop = new Set<string>();
  const judged = new Set<string>();

  for (const chain of bankOrder) {
    const list = [...chain];
    list.forEach((stage, i) => {
      const lessons = stage.challenges.filter((c) => want.has(c.id));
      const test = stage.test && want.has(stage.test.id) ? stage.test : null;
      for (const c of stage.challenges) judged.add(c.id);
      if (stage.test) judged.add(stage.test.id);
      if (lessons.length === 0 && !test) return;
      const states = applyProgress(list, {
        ...stats,
        completedChallenges: [...acc],
        unlockedStages: [...(stats.unlockedStages ?? []), stage.id]
      });
      if (states[i].state === 'Locked') {
        for (const c of lessons) drop.add(c.id);
        if (test) drop.add(test.id);
        return;
      }
      for (const c of lessons) {
        acc.add(c.id);
        keep.add(c.id);
      }
      if (test) {
        if (stage.challenges.every((c) => acc.has(c.id))) {
          acc.add(test.id);
          keep.add(test.id);
        } else {
          drop.add(test.id);
        }
      }
    });
  }

  const unique = [...new Set(incoming)].filter((id) => want.has(id));
  return {
    accepted: unique.filter((id) => keep.has(id) || !judged.has(id)),
    dropped: unique.filter((id) => drop.has(id))
  };
}
