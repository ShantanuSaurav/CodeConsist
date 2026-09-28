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
 *           (not for a question requeued after a miss) -> capture the zone,
 *           pick the learner's day -> score (capped when the answer was shown
 *           first), pay, record
 *           -> a unit completed? its perfect bonus -> the day row -> streak,
 *           freezes, repair and the daily goal (server/habits.js; the goal
 *           bonus once a day) -> level -> persist, drop the draft, Excel
 *   merge:  premium filter on the new ids (-> skippedLocked) -> capture the
 *           zone -> re-price the new ids -> bonuses for units the new ids
 *           complete -> merge the activity log -> adopt the guest's
 *           preferences where the account has none -> the streak (a new
 *           account adopts the guest's; an existing one replays the merged
 *           days, paying their goal bonuses) -> the Practice schedule and
 *           review log (newer entries win; right answers priced again under
 *           the daily cap, no session bonus) -> level -> persist
 *
 * Everything after the last `await` is synchronous, so progress and the
 * activity log are written in the same tick and two requests cannot
 * interleave between a read and its write.
 *
 * `learningDeps` ({ lib, settings, activity, units, habits, review }) is read per request:
 * it is filled in by server/index.js's bootstrap, after this router is mounted.
 */
import express from 'express';
import { applySolveCore, applySolveRewards, bonusesOf, mergeCore, parseSolveBody, recalcProgress, resetProgress, scoreCapFor } from './progress-rules.js';
import { adoptGuestPreferences, publicPreferences } from './preferences-routes.js';
import { BusyError } from './rate-limit.js';

/** The server's unit lookup (server/units.js), or null before boot / in a bare test. */
function unitLookup(learningDeps) {
  const units = learningDeps.units;
  return units ? (id) => units.unitFor(id) : null;
}

const passThrough = (_req, _res, next) => next();

/** A piece of site copy from the settings service, or the given words before it exists. */
function copyOr(learningDeps, key, vars, fallback) {
  const text = learningDeps.settings?.copyText?.(key, vars);
  return text || fallback;
}

const asyncRoute = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

/**
 * A learner's progress with level and streak as they stand on their own
 * today: the missed days since their last streak day worked out (freezes
 * used, a broken run and its repair offer), nothing written.
 */
export function recalcForUser({ store, learningDeps }, user, now = new Date()) {
  const { lib, settings, activity, habits } = learningDeps;
  const progress = store.getProgress(user.id);
  const today = activity.todayFor(user, progress, now);
  return recalcProgress(progress, { lib, levels: settings.current().levels, today, habits });
}

