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
import { SECTION_META, SETTING_META, WELCOME_BACK_TOKENS, metaFor, sectionOfPath } from './meta';
import { GOAL_ID_RE, GOAL_TARGET_BOUNDS } from '../habits/goals';
import { LEAGUE_TIER_ID_RE } from '../league/league';
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
    case 'intList':
      return listBounds(intSchema(field.min, field.max), { label: field.label, help: '', kind: 'intList', minItems: field.minItems, maxItems: field.maxItems });
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
    case 'stringList': {
      // A list chosen from fixed values (the kinds a Practice session uses):
      // only those values, each once.
      const allowed = meta.values;
      schema = allowed
        ? listBounds(stringSchema(1), meta).superRefine((list, ctx) => {
            const seen = new Set<string>();
            list.forEach((value, index) => {
              if (!allowed.includes(value)) ctx.addIssue({ code: z.ZodIssueCode.custom, path: [index], message: `"${value}" is not one of: ${allowed.join(', ')}.` });
              else if (seen.has(value)) ctx.addIssue({ code: z.ZodIssueCode.custom, path: [index], message: `"${value}" is listed twice.` });
              seen.add(value);
            });
          })
        : listBounds(stringSchema(meta.minLength ?? 1, meta.maxLength), meta);
      break;
    }
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
  },
  streak: (streak, add) => {
    const { startingCount, maxHeld } = streak?.freeze ?? {};
    if (typeof startingCount === 'number' && typeof maxHeld === 'number' && startingCount > maxHeld) {
      add('freeze.startingCount', `Must be at most the most freezes held (${maxHeld}).`);
    }
    if (Array.isArray(streak?.milestones)) {
      const at = strictlyAscending(streak.milestones.map(Number));
      if (at !== -1) add(`milestones.${at}`, 'Each milestone must be larger than the one before.');
    }
  },
  goals: (goals, add) => {
    const options: unknown = goals?.options;
    if (!Array.isArray(options)) return;
    const seen = new Set<string>();
    options.forEach((option: any, i: number) => {
      const id = option?.id;
      if (typeof id === 'string') {
        if (!GOAL_ID_RE.test(id)) add(`options.${i}.id`, 'Use lower-case letters, digits and dashes (at most 32).');
        else if (seen.has(id)) add(`options.${i}.id`, `"${id}" is used by two options.`);
        seen.add(id);
      }
      const bounds = GOAL_TARGET_BOUNDS[option?.metric as keyof typeof GOAL_TARGET_BOUNDS];
      if (bounds && typeof option?.target === 'number' && (option.target < bounds.min || option.target > bounds.max)) {
        add(`options.${i}.target`, `A ${option.metric} goal's target must be ${bounds.min}-${bounds.max}.`);
      }
      for (const key of ['label', 'blurb'] as const) {
        const bad = typeof option?.[key] === 'string' ? tokensIn(option[key]) : [];
        if (bad.length) add(`options.${i}.${key}`, `Plain text only (not ${bad.map((t) => `{${t}}`).join(', ')}).`);
      }
    });
    const fallback = options.find((option: any) => option?.id === goals?.defaultOptionId);
    if (typeof goals?.defaultOptionId === 'string') {
      if (!fallback) add('defaultOptionId', 'Must be the id of one of the options.');
      else if (fallback.enabled !== true) add('defaultOptionId', 'The default goal must be switched on.');
    }
  },
  reminders: (reminders, add) => {
    const tiers: unknown = reminders?.welcomeBack?.tiers;
    if (!Array.isArray(tiers)) return;
    const at = strictlyAscending(tiers.map((t: any) => Number(t?.minDays)));
    if (at !== -1) add(`welcomeBack.tiers.${at}.minDays`, 'Each message must be for more days away than the one before.');
    tiers.forEach((tier: any, i: number) => {
      for (const key of ['title', 'body'] as const) {
        const bad = typeof tier?.[key] === 'string' ? tokensIn(tier[key]).filter((t) => !WELCOME_BACK_TOKENS.includes(t)) : [];
        if (bad.length) {
          add(
            `welcomeBack.tiers.${i}.${key}`,
            `Unknown ${bad.length === 1 ? 'token' : 'tokens'} ${bad.map((t) => `{${t}}`).join(', ')} - allowed: ${WELCOME_BACK_TOKENS.map((t) => `{${t}}`).join(', ')}.`
          );
        }
      }
    });
  },
  review: (review, add) => {
    const intervals: unknown = review?.intervalsDays;
    if (Array.isArray(intervals)) {
      const at = strictlyAscending(intervals.map(Number));
      if (at !== -1) add(`intervalsDays.${at}`, 'Each interval must be longer than the one before.');
      const boxes = intervals.length;
      const inRange = (path: string, value: unknown) => {
        if (typeof value === 'number' && value >= boxes) add(path, `Must be less than the number of intervals (${boxes}) - boxes count from 0.`);
      };
      inRange('wrongResetsToBox', review?.wrongResetsToBox);
      inRange('initialBox.clean', review?.initialBox?.clean);
      inRange('initialBox.assisted', review?.initialBox?.assisted);
    }
    const { min, max } = review?.sessionSize ?? {};
    if (typeof min === 'number' && typeof max === 'number' && min > max) add('sessionSize.min', `Must be at most the largest session (${max}).`);
  },
  units: (units, add) => {
    const { minSize, targetSize, maxSize } = units ?? {};
    if ([minSize, targetSize, maxSize].every((n) => typeof n === 'number')) {
      if (minSize > targetSize) add('minSize', `Must be at most the target size (${targetSize}).`);
      if (targetSize > maxSize) add('targetSize', `Must be at most the largest size (${maxSize}).`);
    }
  },
  onboarding: (onboarding, add) => {
    const steps: unknown = onboarding?.steps;
    if (Array.isArray(steps)) {
      const seen = new Set<string>();
      steps.forEach((step: any, i: number) => {
        if (typeof step?.id !== 'string') return;
        if (seen.has(step.id)) add(`steps.${i}.id`, `The "${step.id}" step is listed twice.`);
        seen.add(step.id);
        for (const key of ['title', 'subtitle'] as const) {
          const bad = typeof step?.[key] === 'string' ? tokensIn(step[key]) : [];
          if (bad.length) add(`steps.${i}.${key}`, `Plain text only (not ${bad.map((t) => `{${t}}`).join(', ')}).`);
        }
      });
      const on = (id: string) => steps.findIndex((s: any) => s?.id === id && s?.enabled === true);
      const track = on('track');
      const experience = on('experience');
      if (track !== -1 && experience !== -1 && track > experience) {
        add(`steps.${track}.id`, 'The track step must come before the experience step (the placement is for the chosen track).');
      }
    }
    const options: unknown = onboarding?.motivation?.options;
    if (Array.isArray(options)) {
      const seen = new Set<string>();
      options.forEach((option: any, i: number) => {
        const id = option?.id;
        if (typeof id === 'string') {
          if (!SLUG_RE.test(id)) add(`motivation.options.${i}.id`, 'Use lower-case letters, digits and dashes (at most 32).');
          else if (seen.has(id)) add(`motivation.options.${i}.id`, `"${id}" is used by two answers.`);
          seen.add(id);
        }
        for (const key of ['label', 'description'] as const) {
          const bad = typeof option?.[key] === 'string' ? tokensIn(option[key]) : [];
          if (bad.length) add(`motivation.options.${i}.${key}`, `Plain text only (not ${bad.map((t) => `{${t}}`).join(', ')}).`);
        }
      });
    }
    const blurbs: unknown = onboarding?.track?.blurbs;
    if (isPlainObject(blurbs)) {
      for (const [trackId, text] of Object.entries(blurbs)) {
        if (typeof text !== 'string') add(`track.blurbs.${trackId}`, 'Must be text.');
        else if (text.length > 160) add(`track.blurbs.${trackId}`, 'At most 160 characters.');
        else if (tokensIn(text).length) add(`track.blurbs.${trackId}`, 'Plain text only - no {tokens}.');
      }
    }
  },
  placement: (placement, add) => {
    multipleOfTen(placement?.passMark, 'passMark', add);
    const byTrack: unknown = placement?.stagesByTrack;
    if (isPlainObject(byTrack)) {
      for (const [trackId, ids] of Object.entries(byTrack)) {
        if (!Array.isArray(ids) || ids.some((id) => typeof id !== 'string' || id.length === 0 || id.length > 64)) {
          add(`stagesByTrack.${trackId}`, 'Must be a list of stage ids.');
        } else if (new Set(ids).size !== ids.length) {
          add(`stagesByTrack.${trackId}`, 'A stage is listed twice.');
        }
      }
    }
  },
  testOut: (testOut, add) => {
    multipleOfTen(testOut?.passMark, 'passMark', add);
    const ids: unknown = testOut?.disabledStages;
    if (Array.isArray(ids) && new Set(ids).size !== ids.length) add('disabledStages', 'A stage is listed twice.');
  },
  league: (league, add) => {
    const tiers = league?.tiers;
    const list: unknown = tiers?.list;
    if (Array.isArray(list)) {
      const seen = new Set<string>();
      list.forEach((tier: any, i: number) => {
        const id = tier?.id;
        if (typeof id === 'string') {
          if (!LEAGUE_TIER_ID_RE.test(id)) add(`tiers.list.${i}.id`, 'Use lower-case letters, digits and dashes (at most 32).');
          else if (seen.has(id)) add(`tiers.list.${i}.id`, `"${id}" is used by two tiers.`);
          seen.add(id);
        }
        const bad = typeof tier?.name === 'string' ? tokensIn(tier.name) : [];
        if (bad.length) add(`tiers.list.${i}.name`, `Plain text only (not ${bad.map((t) => `{${t}}`).join(', ')}).`);
      });
    }
    const { groupSize, promoteCount, demoteCount } = tiers ?? {};
    if ([groupSize, promoteCount, demoteCount].every((n) => typeof n === 'number') && promoteCount + demoteCount >= groupSize) {
      add('tiers.promoteCount', `Moving up and down together must be less than the group size (${groupSize}).`);
    }
  },
  badges: (badges, add) => {
    const families: unknown = badges?.families;
    if (!Array.isArray(families)) return;
    const seen = new Set<string>();
    families.forEach((family: any, i: number) => {
      const id = family?.id;
      if (typeof id === 'string') {
        if (!BADGE_FAMILY_ID_RE.test(id)) add(`families.${i}.id`, 'Use lower-case letters, digits and dashes (at most 32).');
        else if (seen.has(id)) add(`families.${i}.id`, `"${id}" is used by two families.`);
        seen.add(id);
      }
      for (const key of ['title', 'detail'] as const) {
        const text = family?.[key];
        if (typeof text !== 'string') continue;
        const tokens = tokensIn(text);
        if (!tokens.includes('n')) add(`families.${i}.${key}`, 'Must contain {n}, the tier.');
        const bad = tokens.filter((t) => t !== 'n');
        if (bad.length) add(`families.${i}.${key}`, `Only {n} may be used (not ${bad.map((t) => `{${t}}`).join(', ')}).`);
      }
      if (Array.isArray(family?.tiers)) {
        const at = strictlyAscending(family.tiers.map(Number));
        if (at !== -1) add(`families.${i}.tiers.${at}`, 'Each tier must be higher than the one before.');
      }
    });
  }
};

