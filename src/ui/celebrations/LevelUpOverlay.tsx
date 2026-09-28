import React, { useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Sparkles } from 'lucide-react';
import { useFocusTrap } from '../hooks/useFocusTrap';

interface LevelUpOverlayProps {
  /** The heading, already worded ("Level 7" - `celebrations.copy.levelUp`). */
  title: string;
  /** "New title: Developer" when the rank changed (`celebrations.copy.newRank`), else nothing. */
  newRankLine?: string | null;
  /** A quiet line under it ("1,240 XP to level 8"). */
  detail?: string;
  onClose: () => void;
  closeLabel?: string;
}

/**
 * The full-screen "you reached a level" moment. A real dialog: `role=dialog`,
 * focus trapped inside, Enter or Esc closes it, and the heading names it for
 * a screen reader. The entrance is a CSS animation that reduced motion turns
 * off (components.css). Props only.
 */
export const LevelUpOverlay: React.FC<LevelUpOverlayProps> = ({ title, newRankLine, detail, onClose, closeLabel = 'Continue' }) => {
  const ref = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const headingId = useId();
  useFocusTrap(ref, true, () => buttonRef.current);

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'Escape' || event.key === 'Enter') {
      event.preventDefault();
      // Handled here: nothing behind the overlay (the lesson's own Esc/Enter) reacts.
      event.stopPropagation();
      onClose();
    }
  };

  // On <body>, so no transformed ancestor (the lesson dialog) can clip a fixed overlay.
  return createPortal(
    <div className="level-up-backdrop" onMouseDown={onClose}>
      <div
        ref={ref}
        className="level-up-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby={headingId}
        tabIndex={-1}
        onKeyDown={onKeyDown}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="level-up-icon" aria-hidden="true">
          <Sparkles size={26} />
        </div>
        <h2 id={headingId} className="level-up-title">
          {title}
        </h2>
        {newRankLine ? <p className="level-up-rank">{newRankLine}</p> : null}
        {detail ? <p className="level-up-detail">{detail}</p> : null}
        <button ref={buttonRef} type="button" className="btn btn-solid btn-lg level-up-close" onClick={onClose}>
          {closeLabel}
        </button>
      </div>
    </div>,
    document.body
  );
};
