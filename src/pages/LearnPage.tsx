import React from 'react';
import { PageHeader } from '../components/ui/PageHeader';
import { LearningPath } from '../components/LearningPath';
import { LanguageTrackPicker } from '../components/LanguageTrackPicker';
import { useGame } from '../context/GameContext';

export const LearnPage: React.FC = () => {
  const { learnerStages, languageTracks, selectedLanguage } = useGame();
  const cleared = learnerStages.filter((s) => s.state === 'Completed').length;
  const activeTrack = languageTracks.find((t) => t.track.id === selectedLanguage)?.track;

  return (
    <div className="p-6 sm:p-8 max-w-5xl mx-auto">
      <PageHeader
        eyebrow="Learning path"
        title="Choose a language, then follow your path"
        description={
          activeTrack
            ? `${activeTrack.label}: ${activeTrack.description}`
            : "Finish a stage's lessons, pass its coding test, and the next one opens."
        }
        aside={
          <div className="text-right">
            <div className="text-3xl font-bold font-mono text-gray-900 dark:text-white">
              {cleared}
              <span className="text-gray-400 text-xl"> / {learnerStages.length}</span>
            </div>
            <div className="text-xs text-gray-500">stages cleared</div>
          </div>
        }
      />
      <LanguageTrackPicker />
      <LearningPath />
    </div>
  );
};
