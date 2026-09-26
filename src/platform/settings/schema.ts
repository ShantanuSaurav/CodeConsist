/* ==========================================================================
   Validation of a complete settings object: per-key bounds from meta.ts plus
   the rules that span keys (a floor no higher than the pass mark, ranks that
   start at level 1 and climb, ...).

   Imported by the server bundle (src/platform/server-lib.ts) and the lazy
   admin chunk only - never by the learner session, so zod stays out of the
   shell. Learners read settings through merge.ts's `coerceSettings`.
   ========================================================================== */
import { z } from 'zod';
import { isValidTimeZone } from '../time/days';
import { tokensIn } from './copy';
import { DEFAULT_SETTINGS } from './defaults';
import { SECTION_META, SETTING_META, metaFor, sectionOfPath } from './meta';
import type { RowFieldMeta, SettingMeta } from './meta';
import { defaultsWithEnv, getPath, isPlainObject, mergeSettings, normalizeOrigin, overrideLeaves } from './merge';
import type { Settings, SettingsIssue } from './types';

const ORIGIN_RE = /^https?:\/\/[A-Za-z0-9.-]+(?::\d{1,5})?$/;

/** One allowed origin: exactly the form a browser sends (see merge.ts normalizeOrigin). */
const originSchema = z.string({ invalid_type_error: 'Must be an origin such as https://example.com.' }).superRefine((value, ctx) => {
  const normal = normalizeOrigin(value);
  if (normal === null || !ORIGIN_RE.test(normal)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Must be an exact origin such as https://example.com - no path, no wildcard.' });
  } else if (normal !== value) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: `Write it as ${normal} (the form a browser sends).` });
  }
});

function intSchema(min?: number, max?: number) {
  let s = z.number({ invalid_type_error: 'Must be a number.', required_error: 'Required.' }).int('Must be a whole number.');
  if (min !== undefined) s = s.min(min, `Must be at least ${min}.`);
  if (max !== undefined) s = s.max(max, `Must be at most ${max}.`);
  return s;
}

function numberSchema(min?: number, max?: number) {
  let s = z.number({ invalid_type_error: 'Must be a number.', required_error: 'Required.' }).finite('Must be a number.');
  if (min !== undefined) s = s.min(min, `Must be at least ${min}.`);
  if (max !== undefined) s = s.max(max, `Must be at most ${max}.`);
  return s;
}

function stringSchema(minLength?: number, maxLength?: number) {
  let s = z.string({ invalid_type_error: 'Must be text.', required_error: 'Required.' });
  if (minLength !== undefined) s = s.min(minLength, minLength === 1 ? 'Required.' : `At least ${minLength} characters.`);
  if (maxLength !== undefined) s = s.max(maxLength, `At most ${maxLength} characters.`);
  return s;
}

function listBounds<T extends z.ZodTypeAny>(item: T, meta: SettingMeta) {
  let s = z.array(item, { invalid_type_error: 'Must be a list.' });
  if (meta.minItems !== undefined) s = s.min(meta.minItems, `Needs at least ${meta.minItems} ${meta.minItems === 1 ? 'entry' : 'entries'}.`);
  if (meta.maxItems !== undefined) s = s.max(meta.maxItems, `At most ${meta.maxItems} entries.`);
  return s;
}

function rowFieldSchema(field: RowFieldMeta): z.ZodTypeAny {
  switch (field.kind) {
    case 'int':
      return intSchema(field.min, field.max);
    case 'number':
      return numberSchema(field.min, field.max);
    case 'bool':
      return z.boolean({ invalid_type_error: 'Must be on or off.' });
    case 'enum':
      return z.enum((field.values ?? ['']) as [string, ...string[]], { errorMap: () => ({ message: `Must be one of: ${(field.values ?? []).join(', ')}.` }) });
    default:
      return stringSchema(field.minLength, field.maxLength);
  }
}

