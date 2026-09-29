/**
 * Test-out and placement in the browser: a guest's own engine, and the
 * words every learner reads about waiting (Phase 5).
 *
 * A signed-in learner's assessments run on the server
 * (server/assessment-routes.js). A guest has no account to record them on,
 * so their test-outs and placements run here with the very same rules
 * (src/platform/progress/access.ts): the same eligibility, limits and
 * cooldowns over a log kept in this browser (`cq-assessments-v1`), the same
 * record moving on after each test, and a pass written like the server
 * writes one - the test solved `via` the assessment, paid `xpForTestOut`,
 * the stage's `testedOut` record with `clears` from the record's rules. On
 * top, a pass keeps the answer that passed it (`stats.assessmentClaims`),
 * which goes up with the merge at sign-in so the server can check it again.
 *
 * Pure: every function takes `now` (or `at`) from its caller, so it can be
 * tested without a browser or a clock.
 */
import type { AssessmentClaim, AssessmentKind, AssessmentRecord, AssessmentView, Challenge, Stage, TestOutRecord, UserStats } from '@/types';
import {
  activeAssessment,
  advanceAssessment,
  assessmentRulesFor,
  assessmentView,
  normalizeAssessmentLog,
  placementEligibility,
  testOutEligibility,
  ASSESSMENT_RECORDS_KEPT
} from '../progress/access';
import type { AssessmentLog, PlacementEligibility, TestOutEligibility } from '../progress/access';
import type { StageStats } from '../progress/stages';
import type { PlacementSettings, TestOutSettings } from '../settings/types';
import { levelFromXp, rawScore, scoreSolve, xpForTestOut } from '../xp-leveling/leveling';
import type { LevelCurve, XpRules } from '../xp-leveling/leveling';
import { STORAGE_KEYS, readJson, writeJson } from '../storage/storage';

const MINUTE_MS = 60_000;

/** A guest's records carry this prefix; the server never issues one. */
export const LOCAL_ASSESSMENT_PREFIX = 'local-';

/** What to start: a test-out of one stage, or a placement on one track. */
export type AssessmentRequest = { kind: 'test-out'; stageId: string } | { kind: 'placement'; trackId: string };

/** One track as the path draws it: its id and its stages with their states. */
export interface TrackChain {
  trackId: string | null;
  stages: readonly Stage[];
}

/* ------------------------------------------------------------ the log */

/** This browser's (a guest's) test-outs and placements. */
export function readLocalAssessmentLog(): AssessmentLog {
  return normalizeAssessmentLog(readJson<unknown>(STORAGE_KEYS.assessments, null));
}

export function writeLocalAssessmentLog(log: AssessmentLog): void {
  writeJson(STORAGE_KEYS.assessments, { records: log.records.slice(-ASSESSMENT_RECORDS_KEPT), cooldownClearedAt: log.cooldownClearedAt });
}

/** The log with one record replaced (by id), or added at the end. */
export function withRecord(log: AssessmentLog, record: AssessmentRecord): AssessmentLog {
  const found = log.records.some((r) => r.id === record.id);
  const records = found ? log.records.map((r) => (r.id === record.id ? record : r)) : [...log.records, record];
  return { ...log, records: records.slice(-ASSESSMENT_RECORDS_KEPT) };
}

/** The track a stage is on (its chain), or the stage alone when it is on none. */
export function chainOf(chains: readonly TrackChain[], stageId: string): TrackChain | null {
  return chains.find((c) => c.stages.some((s) => s.id === stageId)) ?? null;
}

/* ------------------------------------------------------- eligibility */

/** A guest's test-out status for one stage, by the shared rules. */
export function localTestOutStatus(input: {
  stageId: string;
  chains: readonly TrackChain[];
  log: AssessmentLog;
  rules: TestOutSettings;
  stats: StageStats;
  now: Date;
}): TestOutEligibility | null {
  const chain = chainOf(input.chains, input.stageId);
  const stage = chain?.stages.find((s) => s.id === input.stageId);
  if (!chain || !stage) return null;
  return testOutEligibility({ stage, trackStages: chain.stages, log: input.log, rules: input.rules, stats: input.stats, now: input.now });
}

/** A guest's placement status on one track, by the shared rules. */
export function localPlacementStatus(input: {
  trackId: string;
  chains: readonly TrackChain[];
  log: AssessmentLog;
  rules: PlacementSettings;
  stats: StageStats;
  now: Date;
}): PlacementEligibility | null {
  const chain = input.chains.find((c) => c.trackId === input.trackId);
  if (!chain) return null;
  return placementEligibility({ trackId: input.trackId, trackStages: chain.stages, log: input.log, rules: input.rules, stats: input.stats, now: input.now });
}

/* ------------------------------------------------------------- start */

export type LocalStart =
  | { ok: true; record: AssessmentRecord; log: AssessmentLog }
  | { ok: false; reason: string; retryAt: string | null; active?: AssessmentRecord };

