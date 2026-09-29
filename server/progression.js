/**
 * Access gates: may this learner solve this challenge at all - and which of
 * a guest's solves (and passed test-outs) may a merge credit?
 *
 * One entry point for solves, `checkSolveAccess(user, challenge, ctx)`, used
 * by the solve route (before any code runs), the public grade route and -
 * through `mergeAccess` - the guest merge. Two gates, in this order:
 *
 *   1. the premium gate (server/billing.js premiumGate), under
 *      `access.premiumGate`;
 *   2. the stage order (Phase 5), under `access.solveGate`, when the caller
 *      passes one (`ctx.solveGate` with `ctx.lib` and `ctx.progressFor`): the
 *      learner's stages are built exactly as their browser builds them
 *      (`learnerAccess`), and the shared rule `canSolve` decides.
 *
 * `ctx` is built once per request by the caller:
 *   { snapshot, overrides }  the content and admin overrides (billing.js)
 *   mode                     `access.premiumGate`: 'enforce' blocks,
 *                            'log' records what would be blocked and lets it
 *                            through - the emergency switch if paying
 *                            learners are ever wrongly refused
 *   route                    'solve' | 'grade' | 'merge', for the counters
 *   solveGate                `access.solveGate`: 'off' | 'log' | 'enforce'
 *   lib                      the compiled src/platform/server-lib.ts
 *   progressFor(user)        the learner's stored progress row
 *
 * The counters are in memory (since boot, and the last 24 hours) and shown on
 * the admin's Limits & access page; a restart clears them. In 'log' mode a
 * would-be refusal is counted and let through - which is how the gates ship:
 * logging first, enforcing once the counts stay clean.
 */
import { entitlementsFor, premiumGate, stageAccessFor, unlockedStageIds } from './billing.js';
import { applyLearnerOverrides } from './content.js';
import { BusyError } from './rate-limit.js';
import { applySolveCore, validSolvedAt } from './progress-rules.js';

const DAY_MS = 86_400_000;
const TIMES_KEPT = 10_000;

/* ------------------------------------------------------------ premium */

const premiumCounters = { blocked: 0, wouldBlock: 0, lastAt: null, byRoute: {} };

function notePremiumBlock({ mode, route, stageId, userId }) {
  if (mode === 'log') premiumCounters.wouldBlock += 1;
  else premiumCounters.blocked += 1;
  premiumCounters.lastAt = new Date().toISOString();
  premiumCounters.byRoute[route] = (premiumCounters.byRoute[route] ?? 0) + 1;
  if (mode === 'log') console.warn(`[premium] would block ${route} of ${stageId} for ${userId ?? 'a guest'} - logging only`);
}

function modeOf(ctx) {
  return ctx?.mode === 'log' ? 'log' : 'enforce';
}

/** Premium blocks since boot, for the admin's status card. */
export function premiumGateStats() {
  return { ...premiumCounters, byRoute: { ...premiumCounters.byRoute } };
}

/* ------------------------------------------------------- stage order */

function newGateCounter() {
  return { refused: 0, wouldRefuse: 0, lastAt: null, byReason: {}, refusedTimes: [], wouldTimes: [] };
}

const gateCounters = { solve: newGateCounter(), merge: newGateCounter() };

/**
 * Count a refusal (enforce) or a would-be refusal (log) of `count` items.
 * The timestamps behind the 24-hour figures are pruned first, so the cap only
 * ever holds the last day's - a quiet admin page never stops the count.
 * Exported for the tests.
 */
export function noteGate(gate, { mode, reason, count = 1, userId = null, what = '' }) {
  const counter = gateCounters[gate];
  const now = Date.now();
  const times = mode === 'log' ? counter.wouldTimes : counter.refusedTimes;
  if (mode === 'log') counter.wouldRefuse += count;
  else counter.refused += count;
  counter.byReason[reason] = (counter.byReason[reason] ?? 0) + count;
  counter.lastAt = new Date(now).toISOString();
  lastDay(times, now);
  for (let i = 0; i < count && times.length < TIMES_KEPT; i++) times.push(now);
  if (mode === 'log') console.warn(`[progression] would refuse ${gate} (${reason}) ${what} for ${userId ?? 'a guest'} - logging only`);
}

/** Drops the times older than a day (they are oldest first) and says how many are left. */
function lastDay(times, now) {
  let old = 0;
  while (old < times.length && times[old] <= now - DAY_MS) old++;
  if (old) times.splice(0, old);
  return times.length;
}

