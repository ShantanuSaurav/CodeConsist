import React, { useRef } from 'react';
import { ProgressBar } from './ProgressBar';

/** One track to choose, with whatever the screen wants to say about it. */
export interface TrackChoice {
  id: string;
  label: string;
  /** One line under the label (a tagline, or the admin's blurb). */
  description?: string;
  /** Right of the label ("2/10 stages"). */
  count?: string;
  /** 0-100, with its screen-reader label: shown as a bar when given. */
  progress?: { value: number; label: string };
}

interface TrackChoiceListProps {
  tracks: TrackChoice[];
  /** The chosen track, or null for none yet. */
  value: string | null;
  onChange: (id: string) => void;
  /** What is being chosen, for screen readers. */
  ariaLabel: string;
  /** Side by side from the small breakpoint up (the Learn page), or stacked (the setup). */
  layout?: 'row' | 'list';
  className?: string;
}

/**
 * Pick a track: the Learn page's row (with each track's progress) and the
 * first-run setup's track step (with the admin's words) use this. A radio
 * group - one tab stop, the arrow keys move and choose - and every choice is
 * at least 44 px tall. Plain props: no session, no content types.
 */
export const TrackChoiceList: React.FC<TrackChoiceListProps> = ({ tracks, value, onChange, ariaLabel, layout = 'row', className = '' }) => {
  const refs = useRef<Array<HTMLButtonElement | null>>([]);
  const current = Math.max(0, tracks.findIndex((t) => t.id === value));
  const move = (from: number, step: number) => {
    if (tracks.length === 0) return;
    const next = (from + step + tracks.length) % tracks.length;
    refs.current[next]?.focus();
    onChange(tracks[next].id);
  };
  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className={`track-choices ${layout === 'row' ? 'is-row' : ''} ${className}`.replace(/\s+/g, ' ').trim()}
      style={layout === 'row' ? ({ '--track-columns': Math.min(3, Math.max(1, tracks.length)) } as React.CSSProperties) : undefined}
    >
      {tracks.map((track, i) => {
        const checked = track.id === value;
        return (
          <button
            key={track.id}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role="radio"
            aria-checked={checked}
            tabIndex={i === current ? 0 : -1}
            className={`track-choice ${checked ? 'is-checked' : ''}`.trim()}
            onClick={() => onChange(track.id)}
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
            <span className="track-choice-head">
              <span className="track-choice-label">{track.label}</span>
              {track.count ? <span className="track-choice-count">{track.count}</span> : null}
            </span>
            {track.description ? <span className="track-choice-desc block">{track.description}</span> : null}
            {track.progress ? (
              <ProgressBar value={track.progress.value} size="sm" tone={checked ? 'accent' : 'neutral'} className="track-choice-bar" label={track.progress.label} />
            ) : null}
          </button>
        );
      })}
    </div>
  );
};
