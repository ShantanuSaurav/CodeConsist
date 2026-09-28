/**
 * Practice sessions (review): a short run over a learner's mistakes, the
 * questions due on their review schedule and their weakest solves.
 *
 *   POST /api/review/session  { stageId? }
 *        -> { sessionId, items: [{ challengeId, reason }], xp: { remainingToday }, nextDueDay, expiresAt }
 *        -> { sessionId: null, items: [], nextDueDay, xp }  when there is nothing to practise
 *   POST /api/review/answer   { sessionId, challengeId, answer? | code?, attempts 1-10, hintsUsed 0-10, revealed? }
 *        -> { correct, outcome, awardedXp, bonusXp, goalBonusXp, xpRemainingToday, resolved,
 *             sessionComplete, progress, today, habits, habitEvents }
 *
 * The rules are the shared ones (src/platform/review, in `lib`): the session
 * builder, the schedule and what an answer pays. The server decides whether
 * an answer is right (`verifySubmission`, as a solve does) and prices it:
 *   - a question's schedule outcome is decided by its FIRST answer in the
 *     session (clean / assisted / missed); later answers only resolve it;
 *   - XP: once per question per day, never past `review.xp.dailyCap`, and
 *     the session bonus once, when every question is answered right;
 *   - a right answer counts for the streak and the daily goal (the habits
 *     engine, as a solve does), and a clean one closes the question's open
 *     mistake;
 *   - a replay of a question already answered right pays nothing.
 * One open session per learner (`db.reviewSessions`); a new one replaces the
 * old, and one older than `review.sessionTtlHours` is gone (404).
 *
 * Everything after the last `await` is synchronous: progress, the activity
 * log and the session are written in the same tick.
 *
 * `learningDeps` ({ lib, settings, activity, habits, review }) is read per
 * request - server/index.js fills it in at boot, after this router is mounted.
 */
import crypto from 'node:crypto';
import express from 'express';
import { BusyError } from './rate-limit.js';

const HOUR_MS = 3_600_000;
const MAX_ATTEMPTS = 10;
const MAX_HINTS = 10;

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

/**
 * The review service: sessions, answers, the misses route's "answer shown"
 * reset (pipeline step 7 of misses), the merge's review step and the admin's
 * Practice numbers.
 *
 * @param {object} deps
 * @param {object} deps.lib        the compiled src/platform/server-lib.ts
 * @param {object} deps.store      server/db.js
 * @param {object} deps.settings   server/settings.js's service
 * @param {object} deps.activity   server/activity.js's service
 * @param {object} deps.habits     server/habits.js's service
 * @param {(id: string) => object | null} deps.getChallengeMerged
 */
