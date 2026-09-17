/**
 * The content the session works from.
 *
 * The app hands the session its bundled content (the modules own their
 * content; the platform must not import them). The API serves the very same
 * bank - it runs the same registry loader - so we only reach for it to pick up
 * edits without a page reload.
 */
import type { Challenge, Stage } from '@/types';
import { api } from '../api-client/api';

export interface ContentBundle {
  stages: Stage[];
  challenges: Challenge[];
  byId: Map<string, Challenge>;
  source: 'api' | 'bundle';
}

/**
 * Group a flat challenge list under its stages, splitting each stage's test
 * (isStageTest) out of the lessons. Stage order follows `stageMeta`.
 */
export function groupIntoStages(
  stageMeta: Array<Omit<Stage, 'challenges' | 'state' | 'test'>>,
  challenges: Challenge[]
): Stage[] {
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
  return stageMeta.map((meta) => ({
    ...meta,
    state: 'Locked' as const,
    challenges: byStage.get(meta.id) ?? [],
    test: testByStage.get(meta.id)
  }));
}

/** Build a bundle from already-grouped stages and their challenges. */
export function makeBundle(stages: Stage[], challenges: Challenge[], source: ContentBundle['source'] = 'bundle'): ContentBundle {
  return { stages, challenges, byId: new Map(challenges.map((c) => [c.id, c])), source };
}

/** Fetch the bank from the API; null when it is unreachable or empty. */
export async function loadFromApi(): Promise<ContentBundle | null> {
  try {
    const { stages, challenges } = await api.content();
    if (!Array.isArray(challenges) || challenges.length === 0) return null;
    return makeBundle(groupIntoStages(stages, challenges), challenges, 'api');
  } catch {
    return null;
  }
}
