/**
 * The progress routes: a learner's row, a solve, a guest merge and a reset.
 *
 * Moved out of server/index.js (which binds a port the moment it is
 * imported) so they can be tested over HTTP like server/drafts-routes.js.
 * The rules themselves are in server/progress-rules.js; this file is the
 * order they run in:
 *
 *   solve:  rate limit (solve.account) -> parse + clamp -> unknown? 404 ->
 *           may this learner solve it at all (premium, then the stage order
 *           under `access.solveGate`)? 403 - before any
 *           code runs -> verify the submission (the only await; code runs in
 *           an execution slot, 503 when they are all busy) -> pass mark? 422
 *           (not for a question requeued after a miss) -> capture the zone,
 *           pick the learner's day -> score (capped when the answer was shown
 *           first), pay, record
 *           -> a unit completed? its perfect bonus -> the day row (with its
 *           league XP: first-ever XP only) -> streak,
 *           freezes, repair and the daily goal (server/habits.js; the goal
 *           bonus once a day) -> level -> persist, join the week's league
 *           (server/leagues.js), drop the draft, Excel
 *   merge:  check the guest's test-out claims' answers (the only await) ->
 *           capture the zone -> keep the claims that hold up, in track order
 *           (-> claims; each writes `testedOut` and pays its test) -> premium
 *           filter on the new ids (-> skippedLocked) -> the stage order under
 *           `access.mergeGate` (-> droppedChallenges) -> re-price the new
 *           ids -> bonuses for units the new ids
 *           complete -> merge the activity log -> adopt the guest's
 *           preferences where the account has none -> the streak (a new
 *           account adopts the guest's; an existing one replays the merged
 *           days, paying their goal bonuses) -> the Practice schedule and
 *           review log (newer entries win; right answers priced again under
 *           the daily cap, no session bonus) -> level -> persist -> the
 *           weekly league, only when `league.countMergedXp` is on
 *   reset:  a fresh row that keeps `everSolved` (and the streak history)
 *
 * Everything after the last `await` is synchronous, so progress and the
 * activity log are written in the same tick and two requests cannot
 * interleave between a read and its write.
 *
 * `learningDeps` ({ lib, settings, activity, units, habits, review, leagues }) is read per request:
 * it is filled in by server/index.js's bootstrap, after this router is mounted.
 */
import express from 'express';
import {
  applySolveCore,
  applySolveRewards,
  bonusesOf,
  mergeCore,
  parseSolveBody,
  recalcProgress,
  resetProgress,
  scoreCapFor,
  unionSeenConcepts
} from './progress-rules.js';
import { adoptGuestPreferences, preferenceRules, publicPreferences } from './preferences-routes.js';
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
 * A guest's claims answered `unavailable`, one per stage: nothing could be
 * checked (the content or the claim rules are not loaded).
 */
/**
 * Why a claim was not checked that is no fault of the claim: the code runner
 * was busy, the content was not loaded, or the account's `solve.account`
 * limit was reached. The browser keeps such a claim and sends it again, so
 * the merge keeps its test out too (below).
 */
export const RETRY_CLAIM_REASONS = new Set(['busy', 'unavailable', 'rate-limited']);

/** The test ids of the claims rejected for a reason in RETRY_CLAIM_REASONS, or null when there are none. */
function retryTestIds(raw, rejected) {
  const stages = new Set(rejected.filter((r) => RETRY_CLAIM_REASONS.has(r.reason)).map((r) => r.stageId));
  if (stages.size === 0) return null;
  const list = Array.isArray(raw) ? raw : raw && typeof raw === 'object' ? Object.values(raw) : [];
  const ids = new Set(list.filter((c) => c && stages.has(c.stageId) && typeof c.testId === 'string').map((c) => c.testId));
  return ids.size ? ids : null;
}

