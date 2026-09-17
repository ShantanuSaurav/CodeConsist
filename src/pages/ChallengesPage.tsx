import React from 'react';
import { PageHeader } from '../components/ui/PageHeader';
import { ChallengeLibrary } from '../components/ChallengeLibrary';
import { useGame } from '../context/GameContext';

export const ChallengesPage: React.FC = () => {
  const { learnerChallenges: allChallenges, learnerStages: stages, stats, languageTracks, selectedLanguage } = useGame();
  const lessons = allChallenges.filter((c) => !c.isStageTest).length;
  const tests = allChallenges.filter((c) => c.isStageTest).length;
  const trackLabel = languageTracks.find((t) => t.track.id === selectedLanguage)?.track.label ?? 'your track';

  return (
    <div className="p-6 sm:p-8 max-w-7xl mx-auto">
      <PageHeader
        eyebrow="Library"
        title={`Every ${trackLabel} challenge`}
        description={`${lessons} lessons and ${tests} stage tests across ${stages.length} stages. Search, filter, and drill exactly what you want. Switch languages from the sidebar.`}
        aside={
          <div className="text-right">
            <div className="text-3xl font-bold font-mono text-gray-900 dark:text-white">
              {allChallenges.filter((c) => stats.completedChallenges.includes(c.id)).length}
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
