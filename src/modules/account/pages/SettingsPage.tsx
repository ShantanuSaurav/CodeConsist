import React, { useState } from 'react';
import { PageHeader } from '@/ui/primitives/PageHeader';
import { useSession } from '@/platform/session';
import { useTheme } from '@/platform/theme';
import { intents } from '@/platform/events';
import { levelProgress } from '@/platform/xp-leveling/leveling';

const CARD = 'bg-gray-50 dark:bg-[#161b22] border border-black/5 dark:border-white/5 rounded-2xl p-6';
const ROW = 'flex items-center justify-between gap-4 py-3 border-b last:border-b-0 border-black/5 dark:border-white/5';
const BTN_LINE =
  'px-4 py-2 rounded-lg border border-black/10 dark:border-white/15 text-sm font-medium text-gray-800 dark:text-gray-100 hover:bg-black/5 dark:hover:bg-white/5 disabled:opacity-50';

export const SettingsPage: React.FC = () => {
  const { user, stats, serverStatus, logout, resetProgress } = useSession();
  const { theme, toggleTheme } = useTheme();
  const openAuthModal = intents.openAuth;
  const openSubModal = intents.openPro;
  const [confirmingReset, setConfirmingReset] = useState(false);
  const signedIn = Boolean(user && user.provider !== 'guest');
  const level = levelProgress(stats.xp);

  return (
    <div className="p-6 sm:p-8 max-w-3xl mx-auto space-y-6">
      <PageHeader eyebrow="Settings" title="Account & preferences" />

      <section className={CARD}>
        <h2 className="text-sm font-mono uppercase tracking-wider text-gray-500 mb-2">Account</h2>
        <div className={ROW}>
          <div>
            <div className="font-medium text-gray-900 dark:text-white">
              {signedIn ? user!.username : 'Not signed in'}
            </div>
            <div className="text-xs text-gray-500">
              {signedIn
                ? user!.email
                : 'Progress is stored in this browser. Sign in to sync it across devices and join the leaderboard.'}
            </div>
          </div>
          {signedIn ? (
            <button type="button" className={BTN_LINE} onClick={logout}>
              Sign out
            </button>
          ) : (
            <button
              type="button"
              onClick={openAuthModal}
              disabled={serverStatus === 'offline'}
              className="px-4 py-2 rounded-lg bg-[var(--color-primary)] text-white dark:text-black text-sm font-bold hover:brightness-110 disabled:opacity-50"
            >
              Sign in or register
            </button>
          )}
        </div>
        <div className={ROW}>
          <span className="text-sm text-gray-700 dark:text-gray-300">Level</span>
          <span className="font-mono text-sm text-gray-900 dark:text-white">
            {level.level} · {level.percent}% to {level.level + 1}
          </span>
        </div>
        <div className={ROW}>
          <span className="text-sm text-gray-700 dark:text-gray-300">Membership</span>
          <div className="flex items-center gap-3">
            <span className={`font-mono text-sm ${stats.isPremium ? 'text-[var(--color-primary)]' : 'text-gray-900 dark:text-white'}`}>
              {stats.isPremium ? 'Pro' : 'Free'}
            </span>
            {!stats.isPremium && (
              <button type="button" className={BTN_LINE} onClick={openSubModal}>
                Unlock Pro stages
              </button>
            )}
          </div>
        </div>
        <div className={ROW}>
          <span className="text-sm text-gray-700 dark:text-gray-300">API server</span>
          <span
            className={`font-mono text-sm ${
              serverStatus === 'online'
                ? 'text-[var(--color-primary)]'
                : serverStatus === 'checking'
                  ? 'text-gray-500'
                  : 'text-red-500'
            }`}
          >
            {serverStatus === 'online' ? 'connected' : serverStatus === 'checking' ? 'checking…' : 'offline'}
          </span>
        </div>
      </section>

      <section className={CARD}>
        <h2 className="text-sm font-mono uppercase tracking-wider text-gray-500 mb-2">Appearance</h2>
        <div className={ROW}>
          <span className="text-sm text-gray-700 dark:text-gray-300">Dark mode</span>
          <button
            type="button"
            role="switch"
            aria-checked={theme === 'dark'}
            onClick={toggleTheme}
            className={`w-11 h-6 rounded-full relative transition-colors ${
              theme === 'dark' ? 'bg-[var(--color-primary)]' : 'bg-black/15'
            }`}
          >
            <span
              className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all ${
                theme === 'dark' ? 'left-[22px]' : 'left-0.5'
              }`}
            />
          </button>
        </div>
      </section>

      <section className={`${CARD} border-red-500/20`}>
        <h2 className="text-sm font-mono uppercase tracking-wider text-red-500 mb-2">Danger zone</h2>
        <div className={ROW}>
          <div>
            <div className="text-sm font-medium text-gray-900 dark:text-white">Reset progress</div>
            <div className="text-xs text-gray-500">
              Erases XP, streaks and every solve{signedIn ? ' - on this device and on your account' : ' in this browser'}.
            </div>
          </div>
          {confirmingReset ? (
            <div className="flex items-center gap-2">
              <button type="button" className={BTN_LINE} onClick={() => setConfirmingReset(false)}>
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  setConfirmingReset(false);
                  resetProgress();
                }}
                className="px-4 py-2 rounded-lg bg-red-500 text-white text-sm font-bold hover:brightness-110"
              >
                Erase everything
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmingReset(true)}
              className="px-4 py-2 rounded-lg border border-red-500/40 text-red-500 text-sm font-medium hover:bg-red-500/10"
            >
              Reset…
            </button>
          )}
        </div>
      </section>
    </div>
  );
};