/**
 * The stage-order gates since boot: `refused` (enforced) and `wouldRefuse`
 * (logged), each also over the last 24 hours, by reason. For the admin's
 * Limits & access page - the numbers to watch before switching to enforce.
 */
export function progressionGateStats(now = Date.now()) {
  const view = (c) => ({
    refused: c.refused,
    wouldRefuse: c.wouldRefuse,
    refused24h: lastDay(c.refusedTimes, now),
    wouldRefuse24h: lastDay(c.wouldTimes, now),
    lastAt: c.lastAt,
    byReason: { ...c.byReason }
  });
  return { solve: view(gateCounters.solve), merge: view(gateCounters.merge) };
}

/** Forget the counts (a test starts clean). */
export function resetProgressionGateStats() {
  gateCounters.solve = newGateCounter();
  gateCounters.merge = newGateCounter();
}

/** What a learner reads when the stage order refuses a solve. */
export const LOCK_MESSAGES = {
  'stage-locked': 'This stage is still locked - clear the stage before it first.',
  'test-locked': "Finish this stage's lessons before taking its test.",
  'stage-unavailable': 'This lesson is not available right now.'
};

function own(map, key) {
  return map && typeof map === 'object' && typeof key === 'string' && Object.hasOwn(map, key) ? map[key] : undefined;
}

/**
 * A learner's stages exactly as their browser builds them: the learner view
 * of the bank (admin overrides applied, hidden stages and lessons left out),
 * grouped by the shared `groupIntoStages`, hidden tracks left out (the
 * session's `visibleTracks`), and each track's chain run by the shared
 * `applyProgressByTrack` with their solves, their `testedOut` records and
 * their entitlements.
 *
 * `assumeUnlocked` treats one premium stage as bought: the premium gate is
 * a separate check (under its own mode), so the stage order judges a stage
 * as if its price were paid - and a premium stage never dams the ones after.
 *
 * Returns null before the content (or the shared rules) are loaded.
 */
export function learnerAccess(user, progress, { lib, snapshot, overrides, assumeUnlocked = null } = {}) {
  if (!lib || !snapshot) return null;
  const view = applyLearnerOverrides(snapshot, overrides ?? {}, { concepts: false });
  const hidden = overrides?.languages ?? {};
  const tracks = (snapshot.languageTracks ?? []).filter((t) => !own(hidden, t.id)?.hidden);
  const stages = lib.groupIntoStages(view.stages, view.challenges);
  const entitlements = user ? entitlementsFor(user.id, user) : { lifetime: false, trackIds: [], stageIds: [] };
  const unlocked = [...unlockedStageIds(entitlements, snapshot.languageTracks ?? [])];
  const stats = {
    completedChallenges: Array.isArray(progress?.completedChallenges) ? progress.completedChallenges : [],
    testedOut: lib.normalizeTestedOut(progress?.testedOut),
    isPremium: Boolean(entitlements.lifetime),
    unlockedStages: assumeUnlocked ? [...unlocked, assumeUnlocked] : unlocked
  };
  const withState = lib.applyProgressByTrack(stages, tracks, stats);
  const byId = new Map(withState.map((s) => [s.id, s]));
  const chains = lib.stageChains(stages, tracks);
  return {
    stages: withState,
    tracks,
    stats,
    /** Each track's stages in order, then the untracked ones - as filterMergeIds walks them. */
    chains,
    stage: (stageId) => byId.get(stageId) ?? null,
    /** The chain a stage is in, with its states, and that chain's track (null for the untracked stages). */
    trackOf(stageId) {
      const at = chains.findIndex((chain) => chain.some((s) => s.id === stageId));
      if (at === -1) return null;
      return { track: tracks[at] ?? null, stages: chains[at].map((s) => byId.get(s.id) ?? s) };
    }
  };
}

/**
 * The stage-order gate for one solve, or null when it lets the solve
 * through (off, logged, allowed, or nothing to judge with).
 */
function lockCheck(user, challenge, ctx) {
  const mode = ctx.solveGate;
  if (!challenge || !user || !ctx.lib || !ctx.progressFor || (mode !== 'log' && mode !== 'enforce')) return null;
  const progress = ctx.progressFor(user);
  const access = learnerAccess(user, progress, { ...ctx, assumeUnlocked: challenge.stageId });
  if (!access) return null;
  const verdict = ctx.lib.canSolve(challenge, access.stages, access.stats);
  if (verdict.ok) return null;
  noteGate('solve', { mode, reason: verdict.reason, userId: user.id, what: challenge.id });
  if (mode === 'log') return null;
  return { ok: false, reason: verdict.reason, stageId: verdict.stageId, error: LOCK_MESSAGES[verdict.reason] ?? LOCK_MESSAGES['stage-locked'] };
}

