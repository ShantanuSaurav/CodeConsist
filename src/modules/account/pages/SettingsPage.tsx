import React, { useState } from 'react';
import { useSession } from '@/platform/session';
import { Button, Dropdown, LearningModeSwitch, PageHeader, Switch } from '@/ui';
import { useTheme } from '@/platform/theme';
import { intents } from '@/platform/events';
import { levelProgress } from '@/platform/xp-leveling/leveling';

/** One settings row: label + description on the left, the control on the right. */
const Row: React.FC<{ title: React.ReactNode; description?: React.ReactNode; children: React.ReactNode }> = ({ title, description, children }) => (
  <div className="row items-start sm:items-center flex-col sm:flex-row gap-2 sm:gap-6">
    <div className="min-w-0">
      <div className="row-title">{title}</div>
      {description && <div className="row-desc max-w-md">{description}</div>}
    </div>
    <div className="shrink-0 flex items-center gap-3">{children}</div>
  </div>
);

const Section: React.FC<{ id: string; title: string; danger?: boolean; children: React.ReactNode }> = ({ id, title, danger, children }) => (
  <section aria-labelledby={id} className="pb-8 mb-8 border-b border-border-subtle last:border-b-0 last:pb-0 last:mb-0">
    <h2 id={id} className={`section-title mb-1 ${danger ? 'text-error' : ''}`}>
      {title}
    </h2>
    <div className="row-list">{children}</div>
  </section>
);

export const SettingsPage: React.FC = () => {
  const { user, stats, serverStatus, logout, resetProgress, learningMode, setLearningMode, tracks, selectedTrackId, setSelectedTrack } = useSession();
  const { theme, toggleTheme } = useTheme();
  const openAuthModal = intents.openAuth;
  const openSubModal = intents.openPro;
  const [confirmingReset, setConfirmingReset] = useState(false);
  const signedIn = Boolean(user && user.provider !== 'guest');
  const level = levelProgress(stats.xp);

  return (
    <div className="page max-w-3xl">
      <PageHeader eyebrow="Settings" title="Settings" />

      <Section id="settings-account" title="Account">
        <Row
          title={signedIn ? user!.username : 'Not signed in'}
          description={
            signedIn ? user!.email : 'Progress is stored in this browser. Sign in to sync it across devices and join the leaderboard.'
          }
        >
          {signedIn ? (
            <Button onClick={logout}>Sign out</Button>
          ) : (
            <Button variant="primary" onClick={openAuthModal} disabled={serverStatus === 'offline'}>
              Sign in or register
            </Button>
          )}
        </Row>
        <Row title="Level">
          <span className="font-mono text-sm text-fg tabular-nums">
            {String(level.level).padStart(2, '0')} · {level.percent}% to {level.level + 1}
          </span>
        </Row>
        <Row title="Membership">
          <span className={`font-mono text-sm ${stats.isPremium ? 'text-accent' : 'text-fg'}`}>{stats.isPremium ? 'Pro' : 'Free'}</span>
          {!stats.isPremium && <Button onClick={openSubModal}>Unlock Pro stages</Button>}
        </Row>
        <Row title="API server">
          <span
            className={`inline-flex items-center gap-1.5 font-mono text-sm ${
              serverStatus === 'online' ? 'text-success' : serverStatus === 'checking' ? 'text-fg-muted' : 'text-error'
            }`}
          >
            <span className="w-1.5 h-1.5 rounded-full bg-current" aria-hidden="true" />
            {serverStatus === 'online' ? 'connected' : serverStatus === 'checking' ? 'checking…' : 'offline'}
          </span>
        </Row>
      </Section>

      <Section id="settings-appearance" title="Appearance">
        <Row title="Dark mode" description="Switch between the light and dark interface.">
          <Switch checked={theme === 'dark'} onChange={toggleTheme} ariaLabel="Dark mode" />
        </Row>
      </Section>

      <Section id="settings-learning" title="Learning">
        <Row
          title="Learning mode"
          description="Learn walks through theory, an example and a try-it before each new idea; Practice goes straight to the challenges. Same grading, XP and unlocking either way."
        >
          <LearningModeSwitch value={learningMode} onChange={setLearningMode} />
        </Row>
        {tracks.length > 1 && (
          <Row title="Current track" description='Which path the Learn page, the skill map and "Continue learning" follow.'>
            <Dropdown
              value={selectedTrackId}
              onChange={setSelectedTrack}
              options={tracks.map(({ track }) => ({ value: track.id, label: track.label }))}
              ariaLabel="Current track"
            />
          </Row>
        )}
      </Section>

      <Section id="settings-danger" title="Danger zone" danger>
        <Row
          title="Reset progress"
          description={`Erases XP, streaks and every solve${signedIn ? ' - on this device and on your account' : ' in this browser'}.`}
        >
          {confirmingReset ? (
            <>
              <Button onClick={() => setConfirmingReset(false)}>Cancel</Button>
              <Button
                variant="danger"
                onClick={() => {
                  setConfirmingReset(false);
                  resetProgress();
                }}
              >
                Erase everything
              </Button>
            </>
          ) : (
            <Button variant="danger-line" onClick={() => setConfirmingReset(true)}>
              Reset…
            </Button>
          )}
        </Row>
      </Section>
    </div>
  );
};