/** A badge family id: it becomes part of every badge id (`streak-3`). */
const BADGE_FAMILY_ID_RE = /^[a-z0-9-]{1,32}$/;

/** An id stored on accounts (a motivation answer). */
const SLUG_RE = /^[a-z0-9-]{1,32}$/;

/** Pass marks move in steps of the retry penalty's default (10), so "at most N runs" is exact. */
function multipleOfTen(value: unknown, path: string, add: (path: string, message: string) => void): void {
  if (typeof value === 'number' && Number.isInteger(value) && value % 10 !== 0) add(path, 'Must be a multiple of 10.');
}

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

/** What the content-dependent checks need: the tracks (with their stage ids) and every stage id. */
export interface SettingsContentFacts {
  tracks: Array<{ id: string; stageIds: string[] }>;
  stageIds: string[];
}

/**
 * The rules that need the content to judge: a track blurb for a track that
 * exists, placement stages that are stages of their track, test-out
 * exclusions that are stages. Checked when an admin SAVES (server/settings.js)
 * - never when stored settings are resolved, so a stage removed from the
 * content later does not throw a whole section back to its defaults (the
 * code that reads these lists ignores an id it does not know).
 */
export function settingsContentIssues(settings: Pick<Settings, 'onboarding' | 'placement' | 'testOut'>, content: SettingsContentFacts): SettingsIssue[] {
  const issues: SettingsIssue[] = [];
  const tracks = new Map(content.tracks.map((t) => [t.id, new Set(t.stageIds)]));
  const stages = new Set(content.stageIds);
  for (const trackId of Object.keys(settings.onboarding?.track?.blurbs ?? {})) {
    if (!tracks.has(trackId)) issues.push({ path: `onboarding.track.blurbs.${trackId}`, message: `There is no track "${trackId}".` });
  }
  for (const [trackId, ids] of Object.entries(settings.placement?.stagesByTrack ?? {})) {
    const inTrack = tracks.get(trackId);
    if (!inTrack) {
      issues.push({ path: `placement.stagesByTrack.${trackId}`, message: `There is no track "${trackId}".` });
      continue;
    }
    const stray = (Array.isArray(ids) ? ids : []).filter((id) => !inTrack.has(id));
    if (stray.length) issues.push({ path: `placement.stagesByTrack.${trackId}`, message: `Not a stage of this track: ${stray.join(', ')}.` });
  }
  (settings.testOut?.disabledStages ?? []).forEach((id, i) => {
    if (!stages.has(id)) issues.push({ path: `testOut.disabledStages.${i}`, message: `There is no stage "${id}".` });
  });
  return issues;
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
