import React from 'react';
import type { ReadingResolver } from '@/types';
import { PageHeader } from '@/ui';
import { ChallengeLibrary } from '../components/ChallengeLibrary';
import { useSession } from '@/platform/session';

export const ChallengesPage: React.FC<{ readingFor?: ReadingResolver }> = ({ readingFor }) => {
  const { allChallenges, stages, stats, tracks, activeTrack } = useSession();
  const lessons = allChallenges.filter((c) => !c.isStageTest).length;
  const tests = allChallenges.filter((c) => c.isStageTest).length;

  return (
    <div className="page max-w-5xl">
      <PageHeader
        eyebrow="Challenges"
        title="Library"
        description={`${lessons} lessons and ${tests} stage tests across ${stages.length} stages${
          tracks.length > 1 ? `. Showing ${activeTrack.track.label}; pick "All tracks" to search everything` : ''
        }.`}
        aside={
          <div className="sm:text-right">
            <div className="text-2xl font-semibold font-mono text-fg tabular-nums leading-none">
              {stats.completedChallenges.length}
              <span className="text-fg-muted text-base"> / {allChallenges.length}</span>
            </div>
            <div className="text-xs text-fg-muted mt-1">solved</div>
          </div>
        }
      />
      <ChallengeLibrary readingFor={readingFor} />
    </div>
  );
};
