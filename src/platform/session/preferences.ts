/**
 * The learner's own preferences in the browser, and how they meet the
 * account's (`users[].preferences`, PATCH /api/me/preferences).
 *
 * Phase 2 has one: `soundOn`. It resolves, in order, from
 *   1. the account's choice (`user.preferences.soundOn`), when signed in;
 *   2. this browser's choice (`cq-preferences-v1`) - a guest's, or the last
 *      one this device saw, so muting survives a reload and a sign-out;
 *   3. the default, `celebrations.sound.defaultOn`.
 *
 * A choice the server has not taken yet is `pendingSync`, with who made it:
 * a guest's is offered to the next account (adopted only where the account
 * has none - the server applies the same rule to a merge); a signed-in
 * learner's own offline choice is simply sent when the server is back.
 */
import type { LearnerPreferences } from '@/types';
import { STORAGE_KEYS, readJson, writeJson } from '../storage/storage';

export interface LocalPreferences {
  soundOn: boolean | null;
  /** A choice not yet on any account: 'guest', or the id of the account it was made under. */
  pendingSync: string | null;
}

export const EMPTY_LOCAL_PREFERENCES: LocalPreferences = { soundOn: null, pendingSync: null };

export function readLocalPreferences(): LocalPreferences {
  const raw = readJson<Record<string, unknown> | null>(STORAGE_KEYS.preferences, null);
  if (!raw || typeof raw !== 'object') return { ...EMPTY_LOCAL_PREFERENCES };
  return {
    soundOn: typeof raw.soundOn === 'boolean' ? raw.soundOn : null,
    // An older copy stored `true`: a guest's choice.
    pendingSync: typeof raw.pendingSync === 'string' && raw.pendingSync ? raw.pendingSync : raw.pendingSync === true ? 'guest' : null
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

export interface Reconciled {
  /** What to send to PATCH /api/me/preferences, or null. */
  patch: Pick<LearnerPreferences, 'soundOn'> | null;
  /** This browser's copy afterwards. */
  local: LocalPreferences;
}

/**
 * Bring this browser's choice and an account's together once the account is
 * known (sign-in, a restored session):
 *   - a choice made under THIS account while offline goes up as it is;
 *   - a guest's choice goes up only if the account has none;
 *   - otherwise the account's choice wins, and this browser remembers it.
 */
export function reconcilePreferences(accountId: string, account: LearnerPreferences | null | undefined, local: LocalPreferences): Reconciled {
  const accountSound = typeof account?.soundOn === 'boolean' ? account.soundOn : null;
  const pendingHere = typeof local.soundOn === 'boolean' && local.pendingSync !== null;
  if (pendingHere && (local.pendingSync === accountId || (local.pendingSync === 'guest' && accountSound === null))) {
    return { patch: { soundOn: local.soundOn }, local };
  }
  if (accountSound !== null) return { patch: null, local: { soundOn: accountSound, pendingSync: null } };
  return { patch: null, local: { ...local, pendingSync: null } };
}
