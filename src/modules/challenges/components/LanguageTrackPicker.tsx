import React from 'react';
import { motion } from 'framer-motion';
import { Check } from 'lucide-react';
import { useSession } from '@/platform/session';

/**
 * The track-selection row for the Learn section.
 *
 * Each card is one language track (see content/tracks.ts) with its own real
 * progress - stages cleared and lessons solved, computed from the learner's
 * actual `stats`, never fabricated. Picking a card switches the session's
 * selected track, which is persisted and immediately changes which stages
 * the path below, the skill tree and "Continue learning" show. It is also
 * reachable from the sidebar on every dashboard page, so switching tracks
 * never requires coming back here.
 */
export const LanguageTrackPicker: React.FC = () => {
  const { tracks, selectedTrackId, setSelectedTrack } = useSession();
  if (tracks.length <= 1) return null;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-8" role="radiogroup" aria-label="Choose a track to learn">
      {tracks.map(({ track, cleared, total, solvedChallenges, totalChallenges }, i) => {
        const active = track.id === selectedTrackId;
        return (
          <motion.button
            key={track.id}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => setSelectedTrack(track.id)}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: Math.min(i * 0.05, 0.3), duration: 0.3 }}
            className={`relative text-left rounded-2xl border p-4 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)] ${
              active
                ? 'bg-[var(--color-primary)]/10 border-[var(--color-primary)]/50'
                : 'bg-gray-50 dark:bg-[#161b22] border-black/5 dark:border-white/5 hover:border-black/15 dark:hover:border-white/15'
            }`}
          >
            {active && (
              <span className="absolute top-3 right-3 w-5 h-5 rounded-full bg-[var(--color-primary)] text-white dark:text-black flex items-center justify-center">
                <Check size={12} strokeWidth={3} />
              </span>
            )}
            <div className="text-2xl mb-2" aria-hidden="true">
              {track.icon}
            </div>
            <div className="font-bold text-gray-900 dark:text-white">{track.label}</div>
            <div className="text-xs text-gray-500 mt-0.5 line-clamp-2">{track.tagline}</div>
            <div className="mt-3 h-1 bg-black/5 dark:bg-white/10 rounded-full overflow-hidden">
              <div
                className="h-full bg-[var(--color-primary)]"
                style={{ width: total ? `${Math.round((cleared / total) * 100)}%` : '0%' }}
              />
            </div>
            <div className="mt-1.5 text-[11px] font-mono text-gray-500">
              {cleared}/{total} {total === 1 ? 'stage' : 'stages'} · {solvedChallenges}/{totalChallenges} solved
            </div>
          </motion.button>
        );
      })}
    </div>
  );
};
