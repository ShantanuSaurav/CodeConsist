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
 * given filter. Only unlocked stages in the active track are candidates.
 * A completed track offers a previous lesson; it never advertises a locked
 * lesson or silently switches the preview to another language track.
 */
export function useNextChallenge(match: (c: Challenge) => boolean): NextChallenge | null {
  const { learnerStages, learnerChallenges, allChallenges, stats } = useSession();

  return useMemo(() => {
    const solved = new Set(stats.completedChallenges);
    // A locked stub (a premium stage this visitor has not unlocked) has no
    // prompt or answers to show.
    const accessible = new Set(learnerStages.filter((stage) => stage.state !== 'Locked').map((stage) => stage.id));
    const lessons = (c: Challenge) => !c.isStageTest && !c.locked && accessible.has(c.stageId);
    const unsolved = (c: Challenge) => lessons(c) && !solved.has(c.id) && match(c);

    const current = learnerStages.find((s) => s.state === 'In progress' || s.state === 'Test pending') ?? learnerStages[0];
    const inCurrent = current ? learnerChallenges.filter((c) => c.stageId === current.id) : [];

    const challenge =
      inCurrent.find(unsolved) ??
      learnerChallenges.find(unsolved) ??
      learnerChallenges.find((c) => lessons(c) && match(c)) ??
      null;
    if (!challenge) return null;

    const stage = learnerStages.find((s) => s.id === challenge.stageId);
    const stageLessons = allChallenges.filter((c) => c.stageId === challenge.stageId && lessons(c));
    return { challenge, stage, position: stageLessons.indexOf(challenge) + 1, total: stageLessons.length };
  }, [learnerStages, learnerChallenges, allChallenges, stats.completedChallenges, match]);
}
