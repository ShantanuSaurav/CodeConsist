/* ==========================================================================
   The environment layer: settings with an `envVar` in meta.ts, read from the
   server's environment between the defaults and the admin's overrides.

   Only the server (src/platform/server-lib.ts) and schema.ts's
   `resolveSettings` use it. It reads SETTING_META, so it stays out of
   merge.ts - which every learner's browser loads.
   ========================================================================== */
import { DEFAULT_SETTINGS } from './defaults';
import { mergeSettings, patchFromEdits } from './merge';
import { SETTING_META } from './meta';
import type { SettingMeta } from './meta';
import type { Settings } from './types';

function parseEnvValue(meta: SettingMeta, raw: string): unknown {
  const text = raw.trim();
  switch (meta.kind) {
    case 'int':
    case 'number': {
      const n = Number(text);
      return text !== '' && Number.isFinite(n) ? n : undefined;
    }
    case 'bool':
      if (/^(1|true|yes|on)$/i.test(text)) return true;
      if (/^(0|false|no|off)$/i.test(text)) return false;
      return undefined;
    case 'intList':
      return text
        .split(',')
        .map((s) => Number(s.trim()))
        .filter((n) => Number.isFinite(n));
    case 'stringList':
    case 'origins':
      return text
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
    case 'rows':
    case 'map':
      try {
        return JSON.parse(text);
      } catch {
        return undefined;
      }
    default:
      return text;
  }
}

/** `{ [path]: value }` for every setting whose `envVar` is set in `env`. */
export function envValues(env: Record<string, string | undefined> | null | undefined): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (!env) return out;
  for (const [path, meta] of Object.entries(SETTING_META)) {
    if (!meta.envVar) continue;
    const raw = env[meta.envVar];
    if (typeof raw !== 'string' || raw.trim() === '') continue;
    const value = parseEnvValue(meta, raw);
    if (value !== undefined) out[path] = value;
  }
  return out;
}

/** The defaults with the environment layered on - the base an admin's overrides sit on. */
export function defaultsWithEnv(env: Record<string, string | undefined> | null | undefined): Settings {
  const fromEnv = envValues(env);
  if (Object.keys(fromEnv).length === 0) return JSON.parse(JSON.stringify(DEFAULT_SETTINGS)) as Settings;
  return mergeSettings(DEFAULT_SETTINGS, patchFromEdits(fromEnv));
}
