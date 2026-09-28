/* ==========================================================================
   Units: a stage's lessons in short runs of about five questions, each a
   node on the learning path with its own end screen.

   Pure and free of React, shared by the browser (the path, the practice
   session, the bundled/offline content) and the server (GET /api/content,
   the perfect-unit bonus and the admin units editor, through
   src/platform/server-lib.ts). One implementation, two runtimes.

   "Done" is never stored: a unit is done when every lesson in it is solved,
   derived from `completedChallenges` every time. `unitsCompleted` on the
   progress row only records that a bonus was (or was not) paid.
   ========================================================================== */
import type { ChallengeType, UnitDef, UnitSource } from '@/types';
import type { UnitSettings } from '../settings/types';

/** Every question kind, in the order the admin form lists them. */
export const CHALLENGE_TYPES: readonly ChallengeType[] = [
  'quiz',
  'output_prediction',
  'multi_select',
  'fill_blank',
  'pseudocode_order',
  'code_runner',
  'debug'
];

/**
 * The unit defaults. Re-exported as `DEFAULT_SETTINGS.units`
 * (src/platform/settings/defaults.ts) so the two cannot drift.
 */
export const DEFAULT_UNIT_SETTINGS: UnitSettings = {
  targetSize: 5,
  minSize: 3,
  maxSize: 8,
  targetMinutes: 8,
  minutesByType: {
    quiz: 0.5,
    output_prediction: 0.75,
    multi_select: 1,
    fill_blank: 1,
    pseudocode_order: 1.5,
    code_runner: 4,
    debug: 3
  },
  perfectBonusXp: 25,
  perfectRequiresNoHints: true
};

/** Hard safety bounds of an admin's grouping - deliberately not settings. */
export const UNIT_LIMITS = { maxUnits: 40, maxItems: 30, nameMax: 60, descriptionMax: 200 } as const;

/** What the unit maths needs from a question (a full Challenge, a locked stub, or an admin row). */
export interface UnitLesson {
  id: string;
  type: ChallengeType;
  xpReward?: number;
  isStageTest?: boolean;
  title?: string;
}

/** A unit with its questions resolved against a stage's lessons. `Unit` in @/types is this with full challenges. */
export interface ResolvedUnit<T extends UnitLesson = UnitLesson> extends UnitDef {
  stageId: string;
  /** 0-based position in the stage. */
  index: number;
  challenges: T[];
  /** Expected minutes, from `units.minutesByType`. */
  estMinutes: number;
  /** The XP its questions pay on a first, clean solve. */
  xp: number;
  source: UnitSource;
}

type Sizing = Pick<UnitSettings, 'targetSize' | 'minSize' | 'maxSize'>;

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function positive(value: unknown, fallback: number): number {
  const n = Math.floor(Number(value));
  return Number.isFinite(n) && n >= 1 ? n : fallback;
}

/** `n` items in `k` chunks as even as possible, the larger ones first (11 -> 6/5). */
function balancedSizes(n: number, k: number): number[] {
  const base = Math.floor(n / k);
  const extra = n % k;
  return Array.from({ length: k }, (_, i) => base + (i < extra ? 1 : 0));
}

/**
 * The default grouping of a stage's lessons.
 *
 *   1. Split the lessons (in order, the stage test left out) into runs by
 *      batch letter, read from `^<stageId>-([a-z])\d` - `stage-3-a04` is in
 *      run `a`. Anything else (a question written in the admin console) is
 *      in run `x`.
 *   2. Cut each run into k = max(ceil(n / maxSize), round(n / targetSize))
 *      chunks of balanced size: 10 -> 5/5, 12 -> 6/6, 11 -> 6/5, 17 -> 6/6/5.
 *   3. A trailing chunk smaller than `minSize` joins the unit before it when
 *      the two together stay within `maxSize`.
 *   4. Ids are `${stageId}:${letter}${k}` (`stage-3:a1`, `stage-3:b2`).
 *
 * Pass EVERY lesson of the stage, hidden ones included (server/units.js
 * does), and resolve the result against the visible ones: then hiding a
 * question shrinks its own unit and no other lesson changes unit.
 */
