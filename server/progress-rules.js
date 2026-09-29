/**
 * The pure core of the progress routes: how a solve, a guest merge and a
 * reset change a learner's progress row. No I/O here - server/progress-routes.js
 * reads the store, calls these, and writes the result in the same tick - so
 * every rule can be tested without HTTP.
 *
 * The server owns the XP maths: the client says WHICH challenge, WHAT it
 * answered and how much help it took, never whether it was right or what it
 * earned. Every number comes from `settings` (src/platform/settings), whose
 * defaults are exactly the constants these routes used before.
 */

const DAY_MS = 86_400_000;
const FUTURE_SLACK_MS = 5 * 60_000;

/** Where a solve can come from. Assessments and reviews get their own routes later. */
export const SOLVE_CONTEXTS = ['lesson', 'test', 'library'];
export const LEARNING_MODES = ['learn', 'practice'];

function plainObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function ownEntry(map, key) {
  return map && typeof key === 'string' && Object.hasOwn(map, key) ? map[key] : undefined;
}

/**
 * Tries and hints as the score counts them. Clamped exactly as the route
 * always did (a missing or nonsense value is 1 try / 0 hints), with the caps
 * from `settings.xp`.
 */
export function clampCounts(attempts, hintsUsed, xp) {
  return {
    attempts: Math.max(1, Math.min(xp.maxAttemptsCounted, Number(attempts ?? 1) || 1)),
    hintsUsed: Math.max(0, Math.min(xp.maxHintsCounted, Number(hintsUsed ?? 0) || 0))
  };
}

/**
 * Everything the solve route reads from its body, cleaned. `requeued` (the
 * question came back at the end of the unit after a miss) and `revealed`
 * (its answer was shown before this solve) count only when they are exactly
 * `true` - anything else is a plain solve, as before they existed.
 */
export function parseSolveBody(body, xp) {
  const src = plainObject(body);
  const { attempts, hintsUsed } = clampCounts(src.attempts, src.hintsUsed, xp);
  return {
    challengeId: String(src.challengeId ?? ''),
    attempts,
    hintsUsed,
    context: SOLVE_CONTEXTS.includes(src.context) ? src.context : 'lesson',
    learningMode: LEARNING_MODES.includes(src.learningMode) ? src.learningMode : null,
    requeued: src.requeued === true,
    revealed: src.revealed === true
  };
}

/**
 * The highest score this solve can get: 100, or - when the answer was shown
 * before it - `feedback.requeue.maxScoreAfterReveal` for the learning mode
 * (no mode counts as Practice, the stricter one). The browser prices its
 * optimistic XP with the same rule (src/platform/settings/budget.ts).
 */
export function scoreCapFor(input, feedback, lib) {
  if (!input.revealed || !feedback) return 100;
  return lib.revealCap(input.learningMode, feedback);
}

/** A copy of a keyed map with one entry set - safely for any key (see server/db.js defineEntry). */
export function withEntry(map, key, value) {
  const out = {};
  const src = plainObject(map);
  for (const k of Object.keys(src)) Object.defineProperty(out, k, { value: src[k], writable: true, enumerable: true, configurable: true });
  Object.defineProperty(out, key, { value, writable: true, enumerable: true, configurable: true });
  return out;
}

/**
 * Record one verified, passing solve. Re-solving is allowed and keeps the
 * best score, but pays XP only once. `solvedAt` is the FIRST solve and is
 * never overwritten; `lastSolvedAt` and `solves` track the rest.
 *
 * A stage test passed inside a test-out or a placement (Phase 5) comes with
 * `testOut: { stageId, via, clears, assessmentId, xpPercent }`: it is paid
 * `xpForTestOut` (the solve's XP scaled by `xpPercent`), its attempt row
 * says `via`, and the stage's `testedOut` record is written - before the
 * cleared stages are counted, so a record that `clears` counts. The solve
 * route and the assessment routes both come through here, so the two can
 * never price or record a test differently.
 *
 * The streak is not touched here: the habits engine counts the day
 * (server/habits.js recordSolveHabits, pipeline step 11), after the day row
 * it reads has been written.
 */