/**
 * `{ ok: true }`, or `{ ok: false, reason, stageId, error? }`:
 *   - `premium-locked` when the challenge is in a premium stage this viewer
 *     has not unlocked and the premium gate is enforcing (in log mode a
 *     would-be block is counted, logged and allowed: `logged: true`);
 *   - `stage-locked`, `test-locked` or `stage-unavailable` (with the
 *     learner's sentence in `error`) when the stage order is enforcing and
 *     refuses it.
 */
export function checkSolveAccess(user, challenge, ctx = {}) {
  const gate = premiumGate(user, challenge, ctx);
  if (!gate.ok) {
    const mode = modeOf(ctx);
    notePremiumBlock({ mode, route: ctx.route ?? 'solve', stageId: gate.stageId, userId: user?.id ?? null });
    if (mode !== 'log') return { ok: false, reason: 'premium-locked', stageId: gate.stageId };
  }
  const lock = lockCheck(user, challenge, ctx);
  if (lock) return lock;
  return gate.ok ? { ok: true } : { ok: true, logged: true, stageId: gate.stageId };
}

/**
 * For a guest merge: which challenge ids may be credited. Returns
 * `allows(challenge)`; in log mode everything is allowed and the ones that
 * would have been skipped are counted once per call.
 */
export function mergeAccess(user, ctx = {}) {
  const access = stageAccessFor(user, ctx);
  const mode = modeOf(ctx);
  return {
    allows(challenge) {
      if (!challenge || access.allows(challenge.stageId)) return true;
      notePremiumBlock({ mode, route: 'merge', stageId: challenge.stageId, userId: user?.id ?? null });
      return mode === 'log';
    }
  };
}

/**
 * Which stages a set of solved ids clears, in the learner-facing view
 * (authored + admin-authored questions, minus anything an admin hid - the
 * list the browser counts against): every lesson and the test solved, or a
 * `testedOut` record that `clears` with the stage's test solved.
 */
export function completedStagesFor(completedIds, testedOut, { snapshot, overrides } = {}) {
  if (!snapshot) return [];
  // Which lessons exist, not what they teach: the teaching cards are not needed.
  const merged = applyLearnerOverrides(snapshot, overrides ?? {}, { concepts: false });
  const solved = new Set(completedIds ?? []);
  return merged.stages
    .filter((stage) => {
      const inStage = merged.challenges.filter((c) => c.stageId === stage.id);
      if (inStage.length > 0 && inStage.every((c) => solved.has(c.id))) return true;
      const record = own(testedOut, stage.id);
      const test = inStage.find((c) => c.isStageTest);
      return Boolean(record?.clears) && Boolean(test) && solved.has(test.id);
    })
    .map((stage) => stage.id);
}

/* ------------------------------------------------------------- merge */

/**
 * A merge's new ids through the stage order, under `access.mergeGate`
 * (`ctx.mergeGate`): `{ accepted, dropped }`. Off credits everything, as
 * before; log counts what would be held back and credits everything;
 * enforce holds it back (`dropped`, answered as `droppedChallenges`).
 * `current` is the account's row AFTER any accepted test-out claims.
 */
export function filterMerge(user, current, newIds, ctx = {}) {
  const mode = ctx.mergeGate;
  if ((mode !== 'log' && mode !== 'enforce') || !ctx.lib || newIds.length === 0) return { accepted: newIds, dropped: [] };
  const access = learnerAccess(user, current, ctx);
  if (!access) return { accepted: newIds, dropped: [] };
  const result = ctx.lib.filterMergeIds(access.chains, access.stats.completedChallenges, newIds, access.stats);
  if (result.dropped.length) {
    noteGate('merge', { mode, reason: 'stage-locked', count: result.dropped.length, userId: user?.id ?? null, what: `${result.dropped.length} merged solve(s)` });
  }
  return mode === 'log' ? { accepted: newIds, dropped: [] } : result;
}

/** The most test-out claims one merge checks (each may run code). */
export const MAX_CLAIMS = 20;

function clampInt(value, min, max, fallback) {
  const n = Math.floor(Number(value));
  return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : fallback;
}

/**
 * A guest's `assessmentClaims` (a list, or the browser's map by stage id),
 * made safe: `{ claims, rejected }`. Malformed ones are rejected `invalid`,
 * a second claim for a stage is ignored, and past `MAX_CLAIMS` they are
 * rejected `over-cap` without being looked at.
 */
