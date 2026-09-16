import React from 'react';
import { PageHeader } from '../components/ui/PageHeader';
import { ChallengeLibrary } from '../components/ChallengeLibrary';
import { useGame } from '../context/GameContext';

export const ChallengesPage: React.FC = () => {
  const { allChallenges, stages, stats } = useGame();
  const lessons = allChallenges.filter((c) => !c.isStageTest).length;
  const tests = allChallenges.filter((c) => c.isStageTest).length;

  return (
    <div className="p-6 sm:p-8 max-w-7xl mx-auto">
      <PageHeader
        eyebrow="Library"
        title="Every challenge"
        description={`${lessons} lessons and ${tests} stage tests across ${stages.length} stages. Search, filter, and drill exactly what you want.`}
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
      <ChallengeLibrary />
    </div>
  );
};
