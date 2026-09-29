/**
 * Test-out and placement over HTTP (Phase 5).
 *
 *   GET  /api/assessments/status?trackId=
 *        -> { placement: { eligible, reason, retryAt, queue } | null,
 *             testOut: { [stageId]: { allowed, reason, retryAt, attemptsLeft } },
 *             active: AssessmentView | null }
 *   POST /api/assessments            { kind: 'test-out', stageId } | { kind: 'placement', trackId }
 *        -> 201 { assessment }
 *           409 { reason: 'active-exists', assessment }   one open at a time (offer Resume)
 *           429 { reason: 'cooldown' | 'limit', retryAt }
 *           403 { reason: 'premium' | 'not-reachable' | 'disabled' }
 *           409 { reason: 'already-cleared' | 'test-pending' | 'nothing-to-place' }
 *           404 an unknown stage or track (or a stage with no test: reason 'no-test')
 *           503 { reason: 'unverifiable' }   this server cannot check the test's answer (a
 *                                            placement: not even the first one in its queue)
 *   POST /api/assessments/:id/submit { stageId, attempts, hintsUsed, code? | answer? }
 *        -> 200 { assessment, passed, progress, awardedXp, ... }
 *           422 { reason: 'wrong' | 'hints-not-allowed' }   not counted - the run goes on
 *           503 { reason: 'unverifiable' | 'busy' }         not counted either
 *           409 { reason: 'expired' | 'not-active' | 'wrong-stage', assessment }
 *   POST /api/assessments/:id/fail   { stageId, reason: 'gave-up' | 'out-of-runs' } -> { assessment }
 *   POST /api/assessments/:id/finish                                                -> { assessment }
 *
 * The rules are the shared ones (src/platform/progress/access.ts, in `lib`):
 * who may start what, the limits and cooldowns, the placement queue and how
 * a record moves on. A record copies its rules when it starts (`rules`), so
 * an admin's change applies to the next one. A pass is recorded through the
 * solve route's own `applySolveCore` (server/progress-rules.js) - the test
 * solved `via` the assessment, paid `xpForTestOut`, the `testedOut` record
 * written with `clears` from the snapshot - then the day row, the streak and
 * the daily goal, exactly as a solve.
 *
 * Every route is the learner's own: a record id that is not theirs is a 404.
 * The log is kept apart from progress (`db.assessments`), so a progress
 * reset never resets a cooldown. Everything after the last `await` is
 * synchronous: the log, the progress row and the day are written in the
 * same tick.
 */
import crypto from 'node:crypto';
import express from 'express';
import { applySolveCore, clampCounts } from './progress-rules.js';
import { learnerAccess } from './progression.js';
import { BusyError } from './rate-limit.js';

const MINUTE_MS = 60_000;

const passThrough = (_req, _res, next) => next();
const asyncRoute = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

function plainObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function withEntry(map, key, value) {
  const out = {};
  for (const k of Object.keys(plainObject(map))) Object.defineProperty(out, k, { value: map[k], writable: true, enumerable: true, configurable: true });
  Object.defineProperty(out, key, { value, writable: true, enumerable: true, configurable: true });
  return out;
}

/** What each refusal to start says to the learner. */
const START_MESSAGES = {
  disabled: 'Test-out is not available for this stage.',
  premium: 'This stage is part of a premium track you have not unlocked.',
  'not-reachable': 'Test out of the first locked stage of this track first.',
  limit: 'You have used your test-outs for this stage for now.',
  cooldown: 'Take a short break before trying this stage again.',
  'no-test': 'This stage has no test to take.',
  'already-cleared': 'You have already cleared this stage.',
  'test-pending': "You have finished this stage's lessons - take its test instead.",
  'nothing-to-place': 'There is nothing left to place you in on this track.',
  'placement-disabled': 'Placement is not available right now.',
  'placement-cooldown': 'You can take the placement again later.'
};

/** 403 / 404 / 409 / 429 for an eligibility reason. */
function startStatus(reason) {
  if (reason === 'limit' || reason === 'cooldown') return 429;
  if (reason === 'disabled' || reason === 'premium' || reason === 'not-reachable') return 403;
  if (reason === 'no-test') return 404;
  return 409;
}

