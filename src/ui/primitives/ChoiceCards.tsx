import React, { useRef } from 'react';
import { Check } from 'lucide-react';

export interface ChoiceCardOption<T extends string> {
  value: T;
  title: React.ReactNode;
  /** One short line under the title. */
  description?: React.ReactNode;
  /** A figure on the right ("100 XP", "+10 XP"). */
  meta?: React.ReactNode;
  disabled?: boolean;
}

/**
 * How a card was chosen: `'arrow'` while browsing with the arrow keys (the
 * radio-group pattern checks the card focus moves to), `'pick'` for a
 * click, Enter or Space. A caller that closes the cards on a choice closes
 * them on `'pick'` only, so the arrow keys can still reach every card.
 */
export type ChoiceCardVia = 'arrow' | 'pick';

interface ChoiceCardsProps<T extends string> {
  options: ChoiceCardOption<T>[];
  /** The chosen value, or null for none yet. */
  value: T | null;
  onChange: (value: T, via: ChoiceCardVia) => void;
  /** What is being chosen, for screen readers ("Daily goal"). */
  ariaLabel: string;
  /** Two columns from the small breakpoint up (one on phones). */
  columns?: 1 | 2;
  className?: string;
}

/**
 * Pick one of a few cards - the daily goal, and the onboarding choices that
 * reuse it. A radio group: one tab stop, the arrow keys move between cards,
 * and each card is at least 44 px tall so it is easy to hit on a phone.
 * Props only.
 */
export function ChoiceCards<T extends string>({ options, value, onChange, ariaLabel, columns = 2, className = '' }: ChoiceCardsProps<T>) {
  const refs = useRef<Array<HTMLButtonElement | null>>([]);
  const enabled = options.filter((o) => !o.disabled);
  const focusIndex = Math.max(0, options.findIndex((o) => o.value === value && !o.disabled));
  const tabbable = options[focusIndex]?.disabled ? options.findIndex((o) => !o.disabled) : focusIndex;

  const move = (from: number, step: number) => {
    if (enabled.length === 0) return;
    let i = from;
    for (let n = 0; n < options.length; n++) {
      i = (i + step + options.length) % options.length;
      if (!options[i].disabled) break;
    }
    refs.current[i]?.focus();
    onChange(options[i].value, 'arrow');
  };

  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className={`choice-cards ${columns === 2 ? 'is-two' : ''} ${className}`.replace(/\s+/g, ' ').trim()}
    >
      {options.map((option, i) => {
        const checked = option.value === value;
        return (
          <button
            key={option.value}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role="radio"
            aria-checked={checked}
            disabled={option.disabled}
            tabIndex={i === tabbable ? 0 : -1}
            className={`choice-card ${checked ? 'is-checked' : ''}`.trim()}
            onClick={() => onChange(option.value, 'pick')}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown' || e.key === 'ArrowRight') {
                e.preventDefault();
                move(i, 1);
              } else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') {
                e.preventDefault();
                move(i, -1);
              }
            }}
          >
            <span className="choice-card-mark" aria-hidden="true">
              {checked ? <Check size={12} strokeWidth={3} /> : null}
            </span>
            <span className="choice-card-text">
              <span className="choice-card-title">{option.title}</span>
              {option.description ? <span className="choice-card-desc">{option.description}</span> : null}
            </span>
            {option.meta ? <span className="choice-card-meta">{option.meta}</span> : null}
          </button>
        );
      })}
    </div>
  );
}