export function defaultUnits(stageId: string, lessons: readonly UnitLesson[], cfg: Sizing = DEFAULT_UNIT_SETTINGS): UnitDef[] {
  const maxSize = positive(cfg.maxSize, DEFAULT_UNIT_SETTINGS.maxSize);
  const targetSize = Math.min(maxSize, positive(cfg.targetSize, DEFAULT_UNIT_SETTINGS.targetSize));
  const minSize = positive(cfg.minSize, DEFAULT_UNIT_SETTINGS.minSize);
  const letterOf = new RegExp(`^${escapeRegExp(stageId)}-([a-z])\\d`);

  const runs: Array<{ letter: string; ids: string[] }> = [];
  for (const lesson of lessons) {
    if (lesson.isStageTest) continue;
    const letter = letterOf.exec(lesson.id)?.[1] ?? 'x';
    const last = runs[runs.length - 1];
    if (last && last.letter === letter) last.ids.push(lesson.id);
    else runs.push({ letter, ids: [lesson.id] });
  }

  const units: UnitDef[] = [];
  // A letter that comes back later (a, b, a) keeps counting, so ids stay unique.
  const counters = new Map<string, number>();
  for (const run of runs) {
    const n = run.ids.length;
    const k = Math.max(1, Math.ceil(n / maxSize), Math.round(n / targetSize));
    let at = 0;
    const chunks = balancedSizes(n, Math.min(k, n)).map((size) => {
      const ids = run.ids.slice(at, at + size);
      at += size;
      return ids;
    });
    chunks.forEach((ids, j) => {
      const seq = (counters.get(run.letter) ?? 0) + 1;
      counters.set(run.letter, seq);
      const isTrailing = j === chunks.length - 1;
      const previous = units[units.length - 1];
      if (isTrailing && ids.length < minSize && previous && previous.challengeIds.length + ids.length <= maxSize) {
        previous.challengeIds.push(...ids);
        return;
      }
      units.push({ id: `${stageId}:${run.letter}${seq}`, name: '', challengeIds: [...ids], source: 'default' });
    });
  }
  units.forEach((unit, i) => {
    unit.name = `Unit ${i + 1}`;
  });
  return units;
}

/** Expected minutes for a set of questions, to the nearest half minute. */
export function estimateMinutes(challenges: readonly Pick<UnitLesson, 'type'>[], cfg: Pick<UnitSettings, 'minutesByType'> = DEFAULT_UNIT_SETTINGS): number {
  let total = 0;
  for (const c of challenges) {
    const own = Number(cfg.minutesByType?.[c.type]);
    total += Number.isFinite(own) && own > 0 ? own : DEFAULT_UNIT_SETTINGS.minutesByType[c.type] ?? 1;
  }
  return Math.round(total * 2) / 2;
}

/** The XP a set of questions pays on a first, clean solve. */
export function unitXp(challenges: readonly Pick<UnitLesson, 'xpReward'>[]): number {
  return challenges.reduce((sum, c) => sum + (Number(c.xpReward) || 0), 0);
}

/**
 * A stage's units, resolved against the lessons it actually has.
 *
 * `defs` is an admin's grouping (server/db.js `contentOverrides.units`) or
 * what the server sent (`GET /api/content`); without it the default grouping
 * is used. Either way:
 *   - unknown or hidden ids are dropped, and so is a unit left empty;
 *   - a default unit is named by its place ("Unit 2"), an admin's by its name;
 *   - the stage test is never in a unit;
 *   - a lesson in no unit (written after the grouping was saved) goes into
 *     a trailing `${stageId}:auto` unit;
 *   - a lesson listed twice stays in the first unit that has it.
 * The concatenated units ARE the stage's lesson order.
 */
export function resolveUnits<T extends UnitLesson>(
  stageId: string,
  lessons: readonly T[],
  defs: readonly UnitDef[] | null | undefined,
  cfg: UnitSettings = DEFAULT_UNIT_SETTINGS
): ResolvedUnit<T>[] {
  const pool = lessons.filter((l) => !l.isStageTest);
  const byId = new Map(pool.map((l) => [l.id, l]));
  const grouping = Array.isArray(defs) && defs.length > 0 ? defs : defaultUnits(stageId, pool, cfg);
  const fallbackSource: UnitSource = Array.isArray(defs) && defs.length > 0 ? 'custom' : 'default';

  const used = new Set<string>();
  const kept: UnitDef[] = [];
  for (const def of grouping) {
    if (!def || typeof def.id !== 'string' || !Array.isArray(def.challengeIds)) continue;
    const ids = (def.challengeIds as unknown[]).filter((id): id is string => typeof id === 'string' && byId.has(id) && !used.has(id));
    if (ids.length === 0) continue;
    ids.forEach((id) => used.add(id));
    const source = def.source ?? fallbackSource;
    const named = typeof def.name === 'string' && def.name.trim() ? def.name : '';
    const unit: UnitDef = {
      id: def.id,
      // A default unit is named by where it sits, so one left out (every
      // question in it hidden) leaves no gap: Unit 1, Unit 2, not Unit 1, Unit 3.
      name: source === 'default' || !named ? `Unit ${kept.length + 1}` : named,
      challengeIds: ids,
      source
    };
    if (typeof def.description === 'string' && def.description) unit.description = def.description;
    kept.push(unit);
  }

  const unassigned = pool.filter((l) => !used.has(l.id)).map((l) => l.id);
  if (unassigned.length > 0) {
    const autoId = `${stageId}:auto`;
    const existing = kept.find((u) => u.id === autoId);
    if (existing) existing.challengeIds.push(...unassigned);
    else kept.push({ id: autoId, name: kept.length ? 'More lessons' : 'Unit 1', challengeIds: unassigned, source: 'auto' });
  }

  return kept.map((unit, index) => {
    const challenges = unit.challengeIds.map((id) => byId.get(id)!).filter(Boolean);
    return {
      ...unit,
      stageId,
      index,
      challenges,
      estMinutes: estimateMinutes(challenges, cfg),
      xp: unitXp(challenges),
      source: unit.source ?? fallbackSource
    };
  });
}