/**
 * @param {object} deps
 * @param {Function} deps.requireAuth
 * @param {object} deps.store  server/db.js
 * @param {{ lib, settings, activity, habits }} deps.learningDeps
 * @param {(id: string) => object | null} deps.getChallengeMerged
 * @param {(challenge, body) => Promise<{ ok, verified, reason }>} deps.verifySubmission
 * @param {(ids: string[], testedOut?: object) => string[]} deps.completedStagesFor
 * @param {(userId: string, challengeId: string) => void} deps.clearDraftForSolve
 * @param {() => ({ snapshot, overrides, premiumEnforced: boolean } | null)} deps.progressionContext
 *   the content the learner's stages are built from (null before it loads: 503)
 * @param {(challenge) => boolean} [deps.canVerify]  can this server check this test's answer itself?
 * @param {(user, progress) => void} [deps.onProgress]  after a pass is stored (the Excel mirror)
 * @param {Function} [deps.submitLimit]  the `solve.account` rate limit
 * @param {Function} [deps.writeLimit]   the `write.account` rate limit
 */
export function createAssessmentRouter({
  requireAuth,
  store,
  learningDeps,
  getChallengeMerged,
  verifySubmission,
  completedStagesFor,
  clearDraftForSolve,
  progressionContext,
  canVerify = () => true,
  onProgress = () => {},
  submitLimit = passThrough,
  writeLimit = passThrough
}) {
  const router = express.Router();

  /** The learner's log as it stands now: expired records settled (and stored when that changed anything). */
  function loadLog(user, now) {
    const { lib } = learningDeps;
    const log = lib.normalizeAssessmentLog(store.getAssessmentLog(user.id));
    const settled = lib.settleExpired(log.records, now);
    const next = { ...log, records: settled };
    if (settled.some((r, i) => r !== log.records[i])) saveLog(user, next);
    return next;
  }

  function saveLog(user, log) {
    const { lib } = learningDeps;
    store.putAssessmentLog(user.id, { records: log.records.slice(-lib.ASSESSMENT_RECORDS_KEPT), cooldownClearedAt: log.cooldownClearedAt });
  }

  function replaceRecord(log, record) {
    return { ...log, records: log.records.map((r) => (r.id === record.id ? record : r)) };
  }

  /** The learner's stages, or null before the content (or the rules) are loaded. */
  function accessFor(user, content) {
    const { lib } = learningDeps;
    if (!content || !lib) return null;
    return learnerAccess(user, store.getProgress(user.id), { lib, snapshot: content.snapshot, overrides: content.overrides });
  }

  const view = (record, now) => learningDeps.lib.assessmentView(record, now);
  const unavailable = (res) => res.status(503).json({ error: 'Test-outs are not available yet. Try again in a moment.', reason: 'unavailable' });

  /** A record of this learner's, by id - never anyone else's. */
  function findRecord(log, id) {
    return typeof id === 'string' ? log.records.find((r) => r.id === id) ?? null : null;
  }

  /** Is the test's answer something this server checks itself, when it must? */
  function verifiable(challenge) {
    const required = learningDeps.settings.current().access.requireServerVerification;
    return !required || canVerify(challenge);
  }

  /**
   * The start of a placement queue whose tests this server can check, up to
   * the first it cannot: a placement that reached a test no answer could be
   * accepted for would stall there until the learner gave up (and its retake
   * wait began). The stages after it stay for the path.
   */
  function checkableQueue(queue, access) {
    const out = [];
    for (const stageId of queue) {
      const stage = access.stage(stageId);
      const test = stage?.test ? getChallengeMerged(stage.test.id) : null;
      if (!test || !verifiable(test)) break;
      out.push(stageId);
    }
    return out;
  }

  /** A placement's eligibility with its queue cut to what can be checked (not eligible when nothing can). */
  function checkablePlacement(eligibility, access) {
    if (!eligibility.eligible) return eligibility;
    const queue = checkableQueue(eligibility.queue, access);
    return queue.length ? { ...eligibility, queue } : { eligible: false, reason: 'unverifiable', retryAt: null, queue: [] };
  }

  /* --------------------------------------------------------------- status */

  router.get('/assessments/status', requireAuth, (req, res) => {
    const { lib, settings } = learningDeps;
    const content = progressionContext?.();
    const access = accessFor(req.user, content);
    if (!access) return unavailable(res);
    const rules = settings.current();
    const now = new Date();
    const log = loadLog(req.user, now);
    const trackId = typeof req.query.trackId === 'string' && req.query.trackId ? req.query.trackId : null;
    const track = trackId ? access.tracks.find((t) => t.id === trackId) : null;
    if (trackId && !track) return res.status(404).json({ error: 'Unknown track.' });

    const stages = track ? access.trackOf(track.stageIds.find((id) => access.stage(id)) ?? '')?.stages ?? [] : access.stages;
    const testOut = {};
    for (const stage of stages) {
      const chain = access.trackOf(stage.id)?.stages ?? [stage];
      let eligibility = lib.testOutEligibility({ stage, trackStages: chain, log, rules: rules.testOut, stats: access.stats, now });
      if (eligibility.reason === 'premium' && content.premiumEnforced === false) {
        // The premium gate only logs: the stage is judged as bought, as the start route does.
        const bought = learnerAccess(req.user, store.getProgress(req.user.id), { lib, snapshot: content.snapshot, overrides: content.overrides, assumeUnlocked: stage.id });
        eligibility = lib.testOutEligibility({ stage: bought.stage(stage.id), trackStages: bought.trackOf(stage.id)?.stages ?? [stage], log, rules: rules.testOut, stats: bought.stats, now });
      }
      testOut[stage.id] = eligibility;
    }
    const placement = track
      ? checkablePlacement(lib.placementEligibility({ trackId: track.id, trackStages: stages, log, rules: rules.placement, stats: access.stats, now }), access)
      : null;
    const active = lib.activeAssessment(log, now);
    res.json({ placement, testOut, active: active ? view(active, now) : null });
  });

  /* ---------------------------------------------------------------- start */

  router.post('/assessments', requireAuth, writeLimit, (req, res) => {
    const { lib, settings } = learningDeps;
    const content = progressionContext?.();
    const access = accessFor(req.user, content);
    if (!access) return unavailable(res);
    const body = plainObject(req.body);
    const kind = body.kind;
    if (kind !== 'test-out' && kind !== 'placement') return res.status(400).json({ error: '`kind` must be "test-out" or "placement".' });

    const rules = settings.current();
    const now = new Date();
    const log = loadLog(req.user, now);
    const at = now.toISOString();

    let stageIds;
    let trackId;
    if (kind === 'test-out') {
      const stageId = typeof body.stageId === 'string' ? body.stageId : '';
      const stage = stageId ? access.stage(stageId) : null;
      if (!stage) return res.status(404).json({ error: 'Unknown stage.' });
      const chain = access.trackOf(stage.id);
      const active = lib.activeAssessment(log, now);
      if (active) return res.status(409).json({ error: 'You already have a test running.', reason: 'active-exists', assessment: view(active, now) });
      const eligibility = lib.testOutEligibility({ stage, trackStages: chain?.stages ?? [stage], log, rules: rules.testOut, stats: access.stats, now });
      if (eligibility.reason === 'premium' && content.premiumEnforced === false) {
        // The premium gate only logs: the stage is judged as bought.
        const bought = learnerAccess(req.user, store.getProgress(req.user.id), { lib, snapshot: content.snapshot, overrides: content.overrides, assumeUnlocked: stage.id });
        const again = lib.testOutEligibility({ stage: bought.stage(stage.id), trackStages: bought.trackOf(stage.id)?.stages ?? [stage], log, rules: rules.testOut, stats: bought.stats, now });
        if (!again.allowed) return refuse(res, again);
      } else if (!eligibility.allowed) {
        return refuse(res, eligibility);
      }
      const test = stage.test ? getChallengeMerged(stage.test.id) : null;
      if (!test) return res.status(404).json({ error: START_MESSAGES['no-test'], reason: 'no-test' });
      if (!verifiable(test)) {
        return res.status(503).json({ error: 'This server cannot check this stage test itself, so it cannot be tested out of here.', reason: 'unverifiable' });
      }
      stageIds = [stage.id];
      trackId = chain?.track?.id ?? null;
    } else {
      const wanted = typeof body.trackId === 'string' ? body.trackId : '';
      const track = wanted ? access.tracks.find((t) => t.id === wanted) : null;
      if (!track) return res.status(404).json({ error: 'Unknown track.' });
      const active = lib.activeAssessment(log, now);
      if (active) return res.status(409).json({ error: 'You already have a test running.', reason: 'active-exists', assessment: view(active, now) });
      const first = track.stageIds.find((id) => access.stage(id));
      const trackStages = first ? access.trackOf(first)?.stages ?? [] : [];
      const eligibility = checkablePlacement(lib.placementEligibility({ trackId: track.id, trackStages, log, rules: rules.placement, stats: access.stats, now }), access);
      if (!eligibility.eligible) {
        const reason = eligibility.reason;
        if (reason === 'unverifiable') {
          return res.status(503).json({ error: 'This server cannot check the placement tests on this track itself, so the placement is not available here.', reason });
        }
        if (reason === 'disabled') return res.status(403).json({ error: START_MESSAGES['placement-disabled'], reason });
        if (reason === 'cooldown') return res.status(429).json({ error: START_MESSAGES['placement-cooldown'], reason, retryAt: eligibility.retryAt });
        return res.status(409).json({ error: START_MESSAGES[reason] ?? START_MESSAGES['nothing-to-place'], reason });
      }
      stageIds = eligibility.queue;
      trackId = track.id;
    }

    const minutes = rules.testOut.sessionMinutes * stageIds.length;
    const record = {
      id: `as_${crypto.randomBytes(8).toString('hex')}`,
      kind,
      trackId,
      stageIds,
      cursor: 0,
      status: 'active',
      results: {},
      rules: lib.assessmentRulesFor(kind, rules),
      startedAt: at,
      expiresAt: new Date(now.getTime() + minutes * MINUTE_MS).toISOString(),
      finishedAt: null
    };
    saveLog(req.user, { ...log, records: [...log.records, record] });
    res.status(201).json({ assessment: view(record, now) });
  });

  function refuse(res, eligibility) {
    const reason = eligibility.reason ?? 'disabled';
    const payload = { error: START_MESSAGES[reason] ?? START_MESSAGES.disabled, reason };
    if (eligibility.retryAt) payload.retryAt = eligibility.retryAt;
    return res.status(startStatus(reason)).json(payload);
  }

  /**
   * The record behind `:id`, still open and on `stageId` - or the answer that
   * says why not (404 not theirs, 409 expired / over / another stage).
   */
  function openRecord(req, res, now, stageId) {
    const log = loadLog(req.user, now);
    const record = findRecord(log, req.params.id);
    if (!record) {
      res.status(404).json({ error: 'No such test.' });
      return null;
    }
    if (record.status !== 'active') {
      const reason = record.status === 'expired' ? 'expired' : 'not-active';
      res.status(409).json({ error: reason === 'expired' ? 'The time for this test ran out.' : 'This test is over.', reason, assessment: view(record, now) });
      return null;
    }
    const current = record.stageIds[record.cursor];
    if (stageId !== undefined && stageId !== current) {
      res.status(409).json({ error: 'That is not the test this run is on.', reason: 'wrong-stage', assessment: view(record, now) });
      return null;
    }
    return { log, record, current };
  }

  /* --------------------------------------------------------------- submit */

  router.post(
    '/assessments/:id/submit',
    requireAuth,
    submitLimit,
    asyncRoute(async (req, res) => {
      const { lib, settings } = learningDeps;
      const content = progressionContext?.();
      if (!content || !lib) return unavailable(res);
      const body = plainObject(req.body);
      const stageId = typeof body.stageId === 'string' ? body.stageId : '';
      const { attempts, hintsUsed } = clampCounts(body.attempts, body.hintsUsed, settings.current().xp);

      const opened = openRecord(req, res, new Date(), stageId);
      if (!opened) return;
      const { record } = opened;
      const access = accessFor(req.user, content);
      const stage = access?.stage(opened.current);
      const challenge = stage?.test ? getChallengeMerged(stage.test.id) : null;
      if (!challenge) return res.status(409).json({ error: 'This stage test is not available any more.', reason: 'unavailable', assessment: view(record, new Date()) });
      if (content.premiumEnforced !== false && lib.isPremiumLocked(stage, access.stats)) {
        return res.status(403).json({ error: START_MESSAGES.premium, reason: 'premium' });
      }
      // Not counted against the learner: the run goes on.
      if (!record.rules.hintsAllowed && hintsUsed > 0) {
        return res.status(422).json({ error: 'Hints are not allowed in this test.', reason: 'hints-not-allowed' });
      }
      if (!verifiable(challenge)) {
        return res.status(503).json({ error: 'This server cannot check this stage test itself right now.', reason: 'unverifiable' });
      }

      let verdict;
      try {
        verdict = await verifySubmission(challenge, body);
      } catch (err) {
        if (!(err instanceof BusyError)) throw err;
        return res.status(503).json({ error: 'The code runner is busy - try again in a moment.', reason: 'busy' });
      }
      if (!verdict.ok) return res.status(422).json({ error: 'That is not right yet.', reason: 'wrong' });
      if (settings.current().access.requireServerVerification && !verdict.verified) {
        return res.status(503).json({ error: 'This server cannot check this stage test itself right now.', reason: 'unverifiable' });
      }

      // From here on, synchronous: the record is read again (another tab may
      // have moved it on while the answer was being checked).
      const now = new Date();
      const again = openRecord(req, res, now, stageId);
      if (!again) return;
      const { log, record: live } = again;
      const rules = settings.current();
      const at = now.toISOString();
      const score = lib.rawScore(attempts, hintsUsed, rules.xp);
      const passed = score >= live.rules.passMark;
      const result = { outcome: passed ? 'passed' : 'failed', runs: attempts, hintsUsed, score, verified: Boolean(verdict.verified), at };
      const moved = { ...live, results: withEntry(live.results, stageId, result), ...lib.advanceAssessment(live, passed, at) };

      if (!passed) {
        // A correct answer that took too many runs: this test is not passed.
        saveLog(req.user, replaceRecord(log, moved));
        return res.json({ assessment: view(moved, now), passed: false, awardedXp: 0, progress: store.getProgress(req.user.id) });
      }

      const { activity, habits } = learningDeps;
      activity.captureZone(req, req.user, now);
      const progress = store.getProgress(req.user.id);
      const today = activity.todayFor(req.user, progress, now);
      const solved = applySolveCore({
        progress,
        challenge,
        attempts,
        hintsUsed,
        now,
        lib,
        xp: rules.xp,
        levels: rules.levels,
        completedStagesFor,
        testOut: { stageId, via: live.kind, clears: live.rules.clears, assessmentId: live.id, xpPercent: live.rules.xpPercent }
      });
      const dayRow = activity.recordSolve(req.user, {
        challengeId: challenge.id,
        isTest: true,
        firstSolve: solved.firstSolve,
        awardedXp: solved.awarded,
        unitCompleted: false,
        perfectBonusXp: 0,
        day: today,
        at
      });
      const habitsResult = habits.recordSolveHabits({ user: req.user, progress: solved.next, today, dayRow, now });
      const stored = habitsResult.next;
      store.setProgress(req.user.id, stored);
      saveLog(req.user, replaceRecord(log, moved));
      clearDraftForSolve(req.user.id, challenge.id);
      onProgress(req.user, stored);

      res.json({
        assessment: view(moved, now),
        passed: true,
        progress: stored,
        awardedXp: solved.awarded,
        bonusXp: habitsResult.bonusXp,
        settingsRevision: settings.revision(),
        today: habitsResult.today,
        habits: habits.habitSummary(req.user, stored, now),
        habitEvents: habitsResult.habitEvents
      });
    })
  );

  /* ----------------------------------------------------------------- fail */

  router.post('/assessments/:id/fail', requireAuth, writeLimit, (req, res) => {
    const { lib } = learningDeps;
    const body = plainObject(req.body);
    const reason = body.reason;
    if (reason !== 'gave-up' && reason !== 'out-of-runs') return res.status(400).json({ error: '`reason` must be "gave-up" or "out-of-runs".' });
    const stageId = typeof body.stageId === 'string' ? body.stageId : '';
    const now = new Date();
    const opened = openRecord(req, res, now, stageId);
    if (!opened) return;
    const { log, record } = opened;
    const at = now.toISOString();
    const runs = Math.max(0, Math.min(50, Math.floor(Number(body.runs)) || 0));
    const result = { outcome: 'failed', runs, hintsUsed: 0, score: 0, verified: false, at, reason };
    const moved = { ...record, results: withEntry(record.results, stageId, result), ...lib.advanceAssessment(record, false, at) };
    saveLog(req.user, replaceRecord(log, moved));
    res.json({ assessment: view(moved, now) });
  });

  /* --------------------------------------------------------------- finish */

  router.post('/assessments/:id/finish', requireAuth, writeLimit, (req, res) => {
    const now = new Date();
    const opened = openRecord(req, res, now, undefined);
    if (!opened) return;
    const { log, record } = opened;
    if (record.kind !== 'placement') return res.status(400).json({ error: 'Only a placement can be finished early.', reason: 'not-a-placement' });
    const moved = { ...record, status: 'finished', finishedAt: now.toISOString() };
    saveLog(req.user, replaceRecord(log, moved));
    res.json({ assessment: view(moved, now) });
  });

  return router;
}

