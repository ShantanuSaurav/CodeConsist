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
  intro: 'cq-intro-seen'
} as const;