/**
 * Start a guest's test-out or placement, exactly as the server's start route
 * decides: one open at a time (`active-exists`), then the stage's (or the
 * track's) eligibility. The record copies its rules, and stays open for
 * `testOut.sessionMinutes` per stage test.
 */
export function startLocalAssessment(input: {
  request: AssessmentRequest;
  chains: readonly TrackChain[];
  log: AssessmentLog;
  settings: { testOut: TestOutSettings; placement: PlacementSettings; xp: XpRules };
  stats: StageStats;
  now: Date;
  id?: string;
}): LocalStart {
  const { request, chains, log, settings, stats, now } = input;
  const active = activeAssessment(log, now);
  if (active) return { ok: false, reason: 'active-exists', retryAt: null, active };

  let stageIds: string[];
  let trackId: string | null;
  if (request.kind === 'test-out') {
    const chain = chainOf(chains, request.stageId);
    const stage = chain?.stages.find((s) => s.id === request.stageId);
    if (!chain || !stage) return { ok: false, reason: 'unknown-stage', retryAt: null };
    const status = testOutEligibility({ stage, trackStages: chain.stages, log, rules: settings.testOut, stats, now });
    if (!status.allowed) return { ok: false, reason: status.reason ?? 'disabled', retryAt: status.retryAt };
    stageIds = [stage.id];
    trackId = chain.trackId;
  } else {
    const chain = chains.find((c) => c.trackId === request.trackId);
    if (!chain) return { ok: false, reason: 'unknown-track', retryAt: null };
    const status = placementEligibility({ trackId: request.trackId, trackStages: chain.stages, log, rules: settings.placement, stats, now });
    if (!status.eligible) return { ok: false, reason: status.reason ?? 'disabled', retryAt: status.retryAt };
    stageIds = status.queue;
    trackId = request.trackId;
  }

  const minutes = settings.testOut.sessionMinutes * stageIds.length;
  const record: AssessmentRecord = {
    id: input.id ?? `${LOCAL_ASSESSMENT_PREFIX}${now.getTime().toString(36)}`,
    kind: request.kind,
    trackId,
    stageIds,
    cursor: 0,
    status: 'active',
    results: {},
    rules: assessmentRulesFor(request.kind, settings),
    startedAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + minutes * MINUTE_MS).toISOString(),
    finishedAt: null
  };
  return { ok: true, record, log: withRecord(log, record) };
}

/* ----------------------------------------------------- after a test */

/**
 * The record after one of its tests: the result kept under the stage, and
 * the record moved on (`advanceAssessment`). A pass needs the raw score -
 * 100, less the retry and hint penalties - to reach the record's own pass
 * mark; hints where none are allowed never pass.
 */
export function recordLocalResult(
  record: AssessmentRecord,
  input: { stageId: string; correct: boolean; attempts: number; hintsUsed: number; xp: XpRules; at: string }
): { record: AssessmentRecord; passed: boolean; score: number } {
  const score = input.correct ? rawScore(input.attempts, input.hintsUsed, input.xp) : 0;
  const hintsOk = record.rules.hintsAllowed || input.hintsUsed === 0;
  const passed = input.correct && hintsOk && score >= record.rules.passMark;
  const result = { outcome: passed ? ('passed' as const) : ('failed' as const), runs: input.attempts, hintsUsed: input.hintsUsed, score, verified: false, at: input.at };
  const results: AssessmentRecord['results'] = {};
  for (const key of Object.keys(record.results)) Object.defineProperty(results, key, { value: record.results[key], enumerable: true, writable: true, configurable: true });
  Object.defineProperty(results, input.stageId, { value: result, enumerable: true, writable: true, configurable: true });
  return { record: { ...record, results, ...advanceAssessment(record, passed, input.at) }, passed, score };
}

/** A placement ended early by the learner. */
export function finishLocalAssessment(record: AssessmentRecord, at: string): AssessmentRecord {
  if (record.status !== 'active') return record;
  return { ...record, status: 'finished', finishedAt: at };
}

/**
 * A guest's pass, written onto their stats the way the server writes one
 * (server/progress-rules.js applySolveCore with `testOut`): the test solved
 * `via` the assessment and paid `xpForTestOut` (nothing when it was solved
 * before), the stage's `testedOut` record with `clears` from the record's
 * rules - and the answer that passed, kept as a claim for sign-in.
 */
