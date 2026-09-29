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
 *
 * Phase 5 adds four more (`SyncedField`), each pending in `fieldsPending`:
 *   trackId, learningMode - this device's choices (kept in their own keys,
 *                `cq-selected-track` and `cq-learning-mode`); an account
 *                that has none takes this device's (the first device wins),
 *                otherwise the account's is adopted here - unless the
 *                learner changed it here, signed in, while offline;
 *   motivation, experience - the first-run setup's answers, kept here; a
 *                guest's go up only where the account has none.
 * And the setup itself (finished or put aside) in `cq-onboarding-v1`, with
 * the same rule (`reconcileOnboarding`).
 */
import type { LearnerPreferences, LearningMode, OnboardingState } from '@/types';
import { STORAGE_KEYS, readJson, writeJson } from '../storage/storage';
import type { PreferencesPatch } from '../api-client/api';

/** The Phase 5 preferences that follow the account, each with its own pending owner. */
export type SyncedField = 'trackId' | 'learningMode' | 'motivation' | 'experience';

export interface LocalPreferences {
  soundOn: boolean | null;
  /** A sound choice not yet on any account: 'guest', or the id of the account it was made under. */
  pendingSync: string | null;
  /** The daily goal chosen here (an option id), or null for the default. */
  dailyGoalId?: string | null;
  /** Like `pendingSync`, for the daily goal. */
  goalPendingSync?: string | null;
  /** The first-run setup's "why are you learning?" answer given here (an option id). */
  motivation?: string | null;
  /** The first-run setup's "how much do you know?" answer given here. */
  experience?: string | null;
  /** Like `pendingSync`, per Phase 5 field: who made a choice here that no account has yet. */
  fieldsPending?: Partial<Record<SyncedField, string>>;
}

export const EMPTY_LOCAL_PREFERENCES: LocalPreferences = { soundOn: null, pendingSync: null, dailyGoalId: null, goalPendingSync: null };

const GOAL_ID = /^[a-z0-9-]{1,32}$/;
/** The experience answers (the ids are fixed: `ExperienceLevel` in settings/types.ts). */
export const EXPERIENCE_IDS = ['new', 'some', 'experienced'] as const;
const SYNCED_FIELDS: SyncedField[] = ['trackId', 'learningMode', 'motivation', 'experience'];

function owner(value: unknown): string | null {
  // An older copy stored `true`: a guest's choice.
  return typeof value === 'string' && value ? value : value === true ? 'guest' : null;
}

function answerId(value: unknown): string | null {
  return typeof value === 'string' && GOAL_ID.test(value) ? value : null;
}

export function readLocalPreferences(): LocalPreferences {
  const raw = readJson<Record<string, unknown> | null>(STORAGE_KEYS.preferences, null);
  if (!raw || typeof raw !== 'object') return { ...EMPTY_LOCAL_PREFERENCES };
  const goal = typeof raw.dailyGoalId === 'string' && GOAL_ID.test(raw.dailyGoalId) ? raw.dailyGoalId : null;
  const prefs: LocalPreferences = {
    soundOn: typeof raw.soundOn === 'boolean' ? raw.soundOn : null,
    pendingSync: owner(raw.pendingSync),
    dailyGoalId: goal,
    // A pending "back to the default" is a real choice too; a broken id is not.
    goalPendingSync: goal === null && raw.dailyGoalId !== null && raw.dailyGoalId !== undefined ? null : owner(raw.goalPendingSync)
  };
  // Phase 5: only when this browser has any, so an older copy reads exactly as before.
  if ('motivation' in raw) prefs.motivation = answerId(raw.motivation);
  if ('experience' in raw) prefs.experience = (EXPERIENCE_IDS as readonly unknown[]).includes(raw.experience) ? (raw.experience as string) : null;
  const pending = raw.fieldsPending;
  if (pending && typeof pending === 'object' && !Array.isArray(pending)) {
    const out: Partial<Record<SyncedField, string>> = {};
    for (const field of SYNCED_FIELDS) {
      const who = owner((pending as Record<string, unknown>)[field]);
      if (who) out[field] = who;
    }
    if (Object.keys(out).length) prefs.fieldsPending = out;
  }
  return prefs;
}

/** This browser's copy with `field` marked as chosen here by `who` ('guest' or an account id). */
export function withFieldPending(local: LocalPreferences, field: SyncedField, who: string): LocalPreferences {
  return { ...local, fieldsPending: { ...(local.fieldsPending ?? {}), [field]: who } };
}

