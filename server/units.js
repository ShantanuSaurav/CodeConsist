/**
 * Units on the server: each stage's lessons grouped into short units, for
 * the learner-facing bank (GET /api/content), the perfect-unit bonus on a
 * solve or a merge, and the admin units editor.
 *
 * The grouping rules are the shared, pure ones in
 * src/platform/progress/units.ts (handed in as `lib`, the compiled
 * server-lib bundle), so the server and the browser can never disagree on
 * which unit a question is in:
 *
 *   an admin's grouping (server/db.js `contentOverrides.units[stageId]`)
 *   else the default grouping from `settings.units`, cut from EVERY lesson
 *   of the stage (hidden ones too, so hiding a question shrinks its unit)
 *   -> resolved against the lessons LEARNERS see (hidden ones left out, the
 *      stage test never in a unit, leftovers in a trailing `:auto` unit).
 *
 * Resolved once per state - content snapshot, admin content overrides,
 * admin-written questions and settings revision - not once per request.
 */
import { allChallenges, applyLearnerOverrides, applyStageOverride, contentSnapshot } from './content.js';

function plainObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function ownEntry(map, key) {
  return map && typeof key === 'string' && Object.hasOwn(map, key) ? map[key] : null;
}

/**
 * @param {object} deps
 * @param {object} deps.store     server/db.js (getContentOverrides, getUnitOverride, allCustomChallenges)
 * @param {object} deps.lib       the compiled src/platform/server-lib.ts
 * @param {object} deps.settings  server/settings.js's service
 * @param {() => object | null} [deps.getSnapshot]  the authored content (content.js contentSnapshot)
 */
