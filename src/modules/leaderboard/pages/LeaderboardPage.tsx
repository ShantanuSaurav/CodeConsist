import React, { useState } from 'react';
import { Button, PageHeader, Segmented } from '@/ui';
import type { SegmentedOption } from '@/ui';
import { Leaderboard } from '../components/Leaderboard';
import { WeeklyLeague } from '../components/WeeklyLeague';
import { useSession } from '@/platform/session';
import { intents } from '@/platform/events';
import { STORAGE_KEYS, readString, writeString } from '@/platform/storage/storage';

type Tab = 'week' | 'all';

const TABS: SegmentedOption<Tab>[] = [
  { value: 'week', label: 'This week' },
  { value: 'all', label: 'All time' }
];

/** The tab this browser last opened; the weekly one to start with. */
function readTab(): Tab {
  return readString(STORAGE_KEYS.leaderboardTab) === 'all' ? 'all' : 'week';
}

export const LeaderboardPage: React.FC = () => {
  const { user, serverStatus, league, leagueStatus } = useSession();
  const signedIn = Boolean(user && user.provider !== 'guest');
  const [picked, setPicked] = useState<Tab>(readTab);

  // No weekly tab on a server without a league (an older one), or while the admin has it off.
  const weekly = leagueStatus !== 'missing' && !(league && !league.enabled);
  const tab: Tab = weekly ? picked : 'all';

  const choose = (next: Tab) => {
    setPicked(next);
    writeString(STORAGE_KEYS.leaderboardTab, next);
  };

  return (
    <div className="page max-w-3xl">
      <PageHeader
        eyebrow="Community"
        title="Leaderboard"
        description={
          tab === 'week'
            ? 'XP earned this week, ranked. The board starts again every week, and a lesson counts only the first time you solve it.'
            : 'Every account on this CodeConsist, ranked by XP. Solves are verified by the server before they count.'
        }
        aside={
          tab === 'all' && !signedIn && serverStatus === 'online' ? (
            <Button variant="primary" onClick={intents.openAuth}>
              Sign in to be ranked
            </Button>
          ) : undefined
        }
      />
      {weekly && <Segmented<Tab> value={tab} options={TABS} onChange={choose} ariaLabel="Leaderboard period" className="mb-4 leaderboard-tabs" />}
      {tab === 'week' ? <WeeklyLeague /> : <Leaderboard />}
    </div>
  );
};
