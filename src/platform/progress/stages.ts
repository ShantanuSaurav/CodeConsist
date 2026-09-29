/**
 * Stage unlocking - the rule that turns solved challenge ids into stage
 * states. Pure over the shared types, so every screen (and a test) sees the
 * same gate: lessons open the test, the test opens the next stage. The
 * server builds the same stages with `groupIntoStages` and runs the same
 * `applyProgressByTrack` (server/progression.js), so the lock order it
 * enforces is exactly the one the path shows.
 */
import type { Challenge, LanguageTrack, Stage, TestOutRecord, Unit, UnitDef, UserStats } from '@/types';
import { DEFAULT_UNIT_SETTINGS, resolveUnits } from './units';
import type { UnitSettings } from '../settings/types';

/** The part of the stats the stage rules read. */
export type StageStats = Pick<UserStats, 'completedChallenges'> &
  Partial<Pick<UserStats, 'isPremium' | 'unlockedStages' | 'testedOut'>>;

/**
 * Is this premium stage closed to this player? One rule for every screen:
 * a lifetime licence (`stats.isPremium`) opens everything, otherwise the
 * stage must be in the server-supplied `unlockedStages` list (bought on its
 * own or as part of its track). Free stages are never locked by this.
 */
export function isPremiumLocked(stage: Pick<Stage, 'id' | 'isPremium'>, stats: Pick<UserStats, 'isPremium' | 'unlockedStages'>): boolean {
  return Boolean(stage.isPremium) && !stats.isPremium && !(stats.unlockedStages ?? []).includes(stage.id);
}

/** The test-out record for a stage, if any. Own-property lookup, so `__proto__` is never one. */
export function testOutRecordOf(stats: Pick<StageStats, 'testedOut'>, stageId: string): TestOutRecord | null {
  const map = stats.testedOut;
  if (!map || typeof map !== 'object' || !Object.prototype.hasOwnProperty.call(map, stageId)) return null;
  const record = map[stageId];
  return record && typeof record === 'object' ? record : null;
}

/**
 * A stored `testedOut` map made safe: own keys only, each a well-formed
 * record. For the browser's cache and the server's row alike.
 */
export function normalizeTestedOut(raw: unknown): Record<string, TestOutRecord> {
  const out: Record<string, TestOutRecord> = {};
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
  for (const stageId of Object.keys(raw)) {
    if (!stageId || stageId === '__proto__') continue;
    const r = (raw as Record<string, unknown>)[stageId] as Partial<TestOutRecord> | null;
    if (!r || typeof r !== 'object') continue;
    Object.defineProperty(out, stageId, {
      value: {
        at: typeof r.at === 'string' ? r.at : '',
        via: r.via === 'placement' ? 'placement' : 'test-out',
        clears: r.clears === true,
        assessmentId: typeof r.assessmentId === 'string' ? r.assessmentId : ''
      },
      writable: true,
      enumerable: true,
      configurable: true
    });
  }
  return out;
}

/**
 * Decide each stage's state from the player's progress.
 *
 * A stage is CLEARED when every lesson is done and its test is passed, or
 * when it was tested out of with a record that `clears` (the test is then
 * solved too). A stage OPENS when:
 *   - the one before it is cleared (the chain, as always);
 *   - it was tested out of;
 *   - a later stage in the same list was tested out of - jumping ahead opens
 *     every stage before it;
 *   - there is evidence: one of its lessons, or its test, is already solved.
 *     Evidence is sticky, so a stage a learner has worked in never locks
 *     again - not when an admin adds a lesson to the stage before it, and
 *     not for solves made before the server enforced the order.
 * The premium lock is checked before any of that: nothing opens a premium
 * stage the player has not unlocked (see `isPremiumLocked`) - but such a
 * stage never blocks the stages after it, because being unable to pay
 * should not end the path.
 *
 * Without `testedOut` and with solves in order, the states are exactly what
 * they were before test-out existed.
 *
 * The lock chain is local to whatever list is passed in. The session runs
 * this once per language track (`applyProgressByTrack`), so the C track's
 * first stage never waits on Stage 10 of the core path.
 */
export function applyProgress(stages: Stage[], stats: StageStats): Stage[] {
  const solved = new Set(stats.completedChallenges);
  let lastTestedOut = -1;
  stages.forEach((stage, i) => {
    if (testOutRecordOf(stats, stage.id)) lastTestedOut = i;
  });
  let previousCleared = true;

  return stages.map((stage, i) => {
    const { lessonsDone, testPassed } = stageStatus(stage, stats);
    const total = stage.challenges.length;
    const record = testOutRecordOf(stats, stage.id);
    // Cleared means the lessons AND the stage test - or a test-out that
    // clears (its test is solved: the test-out recorded it).
    const isCleared = (total > 0 && lessonsDone && testPassed) || (Boolean(record?.clears) && testPassed);
    const lockedByPremium = isPremiumLocked(stage, { isPremium: stats.isPremium, unlockedStages: stats.unlockedStages });
    const evidence = stage.challenges.some((c) => solved.has(c.id)) || Boolean(stage.test && solved.has(stage.test.id));
    const opened = previousCleared || Boolean(record) || i < lastTestedOut || evidence;
    let state: Stage['state'];

    if (isCleared) state = 'Completed';
    else if (lockedByPremium) state = 'Locked';
    else if (!opened) state = 'Locked';
    else if (lessonsDone && !testPassed) state = 'Test pending';
    else state = 'In progress';

    // The next stage unlocks once this one is cleared. Neither a premium stage
    // the player cannot open nor an empty one may dam the river behind it.
    previousCleared = isCleared || lockedByPremium || total === 0;

    return record ? { ...stage, state, testedOut: true } : { ...stage, state };
  });
}

