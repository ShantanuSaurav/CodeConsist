/**
 * The learning rules the learner app plays by, kept in step with the server.
 *
 *   - Starts from the cached copy (`cq-settings-v1`) read through
 *     `coerceSettings`, or the defaults - so the first paint, a guest and an
 *     offline learner all have rules without waiting for the network.
 *   - The cache is tagged with a fingerprint of this build's defaults. A
 *     default changed in code does not bump the server's revision, and the
 *     cached copy holds whole arrays (the level curve) that would win over
 *     the new default - so a cache written under other defaults counts as no
 *     cache (revision null), and the next revision the server reports
 *     refetches the rules.
 *   - `noteRevision(n)` is called with every `settingsRevision` the server
 *     reports (the 30-second health probe, every solve response). A number
 *     that differs from the cached revision triggers one `GET /api/settings`.
 *   - `noteRevision(undefined)` from a server too old to send a revision means
 *     "use the defaults".
 *
 * No zod here: the schema lives in the admin chunk and on the server.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../api-client/api';
import { DEFAULT_PUBLIC_SETTINGS, coerceSettings, publicSettings, settingsFingerprint } from '../settings/merge';
import { setSettingsSnapshot } from '../settings/store';
import type { PublicSettings } from '../settings/types';
import { STORAGE_KEYS, readJson, writeJson } from '../storage/storage';

export interface SettingsState {
  settings: PublicSettings;
  /** The revision the settings came from; null for the built-in defaults. */
  revision: number | null;
}

/** What `cq-settings-v1` holds. `defaults` is the fingerprint of the build that wrote it. */
interface CachedSettings {
  revision?: unknown;
  settings?: unknown;
  defaults?: unknown;
}

let defaultsTag: string | null = null;

/** This build's defaults, fingerprinted (once). */
export function defaultsFingerprint(): string {
  if (defaultsTag === null) defaultsTag = settingsFingerprint(DEFAULT_PUBLIC_SETTINGS);
  return defaultsTag;
}

/**
 * The cached rules, made safe - or the defaults. Exported for SessionProvider's
 * first render. A cache without this build's defaults fingerprint (written by
 * an older build, or under other defaults) is not used: its revision may match
 * the server's while its values predate a default changed in code.
 */
export function readCachedSettings(): SettingsState {
  const cached = readJson<CachedSettings | null>(STORAGE_KEYS.settings, null);
  if (
    !cached ||
    typeof cached !== 'object' ||
    typeof cached.revision !== 'number' ||
    cached.defaults !== defaultsFingerprint()
  ) {
    return { settings: DEFAULT_PUBLIC_SETTINGS, revision: null };
  }
  return { settings: publicSettings(coerceSettings(cached.settings)), revision: cached.revision };
}

/** Store the served rules, tagged with this build's defaults. */
export function writeCachedSettings(state: SettingsState): void {
  writeJson(STORAGE_KEYS.settings, { revision: state.revision, settings: state.settings, defaults: defaultsFingerprint() });
}

export function useSettingsState(): {
  settings: PublicSettings;
  settingsRevision: number | null;
  noteRevision: (revision: number | null | undefined) => void;
  refreshSettings: () => Promise<void>;
} {
  const [state, setState] = useState<SettingsState>(readCachedSettings);
  const stateRef = useRef(state);
  const inFlight = useRef<Promise<void> | null>(null);

  useEffect(() => {
    stateRef.current = state;
    setSettingsSnapshot(state.settings, state.revision);
  }, [state]);

  const refreshSettings = useCallback(() => {
    if (inFlight.current) return inFlight.current;
    const run = api
      .settings()
      .then((res) => {
        if (!res || typeof res.revision !== 'number') return;
        const next: SettingsState = { settings: publicSettings(coerceSettings(res.settings)), revision: res.revision };
        writeCachedSettings(next);
        setState(next);
      })
      .catch(() => {
        // Offline, or a server without the route: keep what we have.
      })
      .finally(() => {
        inFlight.current = null;
      });
    inFlight.current = run;
    return run;
  }, []);

  const noteRevision = useCallback(
    (revision: number | null | undefined) => {
      if (typeof revision === 'number') {
        if (revision !== stateRef.current.revision) void refreshSettings();
        return;
      }
      // A server that reports no revision predates the settings store: its
      // rules are the defaults, whatever an older cache says.
      if (revision === undefined && stateRef.current.revision !== null) {
        setState({ settings: DEFAULT_PUBLIC_SETTINGS, revision: null });
      }
    },
    [refreshSettings]
  );

  return { settings: state.settings, settingsRevision: state.revision, noteRevision, refreshSettings };
}
