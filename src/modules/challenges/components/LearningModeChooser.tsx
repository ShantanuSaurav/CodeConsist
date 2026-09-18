import React from 'react';
import { ArrowRight, BookOpen, Zap } from 'lucide-react';
import type { LearningMode } from '@/types';

interface LearningModeChooserProps {
  /** The stage about to open, for the copy. */
  stageName: string;
  /** Pre-selected for first-time learners; purely a nudge, never a lock. */
  recommended?: LearningMode;
  onChoose: (mode: LearningMode) => void;
}

const OPTIONS: Array<{ mode: LearningMode; icon: React.ReactNode; title: string; flow: string; blurb: string }> = [
  {
    mode: 'learn',
    icon: <BookOpen size={20} />,
    title: 'Learn & Understand',
    flow: 'Theory → Example → Try it → Quick check → Practice',
    blurb:
      'New ideas are explained before you are asked about them, wrong answers explain themselves straight away, and the stage article is a click away.'
  },
  {
    mode: 'practice',
    icon: <Zap size={20} />,
    title: 'Practice Mode',
    flow: 'Challenge → Solve → Grade → Next',
    blurb: 'Straight into the questions. Same challenges, same real grading, same XP - just no walk-through first.'
  }
];

/**
 * Asked once, the first time a learner opens any stage, and remembered in
 * this browser. Both modes run the same challenge engine, grading, XP,
 * streaks and stage unlocking; only the journey to each question differs, and
 * the choice can be changed at any time from the modal header, the Learn page
 * or Settings.
 */
export const LearningModeChooser: React.FC<LearningModeChooserProps> = ({ stageName, recommended, onChoose }) => (
  <div className="mode-chooser">
    <div className="mode-chooser-head">
      <div className="lesson-intro-badge">Before you start {stageName}</div>
      <h4 className="mode-chooser-title">How do you want to learn?</h4>
      <p className="mode-chooser-summary">
        You can switch at any time. Progress, XP and stage unlocking are exactly the same either way.
      </p>
    </div>

    <div className="mode-chooser-options" role="group" aria-label="Learning mode">
      {OPTIONS.map((o) => (
        <button
          key={o.mode}
          type="button"
          className={`mode-option ${recommended === o.mode ? 'is-recommended' : ''}`.trim()}
          onClick={() => onChoose(o.mode)}
        >
          <span className="mode-option-icon" aria-hidden="true">
            {o.icon}
          </span>
          <span className="mode-option-body">
            <span className="mode-option-title">
              {o.title}
              {recommended === o.mode && <span className="mode-option-tag">Recommended for beginners</span>}
            </span>
            <span className="mode-option-flow">{o.flow}</span>
            <span className="mode-option-blurb">{o.blurb}</span>
          </span>
          <ArrowRight size={16} className="mode-option-arrow" aria-hidden="true" />
        </button>
      ))}
    </div>
  </div>
);
