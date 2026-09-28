/**
 * The learner's own preferences in the browser, and how they meet the
 * account's (`users[].preferences`, PATCH /api/me/preferences).
 *
 * Two are kept here (`cq-preferences-v1`):
 *   soundOn      (Phase 2) - resolves from the account's choice when signed
 *                in, then this browser's, then `celebrations.sound.defaultOn`;
 *   dailyGoalId  (Phase 3) - the account's choice, then this browser's, then
 *                the default goal option (`goals.defaultOptionId`, applied by
 *                the habits engine's `effectiveGoal`).
 * This browser's copy is a guest's own, or the last one this device saw, so a
 * choice survives a reload and a sign-out.
 *
 * A choice the server has not taken yet is pending, with who made it
 * (`pendingSync` for the sound, `goalPendingSync` for the goal): a guest's is
 * offered to the next account (adopted only where the account has none - the
 * server applies the same rule to a merge); a signed-in learner's own
 * offline choice is simply sent when the server is back.
 *
 * The time zone is not kept here: it is this device's (`browserTimeZone`),
 * sent whenever it differs from the account's. A change the server does not
 * apply (inside its cooldown, or offline) is simply sent again next time.
 */
import type { LearnerPreferences } from '@/types';
import { STORAGE_KEYS, readJson, writeJson } from '../storage/storage';
import type { PreferencesPatch } from '../api-client/api';

export interface LocalPreferences {
  soundOn: boolean | null;
  /** A sound choice not yet on any account: 'guest', or the id of the account it was made under. */
  pendingSync: string | null;
  /** The daily goal chosen here (an option id), or null for the default. */
  dailyGoalId?: string | null;
  /** Like `pendingSync`, for the daily goal. */
  goalPendingSync?: string | null;
}

export const EMPTY_LOCAL_PREFERENCES: LocalPreferences = { soundOn: null, pendingSync: null, dailyGoalId: null, goalPendingSync: null };

const GOAL_ID = /^[a-z0-9-]{1,32}$/;

function owner(value: unknown): string | null {
  // An older copy stored `true`: a guest's choice.
  return typeof value === 'string' && value ? value : value === true ? 'guest' : null;
}

export function readLocalPreferences(): LocalPreferences {
  const raw = readJson<Record<string, unknown> | null>(STORAGE_KEYS.preferences, null);
  if (!raw || typeof raw !== 'object') return { ...EMPTY_LOCAL_PREFERENCES };
  const goal = typeof raw.dailyGoalId === 'string' && GOAL_ID.test(raw.dailyGoalId) ? raw.dailyGoalId : null;
  return {
    soundOn: typeof raw.soundOn === 'boolean' ? raw.soundOn : null,
    pendingSync: owner(raw.pendingSync),
    dailyGoalId: goal,
    // A pending "back to the default" is a real choice too; a broken id is not.
    goalPendingSync: goal === null && raw.dailyGoalId !== null && raw.dailyGoalId !== undefined ? null : owner(raw.goalPendingSync)
  };
}

export function writeLocalPreferences(prefs: LocalPreferences): void {
  writeJson(STORAGE_KEYS.preferences, prefs);
}

/** Sound on or off, from the account, then this browser, then the default. */
export function resolveSoundOn(account: LearnerPreferences | null | undefined, local: LocalPreferences, defaultOn: boolean): boolean {
  if (typeof account?.soundOn === 'boolean') return account.soundOn;
  if (typeof local.soundOn === 'boolean') return local.soundOn;
  return defaultOn;
}

/** Is this browser's goal choice waiting to go up to this account (null: a guest)? */
function goalGoesUp(accountId: string | null, account: LearnerPreferences | null | undefined, local: LocalPreferences): boolean {
  const pending = local.goalPendingSync ?? null;
  if (!pending) return false;
  if (accountId === null) return true;
  return pending === accountId || (pending === 'guest' && typeof account?.dailyGoalId !== 'string');
}

/**
 * The goal the learner chose: an option id, or null for the default. A
 * guest's is this browser's; a signed-in learner's is the account's - unless
 * a choice made here is still on its way up, which is then the one in use.
 * Whether the option is still offered is the habits engine's business
 * (`effectiveGoal` falls back to the default and keeps the choice).
 */
export function resolveDailyGoalId(accountId: string | null, account: LearnerPreferences | null | undefined, local: LocalPreferences): string | null {
  if (accountId === null || goalGoesUp(accountId, account, local)) return local.dailyGoalId ?? null;
  return typeof account?.dailyGoalId === 'string' ? account.dailyGoalId : null;
}

export interface Reconciled {
  /** What to send to PATCH /api/me/preferences, or null. */
  patch: PreferencesPatch | null;
  /** This browser's copy afterwards (still pending until the patch lands - see `settledLocal`). */
  local: LocalPreferences;
}

/**
 * Bring this browser's choices and an account's together once the account
 * is known (sign-in, a restored session). For each of the sound and the goal:
 *   - a choice made under THIS account while offline goes up as it is;
 *   - a guest's choice goes up only if the account has none;
 *   - otherwise the account's choice wins, and this browser remembers it.
 * A goal choice for an option that can no longer be chosen
 * (`options.isGoalAvailable`) is dropped instead of sent: the server would
 * refuse the whole patch over it, the sound and the zone with it.
 * And the time zone: this device's (`options.zone`) goes up when it differs
 * from the account's; the server applies it unless it changed too recently.
 */
export function reconcilePreferences(
  accountId: string,
  account: LearnerPreferences | null | undefined,
  local: LocalPreferences,
  options: { zone?: string | null; isGoalAvailable?: (id: string) => boolean } = {}
): Reconciled {
  const patch: PreferencesPatch = {};
  const next: LocalPreferences = { ...local };
  const goalGone = typeof local.dailyGoalId === 'string' && options.isGoalAvailable !== undefined && !options.isGoalAvailable(local.dailyGoalId);

  const accountSound = typeof account?.soundOn === 'boolean' ? account.soundOn : null;
  const soundPending = typeof local.soundOn === 'boolean' && local.pendingSync !== null;
  if (soundPending && (local.pendingSync === accountId || (local.pendingSync === 'guest' && accountSound === null))) {
    patch.soundOn = local.soundOn;
  } else if (accountSound !== null) {
    next.soundOn = accountSound;
    next.pendingSync = null;
  } else {
    next.pendingSync = null;
  }

  if (goalGoesUp(accountId, account, local) && !goalGone) {
    patch.dailyGoalId = local.dailyGoalId ?? null;
  } else if (local.dailyGoalId !== undefined || local.goalPendingSync !== undefined) {
    // The account's choice (or its default) is the one in use from now on.
    next.dailyGoalId = typeof account?.dailyGoalId === 'string' ? account.dailyGoalId : null;
    next.goalPendingSync = null;
  }

  if (options.zone && options.zone !== (account?.timeZone ?? null)) patch.timeZone = options.zone;

  return { patch: Object.keys(patch).length > 0 ? patch : null, local: next };
}

/** This browser's copy once `patch` has landed: what it carried is no longer pending. */
export function settledLocal(local: LocalPreferences, patch: PreferencesPatch): LocalPreferences {
  const next = { ...local };
  if ('soundOn' in patch) next.pendingSync = null;
  if ('dailyGoalId' in patch) next.goalPendingSync = null;
  return next;
}
