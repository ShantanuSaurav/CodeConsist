/**
 * The progress routes: a learner's row, a solve, a guest merge and a reset.
 *
 * Moved out of server/index.js (which binds a port the moment it is
 * imported) so they can be tested over HTTP like server/drafts-routes.js.
 * The rules themselves are in server/progress-rules.js; this file is the
 * order they run in:
 *
 *   solve:  rate limit (solve.account) -> parse + clamp -> unknown? 404 ->
 *           may this learner solve it at all (premium)? 403 - before any
 *           code runs -> verify the submission (the only await; code runs in
 *           an execution slot, 503 when they are all busy) -> pass mark? 422
 *           -> capture the zone, pick the learner's day -> score, pay, record
 *           -> the day row -> streak -> level -> persist, drop the draft, Excel
 *   merge:  premium filter on the new ids (-> skippedLocked) -> capture the
 *           zone -> re-price the new ids -> merge the activity log -> clamp
 *           the streak -> level -> persist
 *
 * Everything after the last `await` is synchronous, so progress and the
 * activity log are written in the same tick and two requests cannot
 * interleave between a read and its write.
 *
 * `learningDeps` ({ lib, settings, activity }) is read per request: it is
 * filled in by server/index.js's bootstrap, after this router is mounted.
 */
import express from 'express';
import { applySolveCore, mergeCore, parseSolveBody, recalcProgress, resetProgress } from './progress-rules.js';
import { BusyError } from './rate-limit.js';

const passThrough = (_req, _res, next) => next();

/** A piece of site copy from the settings service, or the given words before it exists. */
function copyOr(learningDeps, key, vars, fallback) {
  const text = learningDeps.settings?.copyText?.(key, vars);
  return text || fallback;
}

const asyncRoute = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

/** A learner's progress with level and streak as they stand on their own today. */
export function recalcForUser({ store, learningDeps }, user, now = new Date()) {
  const { lib, settings, activity } = learningDeps;
  const progress = store.getProgress(user.id);
  const today = activity.todayFor(user, progress, now);
  return recalcProgress(progress, { lib, levels: settings.current().levels, today });
}

/**
 * @param {object} deps
 * @param {Function} deps.requireAuth
 * @param {object} deps.store  server/db.js
 * @param {{ lib, settings, activity }} deps.learningDeps
 * @param {(id: string) => object | null} deps.getChallenge        raw lookup (does the id exist at all?)
 * @param {(id: string) => object | null} deps.getChallengeMerged  with live admin edits applied
 * @param {(challenge, body) => Promise<{ ok, verified, reason }>} deps.verifySubmission
 * @param {(ids: string[]) => string[]} deps.completedStagesFor
 * @param {(userId: string, challengeId: string) => void} deps.clearDraftForSolve
 * @param {(user, progress) => void} [deps.onProgress]  after a solve is stored (the Excel mirror)
 * @param {Function} [deps.solveLimit]  the `solve.account` rate limit (server/rate-limit.js)
 * @param {(user, challenge) => { ok: boolean, reason?: string, stageId?: string }} [deps.checkSolveAccess]
 *   server/progression.js: may this learner solve it at all? Checked before any code runs.
 * @param {(user) => { allows: (challenge) => boolean } | null} [deps.mergeAccess]
 *   server/progression.js: which merged ids may be credited (the rest come back as `skippedLocked`).
 */