export function createUnitsService({ store, lib, settings, getSnapshot = contentSnapshot }) {
  let memo = null;

  const cfg = () => settings.current().units;
  const overridesOf = () => plainObject(plainObject(store.getContentOverrides?.()).units);

  /** What the resolved units depend on, cheaply compared. */
  function stateKey(snapshot) {
    const custom = typeof store.allCustomChallenges === 'function' ? store.allCustomChallenges() : [];
    return [
      settings.revision(),
      snapshot?.builtAt ?? '',
      JSON.stringify(store.getContentOverrides?.() ?? {}),
      custom.map((c) => `${c.id}@${c.stageId}@${c.updatedAt ?? ''}`).join('|')
    ].join('\n');
  }

  function build() {
    const snapshot = getSnapshot();
    if (!snapshot) return { byStage: new Map(), byChallenge: new Map() };
    const key = stateKey(snapshot);
    if (memo && memo.snapshot === snapshot && memo.key === key) return memo;

    const contentOverrides = plainObject(store.getContentOverrides?.());
    // Which lessons exist, not what they teach: the teaching cards are left
    // out (a card anchored to a unit's start asks this service where it is).
    const merged = applyLearnerOverrides(snapshot, contentOverrides, { concepts: false });
    // The same bank with no question hidden. The default grouping is cut from
    // EVERY lesson of a stage and only then resolved against the visible ones,
    // so hiding a question shrinks its own unit instead of re-balancing the
    // whole stage (and the admin editor's "Default" matches what learners get).
    const everyLesson = applyLearnerOverrides(snapshot, { ...contentOverrides, challenges: {} }, { concepts: false }).challenges;
    const overrides = overridesOf();
    const units = cfg();
    const byStage = new Map();
    const byChallenge = new Map();
    for (const stage of merged.stages) {
      const inStage = (c) => c.stageId === stage.id && !c.isStageTest;
      const lessons = merged.challenges.filter(inStage);
      const custom = ownEntry(overrides, stage.id);
      const grouping =
        Array.isArray(custom?.units) && custom.units.length > 0 ? custom.units : lib.defaultUnits(stage.id, everyLesson.filter(inStage), units);
      const resolved = lib.resolveUnits(stage.id, lessons, grouping, units);
      const defs = lib.toUnitDefs(resolved);
      byStage.set(stage.id, defs);
      for (const def of defs) for (const id of def.challengeIds) byChallenge.set(id, def);
    }
    memo = { snapshot, key, byStage, byChallenge };
    return memo;
  }

  /** A stage's units as learners get them (hidden lessons left out); [] for a hidden or unknown stage. */
  function unitsForStage(stageId) {
    return build().byStage.get(stageId) ?? [];
  }

  /** The unit a question is in, as learners see it - or null (the stage test, a hidden or unknown id). */
  function unitFor(challengeId) {
    return build().byChallenge.get(String(challengeId ?? '')) ?? null;
  }

  /** The first lesson learners see in a unit (where a teaching card anchored to its start goes), or null. */
  function firstLessonOf(unitId) {
    const id = String(unitId ?? '');
    for (const defs of build().byStage.values()) {
      const unit = defs.find((d) => d.id === id);
      if (unit) return unit.challengeIds[0] ?? null;
    }
    return null;
  }

  /** `applyLearnerOverrides(...)` output with each stage's `units` attached, for GET /api/content. */
  function attachUnits(merged) {
    const { byStage } = build();
    return { ...merged, stages: merged.stages.map((stage) => ({ ...stage, units: byStage.get(stage.id) ?? [] })) };
  }

  /** How many units learners see, across every visible stage. */
  function unitCount() {
    let n = 0;
    for (const defs of build().byStage.values()) n += defs.length;
    return n;
  }

  /** Every lesson of a stage the admin can place - hidden ones included - and its test ids. */
  function adminLessons(stageId) {
    const hidden = plainObject(plainObject(store.getContentOverrides?.()).challenges);
    const inStage = allChallenges().filter((c) => c.stageId === stageId);
    return {
      lessons: inStage.filter((c) => !c.isStageTest).map((c) => ({ ...c, hidden: Boolean(ownEntry(hidden, c.id)?.hidden) })),
      testIds: inStage.filter((c) => c.isStageTest).map((c) => c.id)
    };
  }

  /** One unit, as the admin editor shows it. */
  function adminUnit(unit) {
    return {
      id: unit.id,
      name: unit.name,
      ...(unit.description ? { description: unit.description } : {}),
      challengeIds: [...unit.challengeIds],
      source: unit.source,
      size: unit.challenges.length,
      estMinutes: unit.estMinutes,
      xp: unit.xp
    };
  }

  /**
   * The admin editor's view of one stage (GET /api/admin/content/stages/:id/units):
   * the grouping in force over EVERY lesson (hidden ones too - unhiding one
   * never orphans it), the default grouping, the lessons, anything not in a
   * unit yet, and the size/time warnings.
   */
  function adminView(stageId) {
    const { lessons, testIds } = adminLessons(stageId);
    const units = cfg();
    const record = ownEntry(overridesOf(), stageId);
    const custom = Array.isArray(record?.units) ? record.units : null;
    const defaults = lib.resolveUnits(stageId, lessons, null, units).map(adminUnit);
    let current = defaults;
    let unassigned = [];
    if (custom) {
      const resolved = lib.resolveUnits(stageId, lessons, custom, units);
      current = resolved.filter((u) => u.source !== 'auto').map(adminUnit);
      unassigned = resolved.filter((u) => u.source === 'auto').flatMap((u) => u.challengeIds);
    }
    const check = lib.validateUnitOverride(stageId, lessons, { units: current }, units, { testIds });
    const authored = getSnapshot()?.stages.find((s) => s.id === stageId);
    const stage = authored ? applyStageOverride(authored, plainObject(store.getContentOverrides?.()).stages) : null;
    return {
      stageId,
      stage: stage ? { id: stage.id, name: stage.name, index: stage.index, hasTest: testIds.length > 0 } : null,
      source: custom ? 'custom' : 'default',
      units: current,
      defaults,
      lessons: lessons.map((c) => ({ id: c.id, title: c.title, type: c.type, difficulty: c.difficulty, xpReward: c.xpReward, hidden: c.hidden })),
      unassigned,
      warnings: check.warnings,
      nextSeq: Number.isInteger(record?.nextSeq) ? record.nextSeq : 1,
      updatedAt: typeof record?.updatedAt === 'string' ? record.updatedAt : null
    };
  }

  return { unitsForStage, unitFor, firstLessonOf, attachUnits, unitCount, adminLessons, adminView, cfg };
}
