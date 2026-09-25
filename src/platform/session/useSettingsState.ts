/**
 * The learning rules the learner app plays by, kept in step with the server.
 *
 *   - Starts from the cached copy (`cq-settings-v1`) read through
 *     `coerceSettings`, or the defaults - so the first paint, a guest and an
 *     offline learner all have rules without waiting for the network.
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
import { DEFAULT_PUBLIC_SETTINGS, coerceSettings, publicSettings } from '../settings/merge';
import { setSettingsSnapshot } from '../settings/store';
import type { PublicSettings } from '../settings/types';
import { STORAGE_KEYS, readJson, writeJson } from '../storage/storage';

export interface SettingsState {
  settings: PublicSettings;
  /** The revision the settings came from; null for the built-in defaults. */
  revision: number | null;
}

/** The cached rules, made safe - or the defaults. Exported for SessionProvider's first render. */
export function readCachedSettings(): SettingsState {
  const cached = readJson<{ revision?: unknown; settings?: unknown } | null>(STORAGE_KEYS.settings, null);
  if (!cached || typeof cached !== 'object' || typeof cached.revision !== 'number') {
    return { settings: DEFAULT_PUBLIC_SETTINGS, revision: null };
  }
  return { settings: publicSettings(coerceSettings(cached.settings)), revision: cached.revision };
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
        writeJson(STORAGE_KEYS.settings, next);
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