/** Units as plain definitions (ids and names only) - what the server sends and the browser caches. */
export function toUnitDefs(units: readonly (UnitDef & { challenges?: unknown })[]): UnitDef[] {
  return units.map((u) => {
    const def: UnitDef = { id: u.id, name: u.name, challengeIds: [...u.challengeIds] };
    if (u.description) def.description = u.description;
    if (u.source) def.source = u.source;
    return def;
  });
}

/** The unit a question belongs to, or null (the stage test, an unknown id). */
export function unitFor<U extends Pick<UnitDef, 'challengeIds'>>(units: readonly U[] | null | undefined, challengeId: string): U | null {
  if (!units) return null;
  return units.find((u) => u.challengeIds.includes(challengeId)) ?? null;
}

export type UnitGate = 'done' | 'current' | 'locked';

export interface UnitState {
  unitId: string;
  /** done: every lesson solved. current: the first unit that is not. locked: after it. */
  state: UnitGate;
  done: number;
  total: number;
}

/**
 * Where each unit stands. Units are taken in order, like the lessons inside
 * them: the first unit that is not done is the current one and everything
 * after it is locked - except a unit that is already done (an admin's
 * regrouping can put one there), which stays open for a replay.
 */
export function unitStates(units: readonly Pick<UnitDef, 'id' | 'challengeIds'>[], completed: Iterable<string>): UnitState[] {
  const solved = completed instanceof Set ? (completed as Set<string>) : new Set(completed);
  let currentSeen = false;
  return units.map((unit) => {
    const total = unit.challengeIds.length;
    const done = unit.challengeIds.filter((id) => solved.has(id)).length;
    let state: UnitGate;
    if (total > 0 && done === total) state = 'done';
    else if (!currentSeen) {
      state = 'current';
      currentSeen = true;
    } else state = 'locked';
    return { unitId: unit.id, state, done, total };
  });
}

/* ------------------------------------------------------ admin validation */

/** A problem with an admin's grouping, tied to its path (`units.2.name`). */
export interface UnitIssue {
  path: string;
  message: string;
}

/** One unit as the admin editor sends it; `id` is absent for a new unit. */
export interface UnitInput {
  id?: string;
  name: string;
  description?: string;
  challengeIds: string[];
}

export interface UnitValidation {
  /** The input, tidied (names trimmed). Only meaningful when `issues` is empty. */
  units: UnitInput[];
  /** Hard errors: the save is refused (422). */
  issues: UnitIssue[];
  /** Outside the size or time targets: shown, never blocking. */
  warnings: UnitIssue[];
}

const UNIT_ID_RE = /^[A-Za-z0-9_-]+:[a-z0-9-]{1,32}$/;

/**
 * Check an admin's grouping of one stage against every lesson it has -
 * hidden ones included, so unhiding a question never orphans it.
 *
 * Refused: an unknown id or one from another stage, the stage test, a
 * question in two units, a lesson in no unit, a name empty or over 60
 * characters, a description over 200, more than 40 units, a unit with no
 * question or more than 30, a malformed unit id (it must start with
 * `${stageId}:`). Warned about: a unit outside [minSize, maxSize], or
 * expected to take longer than `targetMinutes`.
 */
