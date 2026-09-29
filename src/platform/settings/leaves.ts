/* ==========================================================================
   The shape of the settings: which keys are settings (leaves, replaced whole
   by a merge) and which are groups of settings - and nothing else.

   merge.ts needs only these facts, and it runs in every learner's browser
   (`coerceSettings`). The labels, help text, bounds and environment
   variable names of meta.ts are for the admin console, schema.ts and the
   server, so the learner shell must not import meta.ts. The leaves are read
   off the defaults instead - every value that is not a plain object, plus
   the settings whose value IS one (a map) - and a unit test holds them to
   SETTING_META: the same leaves, the same groups, the same nullable ones.
   ========================================================================== */
import { DEFAULT_SETTINGS } from './defaults';

/** Sections that never leave the server's admin routes. */
export const ADMIN_ONLY_SECTIONS: readonly string[] = ['retention', 'access'];

/** Settings whose value is a map (`kind: 'map'`): a plain object in the defaults, but one setting. */
export const MAP_SETTINGS: readonly string[] = ['onboarding.track.blurbs', 'placement.stagesByTrack'];

/** Settings that may be null (`nullable: true`). */
export const NULLABLE_SETTINGS: readonly string[] = ['streak.defaultTimeZone'];

function isGroupValue(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

let shape: { leaves: Set<string>; groups: Set<string> } | null = null;

/** Worked out once, on first use. */
function settingsShape(): { leaves: Set<string>; groups: Set<string> } {
  if (shape) return shape;
  const leaves = new Set<string>();
  const groups = new Set<string>();
  const walk = (node: Record<string, unknown>, prefix: string) => {
    for (const key of Object.keys(node)) {
      const path = prefix ? `${prefix}.${key}` : key;
      const value = node[key];
      if (isGroupValue(value) && !MAP_SETTINGS.includes(path)) {
        groups.add(path);
        walk(value, path);
      } else {
        leaves.add(path);
      }
    }
  };
  walk(DEFAULT_SETTINGS as unknown as Record<string, unknown>, '');
  shape = { leaves, groups };
  return shape;
}

/** Is `path` a setting (`xp.passScore`, `levels.ranks`, a map) - a leaf a merge replaces whole? */
export function isSettingLeaf(path: string): boolean {
  return settingsShape().leaves.has(path);
}

/** Is `path` a section, or a group of settings inside one (`streak.freeze`)? */
export function isSettingsGroup(path: string): boolean {
  return settingsShape().groups.has(path);
}

/** May the setting at `path` be null? */
export function isNullableSetting(path: string): boolean {
  return NULLABLE_SETTINGS.includes(path);
}

/** Every setting path, in the defaults' order (for the check against SETTING_META). */
export function settingLeafPaths(): string[] {
  return [...settingsShape().leaves];
}
