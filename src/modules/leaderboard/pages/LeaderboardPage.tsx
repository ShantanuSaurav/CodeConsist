import React from 'react';
import { Button, PageHeader } from '@/ui';
import { Leaderboard } from '../components/Leaderboard';
import { useSession } from '@/platform/session';
import { intents } from '@/platform/events';

export const LeaderboardPage: React.FC = () => {
  const { user, serverStatus } = useSession();
  const signedIn = Boolean(user && user.provider !== 'guest');

  return (
    <div className="page max-w-3xl">
      <PageHeader
        eyebrow="Community"
        title="Leaderboard"
        description="Every account on this Devlingo, ranked by XP. Solves are verified by the server before they count."
        aside={
          !signedIn && serverStatus === 'online' ? (
            <Button variant="primary" onClick={intents.openAuth}>
              Sign in to be ranked
            </Button>
          ) : undefined
        }
      />
      <Leaderboard />
    </div>
  );
};
