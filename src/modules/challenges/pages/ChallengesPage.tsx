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
    <div className="p-6 sm:p-8 max-w-7xl mx-auto">
      <PageHeader
        eyebrow="Library"
        title="Every challenge"
        description={`${lessons} lessons and ${tests} stage tests across ${stages.length} stages${tracks.length > 1 ? ` - showing ${activeTrack.track.label}; pick "All tracks" to search everything` : ""}. Search, filter, and drill exactly what you want.`}
        aside={
          <div className="text-right">
            <div className="text-3xl font-bold font-mono text-gray-900 dark:text-white">
              {stats.completedChallenges.length}
              <span className="text-gray-400 text-xl"> / {allChallenges.length}</span>
            </div>
            <div className="text-xs text-gray-500">solved</div>
          </div>
        }
      />
      <ChallengeLibrary readingFor={readingFor} />
    </div>
  );
};
