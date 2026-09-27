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

/** Everything the solve route reads from its body, cleaned. */
export function parseSolveBody(body, xp) {
  const src = plainObject(body);
  const { attempts, hintsUsed } = clampCounts(src.attempts, src.hintsUsed, xp);
  return {
    challengeId: String(src.challengeId ?? ''),
    attempts,
    hintsUsed,
    context: SOLVE_CONTEXTS.includes(src.context) ? src.context : 'lesson',
    learningMode: LEARNING_MODES.includes(src.learningMode) ? src.learningMode : null
  };
}

/**
 * Record one verified, passing solve. Re-solving is allowed and keeps the
 * best score, but pays XP only once. `solvedAt` is the FIRST solve and is
 * never overwritten; `lastSolvedAt` and `solves` track the rest.
 */
export function applySolveCore({ progress, challenge, attempts, hintsUsed, today, now, lib, xp, levels, completedStagesFor }) {
  const challengeId = challenge.id;
  const previous = ownEntry(progress.attempts, challengeId);
  const score = lib.scoreSolve(attempts, hintsUsed, xp);
  const firstSolve = !progress.completedChallenges.includes(challengeId);
  const awarded = firstSolve ? lib.xpForSolve(challenge.xpReward, attempts, hintsUsed, xp) : 0;
  const at = now.toISOString();

  const next = {
    ...progress,
    xp: progress.xp + awarded,
    completedChallenges: firstSolve ? [...progress.completedChallenges, challengeId] : progress.completedChallenges,
    attempts: {
      ...progress.attempts,
      [challengeId]: {
        challengeId,
        score: Math.max(previous?.score ?? 0, score),
        attempts: (previous?.attempts ?? 0) + attempts,
        hintsUsed: (previous?.hintsUsed ?? 0) + hintsUsed,
        solvedAt: typeof previous?.solvedAt === 'string' && previous.solvedAt ? previous.solvedAt : at,
        lastSolvedAt: at,
        // A row from before `solves` existed was solved at least once.
        solves: (Number.isInteger(previous?.solves) ? previous.solves : previous ? 1 : 0) + 1
      }
    },
    streak: lib.nextStreak(progress.streak, progress.lastActiveDay, today),
    lastActiveDay: today
  };
  next.bestStreak = Math.max(progress.bestStreak ?? 0, next.streak);
  next.level = lib.levelFromXp(next.xp, levels);
  next.completedStages = completedStagesFor(next.completedChallenges);
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
  const newIds = [...new Set(incomingIds)].filter((id) => {
    if (known.has(id) || !getChallenge(id)) return false;
    if (allows(getChallengeMerged(id) ?? getChallenge(id))) return true;
    skippedLocked.push(id);
    return false;
  });

  const incomingAttempts = plainObject(incoming.attempts);
  const attempts = { ...(current.attempts ?? {}) };
  const credits = [];
  let awarded = 0;

  for (const id of newIds) {
    const challenge = getChallengeMerged(id);
    const a = plainObject(ownEntry(incomingAttempts, id));
    const { attempts: tries, hintsUsed: hints } = clampCounts(a.attempts, a.hintsUsed, xp);
    // Same maths as a live solve, so a guest is paid exactly what they would
    // have been paid signed in - no more for having been offline.
    const paid = lib.xpForSolve(challenge.xpReward, tries, hints, xp);
    awarded += paid;
    const solvedAt = validSolvedAt(a.solvedAt, nowMs, keepDays);
    attempts[id] = {
      challengeId: id,
      score: lib.scoreSolve(tries, hints, xp),
      attempts: tries,
      hintsUsed: hints,
      solvedAt,
      lastSolvedAt: solvedAt,
      solves: 1
    };
    const day = lib.dayKeyIn(zone, new Date(solvedAt));
    credits.push({ challengeId: id, day: day > today ? today : day, at: solvedAt, isTest: Boolean(challenge.isStageTest), awardedXp: paid });
  }

  const completedChallenges = [...known, ...newIds];
  const clampStreak = (v) => Math.max(0, Math.min(settings.streak.maxPlausibleMergedStreak, Number(v) || 0));

  const merged = {
    ...current,
    xp: current.xp + awarded,
    bestStreak: Math.max(current.bestStreak ?? 0, clampStreak(incoming.bestStreak)),
    streak: Math.max(current.streak ?? 0, clampStreak(incoming.streak)),
    // A day after the account's today would stick: the day never moves back.
    lastActiveDay:
      [current.lastActiveDay, incoming.lastActiveDay]
        .filter((d) => lib.isDayKey(d) && d <= today)
        .sort()
        .pop() ?? (lib.isDayKey(current.lastActiveDay) ? current.lastActiveDay : null),
    completedChallenges,
    completedStages: completedStagesFor(completedChallenges),
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
  return { merged: result, newIds, awarded, bonusXp, unitRewards, credits, skippedLocked };
}

/**
 * A fresh progress row. Built from new objects every time - spreading the
 * shared EMPTY_PROGRESS constant's arrays or maps would let one learner's
 * later writes leak into it.
 */
export function resetProgress(emptyProgress) {
  return { ...emptyProgress, attempts: {}, completedChallenges: [], completedStages: [], unitsCompleted: {} };
}

/** Level and streak as they stand on the learner's `today` (a streak goes stale after a missed day). */
export function recalcProgress(progress, { lib, levels, today }) {
  return {
    ...progress,
    level: lib.levelFromXp(progress.xp, levels),
    streak: lib.currentStreak(progress.streak, progress.lastActiveDay, today)
  };
}
