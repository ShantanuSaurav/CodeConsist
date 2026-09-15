/**
 * Where challenges come from.
 *
 * The bundled TypeScript content is the source of truth and always works
 * offline. The API serves the very same data (it compiles src/data at startup),
 * so we only reach for it to pick up edits without a page reload.
 */
import { Challenge, Stage, UserStats } from '../types';
import { ALL_CHALLENGES, CHALLENGE_BY_ID, buildStages } from '../data';
import { api } from '../lib/api';

export interface ContentBundle {
  stages: Stage[];
  challenges: Challenge[];
  byId: Map<string, Challenge>;
  source: 'api' | 'bundle';
}

function localBundle(): ContentBundle {
  return {
    stages: buildStages(),
    challenges: ALL_CHALLENGES,
    byId: CHALLENGE_BY_ID,
    source: 'bundle'
  };
}

export const contentService = {
  /** Local content immediately; callers can refresh from the API afterwards. */
  load(): ContentBundle {
    return localBundle();
  },

  async loadFromApi(): Promise<ContentBundle | null> {
    try {
      const { stages, challenges } = await api.content();
      if (!Array.isArray(challenges) || challenges.length === 0) return null;

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

      return {
        stages: stages.map((s: any) => ({
          ...s,
          state: 'Locked' as const,
          challenges: byStage.get(s.id) ?? [],
          test: testByStage.get(s.id)
        })),
        challenges,
        byId: new Map(challenges.map((c) => [c.id, c])),
        source: 'api'
      };
    } catch {
      return null;
    }
  }
};

/* --------------------------------------------------------------- unlocking */

/**
 * Decide each stage's state from the player's progress.
 *
 * A stage opens when the one before it is done. Premium stages stay locked for
 * free accounts, but they never block the stages after them - being unable to
 * pay should not end the path.
 */
export function applyProgress(stages: Stage[], stats: UserStats): Stage[] {
  let previousCleared = true;

  return stages.map((stage) => {
    const { lessonsDone, testPassed } = stageStatus(stage, stats);
    const total = stage.challenges.length;
    // Cleared means the lessons AND the stage test. The test is what proves
    // the lessons transferred, so it is what opens the next stage.
    const isCleared = total > 0 && lessonsDone && testPassed;
    const lockedByPremium = Boolean(stage.isPremium) && !stats.isPremium;
    let state: Stage['state'];

    if (isCleared) state = 'Completed';
    else if (lockedByPremium) state = 'Locked';
    else if (!previousCleared) state = 'Locked';
    else if (lessonsDone && !testPassed) state = 'Test pending';
    else state = 'In progress';

    // The next stage unlocks once this one is cleared. Neither a premium stage
    // the player cannot open nor an empty one may dam the river behind it.
    previousCleared = isCleared || lockedByPremium || total === 0;

    return { ...stage, state };
  });
}

/** Lessons solved / total, plus where the stage test stands. */
export function stageStatus(
  stage: Stage,
  stats: UserStats
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

/** @deprecated use stageStatus */
export function stageProgress(stage: Stage, stats: UserStats): { done: number; total: number; percent: number } {
  const { done, total, percent } = stageStatus(stage, stats);
  return { done, total, percent };
}