/**
 * An admin's "Clear test-out cooldowns" for one learner: every attempt and
 * cooldown before now is forgotten for `stageId`, or for everything (`*`,
 * placements included) when none is given. Returns the stored log. The
 * admin route and its audit entry are built on this.
 */
export function clearAssessmentCooldown(store, lib, userId, stageId = null, now = new Date()) {
  const log = lib.normalizeAssessmentLog(store.getAssessmentLog(userId));
  const key = typeof stageId === 'string' && stageId ? stageId : '*';
  const next = { records: log.records, cooldownClearedAt: withEntry(log.cooldownClearedAt, key, now.toISOString()) };
  store.putAssessmentLog(userId, next);
  return next;
}

/* ------------------------------------------------------------------ admin */

/** The newest assessments the admin's Users drawer lists. */
export const ADMIN_ASSESSMENTS_SHOWN = 20;

/**
 * One learner's first-run setup and test-outs, for the admin's Users drawer
 * (`GET /api/admin/users/:id/learning` -> `setup`): whether the setup was
 * finished or dismissed, its answers, the stages tested out of, the newest
 * assessments (their stages and results) and the cooldowns an admin cleared.
 * `stageName(id)` names a stage for the list (its id when unknown).
 */
export function assessmentAdminView(store, lib, user, { stageName = (id) => id, now = new Date() } = {}) {
  const prefs = typeof store.normalizePreferences === 'function' ? store.normalizePreferences(user.preferences) : plainObject(user.preferences);
  const onboarding = typeof store.normalizeOnboarding === 'function' ? store.normalizeOnboarding(user.onboarding) : null;
  const progress = store.getProgress(user.id);
  const testedOut = Object.entries(lib.normalizeTestedOut(progress.testedOut))
    .map(([stageId, record]) => ({ stageId, name: stageName(stageId), at: record.at, via: record.via, clears: record.clears }))
    .sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
  const log = lib.normalizeAssessmentLog(typeof store.getAssessmentLog === 'function' ? store.getAssessmentLog(user.id) : null);
  const assessments = lib
    .settleExpired(log.records, now)
    .slice(-ADMIN_ASSESSMENTS_SHOWN)
    .reverse()
    .map((r) => ({
      id: r.id,
      kind: r.kind,
      trackId: r.trackId ?? null,
      status: r.status,
      startedAt: r.startedAt,
      finishedAt: r.finishedAt ?? null,
      passMark: r.rules?.passMark ?? null,
      stages: r.stageIds.map((stageId) => {
        const result = Object.hasOwn(plainObject(r.results), stageId) ? r.results[stageId] : null;
        return { stageId, name: stageName(stageId), outcome: result?.outcome ?? null, runs: result?.runs ?? null, score: result?.score ?? null };
      })
    }));
  return {
    onboarding,
    answers: {
      motivation: prefs.motivation ?? null,
      experience: prefs.experience ?? null,
      trackId: prefs.trackId ?? null,
      learningMode: prefs.learningMode ?? null
    },
    testedOut,
    assessments,
    cooldownClearedAt: log.cooldownClearedAt
  };
}

