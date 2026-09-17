import React, { useEffect } from 'react';
import { Crown, RefreshCw } from 'lucide-react';
import { useGame } from '../context/GameContext';

/** Top accounts by XP, from the local API. */
export const Leaderboard: React.FC = () => {
  const { leaderboard, user, serverStatus, refreshLeaderboard } = useGame();

  useEffect(() => {
    if (serverStatus === 'online') refreshLeaderboard();
  }, [serverStatus, refreshLeaderboard]);

  if (serverStatus !== 'online') {
    return (
      <div className="rounded-2xl border border-dashed border-black/10 dark:border-white/10 p-8 text-center text-gray-600 dark:text-gray-400">
        The leaderboard needs the local API.{' '}
        {serverStatus === 'checking' ? 'Connecting…' : (
          <>
            Start it with <code className="font-mono text-sm">npm run dev:api</code>.
          </>
        )}
      </div>
    );
  }

  if (leaderboard.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-black/10 dark:border-white/10 p-8 text-center text-gray-600 dark:text-gray-400">
        No accounts yet — sign up and you will be first.
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-black/5 dark:border-white/5 bg-gray-50 dark:bg-[#161b22] overflow-hidden">
      <div className="flex items-center justify-between px-5 py-3 border-b border-black/5 dark:border-white/5">
        <span className="text-xs font-mono uppercase tracking-wider text-gray-500">Top by XP</span>
        <button
          type="button"
          onClick={refreshLeaderboard}
          className="text-gray-500 hover:text-gray-900 dark:hover:text-white inline-flex items-center gap-1 text-xs"
        >
          <RefreshCw size={12} /> Refresh
        </button>
      </div>
      <ol>
        {leaderboard.map((row, i) => {
          const you = row.username === user?.username && user?.provider !== 'guest';
          return (
            <li
              key={row.username}
              className={`grid grid-cols-[2.5rem_1fr_auto] sm:grid-cols-[2.5rem_1fr_6rem_6rem_6rem] items-center gap-3 px-5 py-3 border-b last:border-b-0 border-black/5 dark:border-white/5 ${
                you ? 'bg-[var(--color-primary)]/10' : ''
              }`}
            >
              <span className={`font-mono text-sm ${i < 3 ? 'text-[var(--color-warning)] font-bold' : 'text-gray-500'}`}>
                {i === 0 ? <Crown size={16} className="inline -mt-0.5" /> : `#${i + 1}`}
              </span>
              <span className="font-medium text-gray-900 dark:text-white truncate">
                {row.username}
                {you && <span className="ml-2 text-xs text-[var(--color-primary)] font-mono">you</span>}
              </span>
              <span className="font-mono text-sm text-[var(--color-primary)] text-right">{row.xp.toLocaleString()} XP</span>
              <span className="hidden sm:block font-mono text-xs text-gray-500 text-right">Lv {row.level}</span>
              <span className="hidden sm:block font-mono text-xs text-gray-500 text-right">{row.solved} solved</span>
            </li>
          );
        })}
      </ol>
    </div>
  );
};