/** Lessons solved / total, plus where the stage test stands. */
export function stageStatus(
  stage: Stage,
  stats: Pick<UserStats, 'completedChallenges'>
): {
  done: number;
  total: number;
  percent: number;
  lessonsDone: boolean;
  hasTest: boolean;
  testPassed: boolean;
  /** Lessons are finished, so the test may be taken. */
  testUnlocked: boolean;
} {
  const solved = new Set(stats.completedChallenges);
  const total = stage.challenges.length;
  const done = stage.challenges.filter((c) => solved.has(c.id)).length;
  const lessonsDone = total > 0 && done === total;
  const hasTest = Boolean(stage.test);
  const testPassed = !stage.test || solved.has(stage.test.id);
  return {
    done,
    total,
    percent: total ? Math.round((done / total) * 100) : 0,
    lessonsDone,
    hasTest,
    testPassed,
    testUnlocked: hasTest && lessonsDone
  };
}

/**
 * The subset of `stages` that make up one track, in the track's order.
 * Stage ids the track names but the bank does not have (an unpublished
 * stage, say) are skipped rather than crashing the path.
 */
export function stagesForTrack<T extends Pick<Stage, 'id'>>(stages: readonly T[], track: Pick<LanguageTrack, 'stageIds'>): T[] {
  const byId = new Map(stages.map((s) => [s.id, s]));
  const ordered: T[] = [];
  for (const id of track.stageIds) {
    const stage = byId.get(id);
    if (stage) ordered.push(stage);
  }
  return ordered;
}

/**
 * The lists `applyProgressByTrack` chains: each track's stages in its order
 * (a stage in two tracks is chained in the first), then every stage no track
 * names, in bank order. Each stage is in exactly one list.
 */
export function stageChains<T extends Pick<Stage, 'id'>>(stages: readonly T[], tracks: readonly Pick<LanguageTrack, 'stageIds'>[]): T[][] {
  const seen = new Set<string>();
  const chains: T[][] = [];
  for (const track of tracks) {
    const chain = stagesForTrack(stages, track).filter((s) => {
      if (seen.has(s.id)) return false;
      seen.add(s.id);
      return true;
    });
    chains.push(chain);
  }
  chains.push(stages.filter((s) => !seen.has(s.id)));
  return chains;
}

/**
 * `applyProgress`, run once per track. Returns the whole bank in its original
 * order, every stage carrying the state its own track's chain gives it. A
 * stage that belongs to no track is chained with the other untracked stages
 * in bank order, so nothing is ever silently dropped.
 *
 * A stage listed in two tracks takes the state of the first track's chain,
 * but the second track's chain still sees it where that track puts it.
 */
export function applyProgressByTrack(stages: readonly Stage[], tracks: readonly LanguageTrack[], stats: StageStats): Stage[] {
  const stateById = new Map<string, Stage>();
  const seen = new Set<string>();
  for (const track of tracks) {
    for (const stage of applyProgress(stagesForTrack(stages, track), stats)) {
      if (!seen.has(stage.id)) {
        stateById.set(stage.id, stage);
        seen.add(stage.id);
      }
    }
  }
  const untracked = stages.filter((s) => !seen.has(s.id));
  for (const stage of applyProgress(untracked, stats)) stateById.set(stage.id, stage);
  return stages.map((s) => stateById.get(s.id) ?? s);
}

/* --------------------------------------------------------------- grouping */

/** A stage's units resolved against its lessons, and the lessons in unit order. */
export function withResolvedUnits(stage: Stage, defs: readonly UnitDef[] | null | undefined, cfg: UnitSettings): Stage {
  const units = resolveUnits(stage.id, stage.challenges, defs, cfg) as Unit[];
  return { ...stage, units, challenges: units.flatMap((u) => u.challenges) };
}

/** What `groupIntoStages` needs of a stage: everything but what grouping fills in. */
export type StageMeta = Omit<Stage, 'challenges' | 'state' | 'test' | 'units'> & { units?: UnitDef[] };

/**
 * Group a flat challenge list under its stages, splitting each stage's test
 * (isStageTest) out of the lessons. Stage order follows `stageMeta`. When the
 * meta carries the server's `units` (GET /api/content), each stage gets them,
 * resolved against its lessons - which then follow the unit order.
 *
 * The browser groups the bank with this, and so does the server when it
 * decides which stages a learner has open (server/progression.js).
 */
export function groupIntoStages(stageMeta: StageMeta[], challenges: Challenge[], cfg: UnitSettings = DEFAULT_UNIT_SETTINGS): Stage[] {
  const byStage = new Map<string, Challenge[]>();
  const testByStage = new Map<string, Challenge>();
  for (const challenge of challenges) {
    if (challenge.isStageTest) {
      testByStage.set(challenge.stageId, challenge);
      continue;
    }
    const list = byStage.get(challenge.stageId);
    if (list) list.push(challenge);
    else byStage.set(challenge.stageId, [challenge]);
  }
  return stageMeta.map(({ units, ...meta }) => {
    const stage: Stage = {
      ...meta,
      state: 'Locked' as const,
      challenges: byStage.get(meta.id) ?? [],
      test: testByStage.get(meta.id)
    };
    return Array.isArray(units) ? withResolvedUnits(stage, units, cfg) : stage;
  });
}