/** The zod schema for one setting, from its metadata. */
export function schemaForMeta(meta: SettingMeta): z.ZodTypeAny {
  let schema: z.ZodTypeAny;
  switch (meta.kind) {
    case 'int':
      schema = intSchema(meta.min, meta.max);
      break;
    case 'number':
      schema = numberSchema(meta.min, meta.max);
      break;
    case 'bool':
      schema = z.boolean({ invalid_type_error: 'Must be on or off.' });
      break;
    case 'enum':
      schema = z.enum((meta.values ?? ['']) as [string, ...string[]], {
        errorMap: () => ({ message: `Must be one of: ${(meta.values ?? []).join(', ')}.` })
      });
      break;
    case 'string':
      schema = stringSchema(meta.minLength, meta.maxLength);
      break;
    case 'text': {
      const allowed = meta.tokens ?? [];
      schema = stringSchema(meta.minLength, meta.maxLength).superRefine((value, ctx) => {
        const bad = tokensIn(value).filter((token) => !allowed.includes(token));
        if (bad.length) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: allowed.length
              ? `Unknown ${bad.length === 1 ? 'token' : 'tokens'} ${bad.map((t) => `{${t}}`).join(', ')} - allowed: ${allowed.map((t) => `{${t}}`).join(', ')}.`
              : `This text cannot use tokens (${bad.map((t) => `{${t}}`).join(', ')}).`
          });
        }
      });
      break;
    }
    case 'zone':
      schema = z
        .string({ invalid_type_error: 'Must be a time zone name.' })
        .refine((value) => isValidTimeZone(value), 'Not a time zone this server knows (use an IANA name such as Asia/Kolkata).');
      break;
    case 'intList':
      schema = listBounds(intSchema(meta.min, meta.max), meta);
      break;
    case 'stringList':
      schema = listBounds(stringSchema(meta.minLength ?? 1, meta.maxLength), meta);
      break;
    case 'origins':
      schema = listBounds(originSchema, meta).superRefine((list, ctx) => {
        const seen = new Set<string>();
        list.forEach((origin, index) => {
          if (seen.has(origin)) ctx.addIssue({ code: z.ZodIssueCode.custom, path: [index], message: `${origin} is listed twice.` });
          seen.add(origin);
        });
      });
      break;
    case 'rows': {
      const shape: Record<string, z.ZodTypeAny> = {};
      for (const field of meta.rowMeta ?? []) shape[field.key] = rowFieldSchema(field);
      schema = listBounds(z.object(shape, { invalid_type_error: 'Each row must be an object.' }), meta);
      break;
    }
    case 'map':
      schema = z.record(z.unknown(), { invalid_type_error: 'Must be a map.' });
      break;
    default:
      schema = z.unknown();
  }
  return meta.nullable ? schema.nullable() : schema;
}

/** A nested z.object for one section, built from the metadata of its settings. */
function sectionShape(sectionId: string): z.ZodTypeAny {
  type Tree = { [key: string]: Tree | z.ZodTypeAny };
  const tree: Tree = {};
  for (const [path, meta] of Object.entries(SETTING_META)) {
    if (sectionOfPath(path) !== sectionId) continue;
    const parts = path.split('.').slice(1);
    let node = tree;
    for (const part of parts.slice(0, -1)) {
      if (!(part in node)) node[part] = {};
      node = node[part] as Tree;
    }
    node[parts[parts.length - 1]] = schemaForMeta(meta);
  }
  const build = (node: Tree): z.ZodTypeAny =>
    z.object(
      Object.fromEntries(Object.entries(node).map(([key, value]) => [key, value instanceof z.ZodType ? value : build(value as Tree)])),
      { invalid_type_error: 'Must be a group of settings.' }
    );
  return build(tree);
}

/* ----------------------------------------------------- cross-field rules */

type Refiner = (section: any, add: (path: string, message: string) => void) => void;

function strictlyAscending(values: number[]): number {
  for (let i = 1; i < values.length; i++) if (!(values[i] > values[i - 1])) return i;
  return -1;
}

const REFINEMENTS: Partial<Record<string, Refiner>> = {
  xp: (xp, add) => {
    if (typeof xp?.scoreFloor === 'number' && typeof xp?.passScore === 'number' && xp.scoreFloor > xp.passScore) {
      add('scoreFloor', `Must be at most the pass score (${xp.passScore}).`);
    }
  },
  levels: (levels, add) => {
    const thresholds: unknown = levels?.thresholds;
    if (Array.isArray(thresholds) && thresholds.length > 0) {
      if (thresholds[0] !== 0) add('thresholds.0', 'Level 1 must start at 0 XP.');
      const at = strictlyAscending(thresholds as number[]);
      if (at !== -1) add(`thresholds.${at}`, `Level ${at + 1} must need more XP than level ${at}.`);
    }
    const ranks: unknown = levels?.ranks;
    if (Array.isArray(ranks) && ranks.length > 0) {
      if (ranks[0]?.minLevel !== 1) add('ranks.0.minLevel', 'The first rank must start at level 1.');
      const at = strictlyAscending(ranks.map((r: any) => Number(r?.minLevel)));
      if (at !== -1) add(`ranks.${at}.minLevel`, 'Each rank must start at a higher level than the one before.');
    }
  }
};

