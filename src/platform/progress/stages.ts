/**
 * Stage unlocking - the rule that turns solved challenge ids into stage
 * states. Pure over the shared types, so every screen (and a test) sees the
 * same gate: lessons open the test, the test opens the next stage.
 */
import type { Stage, UserStats } from '@/types';

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

