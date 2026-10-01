import React, { useCallback, useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { useSession } from '@/platform/session';
import { useAppEvent } from '@/platform/events';
import { Badge, Bone, Button, EmptyState, MOTION } from '@/ui';

/** Cell padding, shared by the header, the rows and the skeleton so the columns line up. */
const TH = 'h-9 px-4 font-medium';
const TD = 'h-11 px-4';

/**
 * Top accounts by XP, from the local API. A table, not a stack of cards.
 *
 * Motion: the rows rise in once, 40ms apart and capped (`.stagger` on the
 * body), when the standings first land. Once that has played the class comes
 * off, so refreshes and reorders stay still - React re-inserts a <tr> it
 * moves, and re-insertion would otherwise replay the entrance on rows that
 * merely got passed. The signed-in player's row is marked by a quiet accent
 * band, not by motion.
 */
export const Leaderboard: React.FC = () => {
  const { leaderboard, user, serverStatus, refreshLeaderboard } = useSession();
  // Until the first answer, an empty list means "not asked yet", not "nobody here".
  const [loaded, setLoaded] = useState(leaderboard.length > 0);
  const [refreshing, setRefreshing] = useState(false);
  const [settled, setSettled] = useState(false);
  const showsTable = serverStatus === 'online' && leaderboard.length > 0;

  // The first landing's stagger lasts one enter plus the capped delays; after
  // that the class is dropped (no visual change - the animation has ended).
  // A table that goes away and comes back lands fresh.
  useEffect(() => {
    if (!showsTable) {
      setSettled(false);
      return;
    }
    if (settled) return;
    const timer = window.setTimeout(() => setSettled(true), MOTION.base + MOTION.stagger * (MOTION.staggerCap - 1));
    return () => window.clearTimeout(timer);
  }, [showsTable, settled]);

  useEffect(() => {
    if (serverStatus === 'online') refreshLeaderboard().finally(() => setLoaded(true));
  }, [serverStatus, refreshLeaderboard]);

  // A solve changes the standings; the challenges module does not need to know we care.
  useAppEvent('challenge:completed', () => {
    if (serverStatus === 'online') refreshLeaderboard();
  });

  // The button stays focusable while busy (aria-disabled, not disabled), so a
  // keyboard user keeps their place; the guard stops a second request.
  const refresh = useCallback(async () => {
    if (refreshing) return;
    setRefreshing(true);
    try {
      await refreshLeaderboard();
    } finally {
      setRefreshing(false);
    }
  }, [refreshing, refreshLeaderboard]);

  if (serverStatus === 'checking' || (serverStatus === 'online' && !loaded && leaderboard.length === 0)) {
    return <LeaderboardSkeleton />;
  }

  if (serverStatus !== 'online') {
    return (
      <EmptyState className="anim-fade" title="The leaderboard needs the local API.">
        Start it with <code className="font-mono text-fg">npm run dev:api</code>.
      </EmptyState>
    );
  }

  if (leaderboard.length === 0) {
    return (
      <EmptyState className="anim-fade" title="No accounts yet.">
        Sign up and you will be first.
      </EmptyState>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <span className="eyebrow !mb-0">Top by XP</span>
        <Button
          size="sm"
          variant="ghost"
          onClick={refresh}
          aria-disabled={refreshing || undefined}
          aria-busy={refreshing || undefined}
          className={refreshing ? 'opacity-60 pointer-events-none' : undefined}
        >
          <RefreshCw size={12} /> Refresh
        </Button>
      </div>
      <div className="panel overflow-hidden">
        {/* Fixed layout: the header widths hold, and the User column takes the
            rest and truncates, so a long name never pushes XP out of the panel. */}
        <table className="w-full table-fixed text-sm">
          <thead>
            <tr className="text-left text-[11px] font-mono uppercase tracking-wider text-fg-muted bg-surface-2 border-b border-border">
              <th className={`${TH} w-16`}>#</th>
              <th className={TH}>User</th>
              <th className={`${TH} w-28 text-right`}>XP</th>
              <th className={`${TH} w-24 text-right hidden sm:table-cell`}>Level</th>
              <th className={`${TH} w-24 text-right hidden sm:table-cell`}>Solved</th>
            </tr>
          </thead>
          <tbody className={settled ? undefined : 'stagger'}>
            {leaderboard.map((row, i) => {
              const you = row.username === user?.username && user?.provider !== 'guest';
              return (
                <tr
                  key={row.username}
                  aria-current={you ? 'true' : undefined}
                  className={`border-b border-border-subtle last:border-b-0 transition-colors ${you ? 'bg-accent-soft' : 'hover:bg-surface-2'}`}
                >
                  {/* Your own row carries a 2px accent edge - the sidebar's "you are here" mark. */}
                  <td
                    className={`${TD} font-mono tabular-nums ${i < 3 || you ? 'text-fg font-medium' : 'text-fg-muted'} ${
                      you ? 'shadow-[inset_2px_0_0_var(--accent)]' : ''
                    }`.trim()}
                  >
                    {String(i + 1).padStart(2, '0')}
                  </td>
                  <td className={`${TD} font-medium text-fg`}>
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="truncate">{row.username}</span>
                      {you && (
                        <Badge tone="accent" mono className="shrink-0">
                          you
                        </Badge>
                      )}
                    </div>
                  </td>
                  <td className={`${TD} font-mono tabular-nums text-fg text-right`}>{row.xp.toLocaleString()}</td>
                  <td className={`${TD} font-mono tabular-nums text-fg-muted text-right hidden sm:table-cell`}>{String(row.level).padStart(2, '0')}</td>
                  <td className={`${TD} font-mono tabular-nums text-fg-muted text-right hidden sm:table-cell`}>{row.solved}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};

/**
 * The table's shape while the API is being reached or the first standings are
 * on the way. Held back a beat, like every skeleton, so a quick answer never
 * flashes it.
 */
const LeaderboardSkeleton: React.FC = () => (
  <div className="anim-fade" style={{ animationDelay: 'var(--delay-skeleton)' }} role="status" aria-label="Loading the leaderboard">
    <div className="flex items-center mb-2 h-7">
      <Bone w="5rem" h="0.75rem" />
    </div>
    <div className="panel overflow-hidden">
      <div className="h-9 bg-surface-2 border-b border-border" />
      {Array.from({ length: 6 }, (_, i) => (
        <div key={i} className={`${TD} flex items-center gap-10 border-b border-border-subtle last:border-b-0`}>
          <Bone w="1.25rem" h="0.75rem" />
          <Bone w={`${9 - (i % 3) * 1.5}rem`} h="0.75rem" />
          <Bone w="3rem" h="0.75rem" className="ml-auto" />
        </div>
      ))}
    </div>
  </div>
);