const SECTION_SCHEMAS: Record<string, z.ZodTypeAny> = Object.fromEntries(
  SECTION_META.map((section) => {
    const refine = REFINEMENTS[section.id];
    const base = sectionShape(section.id);
    const schema = refine
      ? base.superRefine((value, ctx) =>
          refine(value, (path, message) =>
            ctx.addIssue({ code: z.ZodIssueCode.custom, path: path.split('.').map((p) => (/^\d+$/.test(p) ? Number(p) : p)), message })
          )
        )
      : base;
    return [section.id, schema];
  })
);

/** The whole settings object. Unknown keys are stripped rather than rejected (the merge never produces them). */
export const SettingsSchema = z.object(SECTION_SCHEMAS);

export interface ValidationResult {
  ok: boolean;
  issues: SettingsIssue[];
}

/** Check a complete settings object against every bound and rule. */
export function validateSettings(settings: unknown): ValidationResult {
  const result = SettingsSchema.safeParse(settings);
  if (result.success) return { ok: true, issues: [] };
  return {
    ok: false,
    issues: result.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message }))
  };
}

/**
 * Stored overrides that the merge did not take: a key that is not a setting,
 * or a value of the wrong type (a string where a number belongs). The merge
 * ignores both silently, so this is what reports them.
 */
export function droppedOverrides(overrides: unknown, merged: Settings): SettingsIssue[] {
  const issues: SettingsIssue[] = [];
  for (const [path, value] of Object.entries(overrideLeaves(overrides))) {
    if (!metaFor(path)) {
      issues.push({ path, message: 'Not a setting - ignored.' });
    } else if (JSON.stringify(getPath(merged, path)) !== JSON.stringify(value)) {
      issues.push({ path, message: 'Wrong type for this setting - ignored.' });
    }
  }
  return issues;
}

/**
 * What stops `patch` from being saved, given the overrides it produces and
 * the settings they merge to:
 *   - a value the patch itself sets that the merge would drop (the wrong type);
 *   - any rule broken in a section the patch touches.
 * A stored override the patch leaves alone - a key only a newer build knows,
 * kept through a rollback, or a section that stopped validating after a code
 * change - is still reported by `resolveSettings` and falls back to its
 * defaults, but never blocks saving something else. The server's PUT and the
 * admin page's pre-check both use this, so they refuse the same patches.
 */
export function patchIssues(patch: unknown, overrides: unknown, merged: Settings): SettingsIssue[] {
  const sections = new Set(isPlainObject(patch) ? Object.keys(patch) : []);
  const written = (path: string) => {
    const value = getPath(patch, path);
    return value !== undefined && value !== null;
  };
  return [
    ...droppedOverrides(overrides, merged).filter((issue) => written(issue.path)),
    ...validateSettings(merged).issues.filter((issue) => sections.has(sectionOfPath(issue.path)))
  ];
}

/**
 * The effective settings: defaults, then the environment, then the stored
 * overrides. A stored section that no longer validates (the bounds changed in
 * code, say) falls back to its defaults as a whole and is reported, so a bad
 * stored value can never take the server down or half-apply.
 */
export function resolveSettings(
  overrides: unknown,
  env?: Record<string, string | undefined> | null
): { settings: Settings; issues: SettingsIssue[] } {
  const base = defaultsWithEnv(env);
  const merged = mergeSettings(base, isPlainObject(overrides) ? overrides : {});
  const issues: SettingsIssue[] = droppedOverrides(overrides, merged);
  const check = validateSettings(merged);
  if (check.ok) return { settings: merged, issues };

  const settings = merged as unknown as Record<string, unknown>;
  const bad = new Set(check.issues.map((issue) => sectionOfPath(issue.path)));
  for (const section of bad) {
    const fallback = (base as unknown as Record<string, unknown>)[section];
    const fallbackOk = validateSettings({ ...settings, [section]: fallback }).issues.every((i) => sectionOfPath(i.path) !== section);
    settings[section] = JSON.parse(JSON.stringify(fallbackOk ? fallback : (DEFAULT_SETTINGS as unknown as Record<string, unknown>)[section]));
  }
  for (const issue of check.issues) {
    issues.push({ path: issue.path, message: `${issue.message} The stored "${sectionOfPath(issue.path)}" section is ignored until this is fixed.` });
  }
  return { settings: settings as unknown as Settings, issues };
}