export function createProgressRouter({
  requireAuth,
  store,
  learningDeps,
  getChallenge,
  getChallengeMerged,
  verifySubmission,
  completedStagesFor,
  clearDraftForSolve,
  onProgress = () => {},
  solveLimit = passThrough,
  checkSolveAccess = () => ({ ok: true }),
  mergeAccess = () => null
}) {
  const router = express.Router();

  router.get('/progress', requireAuth, (req, res) => {
    res.json({ progress: recalcForUser({ store, learningDeps }, req.user) });
  });

  /**
   * Record a solve. The server owns both the verdict and the XP maths: the
   * client says WHICH challenge, WHAT it answered, and how much help it took -
   * never whether it was right and never how much XP it earned.
   */
  router.post(
    '/progress/solve',
    requireAuth,
    solveLimit,
    asyncRoute(async (req, res) => {
      const { lib, settings, activity } = learningDeps;
      const input = parseSolveBody(req.body, settings.current().xp);

      const challenge = getChallengeMerged(input.challengeId);
      if (!challenge) return res.status(404).json({ error: 'Unknown challenge.' });

      // A premium lesson this learner has not unlocked is refused before any
      // of their code is run.
      const access = checkSolveAccess(req.user, challenge);
      if (!access.ok) {
        return res.status(403).json({
          error: copyOr(learningDeps, 'premium.lockedSolve', {}, 'This lesson is part of a premium stage.'),
          reason: access.reason ?? 'premium-locked',
          stageId: access.stageId ?? challenge.stageId
        });
      }

      let verdict;
      try {
        verdict = await verifySubmission(challenge, req.body ?? {});
      } catch (err) {
        if (!(err instanceof BusyError)) throw err;
        // Every code-runner slot is taken. Nothing was recorded; the learner
        // can submit again in a moment.
        return res.status(503).json({ error: copyOr(learningDeps, 'limits.busy', {}, 'The code runner is busy - try again in a moment.'), reason: 'busy' });
      }
      if (!verdict.ok) {
        return res.status(422).json({ error: 'That submission does not solve the challenge.', reason: verdict.reason });
      }

      // From here on, synchronous. The rules are read AFTER the await, so an
      // admin's change applies to the very next solve.
      const rules = settings.current();

      // A correct answer below the pass mark does not complete the lesson.
      if (!lib.isPassingSolve(input.attempts, input.hintsUsed, rules.xp)) {
        return res.status(422).json({
          error: `Correct, but below the pass mark of ${rules.xp.passScore}%. Retry the lesson for a fresh attempt.`,
          reason: 'below-pass-mark',
          score: lib.rawScore(input.attempts, input.hintsUsed, rules.xp)
        });
      }

      const now = new Date();
      activity.captureZone(req, req.user, now);
      const progress = store.getProgress(req.user.id);
      const today = activity.todayFor(req.user, progress, now);

      const { next, awarded, score, firstSolve } = applySolveCore({
        progress,
        challenge,
        attempts: input.attempts,
        hintsUsed: input.hintsUsed,
        today,
        now,
        lib,
        xp: rules.xp,
        levels: rules.levels,
        completedStagesFor
      });

      const todayRow = activity.recordSolve(req.user, {
        challengeId: challenge.id,
        isTest: Boolean(challenge.isStageTest),
        firstSolve,
        awardedXp: awarded,
        day: today,
        at: now.toISOString()
      });

      store.setProgress(req.user.id, next);

      // The lesson is solved, so the half-finished attempt is no longer work in
      // progress - see server/drafts-routes.js, which owns that rule.
      clearDraftForSolve(req.user.id, challenge.id);
      onProgress(req.user, next);

      res.json({
        progress: next,
        awardedXp: awarded,
        score,
        firstSolve,
        verified: verdict.verified,
        settingsRevision: settings.revision(),
        today: todayRow
      });
    })
  );

  /**
   * Merge a guest's local progress (and activity) into the account they just
   * signed into - or this account's own offline copy. Body:
   * `{ progress, activity? }`; see progress-rules.js's mergeCore for what is
   * and is not believed. A solve in a premium stage this account has not
   * unlocked is not credited; its id comes back in `skippedLocked`.
   */
  router.post('/progress/merge', requireAuth, (req, res) => {
    const { lib, settings, activity } = learningDeps;
    const rules = settings.current();
    const now = new Date();

    const gate = mergeAccess(req.user);

    activity.captureZone(req, req.user, now);
    const current = store.getProgress(req.user.id);
    const today = activity.todayFor(req.user, current, now);

    const { merged, newIds, awarded, credits, skippedLocked } = mergeCore({
      current,
      incoming: req.body?.progress,
      lib,
      settings: rules,
      getChallenge,
      getChallengeMerged,
      completedStagesFor,
      zone: activity.zoneFor(req.user),
      today,
      now,
      allows: gate ? (challenge) => gate.allows(challenge) : undefined
    });

    activity.merge(req.user, req.body?.activity, { credits, today, now });
    store.setProgress(req.user.id, merged);

    res.json({
      // Level and streak as they stand on the learner's today, like GET
      // /progress: the browser adopts this streak as it is, rather than
      // judging it against a day of its own.
      progress: recalcForUser({ store, learningDeps }, req.user, now),
      mergedChallenges: newIds.length,
      awardedXp: awarded,
      activity: activity.view(req.user, { now }),
      ...(skippedLocked.length ? { skippedLocked } : {})
    });
  });

  /**
   * Start over. XP, solves and attempts go; so do the recorded wrong answers.
   * The days stay - they are history, and keeping them stops a reset from
   * being a way to farm a day twice.
   */
  router.post('/progress/reset', requireAuth, (req, res) => {
    const fresh = resetProgress(store.EMPTY_PROGRESS);
    store.setProgress(req.user.id, fresh);
    learningDeps.activity.reset(req.user);
    res.json({ progress: fresh });
  });

  return router;
}
