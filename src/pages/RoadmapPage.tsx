import React from 'react';
import { PageHeader } from '../components/ui/PageHeader';
import { SkillRoadmap } from '../components/layout/SkillRoadmap';
import { useGame } from '../context/GameContext';

export const RoadmapPage: React.FC = () => {
  // learnerStages/languageTracks: the roadmap shows one language's path at a
  // time, same as Learn and Challenges - see GameContext's doc comment on why
  // progress is scoped per track rather than one chain across every language.
  const { learnerStages, languageTracks, selectedLanguage, stats } = useGame();
  const cleared = learnerStages.filter((s) => s.state === 'Completed').length;
  const trackLabel = languageTracks.find((t) => t.track.id === selectedLanguage)?.track.label ?? 'this language';

  return (
    <div className="p-6 sm:p-8 max-w-4xl mx-auto">
      <PageHeader
        eyebrow="Your learning journey"
        title={`The path through ${trackLabel}`}
        description="Clear a stage's lessons, pass its test, and the next one unlocks - click any open node to jump back in. Switch languages from the sidebar to see that path instead."
        aside={
          <div className="text-right">
            <div className="text-3xl font-bold font-mono text-gray-900 dark:text-white">
              {cleared}
              <span className="text-gray-400 text-xl"> / {learnerStages.length}</span>
            </div>
            <div className="text-xs text-gray-500">stages cleared · {stats.xp} XP</div>
          </div>
        }
      />
      <SkillRoadmap />
    </div>
  );
};
