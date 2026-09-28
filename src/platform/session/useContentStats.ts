/**
 * The numbers the landing page and the meta description quote, counted from
 * the bank the session actually has - so they reflect admin edits, hidden
 * stages and hidden tracks the moment the API's copy arrives, and are never
 * a figure someone typed into a template.
 *
 *   lessons       every challenge that is not a stage test
 *   tests         stage tests
 *   stages        stages on show
 *   tracks        language tracks on show
 *   freeStages / premiumStages   the split of `stages`
 *
 * Fill copy templates with these (`copy.landing.heroFootnote`,
 * `copy.meta.description`, ...): `copy('copy.landing.pathLine', stats)`.
 */
import { useMemo } from 'react';
import type { Challenge, Stage } from '@/types';
import { useSession } from './SessionProvider';

export interface ContentStats {
  lessons: number;
  tests: number;
  stages: number;
  tracks: number;
  freeStages: number;
  premiumStages: number;
}

/** Pure: the counts for a bank. `trackCount` is the number of tracks on show. */
export function contentStatsOf(challenges: readonly Challenge[], stages: ReadonlyArray<Pick<Stage, 'isPremium'>>, trackCount: number): ContentStats {
  let tests = 0;
  for (const challenge of challenges) if (challenge.isStageTest) tests += 1;
  const premiumStages = stages.filter((stage) => stage.isPremium).length;
  return {
    lessons: challenges.length - tests,
    tests,
    stages: stages.length,
    tracks: trackCount,
    freeStages: stages.length - premiumStages,
    premiumStages
  };
}

export function useContentStats(): ContentStats {
  const { allChallenges, stages, tracks } = useSession();
  return useMemo(() => contentStatsOf(allChallenges, stages, tracks.length), [allChallenges, stages, tracks.length]);
}
