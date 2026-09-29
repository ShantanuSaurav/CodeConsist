import React, { useRef } from 'react';
import { ArrowRight, BookOpen, Check, Zap } from 'lucide-react';
import type { LearningMode } from '@/types';

/** The words on one mode card (the admin's `onboarding.mode.options`). */
export interface LearningModeCardCopy {
  title: string;
  flow: string;
  blurb: string;
}

interface LearningModeCardsProps {
  /** The words for both cards. */
  options: Record<LearningMode, LearningModeCardCopy>;
  onChoose: (mode: LearningMode) => void;
  /** The chosen mode (the cards act as a radio group), or null/undefined when choosing is the action itself. */
  value?: LearningMode | null;
  /** Marked as suggested - a nudge, never a lock. */
  recommended?: LearningMode | null;
  /** The label on the suggested card. */
  recommendedLabel?: string;
  /** What is being chosen, for screen readers. */
  ariaLabel?: string;
}

const MODES: Array<{ mode: LearningMode; icon: React.ReactNode }> = [
  { mode: 'learn', icon: <BookOpen size={20} /> },
  { mode: 'practice', icon: <Zap size={20} /> }
];

/**
 * Learn or Practice, as two cards: the lesson chooser, the first-run setup's
 * mode step and the admin's preview all use these, with the copy passed in.
 * With `value` the cards are a radio group (a check on the chosen one; one
 * tab stop, the arrow keys move and choose - as TrackChoiceList); without it
 * each card is a button that chooses and moves on. Props only.
 */
export const LearningModeCards: React.FC<LearningModeCardsProps> = ({
  options,
  onChoose,
  value,
  recommended,
  recommendedLabel = 'Suggested',
  ariaLabel = 'Learning mode'
}) => {
  const radio = value !== undefined;
  const refs = useRef<Array<HTMLButtonElement | null>>([]);
  const current = Math.max(0, MODES.findIndex((m) => m.mode === value));
  const move = (from: number, step: number) => {
    const next = (from + step + MODES.length) % MODES.length;
    refs.current[next]?.focus();
    onChoose(MODES[next].mode);
  };
  return (
    <div className="mode-cards" role={radio ? 'radiogroup' : 'group'} aria-label={ariaLabel}>
      {MODES.map(({ mode, icon }, i) => {
        const copy = options[mode];
        const checked = radio && value === mode;
        return (
          <button
            key={mode}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role={radio ? 'radio' : undefined}
            aria-checked={radio ? checked : undefined}
            tabIndex={radio ? (i === current ? 0 : -1) : undefined}
            onKeyDown={
              radio
                ? (e) => {
                    if (e.key === 'ArrowDown' || e.key === 'ArrowRight') {
                      e.preventDefault();
                      move(i, 1);
                    } else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') {
                      e.preventDefault();
                      move(i, -1);
                    }
                  }
                : undefined
            }
            className={`mode-option ${recommended === mode ? 'is-recommended' : ''} ${checked ? 'is-checked' : ''}`.replace(/\s+/g, ' ').trim()}
            onClick={() => onChoose(mode)}
          >
            <span className="mode-option-icon" aria-hidden="true">
              {icon}
            </span>
            <span className="mode-option-body">
              <span className="mode-option-title">
                {copy?.title}
                {recommended === mode && <span className="mode-option-tag">{recommendedLabel}</span>}
              </span>
              {copy?.flow ? <span className="mode-option-flow">{copy.flow}</span> : null}
              {copy?.blurb ? <span className="mode-option-blurb">{copy.blurb}</span> : null}
            </span>
            {radio ? (
              checked ? <Check size={16} className="mode-option-arrow" aria-hidden="true" /> : null
            ) : (
              <ArrowRight size={16} className="mode-option-arrow" aria-hidden="true" />
            )}
          </button>
        );
      })}
    </div>
  );
};
