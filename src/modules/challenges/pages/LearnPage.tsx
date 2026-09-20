import React from 'react';
import type { ReadingResolver } from '@/types';
import { LearningModeSwitch, PageHeader } from '@/ui';
import { LearningPath } from '../components/LearningPath';
import { LanguageTrackPicker } from '../components/LanguageTrackPicker';
import { useSession } from '@/platform/session';

export const LearnPage: React.FC<{ readingFor?: ReadingResolver }> = ({ readingFor }) => {
  const { learnerStages, activeTrack, tracks, learningMode, setLearningMode, stats } = useSession();
  const cleared = learnerStages.filter((s) => s.state === 'Completed').length;
  const lessonsTotal = learnerStages.reduce((n, s) => n + s.challenges.length, 0);
  const lessonsDone = learnerStages.reduce((n, s) => n + s.challenges.filter((c) => stats.completedChallenges.includes(c.id)).length, 0);
  const single = tracks.length <= 1;

  return (
    <div className="page max-w-4xl">
      <PageHeader
        eyebrow="Learn"
        title={activeTrack.track.label}
        description={
          single
            ? "Finish a stage's lessons, pass its coding test, and the next one opens."
            : activeTrack.track.description
        }
        aside={
          <div className="sm:text-right">
            <div className="text-2xl font-semibold font-mono text-fg tabular-nums leading-none">
              {lessonsDone}
              <span className="text-fg-muted text-base"> / {lessonsTotal}</span>
            </div>
            <div className="text-xs text-fg-muted mt-1">
              lessons · {cleared} / {learnerStages.length} stages cleared
            </div>
          </div>
        }
      />

      <LanguageTrackPicker />

      {/* How the learner wants to reach each stage's challenges. Same engine,
          grading, XP and unlocking either way; only the journey differs. */}
      <div className="mb-8 flex flex-wrap items-center justify-between gap-3 py-3 border-y border-border-subtle">
        <div className="min-w-0">
          <div className="text-sm font-medium text-fg">Learning mode</div>
          <div className="text-xs text-fg-muted mt-0.5">
            {learningMode === 'learn'
              ? 'Theory, an example, a try-it and a quick check before each new idea.'
              : learningMode === 'practice'
                ? 'Straight into the challenges. Switch back any time.'
                : "You'll be asked when you open your first stage - or choose now."}
          </div>
        </div>
        <LearningModeSwitch value={learningMode} onChange={setLearningMode} />
      </div>

      <LearningPath readingFor={readingFor} />
    </div>
  );
};