export function applySolveCore({ progress, challenge, attempts, hintsUsed, now, lib, xp, levels, completedStagesFor, cap = 100, testOut = null }) {
  const challengeId = challenge.id;
  const previous = ownEntry(progress.attempts, challengeId);
  // `cap` limits the score (and so the XP) of a solve made after the answer was shown.
  const score = lib.scoreSolve(attempts, hintsUsed, xp, cap);
  const firstSolve = !progress.completedChallenges.includes(challengeId);
  let awarded = 0;
  if (firstSolve) {
    awarded = testOut
      ? lib.xpForTestOut(challenge.xpReward, testOut.xpPercent ?? 100, attempts, hintsUsed, xp)
      : lib.xpForSolve(challenge.xpReward, attempts, hintsUsed, xp, cap);
  }
  const at = now.toISOString();

  const next = {
    ...progress,
    xp: progress.xp + awarded,
    completedChallenges: firstSolve ? [...progress.completedChallenges, challengeId] : progress.completedChallenges,
    attempts: withEntry(progress.attempts, challengeId, {
      challengeId,
      score: Math.max(previous?.score ?? 0, score),
      attempts: (previous?.attempts ?? 0) + attempts,
      hintsUsed: (previous?.hintsUsed ?? 0) + hintsUsed,
      solvedAt: typeof previous?.solvedAt === 'string' && previous.solvedAt ? previous.solvedAt : at,
      lastSolvedAt: at,
      // A row from before `solves` existed was solved at least once.
      solves: (Number.isInteger(previous?.solves) ? previous.solves : previous ? 1 : 0) + 1,
      ...(previous?.via ? { via: previous.via } : testOut && firstSolve ? { via: testOut.via } : {})
    })
  };
  if (testOut) {
    next.testedOut = withEntry(progress.testedOut, testOut.stageId, {
      at,
      via: testOut.via,
      clears: testOut.clears === true,
      assessmentId: String(testOut.assessmentId ?? '')
    });
  }
  next.level = lib.levelFromXp(next.xp, levels);
  next.completedStages = completedStagesFor(next.completedChallenges, next.testedOut);
  return { next, awarded, score, firstSolve };
}

/**
 * Pay for a unit this solve completed (pipeline step 9): the perfect-unit
 * bonus and the `unitsCompleted` record, from the shared rule
 * (src/platform/xp-leveling/rewards.ts). `unitFor` is the server's own
 * grouping (server/units.js) - nothing about units is read from the request.
 * Without one (a test, before boot) nothing is paid. The level follows the
 * new XP.
 */
export function applySolveRewards({ progress, next, challengeId, firstSolve, now, lib, units, levels, unitFor }) {
  if (!unitFor) return { next, reward: null };
  const { progress: rewarded, reward } = lib.applyUnitRewards(progress, next, { challengeId, firstSolve, now }, { cfg: units, unitFor });
  if (!reward) return { next, reward: null };
  return { next: { ...rewarded, level: lib.levelFromXp(rewarded.xp, levels) }, reward };
}

/** The bonuses a response reports: `{ kind: 'perfect-unit', unitId, xp }` for each one that paid. */
export function bonusesOf(rewards) {
  return rewards.filter((r) => r && r.bonusXp > 0).map((r) => ({ kind: 'perfect-unit', unitId: r.unitId, xp: r.bonusXp }));
}

/**
 * A client-sent solve time, if it is believable: not in the future (beyond a
 * little clock skew) and not older than the activity window. Anything else is
 * "now".
 */
export function validSolvedAt(value, nowMs, keepDays) {
  const t = typeof value === 'string' ? Date.parse(value) : NaN;
  if (!Number.isFinite(t) || t > nowMs + FUTURE_SLACK_MS || t < nowMs - keepDays * DAY_MS) return new Date(nowMs).toISOString();
  return new Date(t).toISOString();
}

/**
 * Merge a guest's local progress into the account they just signed into.
 *
 * The client says WHICH challenges it solved. The server decides what that is
 * worth, from its own content and the current rules - it never copies an XP
 * number, a level, or a challenge id it has never heard of from the request.
 * Each newly credited solve also comes back as a `credit` for the activity
 * log, dated by its (validated) solve time in the account's zone.
 *
 * `allows(challenge)` is the access gate (server/progression.js): a new id
 * it refuses - a premium lesson this account has not unlocked - is not
 * credited and comes back in `skippedLocked`.
 *
 * `unitFor` is the server's unit grouping (server/units.js): a unit that the
 * NEW ids complete pays its perfect-unit bonus (pipeline step 4); a unit that
 * was complete already, or that the merge does not finish, pays nothing. The
 * bonus is added to the day of the solve that completed the unit.
 */