function median(values) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * The first-run setup and placement across every account (guests are not
 * counted - their answers never reach the server), for the admin's
 * Analytics card (`GET /api/admin/analytics/onboarding`):
 *   setup       finished, dismissed, not yet (and of those, how many have
 *               progress - never sent to it), out of every account
 *   answers     counts per motivation and experience answer, in the admin's
 *               order and words; an answer the admin removed is "other"
 *   placements  started, still running, ended, and the median stages each
 *               ended placement marked as tested out
 *   testOuts    per stage: test-outs taken, passed, and the pass rate
 */
export function onboardingAnalytics({ users, progressOf, logOf, lib, settings, stageName = (id) => id, now = new Date() }) {
  const setup = { accounts: users.length, completed: 0, dismissed: 0, notYet: 0, notYetWithProgress: 0 };
  const motivationOptions = settings.onboarding.motivation.options;
  const known = new Set(motivationOptions.map((o) => o.id));
  const motivation = new Map(motivationOptions.map((o) => [o.id, 0]));
  let otherMotivation = 0;
  let noMotivation = 0;
  const levels = ['new', 'some', 'experienced'];
  const experience = new Map(levels.map((id) => [id, 0]));
  let noExperience = 0;
  const placements = { started: 0, active: 0, ended: 0, stagesPlaced: [] };
  const perStage = new Map();

  for (const user of users) {
    const onboarding = user.onboarding && typeof user.onboarding === 'object' ? user.onboarding : null;
    if (onboarding?.completedAt) setup.completed += 1;
    else if (onboarding?.dismissedAt) setup.dismissed += 1;
    else {
      setup.notYet += 1;
      if ((progressOf(user.id)?.completedChallenges ?? []).length > 0) setup.notYetWithProgress += 1;
    }
    const prefs = plainObject(user.preferences);
    if (typeof prefs.motivation === 'string' && prefs.motivation) {
      if (known.has(prefs.motivation)) motivation.set(prefs.motivation, motivation.get(prefs.motivation) + 1);
      else otherMotivation += 1;
    } else noMotivation += 1;
    if (levels.includes(prefs.experience)) experience.set(prefs.experience, experience.get(prefs.experience) + 1);
    else noExperience += 1;

    const log = lib.normalizeAssessmentLog(logOf(user.id));
    for (const record of lib.settleExpired(log.records, now)) {
      const passed = record.stageIds.filter((id) => Object.hasOwn(plainObject(record.results), id) && record.results[id]?.outcome === 'passed');
      if (record.kind === 'placement') {
        placements.started += 1;
        if (record.status === 'active') placements.active += 1;
        else {
          placements.ended += 1;
          placements.stagesPlaced.push(passed.length);
        }
        continue;
      }
      if (record.status === 'active') continue;
      const stageId = record.stageIds[0];
      if (!stageId) continue;
      const row = perStage.get(stageId) ?? { stageId, name: stageName(stageId), attempts: 0, passed: 0 };
      row.attempts += 1;
      if (record.status === 'passed' || passed.length > 0) row.passed += 1;
      perStage.set(stageId, row);
    }
  }

  const experienceOptions = settings.onboarding.experience.options;
  return {
    setup,
    answers: {
      motivation: [
        ...motivationOptions.map((o) => ({ id: o.id, label: o.label, count: motivation.get(o.id) ?? 0 })),
        { id: 'other', label: 'Other (an answer since removed)', count: otherMotivation }
      ],
      noMotivation,
      experience: levels.map((id) => ({ id, label: experienceOptions[id]?.label ?? id, count: experience.get(id) ?? 0 })),
      noExperience
    },
    placements: { started: placements.started, active: placements.active, ended: placements.ended, medianStagesPlaced: median(placements.stagesPlaced) },
    testOuts: [...perStage.values()]
      .map((row) => ({ ...row, passRate: row.attempts ? Math.round((row.passed / row.attempts) * 100) : 0 }))
      .sort((a, b) => b.attempts - a.attempts || a.stageId.localeCompare(b.stageId))
  };
}
