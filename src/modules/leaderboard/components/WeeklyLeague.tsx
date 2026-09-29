import React, { useEffect, useState } from 'react';
import { ArrowDown, ArrowUp, RefreshCw } from 'lucide-react';
import type { LeagueRow } from '@/types';
import { useSession } from '@/platform/session';
import { useCopy } from '@/platform/settings';
import { useAppEvent, intents } from '@/platform/events';
import { formatDayLabel } from '@/platform/time/days';
import { uncountedLeagueXp } from '@/platform/league/league';
import { Button, EmptyState, StreakFlame } from '@/ui';

/** The longest delay setTimeout honours; longer ones fire at once. */
const MAX_TIMEOUT_MS = 2_147_483_647;

/** "2d 5h", "5h 12m", "12m" - how long until the week ends. */
export function formatCountdown(ms: number): string {
  const minutes = Math.max(1, Math.floor(ms / 60_000));
  const days = Math.floor(minutes / 1440);
  const hours = Math.floor((minutes % 1440) / 60);
  const mins = minutes % 60;
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins}m`;
}

/** The clock, read again every `everyMs`. */
function useNow(everyMs: number): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), everyMs);
    return () => window.clearInterval(timer);
  }, [everyMs]);
  return now;
}

const ZoneMark: React.FC<{ zone: LeagueRow['zone'] }> = ({ zone }) =>
  zone === 'up' ? (
    <ArrowUp size={12} className="text-success" aria-label="Moves up" role="img" />
  ) : zone === 'down' ? (
    <ArrowDown size={12} className="text-error" aria-label="Moves down" role="img" />
  ) : null;

const zoneRowClass = (zone: LeagueRow['zone']) => (zone === 'up' ? 'league-row-up' : zone === 'down' ? 'league-row-down' : '');

/**
 * This week's league: everyone's XP this week (their group's, with tiers
 * on), when the week ends, who is in line to move up or down, and the
 * learner's own place pinned below when it is not among the rows. A guest
 * can watch but is not ranked.
 */
export const WeeklyLeague: React.FC = () => {
  const { league, leagueStatus, leagueFetchedAt, refreshLeague, user, serverStatus, habits, activity } = useSession();
  const copy = useCopy();
  const signedIn = Boolean(user && user.provider !== 'guest');
  const now = useNow(30_000);

  useEffect(() => {
    if (serverStatus === 'online') void refreshLeague();
  }, [serverStatus, refreshLeague]);

  // A solve changes the standings.
  useAppEvent('challenge:completed', () => {
    if (serverStatus === 'online') void refreshLeague();
  });

  // When the week ends on this device's clock, the next one starts: fetch it.
  const endsAt = league?.week && leagueFetchedAt !== null ? leagueFetchedAt + league.week.endsInMs : null;
  useEffect(() => {
    if (endsAt === null || league?.week?.status !== 'open' || serverStatus !== 'online') return;
    // A week is at most 7 days: well inside what a timeout can wait (2^31 - 1 ms, about 24.8 days).
    const wait = Math.min(MAX_TIMEOUT_MS, Math.max(5_000, endsAt - Date.now() + 5_000));
    const timer = window.setTimeout(() => void refreshLeague(), wait);
    return () => window.clearTimeout(timer);
  }, [endsAt, league?.week?.status, serverStatus, refreshLeague]);

  if (serverStatus === 'checking' || (serverStatus === 'online' && leagueStatus === 'idle' && !league)) {
    return <EmptyState title="Loading this week's league…">Connecting…</EmptyState>;
  }

  if (serverStatus !== 'online') {
    return (
      <EmptyState title={copy('copy.offline.leaderboard')}>Please check back in a little while - your own progress is saved on this device.</EmptyState>
    );
  }

  if (!league) {
    return (
      <EmptyState
        title="This week's league could not be loaded."
        action={
          <Button size="sm" variant="secondary" className="min-h-[44px]" onClick={() => void refreshLeague()}>
            Try again
          </Button>
        }
      />
    );
  }

  if (!league.enabled || !league.week) {
    return <EmptyState title="The weekly league is off right now.">The all-time board is still on.</EmptyState>;
  }

  const { week, rows, me, zones, tier } = league;
  const open = week.status === 'open';
  const left = endsAt !== null ? endsAt - now : week.endsInMs;
  const pinMe = signedIn && me && !me.inRows;
  // XP of this week that is not league XP (merged as a guest, synced from
  // offline): say so, rather than leave the learner wondering where it went.
  const uncounted = signedIn ? uncountedLeagueXp(activity.days, week) : 0;
  const uncountedWhy = "XP earned as a guest or while offline doesn't count toward the weekly league.";

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
        <div className="min-w-0">
          <span className="eyebrow !mb-0">{tier ? `${tier.name} league` : 'This week'}</span>
          <p className="text-xs text-fg-muted mt-0.5" data-testid="league-countdown">
            {formatDayLabel(week.startDay)} – {formatDayLabel(week.endDay)} ·{' '}
            {open ? (left > 0 ? `Ends in ${formatCountdown(left)}` : 'Ending now') : 'This week has closed. The results are final.'}
          </p>
        </div>
        <Button size="sm" variant="ghost" className="min-h-[44px]" onClick={() => void refreshLeague()}>
          <RefreshCw size={12} /> Refresh
        </Button>
      </div>

      {zones && (zones.promote > 0 || zones.demote > 0) && (
        <p className="text-xs text-fg-secondary mb-2 flex flex-wrap items-center gap-x-3 gap-y-1">
          {zones.promote > 0 && (
            <span className="inline-flex items-center gap-1">
              <ArrowUp size={12} className="text-success" aria-hidden="true" /> Top {zones.promote} move up
            </span>
          )}
          {zones.demote > 0 && (
            <span className="inline-flex items-center gap-1">
              <ArrowDown size={12} className="text-error" aria-hidden="true" /> Bottom {zones.demote} move down
            </span>
          )}
        </p>
      )}

      {signedIn && league.lastResult && (
        <p className="text-xs text-fg-muted mb-2">
          Last week: #{league.lastResult.rank} with {league.lastResult.xp.toLocaleString()} XP
          {league.lastResult.outcome === 'promoted' && league.lastResult.tierName ? ` · moved up to ${league.lastResult.tierName}` : ''}
          {league.lastResult.outcome === 'demoted' && league.lastResult.tierName ? ` · moved down to ${league.lastResult.tierName}` : ''}
        </p>
      )}

      {rows.length === 0 && uncounted > 0 ? (
        <EmptyState title="Your XP this week isn't on the board yet.">{uncountedWhy} Finish a lesson to be first on the board.</EmptyState>
      ) : rows.length === 0 ? (
        <EmptyState title="No one has earned XP this week yet.">{signedIn ? 'Finish a lesson to be first on the board.' : 'Sign in and finish a lesson to be first.'}</EmptyState>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[11px] font-mono uppercase tracking-wider text-fg-muted border-b border-border">
              <th className="py-2 pr-3 font-medium w-14">#</th>
              <th className="py-2 pr-3 font-medium">User</th>
              <th className="py-2 pl-3 font-medium text-right">Week XP</th>
              <th className="py-2 pl-3 font-medium text-right">Streak</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.username} className={`border-b border-border-subtle ${row.isYou ? 'bg-accent-soft' : ''} ${zoneRowClass(row.zone)}`.trim()}>
                <td className={`py-2.5 pr-3 font-mono tabular-nums ${row.rank <= 3 ? 'text-fg font-medium' : 'text-fg-muted'}`}>
                  <span className="inline-flex items-center gap-1">
                    {String(row.rank).padStart(2, '0')}
                    <ZoneMark zone={row.zone} />
                  </span>
                </td>
                <td className="py-2.5 pr-3 font-medium text-fg truncate max-w-[14rem]">
                  {row.username}
                  {row.isYou && <span className="ml-2 text-[11px] font-mono text-accent">you</span>}
                </td>
                <td className="py-2.5 pl-3 font-mono tabular-nums text-fg text-right">{row.xp.toLocaleString()}</td>
                <td className="py-2.5 pl-3 text-right">
                  <StreakFlame streak={row.streak} size={13} className="text-xs justify-end" />
                </td>
              </tr>
            ))}
          </tbody>
          {pinMe && me && (
            <tfoot>
              <tr className={`bg-accent-soft ${zoneRowClass(me.zone)}`.trim()} data-testid="league-me">
                <td className="py-2.5 pr-3 font-mono tabular-nums text-fg font-medium border-t-2 border-border" colSpan={2}>
                  <span className="inline-flex items-center gap-1">
                    You · #{me.rank}
                    <ZoneMark zone={me.zone} />
                  </span>
                </td>
                <td className="py-2.5 pl-3 font-mono tabular-nums text-fg text-right border-t-2 border-border">{me.xp.toLocaleString()}</td>
                <td className="py-2.5 pl-3 text-right border-t-2 border-border">
                  <StreakFlame streak={habits?.streak ?? 0} size={13} className="text-xs justify-end" />
                </td>
              </tr>
            </tfoot>
          )}
        </table>
      )}

      {signedIn && !me && rows.length > 0 && open && <p className="text-xs text-fg-muted mt-3">Finish a lesson this week to join the board.</p>}

      {rows.length > 0 && uncounted > 0 && (
        <p className="text-xs text-fg-muted mt-3" data-testid="league-uncounted">
          {uncounted.toLocaleString()} XP you earned this week is not on the board: {uncountedWhy}
        </p>
      )}

      {!signedIn && (
        <div className="flex flex-wrap items-center justify-between gap-2 mt-3 text-sm text-fg-secondary" data-testid="league-guest">
          <span>Sign in to join this week's league.</span>
          <Button size="sm" variant="primary" className="min-h-[44px]" onClick={intents.openAuth}>
            Sign in to join
          </Button>
        </div>
      )}
    </div>
  );
};