export function createReviewService({ lib, store, settings, activity, habits, getChallengeMerged }) {
  const rules = () => settings.current().review;

  /** The stored session, if it is this one and still open. */
  function liveSession(user, sessionId, now) {
    const session = store.getReviewSession(user.id);
    if (!session || typeof sessionId !== 'string' || session.id !== sessionId) return null;
    const created = Date.parse(session.createdAt);
    if (!Number.isFinite(created) || now.getTime() - created > rules().sessionTtlHours * HOUR_MS) return null;
    return {
      ...session,
      items: Array.isArray(session.items) ? session.items : [],
      answered: plainObject(session.answered),
      bonusPaid: session.bonusPaid === true
    };
  }

  /** Build a session from what this learner may see (`bank`), and store it. */
  function startSession(user, { stageId = null, bank, now = new Date() }) {
    const r = settings.current();
    const progress = store.getProgress(user.id);
    const today = activity.todayFor(user, progress, now);
    const log = activity.load(user, now);
    const plan = lib.buildReviewSession({
      progress,
      misses: log.misses,
      bank,
      settings: r.review,
      today,
      seed: `${user.id}:${now.getTime()}`,
      zone: activity.zoneFor(user),
      stageId
    });
    const xp = { remainingToday: lib.reviewXpRemaining(lib.dayRow(log, today).reviewXp, r.review.xp) };
    if (plan.items.length === 0) return { sessionId: null, items: [], nextDueDay: plan.nextDueDay, xp };
    const record = {
      id: `rs-${crypto.randomBytes(6).toString('hex')}`,
      createdAt: now.toISOString(),
      stageId: stageId ?? null,
      items: plan.items,
      answered: {},
      bonusPaid: false
    };
    store.putReviewSession(user.id, record);
    return {
      sessionId: record.id,
      items: plan.items,
      xp,
      nextDueDay: plan.nextDueDay,
      expiresAt: new Date(now.getTime() + r.review.sessionTtlHours * HOUR_MS).toISOString()
    };
  }

  /** Has this question already been answered right in the session? (A replay: nothing to verify or pay.) */
  function resolvedIn(session, challengeId) {
    return Boolean(session && Object.hasOwn(session.answered, challengeId) && session.answered[challengeId]?.resolved);
  }

  /**
   * Record one verified answer. `{ status, body }`: 404 for a missing or
   * expired session, 400 for a question not in it, else 200 with what it
   * paid and the progress after it.
   */
  function answer(user, { sessionId, challengeId, correct, attempts, hintsUsed, revealed, now = new Date() }) {
    const r = settings.current();
    const session = liveSession(user, sessionId, now);
    if (!session) return { status: 404, body: { error: 'This practice session has ended. Start a new one.', reason: 'expired' } };
    if (!session.items.some((item) => item.challengeId === challengeId)) {
      return { status: 400, body: { error: 'That question is not part of this practice session.' } };
    }

    const progress = store.getProgress(user.id);
    const today = activity.todayFor(user, progress, now);
    const at = now.toISOString();
    const state = lib.reviewStateOf(progress, challengeId, r.review, { zone: activity.zoneFor(user), today });
    const before = lib.dayRow(activity.load(user, now), today);
    const result = lib.answerReview(
      session,
      { challengeId, correct, attempts, hintsUsed, revealed },
      { state, dayReviewXp: before.reviewXp, today, at, settings: r.review }
    );

    const base = { outcome: result.outcome, xpRemainingToday: lib.reviewXpRemaining(before.reviewXp, r.review.xp) };
    if (result.replay) {
      return { status: 200, body: { correct: true, ...base, awardedXp: 0, bonusXp: 0, goalBonusXp: 0, replay: true, resolved: true, sessionComplete: result.complete, progress } };
    }

    let next = result.state ? { ...progress, review: withEntry(progress.review, challengeId, result.state) } : progress;
    const paid = result.awardedXp + result.bonusXp;
    if (paid > 0) next = { ...next, xp: next.xp + paid, level: lib.levelFromXp(next.xp + paid, r.levels) };

    // The day row: a right answer counts in `reviews`, its XP (and the
    // bonus) in `reviewXp` and `xp`; a clean one closes the open mistake.
    let dayRow = before;
    if (correct || result.awardedXp > 0) {
      dayRow = activity.recordReview(user, { challengeId, answered: correct, xp: result.awardedXp, clean: result.closesMistake, day: today, at });
    }
    if (result.bonusXp > 0) dayRow = activity.recordReview(user, { challengeId: null, answered: false, xp: result.bonusXp, day: today, at });

    // A right answer is practice: it counts for the streak and the goal
    // (freezes, repair, the goal bonus - once a day), as a solve does.
    let habitsResult = null;
    if (correct) {
      habitsResult = habits.recordSolveHabits({ user, progress: next, today, dayRow, now });
      next = habitsResult.next;
      dayRow = habitsResult.today;
    }

    store.setProgress(user.id, next);
    store.putReviewSession(user.id, result.session);
    return {
      status: 200,
      body: {
        correct,
        outcome: result.outcome,
        awardedXp: result.awardedXp,
        bonusXp: result.bonusXp,
        goalBonusXp: habitsResult?.bonusXp ?? 0,
        xpRemainingToday: lib.reviewXpRemaining(dayRow.reviewXp, r.review.xp),
        resolved: correct,
        sessionComplete: result.complete,
        progress: next,
        today: dayRow,
        habits: habits.habitSummary(user, next, now),
        habitEvents: habitsResult?.habitEvents ?? null
      }
    };
  }

  /**
   * Misses step 7: a question whose answer was shown (`final: true`, in a
   * lesson or a session) goes back to `review.wrongResetsToBox` on the
   * schedule, due again from today. Synchronous, in the misses route's tick.
   */
  function noteRevealed(user, challengeIds, now = new Date()) {
    const ids = [...new Set((challengeIds ?? []).filter((id) => typeof id === 'string' && id))];
    if (ids.length === 0) return;
    const r = rules();
    const progress = store.getProgress(user.id);
    const today = activity.todayFor(user, progress, now);
    const at = now.toISOString();
    const zone = activity.zoneFor(user);
    let review = progress.review;
    for (const id of ids) {
      const state = lib.reviewStateOf({ ...progress, review }, id, r, { zone, today });
      review = withEntry(review, id, lib.applyReviewResult(state, 'missed', r, today, at));
    }
    store.setProgress(user.id, { ...progress, review });
  }

  /**
   * The merge's review step: a guest's (or an offline) schedule and review
   * log. The newer schedule entry wins (checked, `paid` never taken); right
   * answers in the log inside `guestMergeWindowDays` are priced again here,
   * once per question per day, under the daily cap - never a session bonus.
   * Each answer it pays is one of its day's `reviews` (the daily goal counts
   * them; a browser's own count is never taken), so the merge runs this
   * before the streak step replays the merged days - and the days it paid
   * an answer on are replayed there, as a live answer counts for the
   * streak. A clean answer there fixes an open mistake it came after.
   * Returns the progress row after it, the XP it paid and its credits
   * (`{ challengeId, day, at, xp }`).
   */
  function mergeFor({ user, progress, incoming, reviewLog, today, now = new Date() }) {
    const r = settings.current();
    const zone = activity.zoneFor(user);
    const known = (id) => Boolean(getChallengeMerged(id));
    let review = lib.mergeReviewStates(progress.review, incoming, { known, rules: r.review, today, now });
    const log = activity.load(user, now);
    // Only questions a session could have held: solved, not a stage test, of a kind sessions use.
    const types = new Set(r.review.itemTypes);
    const eligible = (progress.completedChallenges ?? []).filter((id) => {
      const c = getChallengeMerged(id);
      return Boolean(c) && !c.isStageTest && types.has(c.type);
    });
    const credited = lib.creditReviewLog(reviewLog, {
      solved: new Set(eligible),
      review,
      stateOf: (id) => lib.reviewStateOf({ ...progress, review }, id, r.review, { zone, today }),
      dayTotal: (day) => lib.dayRow(log, day).reviewXp,
      settings: r.review,
      zone,
      today,
      now
    });
    review = credited.review;
    let awardedXp = 0;
    for (const credit of credited.credits) {
      activity.recordReview(user, { challengeId: credit.challengeId, answered: true, xp: credit.xp, day: credit.day, at: credit.at });
      awardedXp += credit.xp;
    }
    closeFixedMistakes(user, reviewLog, { solved: new Set(eligible), zone, today, now, windowDays: r.review.guestMergeWindowDays });
    const xp = progress.xp + awardedXp;
    return { next: { ...progress, review, xp, level: lib.levelFromXp(xp, r.levels) }, awardedXp, credits: credited.credits };
  }

  /**
   * A clean answer in the merged review log fixes the question's open
   * mistake, as it would have on the server - when it came after the last
   * miss, and inside the window the XP uses. Its own day is touched (the
   * answer did happen then); no XP, and no `reviews` (only a paid answer counts).
   */
  function closeFixedMistakes(user, reviewLog, { solved, zone, today, now, windowDays }) {
    const window = Math.max(0, Math.floor(Number(windowDays) || 0));
    const from = lib.addDays(today, -window);
    const latestMs = now.getTime() + 5 * 60_000;
    const closed = new Set();
    for (const raw of Array.isArray(reviewLog) ? reviewLog.slice(-lib.REVIEW_LOG_MAX) : []) {
      const event = lib.normalizeReviewEvent(raw);
      if (!event || !event.correct || event.outcome !== 'clean' || closed.has(event.challengeId) || !solved.has(event.challengeId)) continue;
      const atMs = Date.parse(event.at);
      if (atMs > latestMs) continue;
      let day = lib.dayKeyIn(zone, new Date(event.at));
      if (day > today) day = today;
      if (day < from) continue;
      const misses = activity.load(user, now).misses;
      const miss = Object.hasOwn(misses, event.challengeId) ? misses[event.challengeId] : null;
      if (!miss?.open || atMs <= Date.parse(miss.lastAt)) continue;
      activity.recordReview(user, { challengeId: event.challengeId, answered: false, xp: 0, clean: true, day, at: event.at });
      closed.add(event.challengeId);
    }
  }

  /** A progress reset: the open session goes with it (the schedule is in the progress row). */
  function reset(user) {
    store.deleteReviewSession(user.id);
  }

  /**
   * The admin's "Practice (7 days)": learners who answered in a session in
   * the last 7 days (each in their own days), and the XP it paid them.
   */
  function practiceStats(now = new Date()) {
    let learners7d = 0;
    let xp7d = 0;
    const all = store.allActivity();
    for (const user of store.allUsers()) {
      if (!Object.hasOwn(all, user.id)) continue;
      const log = lib.normalizeActivityLog(all[user.id]);
      const today = activity.todayFor(user, undefined, now);
      const from = lib.addDays(today, -6);
      let xp = 0;
      let answers = 0;
      for (const day of Object.keys(log.days)) {
        if (day < from || day > today) continue;
        xp += log.days[day].reviewXp;
        answers += log.days[day].reviews;
      }
      if (xp > 0 || answers > 0) learners7d += 1;
      xp7d += xp;
    }
    return { learners7d, xp7d };
  }

  return { startSession, answer, resolvedIn, liveSession, noteRevealed, mergeFor, reset, practiceStats };
}

