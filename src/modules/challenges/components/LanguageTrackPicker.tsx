import React from 'react';
import { useSession } from '@/platform/session';
import { ProgressBar } from '@/ui';

/**
 * The track-selection row for the Learn section.
 *
 * Each option is one language track (see content/tracks.ts) with its own real
 * progress - stages cleared and lessons solved, computed from the learner's
 * actual `stats`, never fabricated. Picking one switches the session's
 * selected track, which is persisted and immediately changes which stages
 * the path below, the skill tree and "Continue learning" show. It is also
 * reachable from the sidebar on every dashboard page.
 */
export const LanguageTrackPicker: React.FC = () => {
  const { tracks, selectedTrackId, setSelectedTrack } = useSession();
  if (tracks.length <= 1) return null;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 border border-border rounded-lg overflow-hidden divide-y sm:divide-y-0 sm:divide-x divide-border mb-8" role="radiogroup" aria-label="Choose a track to learn">
      {tracks.map(({ track, cleared, total, solvedChallenges, totalChallenges }) => {
        const active = track.id === selectedTrackId;
        return (
          <button
            key={track.id}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => setSelectedTrack(track.id)}
            className={`relative text-left px-4 py-3.5 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent ${
              active ? 'bg-surface' : 'bg-bg hover:bg-surface'
            }`}
          >
            {active && <span className="absolute inset-x-0 top-0 h-0.5 bg-accent" aria-hidden="true" />}
            <div className="flex items-baseline justify-between gap-3">
              <span className={`text-sm font-medium ${active ? 'text-fg' : 'text-fg-secondary'}`}>{track.label}</span>
              <span className="font-mono text-[11px] text-fg-muted">
                {cleared}/{total} {total === 1 ? 'stage' : 'stages'}
              </span>
            </div>
            <div className="text-xs text-fg-muted mt-0.5 line-clamp-1">{track.tagline}</div>
            <ProgressBar
              value={total ? (cleared / total) * 100 : 0}
              size="sm"
              tone={active ? 'accent' : 'neutral'}
              className="mt-3"
              label={`${solvedChallenges} of ${totalChallenges} solved in ${track.label}`}
            />
          </button>
        );
      })}
    </div>
  );
};