/** The derived streak and goal status for a response, or undefined before the habits service exists. */
export function habitsForUser({ store, learningDeps }, user, now = new Date()) {
  const habits = learningDeps.habits;
  return habits ? habits.habitSummary(user, store.getProgress(user.id), now) : undefined;
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
    res.json({ progress: recalcForUser({ store, learningDeps }, req.user), habits: habitsForUser({ store, learningDeps }, req.user) });
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
      const { lib, settings, activity, habits } = learningDeps;
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

      // A correct answer below the pass mark does not complete the lesson -
      // unless the question came back at the end of the unit after a miss
      // (`requeued`): then it is the learner finishing it, and the score
      // (floored, and capped when the answer was shown) says how it went.
      if (!input.requeued && !lib.isPassingSolve(input.attempts, input.hintsUsed, rules.xp)) {
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

      const solved = applySolveCore({
        progress,
        challenge,
        attempts: input.attempts,
        hintsUsed: input.hintsUsed,
        now,
        lib,
        xp: rules.xp,
        levels: rules.levels,
        completedStagesFor,
        cap: scoreCapFor(input, rules.feedback, lib)
      });
      const { awarded, score, firstSolve } = solved;

      // Did this first solve complete a unit? Then its record, and the
      // perfect-unit bonus when every lesson in it was clean.
      const { next, reward } = applySolveRewards({
        progress,
        next: solved.next,
        challengeId: challenge.id,
        firstSolve,
        now,
        lib,
        units: rules.units,
        levels: rules.levels,
        unitFor: unitLookup(learningDeps)
      });

      const dayRow = activity.recordSolve(req.user, {
        challengeId: challenge.id,
        isTest: Boolean(challenge.isStageTest),
        firstSolve,
        awardedXp: awarded,
        unitCompleted: Boolean(reward),
        perfectBonusXp: reward?.bonusXp ?? 0,
        day: today,
        at: now.toISOString()
      });

      // The streak and the daily goal (step 11): settle the missed days,
      // count towards a repair, count today, and pay the goal bonus the
      // first time today's goal is met.
      const habitsResult = habits.recordSolveHabits({ user: req.user, progress: next, today, dayRow, now });
      const stored = habitsResult.next;
      const todayRow = habitsResult.today;

      store.setProgress(req.user.id, stored);

      // The lesson is solved, so the half-finished attempt is no longer work in
      // progress - see server/drafts-routes.js, which owns that rule.
      clearDraftForSolve(req.user.id, challenge.id);
      onProgress(req.user, stored);

      const goalBonuses = habitsResult.bonusXp > 0 ? [{ kind: 'daily-goal', day: today, xp: habitsResult.bonusXp }] : [];
      res.json({
        progress: stored,
        // Solve XP only, as always; bonuses are reported beside it.
        awardedXp: awarded,
        score,
        firstSolve,
        verified: verdict.verified,
        settingsRevision: settings.revision(),
        today: todayRow,
        bonuses: [...bonusesOf(reward ? [reward] : []), ...goalBonuses],
        // Every bonus this solve paid: the perfect unit's and the daily goal's.
        bonusXp: (reward?.bonusXp ?? 0) + habitsResult.bonusXp,
        unitCompleted: reward?.unitId ?? null,
        unitPerfect: Boolean(reward?.perfect),
        habits: habits.habitSummary(req.user, stored, now),
        habitEvents: habitsResult.habitEvents
      });
    })
  );

  /**
   * Merge a guest's local progress (and activity) into the account they just
   * signed into - or this account's own offline copy. Body:
   * `{ progress, activity?, preferences?, habit?, reviewLog? }`; see
   * progress-rules.js's mergeCore for what is and is not believed, and
   * review-routes.js's mergeFor for the Practice schedule (`progress.review`)
   * and the review log. A solve in a premium stage this account has not
   * unlocked is not credited; its id comes back in `skippedLocked`.
   */
  router.post('/progress/merge', requireAuth, (req, res) => {
    const { lib, settings, activity, habits } = learningDeps;
    const rules = settings.current();
    const now = new Date();

    const gate = mergeAccess(req.user);

    activity.captureZone(req, req.user, now);
    const current = store.getProgress(req.user.id);
    const today = activity.todayFor(req.user, current, now);

    const { merged, newIds, awarded, bonusXp, unitRewards, credits, skippedLocked } = mergeCore({
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
      allows: gate ? (challenge) => gate.allows(challenge) : undefined,
      unitFor: unitLookup(learningDeps)
    });

    activity.merge(req.user, req.body?.activity, { credits, today, now });

    // A guest's own choices (sound on or off, their daily goal) come along -
    // but never over one the account already made. Adopted before the
    // streak step, so the days it replays are judged against that goal.
    let user = req.user;
    const adopt = adoptGuestPreferences(store.normalizePreferences?.(user.preferences) ?? user.preferences, req.body?.preferences, {
      goals: rules.goals,
      isGoalOptionAvailable: lib.isGoalOptionAvailable
    });
    if (adopt) {
      const prefs = store.normalizePreferences(user.preferences);
      user = store.updateUser(user.id, { preferences: { ...prefs, ...adopt, updatedAt: now.toISOString() } }) ?? user;
    }

    // Practice (step 7, run before the streak): the newer schedule entries,
    // and the review log's right answers priced again here - under the daily
    // cap, never a bonus. The answers it pays are the only Practice answers
    // on the merged days, so the goal the streak step replays below counts
    // server-priced answers only (never a count the browser sent).
    const reviewed = learningDeps.review
      ? learningDeps.review.mergeFor({ user, progress: merged, incoming: req.body?.progress?.review, reviewLog: req.body?.reviewLog, today, now })
      : { next: merged, awardedXp: 0, credits: [] };

    // The streak (step 6): a new account adopts the guest's habit; an
    // existing one keeps its own and replays the merged days - the days a
    // solve or a Practice answer was credited on (a right Practice answer
    // counts for the streak, as it does live). Goal bonuses come only from here.
    const withHabits = habits.mergeHabitsFor({
      user,
      current,
      merged: reviewed.next,
      incoming: req.body?.progress,
      incomingHabit: req.body?.habit,
      credits: [...credits, ...reviewed.credits],
      today,
      now
    });
    store.setProgress(req.user.id, withHabits.next);

    const goalBonuses = withHabits.goals.filter((g) => g.xp > 0).map((g) => ({ kind: 'daily-goal', day: g.day, xp: g.xp }));
    res.json({
      // Level and streak as they stand on the learner's today, like GET
      // /progress: the browser adopts this streak as it is, rather than
      // judging it against a day of its own.
      progress: recalcForUser({ store, learningDeps }, user, now),
      mergedChallenges: newIds.length,
      // Solve XP only; unit and goal bonuses are reported beside it.
      awardedXp: awarded,
      bonusXp: bonusXp + withHabits.bonusXp,
      bonuses: [...bonusesOf(unitRewards), ...goalBonuses],
      // Practice XP the review log paid (not in `awardedXp`).
      awardedReviewXp: reviewed.awardedXp,
      activity: activity.view(user, { now }),
      preferences: publicPreferences(store.normalizePreferences?.(user.preferences) ?? user.preferences),
      habits: habitsForUser({ store, learningDeps }, user, now),
      ...(skippedLocked.length ? { skippedLocked } : {})
    });
  });

  /**
   * Start over. XP, solves and attempts go; so do the recorded wrong answers.
   * The days stay - they are history, and keeping them stops a reset from
   * being a way to farm a day twice. The streak history stays too: the
   * current run is closed into it as `ended: 'reset'`, and freezes go back
   * to the starting number.
   */
  router.post('/progress/reset', requireAuth, (req, res) => {
    const before = store.getProgress(req.user.id);
    const streak = learningDeps.habits.resetFields(req.user, before);
    const fresh = { ...resetProgress(store.EMPTY_PROGRESS), ...streak };
    store.setProgress(req.user.id, fresh);
    learningDeps.activity.reset(req.user);
    // The open Practice session goes too (the schedule went with the row).
    learningDeps.review?.reset(req.user);
    res.json({ progress: fresh, habits: habitsForUser({ store, learningDeps }, req.user) });
  });

  return router;
}
