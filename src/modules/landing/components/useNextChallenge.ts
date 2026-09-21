import { useMemo } from 'react';
import { useSession } from '@/platform/session';
import type { Challenge, Stage } from '@/types';

export interface NextChallenge {
  challenge: Challenge;
  stage: Stage | undefined;
  /** 1-based position of this lesson in its stage - the same "7 / 22" the practice modal shows. */
  position: number;
  /** Lessons in this stage (stage test excluded). */
  total: number;
}

/**
 * The challenge a landing panel should show for THIS visitor: the first one
 * they have not solved, from the stage they are currently on, matching the
 * given filter. Reads the same session the dashboard does, so as they solve
 * things the panel moves on to the next one. Falls back to any unsolved
 * match, then to the first match at all (a visitor who has cleared
 * everything still sees a real challenge).
 */
export function useNextChallenge(match: (c: Challenge) => boolean): NextChallenge | null {
  const { learnerStages, learnerChallenges, allChallenges, stats } = useSession();

  return useMemo(() => {
    const solved = new Set(stats.completedChallenges);
    const lessons = (c: Challenge) => !c.isStageTest;
    const unsolved = (c: Challenge) => lessons(c) && !solved.has(c.id) && match(c);

    const current = learnerStages.find((s) => s.state === 'In progress' || s.state === 'Test pending') ?? learnerStages[0];
    const inCurrent = current ? learnerChallenges.filter((c) => c.stageId === current.id) : [];

    const challenge =
      inCurrent.find(unsolved) ??
      learnerChallenges.find(unsolved) ??
      allChallenges.find(unsolved) ??
      allChallenges.find((c) => lessons(c) && match(c)) ??
      null;
    if (!challenge) return null;

    const stage = learnerStages.find((s) => s.id === challenge.stageId);
    const stageLessons = allChallenges.filter((c) => c.stageId === challenge.stageId && lessons(c));
    return { challenge, stage, position: stageLessons.indexOf(challenge) + 1, total: stageLessons.length };
  }, [learnerStages, learnerChallenges, allChallenges, stats.completedChallenges, match]);
}