export function validateUnitOverride(
  stageId: string,
  lessons: readonly UnitLesson[],
  input: unknown,
  cfg: UnitSettings = DEFAULT_UNIT_SETTINGS,
  options: { testIds?: readonly string[]; stageOf?: (id: string) => string | null | undefined } = {}
): UnitValidation {
  const issues: UnitIssue[] = [];
  const warnings: UnitIssue[] = [];
  const raw = Array.isArray(input) ? input : input && typeof input === 'object' ? (input as { units?: unknown }).units : undefined;
  if (!Array.isArray(raw)) {
    return { units: [], issues: [{ path: 'units', message: 'Send the units as a list.' }], warnings };
  }
  if (raw.length > UNIT_LIMITS.maxUnits) issues.push({ path: 'units', message: `At most ${UNIT_LIMITS.maxUnits} units.` });

  const byId = new Map(lessons.filter((l) => !l.isStageTest).map((l) => [l.id, l]));
  const tests = new Set([...(options.testIds ?? []), ...lessons.filter((l) => l.isStageTest).map((l) => l.id)]);
  const seenQuestions = new Map<string, number>();
  const seenUnits = new Set<string>();
  const units: UnitInput[] = [];

  raw.forEach((entry: unknown, i: number) => {
    const at = `units.${i}`;
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      issues.push({ path: at, message: 'Each unit must be an object.' });
      return;
    }
    const src = entry as Record<string, unknown>;
    const unit: UnitInput = { name: '', challengeIds: [] };

    if (src.id !== undefined && src.id !== null && src.id !== '') {
      if (typeof src.id !== 'string' || !UNIT_ID_RE.test(src.id) || !src.id.startsWith(`${stageId}:`)) {
        issues.push({ path: `${at}.id`, message: `Unit ids look like ${stageId}:a1 and belong to this stage.` });
      } else if (seenUnits.has(src.id)) {
        issues.push({ path: `${at}.id`, message: `${src.id} is used by two units.` });
      } else {
        seenUnits.add(src.id);
        unit.id = src.id;
      }
    }

    const name = typeof src.name === 'string' ? src.name.trim() : '';
    if (!name) issues.push({ path: `${at}.name`, message: 'Give the unit a name.' });
    else if (name.length > UNIT_LIMITS.nameMax) issues.push({ path: `${at}.name`, message: `At most ${UNIT_LIMITS.nameMax} characters.` });
    unit.name = name;

    if (src.description !== undefined && src.description !== null) {
      if (typeof src.description !== 'string') issues.push({ path: `${at}.description`, message: 'Must be text.' });
      else if (src.description.trim().length > UNIT_LIMITS.descriptionMax) {
        issues.push({ path: `${at}.description`, message: `At most ${UNIT_LIMITS.descriptionMax} characters.` });
      } else if (src.description.trim()) unit.description = src.description.trim();
    }

    const ids = Array.isArray(src.challengeIds) ? src.challengeIds : null;
    if (!ids) {
      issues.push({ path: `${at}.challengeIds`, message: 'List the questions in this unit.' });
    } else {
      if (ids.length === 0) issues.push({ path: `${at}.challengeIds`, message: 'A unit needs at least one question - delete an empty one.' });
      if (ids.length > UNIT_LIMITS.maxItems) issues.push({ path: `${at}.challengeIds`, message: `At most ${UNIT_LIMITS.maxItems} questions in a unit.` });
      ids.forEach((id: unknown, j: number) => {
        const path = `${at}.challengeIds.${j}`;
        if (typeof id !== 'string' || !id) {
          issues.push({ path, message: 'Not a question id.' });
          return;
        }
        if (tests.has(id)) {
          issues.push({ path, message: 'The stage test is not part of a unit - it comes after the last one.' });
          return;
        }
        if (!byId.has(id)) {
          const other = options.stageOf?.(id);
          issues.push({ path, message: other && other !== stageId ? `${id} belongs to another stage (${other}).` : `There is no question ${id} in this stage.` });
          return;
        }
        const earlier = seenQuestions.get(id);
        if (earlier !== undefined) {
          issues.push({ path, message: `${id} is already in unit ${earlier + 1}.` });
          return;
        }
        seenQuestions.set(id, i);
        unit.challengeIds.push(id);
      });
    }
    units.push(unit);

    // Targets: warned about, never refused.
    const size = unit.challengeIds.length;
    if (size > 0 && (size < cfg.minSize || size > cfg.maxSize)) {
      warnings.push({ path: at, message: `${size} ${size === 1 ? 'question' : 'questions'} - outside the ${cfg.minSize}-${cfg.maxSize} target.` });
    }
    const minutes = estimateMinutes(unit.challengeIds.map((id) => byId.get(id)!).filter(Boolean), cfg);
    if (minutes > cfg.targetMinutes) warnings.push({ path: at, message: `About ${minutes} minutes - over the ${cfg.targetMinutes}-minute target.` });
  });

  for (const lesson of byId.values()) {
    if (!seenQuestions.has(lesson.id)) {
      issues.push({ path: 'units', message: `"${lesson.title ?? lesson.id}" (${lesson.id}) is not in any unit.` });
    }
  }
  return { units, issues, warnings };
}
