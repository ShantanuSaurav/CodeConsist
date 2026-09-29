import React from 'react';
import { useSession } from '@/platform/session';
import { TrackChoiceList } from '@/ui';

/**
 * The track-selection row for the Learn section: a thin wrapper that feeds
 * the session's tracks into the shared TrackChoiceList primitive (the
 * first-run setup's track step uses the same one).
 *
 * Each option is one language track (see content/tracks.ts) with its own real
 * progress - stages cleared and lessons solved, computed from the learner's
 * actual `stats`, never fabricated. Picking one switches the session's
 * selected track, which is persisted (and, signed in, kept on the account)
 * and immediately changes which stages the path below, the skill tree and
 * "Continue learning" show. It is also reachable from the sidebar on every
 * dashboard page.
 */
export const LanguageTrackPicker: React.FC = () => {
  const { tracks, selectedTrackId, setSelectedTrack } = useSession();
  if (tracks.length <= 1) return null;

  return (
    <TrackChoiceList
      ariaLabel="Choose a track to learn"
      className="mb-8"
      value={selectedTrackId}
      onChange={setSelectedTrack}
      tracks={tracks.map(({ track, cleared, total, solvedChallenges, totalChallenges }) => ({
        id: track.id,
        label: track.label,
        description: track.tagline,
        count: `${cleared}/${total} ${total === 1 ? 'stage' : 'stages'}`,
        progress: { value: total ? (cleared / total) * 100 : 0, label: `${solvedChallenges} of ${totalChallenges} solved in ${track.label}` }
      }))}
    />
  );
};
