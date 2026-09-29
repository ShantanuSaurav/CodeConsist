import React from 'react';
import type { LearningMode } from '@/types';
import { useSession } from '@/platform/session';
import { LearningModeCards } from '@/ui';

interface LearningModeChooserProps {
  /** The stage about to open, for the copy. */
  stageName: string;
  /** Pre-selected for first-time learners; purely a nudge, never a lock. */
  recommended?: LearningMode;
  onChoose: (mode: LearningMode) => void;
}

/**
 * Asked once, the first time a learner opens any stage without having chosen
 * - the fallback for a learner who skipped the first-run setup's mode step.
 * Both modes run the same challenge engine, grading, XP, streaks and stage
 * unlocking; only the journey to each question differs, and the choice can
 * be changed at any time from the modal header, the Learn page or Settings.
 * The cards' words are the admin's (`onboarding.mode.options`).
 */
export const LearningModeChooser: React.FC<LearningModeChooserProps> = ({ stageName, recommended, onChoose }) => {
  const { settings } = useSession();
  return (
    <div className="mode-chooser">
      <div className="mode-chooser-head">
        <div className="lesson-intro-badge">Before you start {stageName}</div>
        <h4 className="mode-chooser-title">How do you want to learn?</h4>
        <p className="mode-chooser-summary">You can switch at any time. Progress, XP and stage unlocking are exactly the same either way.</p>
      </div>
      <LearningModeCards
        options={settings.onboarding.mode.options}
        recommended={recommended ?? null}
        recommendedLabel="Recommended for beginners"
        onChoose={onChoose}
      />
    </div>
  );
};
