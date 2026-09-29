import React, { useEffect } from 'react';
import { RefreshCw } from 'lucide-react';
import { useSession } from '@/platform/session';
import { useCopy } from '@/platform/settings';
import { useAppEvent } from '@/platform/events';
import { Button, DevHint, EmptyState, StreakFlame } from '@/ui';

/**
 * Top accounts by XP, from the local API. A table, not a stack of cards.
 * The learner's own row is marked (the server's `isYou`; the username on
 * an older server), and their place is pinned below when it is not shown.
 */
export const Leaderboard: React.FC = () => {
  const { leaderboard, leaderboardMe, user, serverStatus, refreshLeaderboard } = useSession();
  const signedIn = Boolean(user && user.provider !== 'guest');
  const serverMarks = leaderboard.some((row) => row.isYou !== undefined);
  // Only a signed-in learner has a row of their own (rows from before a sign-out may still carry the last one).
  const isYou = (row: { username: string; isYou?: boolean }) => signedIn && (serverMarks ? row.isYou === true : row.username === user?.username);
  const shown = leaderboard.some(isYou);
  const pinMe = signedIn && leaderboardMe && !shown ? leaderboardMe : null;
  const copy = useCopy();

  useEffect(() => {
    if (serverStatus === 'online') refreshLeaderboard();
  }, [serverStatus, refreshLeaderboard]);

  // A solve changes the standings; the challenges module does not need to know we care.
  useAppEvent('challenge:completed', () => {
    if (serverStatus === 'online') refreshLeaderboard();
  });

  if (serverStatus === 'checking') {
    return <EmptyState title="Loading the leaderboard…">Connecting…</EmptyState>;
  }

  if (serverStatus !== 'online') {
    return (
      <EmptyState title={copy('copy.offline.leaderboard')}>
        Please check back in a little while - your own progress is saved on this device.
        <DevHint as="div" className="mt-1">
          The API server is not running: start it with <code className="font-mono text-fg">npm run dev:api</code>.
        </DevHint>
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
        <Button size="sm" variant="ghost" className="min-h-[44px]" onClick={refreshLeaderboard}>
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
            <th className="py-2 pl-3 font-medium text-right">Streak</th>
          </tr>
        </thead>
        <tbody>
          {leaderboard.map((row, i) => {
            const you = isYou(row);
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
                <td className="py-2.5 pl-3 text-right">
                  <StreakFlame streak={row.streak} size={13} className="text-xs justify-end" />
                </td>
              </tr>
            );
          })}
        </tbody>
        {pinMe && (
          <tfoot>
            <tr className="bg-accent-soft" data-testid="leaderboard-me">
              <td className="py-2.5 pr-3 font-mono tabular-nums text-fg font-medium border-t-2 border-border" colSpan={2}>
                You · #{pinMe.rank}
              </td>
              <td className="py-2.5 pl-3 font-mono tabular-nums text-fg text-right border-t-2 border-border">{pinMe.xp.toLocaleString()}</td>
              <td className="py-2.5 pl-3 font-mono tabular-nums text-fg-muted text-right hidden sm:table-cell border-t-2 border-border">
                {String(pinMe.level).padStart(2, '0')}
              </td>
              <td className="py-2.5 pl-3 font-mono tabular-nums text-fg-muted text-right hidden sm:table-cell border-t-2 border-border">{pinMe.solved}</td>
              <td className="py-2.5 pl-3 text-right border-t-2 border-border">
                <StreakFlame streak={pinMe.streak} size={13} className="text-xs justify-end" />
              </td>
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );
};