export function withLocalPass(
  stats: UserStats,
  input: {
    challenge: Pick<Challenge, 'id' | 'stageId' | 'xpReward'>;
    stageId: string;
    record: Pick<AssessmentRecord, 'id' | 'kind' | 'rules'>;
    attempts: number;
    hintsUsed: number;
    submission: { code?: string; answer?: unknown };
    xp: XpRules;
    levels: LevelCurve;
    at: string;
  }
): { stats: UserStats; awarded: number; firstSolve: boolean } {
  const { challenge, stageId, record, attempts, hintsUsed, submission, xp, levels, at } = input;
  const firstSolve = !stats.completedChallenges.includes(challenge.id);
  const awarded = firstSolve ? xpForTestOut(challenge.xpReward, record.rules.xpPercent, attempts, hintsUsed, xp) : 0;
  const previous = Object.prototype.hasOwnProperty.call(stats.attempts, challenge.id) ? stats.attempts[challenge.id] : undefined;
  const kind: AssessmentKind = record.kind;
  const tested: TestOutRecord = { at, via: kind, clears: record.rules.clears === true, assessmentId: record.id };
  const claim: AssessmentClaim = {
    kind,
    stageId,
    testId: challenge.id,
    attempts,
    hintsUsed,
    ...(typeof submission.code === 'string' ? { code: submission.code } : {}),
    ...(submission.answer !== undefined ? { answer: submission.answer } : {}),
    at
  };
  const total = stats.xp + awarded;
  return {
    stats: {
      ...stats,
      xp: total,
      level: levelFromXp(total, levels),
      completedChallenges: firstSolve ? [...stats.completedChallenges, challenge.id] : stats.completedChallenges,
      attempts: {
        ...stats.attempts,
        [challenge.id]: {
          challengeId: challenge.id,
          score: Math.max(previous?.score ?? 0, scoreSolve(attempts, hintsUsed, xp)),
          attempts: (previous?.attempts ?? 0) + attempts,
          hintsUsed: (previous?.hintsUsed ?? 0) + hintsUsed,
          solvedAt: previous?.solvedAt || at,
          lastSolvedAt: at,
          solves: (typeof previous?.solves === 'number' ? previous.solves : previous ? 1 : 0) + 1,
          ...(previous?.via ? { via: previous.via } : firstSolve ? { via: kind } : {})
        }
      },
      testedOut: { ...(stats.testedOut ?? {}), [stageId]: tested },
      // Only a first solve is worth checking again: the server would refuse a test already solved.
      assessmentClaims: firstSolve ? { ...(stats.assessmentClaims ?? {}), [stageId]: claim } : stats.assessmentClaims
    },
    awarded,
    firstSolve
  };
}

/** A record as the learner sees it (the stage test it is on), at `now`. */
export function viewOf(record: AssessmentRecord, now: Date): AssessmentView {
  return assessmentView(record, now);
}

/* ------------------------------------------------------------ wording */

/**
 * "in 45 minutes", "in 3 hours", "tomorrow at 09:30", "on 12 Oct": when a
 * learner may try again, as the `{when}` of the admin's copy. Null when
 * there is nothing to wait for.
 */
export function describeRetry(retryAt: string | null | undefined, now: Date = new Date()): string | null {
  const t = typeof retryAt === 'string' ? Date.parse(retryAt) : NaN;
  if (!Number.isFinite(t)) return null;
  const ms = t - now.getTime();
  if (ms <= 0) return 'now';
  const minutes = Math.ceil(ms / MINUTE_MS);
  if (minutes < 60) return `in ${minutes} ${minutes === 1 ? 'minute' : 'minutes'}`;
  const hours = Math.round(minutes / 60);
  if (hours < 12) return `in ${hours} ${hours === 1 ? 'hour' : 'hours'}`;
  const at = new Date(t);
  const days = Math.round((startOfDay(at) - startOfDay(now)) / (24 * 60 * MINUTE_MS));
  const time = at.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  if (days <= 0) return `at ${time}`;
  if (days === 1) return `tomorrow at ${time}`;
  if (days < 7) return `in ${days} days`;
  return `on ${at.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}`;
}

function startOfDay(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

/**
 * Why a test-out or placement cannot start, as a learner reads it. `when`
 * fills a wait ("in 45 minutes").
 */
export function assessmentBlockText(reason: string | null | undefined, when: string | null = null): string {
  switch (reason) {
    case 'cooldown':
      return when ? `Take a short break - you can try again ${when}.` : 'Take a short break before trying again.';
    case 'limit':
      return when ? `You have used your test-outs for this stage for now. Try again ${when}.` : 'You have used your test-outs for this stage for now.';
    case 'premium':
      return 'This stage is part of a premium track you have not unlocked.';
    case 'not-reachable':
      return 'Test out of the first locked stage of this track first.';
    case 'already-cleared':
      return 'You have already cleared this stage.';
    case 'test-pending':
      return "You have finished this stage's lessons - take its test instead.";
    case 'no-test':
      return 'This stage has no test to take.';
    case 'nothing-to-place':
      return 'There is nothing left to place you in on this track.';
    case 'unverifiable':
      return 'This stage test cannot be checked on the server right now, so it cannot be tested out of.';
    case 'active-exists':
      return 'You already have a test running.';
    case 'offline':
      return 'Test-outs need a connection so the unlock is saved to your account.';
    default:
      return 'Test-out is not available for this stage.';
  }
}