/**
 * @param {object} deps
 * @param {Function} deps.requireAuth
 * @param {{ lib, settings, review }} deps.learningDeps
 * @param {(user) => { stageIds: string[], challenges: object[] }} deps.visibleBankFor
 *   what this learner may practise: the learner view minus premium stages
 *   they have not unlocked, stage tests and kinds outside `review.itemTypes`
 * @param {(challenge, body) => Promise<{ ok, verified, reason }>} deps.verifySubmission
 * @param {(id: string) => object | null} deps.getChallengeMerged
 * @param {Function} [deps.writeLimit]  the `write.account` rate limit
 */
export function createReviewRouter({ requireAuth, learningDeps, visibleBankFor, verifySubmission, getChallengeMerged, writeLimit = passThrough }) {
  const router = express.Router();

  router.post('/review/session', requireAuth, writeLimit, (req, res) => {
    const { settings, review } = learningDeps;
    if (!review) return res.status(503).json({ error: 'Practice is not available yet.' });
    if (!settings.current().review.enabled) return res.status(409).json({ error: 'Practice sessions are switched off.', reason: 'disabled' });
    const raw = req.body?.stageId;
    if (raw !== undefined && raw !== null && typeof raw !== 'string') return res.status(400).json({ error: '`stageId` must be a stage id.' });
    const bank = visibleBankFor(req.user);
    const stageId = raw ? raw : null;
    if (stageId && !bank.stageIds.includes(stageId)) return res.status(400).json({ error: 'That stage is not one you can practise.' });
    const types = new Set(settings.current().review.itemTypes);
    const challenges = bank.challenges.filter((c) => !c.isStageTest && types.has(c.type));
    res.json(review.startSession(req.user, { stageId, bank: challenges, now: new Date() }));
  });

  router.post(
    '/review/answer',
    requireAuth,
    writeLimit,
    asyncRoute(async (req, res) => {
      const { review, activity } = learningDeps;
      if (!review) return res.status(503).json({ error: 'Practice is not available yet.' });
      const body = plainObject(req.body);
      const sessionId = typeof body.sessionId === 'string' ? body.sessionId : '';
      const challengeId = typeof body.challengeId === 'string' ? body.challengeId : '';
      const attempts = Math.max(1, Math.min(MAX_ATTEMPTS, Math.floor(Number(body.attempts ?? 1)) || 1));
      const hintsUsed = Math.max(0, Math.min(MAX_HINTS, Math.floor(Number(body.hintsUsed ?? 0)) || 0));
      const revealed = body.revealed === true;

      // Cheap checks first: a missing session, a question not in it, a replay
      // (nothing to verify, nothing to pay).
      const first = review.liveSession(req.user, sessionId, new Date());
      if (!first) return res.status(404).json({ error: 'This practice session has ended. Start a new one.', reason: 'expired' });
      if (!first.items.some((item) => item.challengeId === challengeId)) {
        return res.status(400).json({ error: 'That question is not part of this practice session.' });
      }
      const challenge = getChallengeMerged(challengeId);
      if (!challenge) return res.status(404).json({ error: 'Unknown challenge.' });

      let correct = true;
      if (!review.resolvedIn(first, challengeId)) {
        let verdict;
        try {
          verdict = await verifySubmission(challenge, body);
        } catch (err) {
          if (!(err instanceof BusyError)) throw err;
          return res.status(503).json({ error: 'The code runner is busy - try again in a moment.', reason: 'busy' });
        }
        correct = Boolean(verdict.ok);
      }

      // From here on, synchronous.
      const now = new Date();
      activity.captureZone(req, req.user, now);
      const result = review.answer(req.user, { sessionId, challengeId, correct, attempts, hintsUsed, revealed, now });
      res.status(result.status).json(result.status === 200 ? { ...result.body, settingsRevision: learningDeps.settings.revision() } : result.body);
    })
  );

  return router;
}
