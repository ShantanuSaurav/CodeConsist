/* ==========================================================================
   Layering stored overrides onto the defaults, and applying an admin's patch.

   No zod here on purpose: this file is what the learner app uses (through
   `coerceSettings`) to read a cached or served settings object safely, and
   zod stays out of the shell chunk. The rules are simple enough to hold
   without it:
     - a group (a section, or `freeze` inside `streak`) recurses;
     - a setting - anything with an entry in SETTING_META - is a leaf and is
       replaced whole, arrays and maps included;
     - a leaf whose type differs from its default is ignored;
     - keys the defaults do not have (and `__proto__`) are skipped.
   ========================================================================== */
import { DEFAULT_SETTINGS } from './defaults';
import { ADMIN_ONLY_SECTIONS, SETTING_META, isSettingsGroup, metaFor } from './meta';
import type { SettingMeta } from './meta';
import type { PublicSettings, Settings, SettingsOverrides } from './types';

type Json = Record<string, unknown>;

function hasOwn(map: object, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(map, key);
}

export function isPlainObject(value: unknown): value is Json {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function clone<T>(value: T): T {
  return value === undefined ? value : (JSON.parse(JSON.stringify(value)) as T);
}

/**
 * Write one own property, safely for ANY key - `map[key] = v` runs
 * Object.prototype's setter for '__proto__' instead (see server/db.js).
 */
function define(map: Json, key: string, value: unknown): void {
  Object.defineProperty(map, key, { value, writable: true, enumerable: true, configurable: true });
}

/** Does `value` have the same JSON type as the default it would replace? */
function sameKind(base: unknown, value: unknown, meta: SettingMeta | null): boolean {
  if (value === null) return base === null || Boolean(meta?.nullable);
  if (base === null) return typeof value === 'string' || typeof value === 'boolean' || (typeof value === 'number' && Number.isFinite(value));
  if (Array.isArray(base)) return Array.isArray(value);
  if (isPlainObject(base)) return isPlainObject(value);
  if (typeof base === 'number') return typeof value === 'number' && Number.isFinite(value);
  return typeof value === typeof base;
}

function mergeAt(base: unknown, over: unknown, path: string): unknown {
  const meta = path ? metaFor(path) : null;
  if (meta || !isPlainObject(base)) {
    if (over === undefined) return clone(base);
    return sameKind(base, over, meta) ? clone(over) : clone(base);
  }
  const out: Json = {};
  const source = isPlainObject(over) ? over : {};
  for (const key of Object.keys(base)) {
    const child = path ? `${path}.${key}` : key;
    define(out, key, mergeAt(base[key], hasOwn(source, key) ? source[key] : undefined, child));
  }
  return out;
}

/** `defaults` with `overrides` layered on. Never mutates either; always returns the defaults' shape. */
export function mergeSettings<T>(defaults: T, overrides: unknown): T {
  return mergeAt(defaults, overrides, '') as T;
}

/** A settings object from anywhere (a cache, a server response), made safe: missing or wrong-typed keys become defaults. */
export function coerceSettings(raw: unknown): Settings {
  return mergeSettings(DEFAULT_SETTINGS, raw);
}

/** The learner-facing subset: every section except the admin-only ones. */
export function publicSettings(settings: Settings): PublicSettings {
  const out: Json = {};
  for (const key of Object.keys(settings)) {
    if (!ADMIN_ONLY_SECTIONS.includes(key)) define(out, key, (settings as unknown as Json)[key]);
  }
  return out as unknown as PublicSettings;
}

export const DEFAULT_PUBLIC_SETTINGS: PublicSettings = publicSettings(DEFAULT_SETTINGS);

/**
 * A short, stable fingerprint of a JSON value (32-bit FNV-1a over its JSON
 * text, base 36). Not for security - only to tell "the same rules" from
 * "different rules" where the revision number cannot: a default changed in
 * code (the Phase 2 level curve) or an environment value leaves the revision
 * as it was. The learner cache is tagged with the build's defaults through
 * it, and `GET /api/settings` puts it in its ETag.
 */
export function settingsFingerprint(value: unknown): string {
  const text = JSON.stringify(value) ?? '';
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36);
}

/** The value at a dot path (`levels.ranks.0.title`), or undefined. Own properties only. */
export function getPath(source: unknown, path: string): unknown {
  let node: unknown = source;
  for (const part of path.split('.')) {
    if (node === null || typeof node !== 'object' || !hasOwn(node as object, part)) return undefined;
    node = (node as Json)[part];
  }
  return node;
}

/** Set a value at a dot path, creating groups on the way. Mutates `target`. */
export function setPath(target: Json, path: string, value: unknown): void {
  const parts = path.split('.');
  let node = target;
  for (const part of parts.slice(0, -1)) {
    const next = hasOwn(node, part) ? node[part] : undefined;
    if (isPlainObject(next)) node = next;
    else {
      const created: Json = {};
      define(node, part, created);
      node = created;
    }
  }
  define(node, parts[parts.length - 1], value);
}

