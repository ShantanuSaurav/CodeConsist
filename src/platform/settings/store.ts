/* ==========================================================================
   The learner's current settings for code outside React.

   `SessionProvider` (through useSettingsState) keeps this in step with what
   the server last served; services that are not components - the compiler
   service, a toast built outside a render - read it from here instead of
   threading the settings through every call.
   ========================================================================== */
import { fillCopy, refreshProductCopy } from './copy';
import { DEFAULT_PUBLIC_SETTINGS, getPath } from './merge';
import type { PublicSettings } from './types';

let snapshot: PublicSettings = DEFAULT_PUBLIC_SETTINGS;
let snapshotRevision: number | null = null;
const listeners = new Set<() => void>();

export function getSettingsSnapshot(): PublicSettings {
  return snapshot;
}

/** The revision the snapshot came from; null for the defaults (or an older server that sends none). */
export function getSettingsRevision(): number | null {
  return snapshotRevision;
}

export function setSettingsSnapshot(settings: PublicSettings, revision: number | null = null): void {
  if (settings === snapshot && revision === snapshotRevision) return;
  snapshot = settings;
  snapshotRevision = revision;
  for (const listener of [...listeners]) {
    try {
      listener();
    } catch {
      /* one broken listener must not stop the rest */
    }
  }
}

/** Called whenever the snapshot changes. Returns the unsubscribe function. */
export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * A piece of editable copy by its dot path (`copy.offline.auth`, or just
 * `offline.auth`), with its `{tokens}` filled. Empty text when the path is
 * not copy - which a caller should treat as "use your own wording".
 */
export function getCopy(key: string, vars: Record<string, string | number | null | undefined> = {}): string {
  let template = getPath(snapshot, key);
  if (typeof template !== 'string' && !key.startsWith('copy.')) template = getPath(snapshot, `copy.${key}`);
  return typeof template === 'string' ? fillCopy(refreshProductCopy(key, template), vars) : '';
}