export function normalizeClaims(raw, xp) {
  const list = Array.isArray(raw) ? raw : raw && typeof raw === 'object' ? Object.values(raw) : [];
  const claims = [];
  const rejected = [];
  const seen = new Set();
  for (const item of list) {
    const c = item && typeof item === 'object' ? item : {};
    const stageId = typeof c.stageId === 'string' && c.stageId.length <= 64 ? c.stageId : '';
    if (claims.length >= MAX_CLAIMS) {
      if (stageId) rejected.push({ stageId, reason: 'over-cap' });
      continue;
    }
    const kind = c.kind === 'test-out' || c.kind === 'placement' ? c.kind : null;
    const testId = typeof c.testId === 'string' && c.testId.length <= 128 ? c.testId : '';
    if (!stageId || !kind || !testId) {
      if (stageId) rejected.push({ stageId, reason: 'invalid' });
      continue;
    }
    if (seen.has(stageId)) continue;
    seen.add(stageId);
    claims.push({
      kind,
      stageId,
      testId,
      attempts: clampInt(c.attempts, 1, xp.maxAttemptsCounted, 1),
      hintsUsed: clampInt(c.hintsUsed, 0, xp.maxHintsCounted, 0),
      ...(typeof c.code === 'string' ? { code: c.code.slice(0, 100_000) } : {}),
      ...(c.answer !== undefined ? { answer: c.answer } : {}),
      at: typeof c.at === 'string' ? c.at : ''
    });
  }
  return { claims, rejected };
}

/** The rules a claim of this kind is judged by (its own pass mark, hints and XP share). */
function claimRules(kind, rules) {
  return kind === 'placement' ? rules.placement : rules.testOut;
}

/**
 * Merge step 2, the part that awaits: each claim's answer is checked by the
 * server (`verifySubmission`, one at a time) - after the cheap checks that
 * need no progress, so nothing is run for a claim that cannot count anyway:
 * claims switched off (`access.acceptGuestClaims`, or the kind itself), not
 * the stage's test, hints where none are allowed, below the pass mark. Then:
 * a test the account has already solved (`alreadySolved`, `already-cleared`).
 * Each claim left counts against the account's limit before it is run
 * (`mayRun`; `rate-limited` once over it). Then a wrong answer is
 * `wrong`; one the server could not check itself while
 * `access.requireServerVerification` is on is `unverifiable`; a busy code
 * runner is `busy`. Returns `{ checked: [{ claim, challenge, verified }], rejected }`.
 */
export async function verifyClaims(raw, { rules, lib, getChallengeMerged, verifySubmission, alreadySolved = () => false, mayRun = () => true }) {
  const { claims, rejected } = normalizeClaims(raw, rules.xp);
  const checked = [];
  for (const claim of claims) {
    const own = claimRules(claim.kind, rules);
    if (!rules.access.acceptGuestClaims || !own.enabled) {
      rejected.push({ stageId: claim.stageId, reason: 'disabled' });
      continue;
    }
    const challenge = getChallengeMerged(claim.testId);
    if (!challenge || !challenge.isStageTest || challenge.stageId !== claim.stageId) {
      rejected.push({ stageId: claim.stageId, reason: 'not-a-test' });
      continue;
    }
    if (!own.hintsAllowed && claim.hintsUsed > 0) {
      rejected.push({ stageId: claim.stageId, reason: 'hints' });
      continue;
    }
    if (lib.rawScore(claim.attempts, claim.hintsUsed, rules.xp) < own.passMark) {
      rejected.push({ stageId: claim.stageId, reason: 'below-pass-mark' });
      continue;
    }
    if (alreadySolved(claim.testId)) {
      rejected.push({ stageId: claim.stageId, reason: 'already-cleared' });
      continue;
    }
    if (!mayRun(claim)) {
      rejected.push({ stageId: claim.stageId, reason: 'rate-limited' });
      continue;
    }
    let verdict;
    try {
      verdict = await verifySubmission(challenge, { code: claim.code, answer: claim.answer });
    } catch (err) {
      if (!(err instanceof BusyError)) throw err;
      rejected.push({ stageId: claim.stageId, reason: 'busy' });
      continue;
    }
    if (!verdict?.ok) {
      rejected.push({ stageId: claim.stageId, reason: 'wrong' });
      continue;
    }
    if (rules.access.requireServerVerification && !verdict.verified) {
      rejected.push({ stageId: claim.stageId, reason: 'unverifiable' });
      continue;
    }
    checked.push({ claim, challenge, verified: Boolean(verdict.verified) });
  }
  return { checked, rejected };
}

