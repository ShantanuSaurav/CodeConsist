/**
 * localStorage that never throws.
 *
 * Private windows, disabled site data and quota errors all make the real API
 * throw, and a thrown storage call in a render path takes the whole app down.
 */

function backing(): Storage | null {
  try {
    const probe = '__cq_probe__';
    window.localStorage.setItem(probe, '1');
    window.localStorage.removeItem(probe);
    return window.localStorage;
  } catch {
    return null;
  }
}

const memory = new Map<string, string>();
const store = typeof window !== 'undefined' ? backing() : null;

export function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = store ? store.getItem(key) : memory.get(key) ?? null;
    if (raw === null) return fallback;
    const parsed = JSON.parse(raw);
    return parsed === null || parsed === undefined ? fallback : (parsed as T);
  } catch {
    return fallback;
  }
}

export function writeJson(key: string, value: unknown): void {
  try {
    const raw = JSON.stringify(value);
    if (store) store.setItem(key, raw);
    else memory.set(key, raw);
  } catch {
    /* out of quota, or a value with a cycle - not worth breaking the app over */
  }
}

export function readString(key: string): string | null {
  try {
    return store ? store.getItem(key) : memory.get(key) ?? null;
  } catch {
    return null;
  }
}

export function writeString(key: string, value: string): void {
  try {
    if (store) store.setItem(key, value);
    else memory.set(key, value);
  } catch {
    /* ignore */
  }
}

export function remove(key: string): void {
  try {
    if (store) store.removeItem(key);
    else memory.delete(key);
  } catch {
    /* ignore */
  }
}

export const STORAGE_KEYS = {
  stats: 'cq-user-stats-v2',
  theme: 'cq-theme',
  user: 'cq-user-profile-v2',
  token: 'cq-auth-token',
  editor: 'cq-playground-draft',
  /**
   * The HTML/CSS/JS playground's three files, its active tab and its chosen
   * example. Deliberately NOT `editor`: that key holds one language and one
   * blob of code, and the single-language playground writes it on every
   * keystroke, so sharing it would have the two modes overwrite each other.
   */
  webPlayground: 'cq-web-playground-draft',
  /**
   * Saved challenge code for a learner with no account yet, keyed by challenge
   * id. A signed-in learner's drafts live on their account instead; these are
   * pushed up on sign-in and cleared on sign-out, so one person's code is
   * never left behind for the next person on a shared browser.
   */
  drafts: 'cq-code-drafts-v1',
  /** Which language track (modules/challenges/content/tracks.ts) the learner last picked. */
  track: 'cq-selected-track',
  /** 'learn' | 'practice' - how the learner wants to reach a stage's challenges; unset until chosen. */
  learningMode: 'cq-learning-mode',
  /** Separate from the learner's own token - the admin app is a distinct session. */
  adminToken: 'cq-admin-token',
  /** '1' once the welcome intro at "/" has played this visit (sessionStorage, not localStorage). */
  intro: 'cq-intro-seen',
  /**
   * The learning rules the server last served, as `{ revision, settings,
   * defaults }` (src/platform/settings; `defaults` fingerprints the build's
   * defaults, so a copy written under other defaults is ignored). Read
   * through `coerceSettings`, so a stale or hand-edited copy can only ever
   * fall back to the defaults.
   */
  settings: 'cq-settings-v1',
  /**
   * The learner's activity log (days and wrong answers). A guest's own log,
   * or a signed-in learner's mirror of the server's, tagged with `ownerId`
   * exactly like the stats so one account's log never reaches another.
   */
  activity: 'cq-activity-v1',
  /**
   * The learner's own choices in this browser (`soundOn`, ...), in the
   * shape of the account's `preferences`, plus `pendingSync` while a choice
   * made as a guest (or offline) has not reached an account yet. Kept on
   * sign-out, so the device remembers what its user chose.
   */
  preferences: 'cq-preferences-v1',
  /**
   * The last unit groupings the server sent, per stage - ids and names only
   * (`{ [stageId]: UnitDef[] }`). Used for the bundled content while offline;
   * without it the default grouping is used.
   */
  unitDefs: 'cq-unit-defs-v1',
  /**
   * What this browser has already announced about the streak and the daily
   * goal (goal met, freeze earned or used, repair, milestone) and which
   * reminder banners were dismissed today, per learner -
   * `{ v: 2, owners: { [accountId | 'guest']: { [key]: day } } }` - so a
   * refresh never announces the same thing twice and one learner's never
   * hides another's. Pruned to recent days (useHabitState).
   */
  habitSeen: 'cq-habit-seen-v1',
  /**
   * The first-run setup in this browser: `{ completedAt, dismissedAt,
   * pendingSync }` - a guest's own, or a signed-in learner's copy while the
   * account has not taken it yet (`pendingSync` says whose: 'guest' or the
   * account id). The answers themselves are preferences (`preferences`).
   */
  onboarding: 'cq-onboarding-v1',
  /**
   * A guest's test-outs and placements: the same log the server keeps for
   * an account (`{ records, cooldownClearedAt }`, src/platform/progress/access.ts),
   * so the same limits and cooldowns apply. Cleared when an account's
   * progress replaces the guest's.
   */
  assessments: 'cq-assessments-v1',
  /** The leaderboard tab last opened in this browser: 'week' (the weekly league) or 'all' (all time). */
  leaderboardTab: 'cq-leaderboard-tab-v1'
} as const;