/** This browser's copy with nothing pending for these fields (they landed, or the account's won). */
export function withoutFieldsPending(local: LocalPreferences, fields: readonly SyncedField[]): LocalPreferences {
  if (!local.fieldsPending) return local;
  const rest = { ...local.fieldsPending };
  for (const field of fields) delete rest[field];
  const next = { ...local };
  if (Object.keys(rest).length) next.fieldsPending = rest;
  else delete next.fieldsPending;
  return next;
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
  /**
   * The account's track and mode, where this device should take them
   * (Phase 5): the caller switches to them. Absent when this device's own
   * stand, or go up.
   */
  adopt: { trackId?: string; learningMode?: LearningMode };
}

/** What `reconcilePreferences` may be told beyond the account and this browser's copy. */
export interface ReconcileOptions {
  zone?: string | null;
  isGoalAvailable?: (id: string) => boolean;
  /** This device's track and learning mode (Phase 5), from their own keys. */
  device?: { trackId: string | null; learningMode: LearningMode | null };
  /** Is this a track the learner may pick (a visible one)? Without it a device's track is sent and the server decides. */
  isTrackAvailable?: (id: string) => boolean;
  /** Is this still a motivation answer the setup offers? Without it one is not sent. */
  isMotivation?: (id: string) => boolean;
}

/**
 * The Phase 5 fields, one at a time (see the file comment). `value` is this
 * device's choice, `valid` whether the server would take it.
 */