/** Remove the value at a dot path, then drop any group it leaves empty. Mutates `target`. */
function deletePath(target: Json, path: string): void {
  const parts = path.split('.');
  const trail: Json[] = [target];
  let node = target;
  for (const part of parts.slice(0, -1)) {
    const next = hasOwn(node, part) ? node[part] : undefined;
    if (!isPlainObject(next)) return;
    node = next;
    trail.push(node);
  }
  delete node[parts[parts.length - 1]];
  for (let i = trail.length - 1; i > 0; i--) {
    if (Object.keys(trail[i]).length > 0) break;
    delete trail[i - 1][parts[i - 1]];
  }
}

/**
 * Every overridden setting as `{ [path]: value }`. Stops at settings (so a
 * rows value is one entry, not one per cell); junk that is not a known group
 * is reported as a leaf where it sits.
 */
export function overrideLeaves(overrides: unknown, prefix = ''): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (!isPlainObject(overrides)) return out;
  for (const key of Object.keys(overrides)) {
    const path = prefix ? `${prefix}.${key}` : key;
    const value = overrides[key];
    if (!metaFor(path) && isPlainObject(value) && isSettingsGroup(path)) Object.assign(out, overrideLeaves(value, path));
    else out[path] = value;
  }
  return out;
}

export interface PatchResult {
  overrides: SettingsOverrides;
  /** Settings whose stored override was added, changed or removed. */
  changedPaths: string[];
  /** Keys in the patch that are not settings - the whole patch is refused when there are any. */
  unknownPaths: string[];
}

/**
 * Apply an admin's sparse patch to the stored overrides. A value sets that
 * setting; `null` removes the override (back to the default) - on a group it
 * removes every override inside it, so `{ xp: null }` resets the section.
 * Groups left empty are pruned. Nothing is validated here beyond the keys:
 * the caller merges the result and runs the schema.
 *
 * A stored key this build does not know (one a newer build wrote before a
 * rollback, say) can be removed with `null` - never set - so the admin page
 * can always clear what the merge is ignoring.
 */
export function applySettingsPatch(overrides: unknown, patch: unknown): PatchResult {
  const before: Json = isPlainObject(overrides) ? clone(overrides) : {};
  const next: Json = clone(before);
  const unknownPaths: string[] = [];

  const walk = (node: Json, prefix: string) => {
    for (const key of Object.keys(node)) {
      const path = prefix ? `${prefix}.${key}` : key;
      const value = node[key];
      if (metaFor(path)) {
        if (value === null) deletePath(next, path);
        else if (value !== undefined) setPath(next, path, clone(value));
      } else if (isSettingsGroup(path)) {
        if (value === null) deletePath(next, path);
        else if (isPlainObject(value)) walk(value, path);
        else unknownPaths.push(path);
      } else if (value === null && getPath(before, path) !== undefined) {
        deletePath(next, path);
      } else if (isPlainObject(value) && isPlainObject(getPath(before, path))) {
        walk(value, path);
      } else {
        unknownPaths.push(path);
      }
    }
  };

  if (!isPlainObject(patch)) return { overrides: before, changedPaths: [], unknownPaths: ['(patch)'] };
  walk(patch, '');

  const was = overrideLeaves(before);
  const now = overrideLeaves(next);
  const changedPaths = [...new Set([...Object.keys(was), ...Object.keys(now)])].filter(
    (path) => JSON.stringify(was[path]) !== JSON.stringify(now[path])
  );
  return { overrides: next, changedPaths, unknownPaths };
}

/** Build a nested patch from flat `{ [path]: value | null }` edits (the admin form's pending changes). */
export function patchFromEdits(edits: Record<string, unknown>): Json {
  const patch: Json = {};
  for (const [path, value] of Object.entries(edits)) setPath(patch, path, value === undefined ? null : value);
  return patch;
}

/* ---------------------------------------------------------------- origins */

/**
 * An allowed-origin entry as the browser sends it in `Origin`: scheme, host
 * and a non-default port, lower case, no trailing slash - `https://example.com`.
 * Null for anything that is not one exact http(s) origin: a path, a query, a
 * wildcard, credentials, another scheme. The admin form normalises what is
 * typed with this, and the schema refuses a stored value that differs from
 * its own normal form, so the allow-list only ever holds values that can
 * match a real `Origin` header.
 */
export function normalizeOrigin(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const text = raw.trim().replace(/\/+$/, '');
  if (!/^https?:\/\/[^/?#]+$/i.test(text) || text.includes('*') || text.includes('@')) return null;
  try {
    const url = new URL(text);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    if (url.pathname !== '/' || url.search || url.hash || !url.hostname) return null;
    return url.origin;
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------ environment */

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
  if (Object.keys(fromEnv).length === 0) return clone(DEFAULT_SETTINGS);
  return mergeSettings(DEFAULT_SETTINGS, patchFromEdits(fromEnv));
}
