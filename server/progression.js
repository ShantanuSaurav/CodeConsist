/**
 * Access gates: may this learner solve this challenge at all?
 *
 * One entry point, `checkSolveAccess(user, challenge, ctx)`, used by the
 * solve route (before any code runs), the public grade route and - through
 * `mergeAccess` - the guest merge. In this phase it is the premium gate
 * (server/billing.js premiumGate); the lock-order gate joins it later.
 *
 * `ctx` is built once per request by the caller:
 *   { snapshot, overrides }  the content and admin overrides (billing.js)
 *   mode                     `access.premiumGate`: 'enforce' blocks,
 *                            'log' records what would be blocked and lets it
 *                            through - the emergency switch if paying
 *                            learners are ever wrongly refused
 *   route                    'solve' | 'grade' | 'merge', for the counters
 *
 * The counters are in memory (since boot) and shown on the admin's Limits &
 * access page; a restart clears them.
 */
import { premiumGate, stageAccessFor } from './billing.js';

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

/**
 * `{ ok: true }`, or `{ ok: false, reason: 'premium-locked', stageId }` when
 * the challenge is in a premium stage this viewer has not unlocked and the
 * gate is enforcing. In log mode a would-be block is counted, logged and
 * allowed (`logged: true`).
 */
export function checkSolveAccess(user, challenge, ctx = {}) {
  const gate = premiumGate(user, challenge, ctx);
  if (gate.ok) return { ok: true };
  const mode = modeOf(ctx);
  notePremiumBlock({ mode, route: ctx.route ?? 'solve', stageId: gate.stageId, userId: user?.id ?? null });
  if (mode === 'log') return { ok: true, logged: true, stageId: gate.stageId };
  return { ok: false, reason: 'premium-locked', stageId: gate.stageId };
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

/** Premium blocks since boot, for the admin's status card. */
export function premiumGateStats() {
  return { ...premiumCounters, byRoute: { ...premiumCounters.byRoute } };
}
