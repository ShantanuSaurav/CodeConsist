/**
 * The challenge bank, discovered at build time.
 *
 * This is its own public entry (`@/modules/challenges/content`), separate
 * from the module barrel, and the app loads it with a dynamic import: the
 * bank is by far the largest thing we ship, and keeping it out of the shell
 * chunk is what lets the first screen paint before it arrives (ADR 0006).
 *
 * `import.meta.glob` finds every batch file under this directory, so adding a
 * topic folder or a batch needs no registration step. The pattern below must
 * match `challengesSpec` (same directory, same exclusions) - the parity check
 * in `npm run check` fails if they drift.
 */
import type { Challenge, Stage } from '@/types';
import { loadFromGlob } from '@/platform/content-registry';
import { challengesSpec } from './spec';
import { STAGE_META } from './stages';

const modules = import.meta.glob(['./**/*.ts', '!./index.ts', '!./spec.ts', '!./stages.ts'], { eager: true });

const loaded = loadFromGlob(challengesSpec, modules);

/** Every challenge - lessons and stage tests - in stage order, then authored order. */
export const ALL_CHALLENGES: Challenge[] = loaded.items;

/** Development only: resolves with the schema issues (none, we hope) once the deferred check has run. */
export const CHALLENGES_VERIFIED = loaded.verified;

/** Flat lookup used by the grader and the practice session. */
export const CHALLENGE_BY_ID: Map<string, Challenge> = new Map(ALL_CHALLENGES.map((c) => [c.id, c]));

/**
 * Challenges grouped by stage, in stage order, preserving authored order.
 * The stage test (isStageTest) is split out into `stage.test`; `stage.challenges`
 * holds only the lessons.
 */
export function buildStages(challenges: Challenge[] = ALL_CHALLENGES): Stage[] {
  const byStage = new Map<string, Challenge[]>();
  const testByStage = new Map<string, Challenge>();
  for (const challenge of challenges) {
    if (challenge.isStageTest) {
      testByStage.set(challenge.stageId, challenge);
      continue;
    }
    const bucket = byStage.get(challenge.stageId);
    if (bucket) bucket.push(challenge);
    else byStage.set(challenge.stageId, [challenge]);
  }

  return STAGE_META.map((meta) => ({
    ...meta,
    state: 'Locked' as const,
    challenges: byStage.get(meta.id) ?? [],
    test: testByStage.get(meta.id)
  }));
}

export { STAGE_META };
export { challengesSpec } from './spec';