export function mergeCore({
  current,
  incoming: raw,
  lib,
  settings,
  getChallenge,
  getChallengeMerged,
  completedStagesFor,
  zone,
  today,
  now,
  allows = () => true,
  filterNew = null,
  unitFor = null
}) {
  const incoming = plainObject(raw);
  const xp = settings.xp;
  const nowMs = now.getTime();
  const keepDays = settings.retention.activityDaysKept;

  const known = new Set(current.completedChallenges ?? []);
  const incomingIds = Array.isArray(incoming.completedChallenges) ? incoming.completedChallenges.map(String) : [];

  // Only ids that exist, only ones this account has not already been paid
  // for, and only ones it may open.
  const skippedLocked = [];
  const unlocked = [...new Set(incomingIds)].filter((id) => {
    if (known.has(id) || !getChallenge(id)) return false;
    if (allows(getChallengeMerged(id) ?? getChallenge(id))) return true;
    skippedLocked.push(id);
    return false;
  });
  // Then the stage order (Phase 5, server/progression.js filterMerge under
  // `access.mergeGate`): a solve in a stage the account has not opened is
  // held back and comes back in `droppedChallenges`.
  const filtered = filterNew ? filterNew(unlocked) : { accepted: unlocked, dropped: [] };
  const newIds = filtered.accepted;
  const droppedChallenges = filtered.dropped;

  const incomingAttempts = plainObject(incoming.attempts);
  const attempts = { ...(current.attempts ?? {}) };
  const credits = [];
  let awarded = 0;

  for (const id of newIds) {
    const challenge = getChallengeMerged(id);
    const a = plainObject(ownEntry(incomingAttempts, id));
    const { attempts: tries, hintsUsed: hints } = clampCounts(a.attempts, a.hintsUsed, xp);
    // A solve the guest made after its answer was shown carries the cap it
    // was paid under. It can only lower the price, so it is taken as sent.
    const cap = typeof a.scoreCap === 'number' && Number.isFinite(a.scoreCap) ? Math.max(0, Math.min(100, a.scoreCap)) : 100;
    // Same maths as a live solve, so a guest is paid exactly what they would
    // have been paid signed in - no more for having been offline.
    const paid = lib.xpForSolve(challenge.xpReward, tries, hints, xp, cap);
    awarded += paid;
    const solvedAt = validSolvedAt(a.solvedAt, nowMs, keepDays);
    attempts[id] = {
      challengeId: id,
      score: lib.scoreSolve(tries, hints, xp, cap),
      attempts: tries,
      hintsUsed: hints,
      solvedAt,
      lastSolvedAt: solvedAt,
      solves: 1,
      ...(cap < 100 ? { scoreCap: cap } : {})
    };
    const day = lib.dayKeyIn(zone, new Date(solvedAt));
    credits.push({ challengeId: id, day: day > today ? today : day, at: solvedAt, isTest: Boolean(challenge.isStageTest), awardedXp: paid });
  }

  const completedChallenges = [...known, ...newIds];

  // The streak fields stay the account's here: the habits engine decides
  // what a merge does to them (server/habits.js mergeHabitsFor, step 6).
  const merged = {
    ...current,
    xp: current.xp + awarded,
    completedChallenges,
    completedStages: completedStagesFor(completedChallenges, current.testedOut),
    attempts
  };

  // Units completed BY the new ids: bonus, record, and the day it lands on.
  let unitRewards = [];
  let bonusXp = 0;
  let result = merged;
  if (unitFor && newIds.length) {
    const paid = lib.applyMergeUnitRewards(
      current,
      merged,
      { newIds, solvedAtOf: (id) => attempts[id]?.solvedAt, now },
      { cfg: settings.units, unitFor }
    );
    result = paid.progress;
    unitRewards = paid.rewards;
    bonusXp = paid.bonusXp;
    for (const reward of unitRewards) {
      const credit = credits.find((c) => c.challengeId === reward.challengeId);
      if (credit) {
        credit.unitCompleted = true;
        credit.perfectBonusXp = reward.bonusXp;
      }
    }
  }
  result.level = lib.levelFromXp(result.xp, settings.levels);
  return { merged: result, newIds, awarded, bonusXp, unitRewards, credits, skippedLocked, droppedChallenges };
}

/**
 * A fresh progress row. Built from new objects every time - spreading the
 * shared EMPTY_PROGRESS constant's arrays or maps would let one learner's
 * later writes leak into it. Tested-out stages go with the rest of the
 * progress; the assessment log (and its cooldowns) is not progress and stays.
 */
export function resetProgress(emptyProgress) {
  return {
    ...emptyProgress,
    attempts: {},
    completedChallenges: [],
    completedStages: [],
    unitsCompleted: {},
    review: {},
    testedOut: {},
    seenConcepts: []
  };
}

/** The most teaching sequences a learner's `seenConcepts` keeps (and one request may add). */
export const SEEN_CONCEPTS_MAX = 500;

/**
 * Teaching sequences already shown (Phase 5): the stored list with the ids
 * in `incoming` added - each once, in first-seen order, only the ones
 * `isKnown` accepts (a concept learners are served), at most
 * `SEEN_CONCEPTS_MAX` of them from one request, and the newest
 * `SEEN_CONCEPTS_MAX` kept. `added` says which were new.
 */
export function unionSeenConcepts(stored, incoming, isKnown, max = SEEN_CONCEPTS_MAX) {
  const list = Array.isArray(stored) ? stored.filter((id) => typeof id === 'string' && id) : [];
  const seen = new Set(list);
  const added = [];
  for (const id of Array.isArray(incoming) ? incoming.slice(0, max) : []) {
    if (typeof id !== 'string' || !id || id.length > 200 || seen.has(id) || !isKnown(id)) continue;
    seen.add(id);
    list.push(id);
    added.push(id);
  }
  return { list: list.slice(-max), added };
}

/**
 * Level and streak as they stand on the learner's `today`: the level from
 * the current curve, and the missed days since the last streak day worked
 * out by the habits engine - freezes used, a broken run saved and its repair
 * offered (`habits.settledRow`). Nothing is written; the browser adopts the
 * row as it is, and its own settle of it changes nothing.
 */
export function recalcProgress(progress, { lib, levels, today, habits }) {
  const level = lib.levelFromXp(progress.xp, levels);
  if (habits) return { ...habits.settledRow(progress, today), level };
  // Without the habits service (before boot): the old stale-or-alive rule.
  return { ...progress, level, streak: lib.currentStreak(progress.streak, progress.lastActiveDay, today) };
}
