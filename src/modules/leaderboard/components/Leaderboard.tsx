import React, { useEffect } from 'react';
import { RefreshCw } from 'lucide-react';
import { useSession } from '@/platform/session';
import { useAppEvent } from '@/platform/events';
import { Button, EmptyState } from '@/ui';

/** Top accounts by XP, from the local API. A table, not a stack of cards. */
export const Leaderboard: React.FC = () => {
  const { leaderboard, user, serverStatus, refreshLeaderboard } = useSession();

  useEffect(() => {
    if (serverStatus === 'online') refreshLeaderboard();
  }, [serverStatus, refreshLeaderboard]);

  // A solve changes the standings; the challenges module does not need to know we care.
  useAppEvent('challenge:completed', () => {
    if (serverStatus === 'online') refreshLeaderboard();
  });

  if (serverStatus !== 'online') {
    return (
      <EmptyState title="The leaderboard needs the local API.">
        {serverStatus === 'checking' ? (
          'Connecting…'
        ) : (
          <>
            Start it with <code className="font-mono text-fg">npm run dev:api</code>.
          </>
        )}
      </EmptyState>
    );
  }

  if (leaderboard.length === 0) {
    return <EmptyState title="No accounts yet.">Sign up and you will be first.</EmptyState>;
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <span className="eyebrow !mb-0">Top by XP</span>
        <Button size="sm" variant="ghost" onClick={refreshLeaderboard}>
          <RefreshCw size={12} /> Refresh
        </Button>
      </div>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-[11px] font-mono uppercase tracking-wider text-fg-muted border-b border-border">
            <th className="py-2 pr-3 font-medium w-10">#</th>
            <th className="py-2 pr-3 font-medium">User</th>
            <th className="py-2 pl-3 font-medium text-right">XP</th>
            <th className="py-2 pl-3 font-medium text-right hidden sm:table-cell">Level</th>
            <th className="py-2 pl-3 font-medium text-right hidden sm:table-cell">Solved</th>
          </tr>
        </thead>
        <tbody>
          {leaderboard.map((row, i) => {
            const you = row.username === user?.username && user?.provider !== 'guest';
            return (
              <tr key={row.username} className={`border-b border-border-subtle ${you ? 'bg-accent-soft' : ''}`}>
                <td className={`py-2.5 pr-3 font-mono tabular-nums ${i < 3 ? 'text-fg font-medium' : 'text-fg-muted'}`}>
                  {String(i + 1).padStart(2, '0')}
                </td>
                <td className="py-2.5 pr-3 font-medium text-fg truncate max-w-[14rem]">
                  {row.username}
                  {you && <span className="ml-2 text-[11px] font-mono text-accent">you</span>}
                </td>
                <td className="py-2.5 pl-3 font-mono tabular-nums text-fg text-right">{row.xp.toLocaleString()}</td>
                <td className="py-2.5 pl-3 font-mono tabular-nums text-fg-muted text-right hidden sm:table-cell">{String(row.level).padStart(2, '0')}</td>
                <td className="py-2.5 pl-3 font-mono tabular-nums text-fg-muted text-right hidden sm:table-cell">{row.solved}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};