const EMPTY_LOG = { records: [], cooldownClearedAt: {} };

/**
 * Merge step 2, the synchronous part (after the last await): the verified
 * claims, in track order, against the account's row as it is now. A claim is
 * kept when its stage is in the learner's view, not premium-locked (while the
 * premium gate enforces), its test not already solved, and it is reachable -
 * a test-out by the test-out rules (skip-ahead, open stages, excluded stages;
 * the account's own limit and cooldown do not apply to what a guest did), a
 * placement test while it is in the placement queue and the placement has
 * not placed `maxStages` yet. Each claim kept is recorded like a live pass:
 * the test solved (`via`), paid `xpForTestOut`, and the `testedOut` record
 * written with `clears` from the settings - so a later claim, and the merged
 * lessons after it, see its stage cleared.
 *
 * Returns `{ progress, accepted: [{ stageId, testId, kind, xp }], rejected, credits, awardedXp }`.
 */
export function acceptClaims(current, checked, ctx) {
  const { user, lib, rules, now, zone, today, completedStagesFor: stagesFor, premiumEnforced = true } = ctx;
  let next = current;
  const accepted = [];
  const rejected = [];
  const credits = [];
  let awardedXp = 0;
  const placed = new Map();

  const first = learnerAccess(user, current, ctx);
  if (!first) return { progress: current, accepted, rejected: checked.map(({ claim }) => ({ stageId: claim.stageId, reason: 'unavailable' })), credits, awardedXp };
  const order = new Map(first.chains.flat().map((s, i) => [s.id, i]));
  const sorted = [...checked].sort((a, b) => (order.get(a.claim.stageId) ?? Infinity) - (order.get(b.claim.stageId) ?? Infinity));

  for (const { claim, challenge } of sorted) {
    // While the premium gate only logs, a premium stage is judged as bought (as a solve would be).
    const access = learnerAccess(user, next, { ...ctx, assumeUnlocked: premiumEnforced ? null : claim.stageId });
    const stage = access.stage(claim.stageId);
    const reject = (reason) => rejected.push({ stageId: claim.stageId, reason });
    if (!stage) {
      reject('unknown-stage');
      continue;
    }
    if (stage.test?.id !== claim.testId) {
      reject('not-a-test');
      continue;
    }
    if (premiumEnforced && lib.isPremiumLocked(stage, access.stats)) {
      reject('premium');
      continue;
    }
    if (access.stats.completedChallenges.includes(claim.testId)) {
      reject('already-cleared');
      continue;
    }
    const chain = access.trackOf(stage.id);
    const trackStages = chain?.stages ?? [stage];
    if (claim.kind === 'test-out') {
      const eligibility = lib.testOutEligibility({ stage, trackStages, log: EMPTY_LOG, rules: rules.testOut, stats: access.stats, now });
      if (!eligibility.allowed) {
        reject(eligibility.reason === 'test-pending' ? 'test-pending' : eligibility.reason ?? 'not-reachable');
        continue;
      }
    } else {
      const trackId = chain?.track?.id ?? '';
      const done = placed.get(trackId) ?? 0;
      const room = rules.placement.maxStages - done;
      const queue = room > 0 ? lib.placementQueue(trackStages, { ...rules.placement, maxStages: room }, { trackId, stats: access.stats }) : [];
      if (!queue.includes(stage.id)) {
        reject('not-reachable');
        continue;
      }
      placed.set(trackId, done + 1);
    }

    const own = claimRules(claim.kind, rules);
    const at = validSolvedAt(claim.at, now.getTime(), rules.retention.activityDaysKept);
    const solved = applySolveCore({
      progress: next,
      challenge,
      attempts: claim.attempts,
      hintsUsed: claim.hintsUsed,
      now: new Date(at),
      lib,
      xp: rules.xp,
      levels: rules.levels,
      completedStagesFor: stagesFor,
      testOut: {
        stageId: stage.id,
        via: claim.kind,
        clears: rules.testOut.countsAsCleared,
        assessmentId: `guest-${claim.kind}`,
        xpPercent: own.xpPercent
      }
    });
    next = solved.next;
    awardedXp += solved.awarded;
    accepted.push({ stageId: stage.id, testId: claim.testId, kind: claim.kind, xp: solved.awarded });
    const day = lib.dayKeyIn(zone, new Date(at));
    credits.push({ challengeId: claim.testId, day: day > today ? today : day, at, isTest: true, awardedXp: solved.awarded });
  }
  return { progress: next, accepted, rejected, credits, awardedXp };
}
