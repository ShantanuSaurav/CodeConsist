import React from 'react';
import type { ReadingResolver } from '@/types';
import { LearningModeSwitch, PageHeader } from '@/ui';
import { LearningPath } from '../components/LearningPath';
import { LanguageTrackPicker } from '../components/LanguageTrackPicker';
import { useSession } from '@/platform/session';

export const LearnPage: React.FC<{ readingFor?: ReadingResolver }> = ({ readingFor }) => {
  const { learnerStages, activeTrack, tracks, learningMode, setLearningMode } = useSession();
  const cleared = learnerStages.filter((s) => s.state === 'Completed').length;
  const single = tracks.length <= 1;

  return (
    <div className="p-6 sm:p-8 max-w-5xl mx-auto">
      <PageHeader
        eyebrow="Learning path"
        title={single ? 'Your path, staged' : 'Pick a track, then follow your path'}
        description={
          single
            ? "Ten stages. Finish a stage's lessons, pass its coding test, and the next one opens."
            : `${activeTrack.track.label}: ${activeTrack.track.description}`
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

      {/* How the learner wants to reach each stage's challenges. Same engine,
          grading, XP and unlocking either way; only the journey differs. */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-black/5 dark:border-white/5 bg-gray-50 dark:bg-[#161b22] px-4 py-3">
        <div className="min-w-0">
          <div className="text-sm font-semibold text-gray-900 dark:text-white">How do you want to learn?</div>
          <div className="text-xs text-gray-500 mt-0.5">
            {learningMode === 'learn'
              ? 'Learn & Understand: theory, an example, a try-it and a quick check before each new idea.'
              : learningMode === 'practice'
                ? 'Practice mode: straight into the challenges. Switch back any time.'
                : "You'll be asked when you open your first stage - or choose now."}
          </div>
        </div>
        <LearningModeSwitch value={learningMode} onChange={setLearningMode} />
      </div>

      <LearningPath readingFor={readingFor} />
    </div>
  );
};
