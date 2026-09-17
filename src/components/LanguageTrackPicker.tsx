import React from 'react';
import { motion } from 'framer-motion';
import { Check } from 'lucide-react';
import { useGame } from '../context/GameContext';

/**
 * The language-selection screen for the Learn section.
 *
 * Each card is one language track (see src/data/tracks.ts) with its own
 * real progress - stages cleared and lessons solved, computed from the
 * player's actual `stats`, never fabricated. Picking a card switches
 * `selectedLanguage`, which is persisted (localStorage) and immediately
 * changes which stages the rest of the Learn page, the Challenge library and
 * "Continue learning" show. It is also reachable from the sidebar on every
 * dashboard page, so switching languages never requires coming back here.
 */
export const LanguageTrackPicker: React.FC = () => {
  const { languageTracks, selectedLanguage, setSelectedLanguage } = useGame();

  return (
    <div
      className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8"
      role="radiogroup"
      aria-label="Choose a language to learn"
    >
      {languageTracks.map(({ track, cleared, total, solvedChallenges, totalChallenges }, i) => {
        const active = track.id === selectedLanguage;
        return (
          <motion.button
            key={track.id}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => setSelectedLanguage(track.id)}
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
              {cleared}/{total} stages · {solvedChallenges}/{totalChallenges} solved
            </div>
          </motion.button>
        );
      })}
    </div>
  );
};