function reconcileField(
  accountId: string,
  accountValue: string | null,
  value: string | null,
  pending: string | null,
  valid: boolean,
  deviceChoice: boolean
): 'send' | 'adopt' | 'keep' {
  if (value !== null && value !== accountValue && valid) {
    // This account's own change, made here while offline: it goes up as it is.
    if (pending === accountId) return 'send';
    // An account with none takes this device's: the track and mode from any
    // device (the first device wins), an answer only from a guest's setup.
    if (accountValue === null && (deviceChoice || pending === 'guest')) return 'send';
  }
  return accountValue !== null ? 'adopt' : 'keep';
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
 * And the Phase 5 fields: this device's track and mode go up to an account
 * that has none (or when this account changed them here offline), else the
 * account's are adopted (`adopt`); the setup's answers go up from a guest
 * only where the account has none, else the account's are remembered here.
 */
export function reconcilePreferences(
  accountId: string,
  account: LearnerPreferences | null | undefined,
  local: LocalPreferences,
  options: ReconcileOptions = {}
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

  // Phase 5: the track, the mode and the setup's answers.
  const adopt: Reconciled['adopt'] = {};
  const settledFields: SyncedField[] = [];
  const text = (v: unknown) => (typeof v === 'string' && v ? v : null);
  const device = options.device;
  if (device) {
    const accountTrack = text(account?.trackId);
    const track = reconcileField(
      accountId,
      accountTrack,
      device.trackId,
      local.fieldsPending?.trackId ?? null,
      // Without the list of tracks (the content not loaded yet) it goes up
      // and the server decides; a track it refuses is dropped and the rest sent.
      Boolean(device.trackId && (options.isTrackAvailable ? options.isTrackAvailable(device.trackId) : true)),
      true
    );
    if (track === 'send') patch.trackId = device.trackId;
    else {
      if (track === 'adopt' && accountTrack !== device.trackId) adopt.trackId = accountTrack as string;
      settledFields.push('trackId');
    }
    const accountMode = account?.learningMode === 'learn' || account?.learningMode === 'practice' ? account.learningMode : null;
    const mode = reconcileField(accountId, accountMode, device.learningMode, local.fieldsPending?.learningMode ?? null, true, true);
    if (mode === 'send') patch.learningMode = device.learningMode;
    else {
      if (mode === 'adopt' && accountMode !== device.learningMode) adopt.learningMode = accountMode as LearningMode;
      settledFields.push('learningMode');
    }
  }
  for (const field of ['motivation', 'experience'] as const) {
    const accountValue = text(account?.[field]);
    const value = local[field] ?? null;
    if (local[field] === undefined && accountValue === null && !local.fieldsPending?.[field]) continue;
    const valid = field === 'experience' ? value !== null && (EXPERIENCE_IDS as readonly string[]).includes(value) : value !== null && Boolean(options.isMotivation?.(value));
    const verdict = reconcileField(accountId, accountValue, value, local.fieldsPending?.[field] ?? null, valid, false);
    if (verdict === 'send') patch[field] = value;
    else {
      // The account's answer from now on (or none: another account's stays out of this one).
      next[field] = accountValue;
      settledFields.push(field);
    }
  }
  const settled = withoutFieldsPending(next, settledFields);

  return { patch: Object.keys(patch).length > 0 ? patch : null, local: settled, adopt };
}

/* ------------------------------------------------------------- onboarding */

/** The first-run setup in this browser (`cq-onboarding-v1`). */
export interface LocalOnboarding extends OnboardingState {
  /** Finished or put aside here, and not on any account yet: 'guest', or the account it was done under. */
  pendingSync: string | null;
}

export const EMPTY_LOCAL_ONBOARDING: LocalOnboarding = { completedAt: null, dismissedAt: null, pendingSync: null };

export function readLocalOnboarding(): LocalOnboarding {
  const raw = readJson<Record<string, unknown> | null>(STORAGE_KEYS.onboarding, null);
  if (!raw || typeof raw !== 'object') return { ...EMPTY_LOCAL_ONBOARDING };
  const at = (v: unknown) => (typeof v === 'string' && v ? v : null);
  return { completedAt: at(raw.completedAt), dismissedAt: at(raw.dismissedAt), pendingSync: owner(raw.pendingSync) };
}

export function writeLocalOnboarding(state: LocalOnboarding): void {
  writeJson(STORAGE_KEYS.onboarding, state);
}

/** Was the setup finished or put aside? */
function onboardingDone(state: OnboardingState | null | undefined): boolean {
  return Boolean(state && (state.completedAt || state.dismissedAt));
}

/**
 * The setup's state for this learner: a guest's is this browser's; an
 * account's is the account's - or this browser's while one made here (by
 * this account, or by the guest who just signed in to an account that has
 * none) is on its way up.
 */
export function effectiveOnboarding(accountId: string | null, account: OnboardingState | null | undefined, local: LocalOnboarding): OnboardingState | null {
  const mine: OnboardingState | null = onboardingDone(local) ? { completedAt: local.completedAt, dismissedAt: local.dismissedAt } : null;
  if (accountId === null) return mine;
  if (onboardingDone(account)) return { completedAt: account?.completedAt ?? null, dismissedAt: account?.dismissedAt ?? null };
  if (mine && (local.pendingSync === accountId || local.pendingSync === 'guest')) return mine;
  return null;
}

/**
 * Should this learner be sent to the first-run setup? Only one who has not
 * finished it, has not put it aside AND has solved nothing: nobody with
 * progress - every account from before the setup existed - is ever sent.
 */
export function needsOnboarding(state: OnboardingState | null | undefined, solvedCount: number): boolean {
  return !onboardingDone(state) && solvedCount === 0;
}

/**
 * The setup and an account, once the account is known: finished or put
 * aside here (by this account offline, or by the guest who just signed in to
 * an account that has not done it) goes up; otherwise the account's is
 * remembered here and nothing is pending.
 */
export function reconcileOnboarding(
  accountId: string,
  account: OnboardingState | null | undefined,
  local: LocalOnboarding
): { action: 'completed' | 'dismissed' | null; local: LocalOnboarding } {
  if (onboardingDone(local) && !onboardingDone(account) && (local.pendingSync === accountId || local.pendingSync === 'guest')) {
    return { action: local.completedAt ? 'completed' : 'dismissed', local };
  }
  if (onboardingDone(account)) {
    return { action: null, local: { completedAt: account?.completedAt ?? null, dismissedAt: account?.dismissedAt ?? null, pendingSync: null } };
  }
  return { action: null, local: { ...EMPTY_LOCAL_ONBOARDING } };
}

/**
 * Teaching sequences already seen, from several places (this browser, the
 * account), each once and in first-seen order. From Phase 5 the server keeps
 * `seenConcepts` too - which starts out empty for every account - so every
 * place that adopts a server row unions instead of overwriting: otherwise
 * the first restore after the upgrade would erase the history this browser
 * kept on its own.
 */
export function unionConcepts(...lists: Array<readonly unknown[] | null | undefined>): string[] {
  const seen = new Set<string>();
  for (const list of lists) {
    if (!Array.isArray(list)) continue;
    for (const id of list) if (typeof id === 'string' && id) seen.add(id);
  }
  return [...seen];
}

/** This browser's copy once `patch` has landed: what it carried is no longer pending. */
export function settledLocal(local: LocalPreferences, patch: PreferencesPatch): LocalPreferences {
  const next = { ...local };
  if ('soundOn' in patch) next.pendingSync = null;
  if ('dailyGoalId' in patch) next.goalPendingSync = null;
  return withoutFieldsPending(
    next,
    SYNCED_FIELDS.filter((field) => field in patch)
  );
}

/**
 * The setup's answers for this learner (a guest's from this browser; an
 * account's, else this browser's while they are on their way up), to fill
 * the setup in again ("Redo setup").
 */
export function resolveAnswers(accountId: string | null, account: LearnerPreferences | null | undefined, local: LocalPreferences): { motivation: string | null; experience: string | null } {
  const pick = (field: 'motivation' | 'experience') => {
    const mine = local[field] ?? null;
    if (accountId === null) return mine;
    const theirs = typeof account?.[field] === 'string' && account[field] ? (account[field] as string) : null;
    const pending = local.fieldsPending?.[field];
    if (mine !== null && (pending === accountId || (pending === 'guest' && theirs === null))) return mine;
    return theirs;
  };
  return { motivation: pick('motivation'), experience: pick('experience') };
}