function unavailableClaims(raw) {
  const list = Array.isArray(raw) ? raw : raw && typeof raw === 'object' ? Object.values(raw) : [];
  const ids = list.map((c) => c?.stageId).filter((id) => typeof id === 'string' && id.length > 0 && id.length <= 64);
  return [...new Set(ids)].slice(0, 100).map((stageId) => ({ stageId, reason: 'unavailable' }));
}

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
 * @param {(ids: string[], testedOut?: object) => string[]} deps.completedStagesFor
 * @param {(userId: string, challengeId: string) => void} deps.clearDraftForSolve
 * @param {(user, progress) => void} [deps.onProgress]  after a solve is stored (the Excel mirror)
 * @param {Function} [deps.solveLimit]  the `solve.account` rate limit (server/rate-limit.js)
 * @param {Function} [deps.mergeLimit]  the merge's rate limit (`solve.account` too)
 * @param {(req) => { allowed: boolean }} [deps.chargeClaimRun]  counts one guest claim whose
 *   answer the merge is about to run against the limit (server/rate-limit.js limitCheck)
 * @param {(user, challenge) => { ok: boolean, reason?: string, stageId?: string, error?: string }} [deps.checkSolveAccess]
 *   server/progression.js: may this learner solve it at all (premium, then the
 *   stage order)? Checked before any code runs.
 * @param {(user) => { allows: (challenge) => boolean } | null} [deps.mergeAccess]
 *   server/progression.js: which merged ids may be credited (the rest come back as `skippedLocked`).
 * @param {() => ({ snapshot, overrides, premiumEnforced: boolean } | null)} [deps.progressionContext]
 *   the content a merge judges test-out claims and the stage order against.
 * @param {{ verifyClaims, acceptClaims, filterMerge }} [deps.progression]
 *   server/progression.js's merge steps (handed in rather than imported, so
 *   this router does not pull in the content module). Without them or the
 *   content (before boot, a bare test) claims are refused as `unavailable`
 *   and nothing is held back by the stage order.
 * @param {() => Set<string> | null} [deps.knownConceptIds]  the concept ids learners are served (null
 *   before the content loads): `seenConcepts` only ever holds these
 * @param {() => string[] | null} [deps.learnerTracks]  the tracks learners are shown, for a guest's track at merge
 * @param {Function} [deps.writeLimit]  the `write.account` rate limit (POST /progress/concepts)
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
  mergeLimit = passThrough,
  chargeClaimRun = () => ({ allowed: true }),
  checkSolveAccess = () => ({ ok: true }),
  mergeAccess = () => null,
  progressionContext = () => null,
  progression = null,
  knownConceptIds = () => null,
  learnerTracks = null,
  writeLimit = passThrough
}) {
  const router = express.Router();

  router.get('/progress', requireAuth, (req, res) => {
    res.json({ progress: recalcForUser({ store, learningDeps }, req.user), habits: habitsForUser({ store, learningDeps }, req.user) });
  });

  /**
   * Teaching sequences shown to this learner (Phase 5): `{ conceptIds }` is
   * added to the stored `seenConcepts` - known concepts only, each once, at
   * most 500 - so another device does not teach them again. Answers with
   * the whole list. Earns nothing and changes nothing else.
   */
  router.post('/progress/concepts', requireAuth, writeLimit, (req, res) => {
    const ids = req.body?.conceptIds;
    if (!Array.isArray(ids)) return res.status(400).json({ error: 'Send conceptIds as a list of concept ids.' });
    const known = knownConceptIds();
    if (!known) return res.status(503).json({ error: 'The lessons are still loading. Try again in a moment.' });
    const progress = store.getProgress(req.user.id);
    const { list, added } = unionSeenConcepts(progress.seenConcepts, ids, (id) => known.has(id));
    if (added.length) store.setProgress(req.user.id, { ...progress, seenConcepts: list });
    res.json({ seenConcepts: added.length ? list : Array.isArray(progress.seenConcepts) ? progress.seenConcepts : [] });
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

      // A premium lesson this learner has not unlocked - or, with the stage
      // order enforced, a lesson in a stage they have not opened or a test
      // before its lessons - is refused before any of their code is run.
      const access = checkSolveAccess(req.user, challenge);
      if (!access.ok) {
        const reason = access.reason ?? 'premium-locked';
        return res.status(403).json({
          error:
            reason === 'premium-locked'
              ? copyOr(learningDeps, 'premium.lockedSolve', {}, 'This lesson is part of a premium stage.')
              : access.error ?? 'This lesson is not open yet.',
          reason,
          stageId: access.stageId ?? challenge.stageId
        });
      }

      let verdict;
      try {
        verdict = await verifySubmission(challenge, req.body ?? {});
      } catch (err) {
        if (!(err instanceof BusyError)) throw err;
        if (err.reason === 'admin-disabled') return res.status(403).json({ error: err.policyMessage, reason: 'admin-disabled' });
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
        // The weekly league (step 12): first-ever XP only - never XP earned
        // again after a reset - and unchecked solves only when they count.
        leagueXp: lib.solveLeagueXp({ firstEver: solved.firstEver, verified: Boolean(verdict.verified), awardedXp: awarded }, rules.league),
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
      // League XP today (this solve's, or the goal bonus it paid): the
      // learner joins this week's league.
      if (todayRow.leagueXp > 0) learningDeps.leagues?.noteLeagueXp(req.user, today, now);

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
   * `{ progress, activity?, preferences?, habit?, reviewLog?, assessmentClaims? }`;
   * see progress-rules.js's mergeCore for what is and is not believed, and
   * review-routes.js's mergeFor for the Practice schedule (`progress.review`)
   * and the review log. A solve in a premium stage this account has not
   * unlocked is not credited; its id comes back in `skippedLocked`.
   *
   * Phase 5: a guest's passed test-outs and placement tests
   * (`assessmentClaims`, at most 20) are checked again - their answer by the
   * server, their pass mark, hints and reachability (server/progression.js) -
   * and the ones that hold up are recorded like a live pass; the response's
   * `claims` says which were kept and why the others were not. Then, with
   * `access.mergeGate` enforcing, a solve in a stage the account has not
   * opened is held back and comes back in `droppedChallenges`.
   */
  router.post(
    '/progress/merge',
    requireAuth,
    mergeLimit,
    asyncRoute(async (req, res) => {
      const { lib, settings, activity, habits } = learningDeps;
      const content = progression ? progressionContext() : null;

      // The only await: a guest's claims have their answers checked by the
      // server (code runs in an execution slot). A test the account has
      // already solved is never run, and each one that is run counts as a
      // solve against the account's limit.
      const rawClaims = req.body?.assessmentClaims;
      const hasClaims = rawClaims !== undefined && rawClaims !== null;
      let verified = { checked: [], rejected: [] };
      if (hasClaims && content) {
        const solvedBefore = new Set(store.getProgress(req.user.id)?.completedChallenges ?? []);
        verified = await progression.verifyClaims(rawClaims, {
          rules: settings.current(),
          lib,
          getChallengeMerged,
          verifySubmission,
          alreadySolved: (testId) => solvedBefore.has(testId),
          mayRun: () => chargeClaimRun(req).allowed !== false
        });
      } else if (hasClaims) {
        verified.rejected = unavailableClaims(rawClaims);
      }

      // From here on, synchronous. The rules are read after the await.
      const rules = settings.current();
      const now = new Date();

      const gate = mergeAccess(req.user);

      activity.captureZone(req, req.user, now);
      const current = store.getProgress(req.user.id);
      const today = activity.todayFor(req.user, current, now);
      const zone = activity.zoneFor(req.user);

      // The claims that hold up against the account as it is now, in track
      // order: each writes its `testedOut` record and pays its test, so the
      // merged lessons after it see its stage open.
      let claimed = { progress: current, accepted: [], rejected: [], credits: [], awardedXp: 0 };
      if (content && verified.checked.length) {
        claimed = progression.acceptClaims(current, verified.checked, {
          user: req.user,
          lib,
          rules,
          now,
          zone,
          today,
          completedStagesFor,
          snapshot: content.snapshot,
          overrides: content.overrides,
          premiumEnforced: content.premiumEnforced !== false
        });
      }
      const base = claimed.progress;

      // A claim that could not be checked just now is sent again later: its
      // test stays out of this merge, since credited as a plain solve it
      // would make the stage's test-out "already cleared" for good.
      const retrying = hasClaims ? retryTestIds(rawClaims, [...verified.rejected, ...claimed.rejected]) : null;
      const sent = req.body?.progress;
      const incoming =
        retrying && sent && Array.isArray(sent.completedChallenges)
          ? { ...sent, completedChallenges: sent.completedChallenges.filter((id) => !retrying.has(id)) }
          : sent;

      const { merged, newIds, awarded, bonusXp, unitRewards, credits, skippedLocked, droppedChallenges } = mergeCore({
        current: base,
        incoming,
        lib,
        settings: rules,
        getChallenge,
        getChallengeMerged,
        completedStagesFor,
        zone,
        today,
        now,
        allows: gate ? (challenge) => gate.allows(challenge) : undefined,
        filterNew: content
          ? (ids) =>
              progression.filterMerge(req.user, base, ids, { lib, mergeGate: rules.access.mergeGate, snapshot: content.snapshot, overrides: content.overrides })
          : null,
        unitFor: unitLookup(learningDeps)
      });
      const allCredits = [...claimed.credits, ...credits];

      activity.merge(req.user, req.body?.activity, { credits: allCredits, today, now });

      // A guest's own choices (sound on or off, their daily goal) come along -
      // but never over one the account already made. Adopted before the
      // streak step, so the days it replays are judged against that goal.
      let user = req.user;
      const adopt = adoptGuestPreferences(store.normalizePreferences?.(user.preferences) ?? user.preferences, req.body?.preferences, {
        goals: rules.goals,
        isGoalOptionAvailable: lib.isGoalOptionAvailable,
        // Their track, learning mode and setup answers too (Phase 5), checked like a PATCH.
        check: preferenceRules(lib, rules, learnerTracks)
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
      // solve, a kept claim or a Practice answer was credited on (a right
      // Practice answer counts for the streak, as it does live). Goal
      // bonuses come only from here. `current` is the row from before the
      // claims, so a new account is still new.
      const withHabits = habits.mergeHabitsFor({
        user,
        current,
        merged: reviewed.next,
        incoming: req.body?.progress,
        incomingHabit: req.body?.habit,
        credits: [...allCredits, ...reviewed.credits],
        today,
        now
      });
      // Teaching already shown on the other device (Phase 5): a union of
      // known concepts - the account's list never loses one.
      let stored = withHabits.next;
      const known = knownConceptIds();
      if (known) {
        const concepts = unionSeenConcepts(stored.seenConcepts, req.body?.progress?.seenConcepts, (id) => known.has(id));
        if (concepts.added.length) stored = { ...stored, seenConcepts: concepts.list };
      }
      store.setProgress(req.user.id, stored);

      // The weekly league (step 9): merged days carry league XP only when
      // `league.countMergedXp` is on; then the learner joins the weeks of
      // the days that got some (a week already final is never reopened).
      if (rules.league?.countMergedXp && learningDeps.leagues) {
        const days = new Set([...allCredits, ...reviewed.credits, ...withHabits.goals].map((c) => c.day).filter(Boolean));
        for (const day of [...days].sort()) learningDeps.leagues.noteLeagueXp(user, day, now);
      }

      const goalBonuses = withHabits.goals.filter((g) => g.xp > 0).map((g) => ({ kind: 'daily-goal', day: g.day, xp: g.xp }));
      res.json({
        // Level and streak as they stand on the learner's today, like GET
        // /progress: the browser adopts this streak as it is, rather than
        // judging it against a day of its own.
        progress: recalcForUser({ store, learningDeps }, user, now),
        mergedChallenges: newIds.length + claimed.accepted.length,
        // Solve XP only (a kept claim's test included); unit and goal bonuses are reported beside it.
        awardedXp: awarded + claimed.awardedXp,
        bonusXp: bonusXp + withHabits.bonusXp,
        bonuses: [...bonusesOf(unitRewards), ...goalBonuses],
        // Practice XP the review log paid (not in `awardedXp`).
        awardedReviewXp: reviewed.awardedXp,
        activity: activity.view(user, { now }),
        preferences: publicPreferences(store.normalizePreferences?.(user.preferences) ?? user.preferences),
        habits: habitsForUser({ store, learningDeps }, user, now),
        ...(skippedLocked.length ? { skippedLocked } : {}),
        ...(droppedChallenges.length ? { droppedChallenges } : {}),
        ...(hasClaims
          ? { claims: { accepted: claimed.accepted.map((c) => c.stageId), rejected: [...verified.rejected, ...claimed.rejected] } }
          : {})
      });
    })
  );

  /**
   * Start over. XP, solves and attempts go; so do the recorded wrong answers.
   * The days stay - they are history, and keeping them stops a reset from
   * being a way to farm a day twice. The streak history stays too: the
   * current run is closed into it as `ended: 'reset'`, and freezes go back
   * to the starting number. So does `everSolved`: XP earned again after a
   * reset never counts for the weekly league.
   */
  router.post('/progress/reset', requireAuth, (req, res) => {
    const before = store.getProgress(req.user.id);
    const streak = learningDeps.habits.resetFields(req.user, before);
    const fresh = { ...resetProgress(store.EMPTY_PROGRESS, before), ...streak };
    store.setProgress(req.user.id, fresh);
    learningDeps.activity.reset(req.user);
    // The open Practice session goes too (the schedule went with the row).
    learningDeps.review?.reset(req.user);
    res.json({ progress: fresh, habits: habitsForUser({ store, learningDeps }, req.user) });
  });

  return router;
}
