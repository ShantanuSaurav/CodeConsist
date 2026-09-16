import React from 'react';
import { PageHeader } from '@/ui/primitives/PageHeader';
import { Leaderboard } from '../components/Leaderboard';
import { useSession } from '@/platform/session';
import { intents } from '@/platform/events';

export const LeaderboardPage: React.FC = () => {
  const { user, serverStatus } = useSession();
  const signedIn = Boolean(user && user.provider !== 'guest');

  return (
    <div className="p-6 sm:p-8 max-w-4xl mx-auto">
      <PageHeader
        eyebrow="Community"
        title="Leaderboard"
        description="Every account on this Devlingo, ranked by XP. Solves are verified by the server before they count."
        aside={
          !signedIn && serverStatus === 'online' ? (
            <button
              type="button"
              onClick={intents.openAuth}
              className="px-5 py-2.5 bg-[var(--color-primary)] text-white dark:text-black font-bold rounded-lg text-sm hover:brightness-110"
            >
              Sign in to be ranked
            </button>
          ) : undefined
        }
      />
      <Leaderboard />
    </div>
  );
};
