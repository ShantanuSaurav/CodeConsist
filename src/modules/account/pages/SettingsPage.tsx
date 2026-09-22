import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useSession } from '@/platform/session';
import { Badge, Button, Dropdown, LearningModeSwitch, PageHeader, Switch } from '@/ui';
import type { BadgeTone } from '@/ui';
import { useTheme } from '@/platform/theme';
import { intents } from '@/platform/events';
import { api, oauthStartUrl, rupees } from '@/platform/api-client/api';
import type { BillingOrder, Certificate } from '@/platform/api-client/api';
import { ROUTES } from '@/config/routes';
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

const Section: React.FC<{ id: string; title: string; children: React.ReactNode }> = ({ id, title, children }) => (
  <section aria-labelledby={id} className="pb-8 mb-8 border-b border-border-subtle last:border-b-0 last:pb-0 last:mb-0">
    <h2 id={id} className="section-title mb-1">
      {title}
    </h2>
    <div className="row-list">{children}</div>
  </section>
);

/* ------------------------------------------------------------ purchases */

const PROVIDER_LABEL: Record<BillingOrder['provider'], string> = { razorpay: 'Razorpay', test: 'Test', admin: 'Granted', free: 'Free' };
const STATUS_TONE: Record<BillingOrder['status'], BadgeTone> = { paid: 'success', created: 'warning', failed: 'error', revoked: 'neutral' };
const STATUS_LABEL: Record<BillingOrder['status'], string> = { paid: 'Paid', created: 'Not completed', failed: 'Failed', revoked: 'Revoked' };

/** "Lifetime licence", "C track", "Stage stage-9", "Certificate · Core" - from the order's product key. */
function describeOrder(order: BillingOrder, labels: { tracks: Map<string, string>; stages: Map<string, string> }): string {
  const p = order.product;
  if (p.kind === 'lifetime') return 'Lifetime licence';
  if (p.kind === 'track') return `${labels.tracks.get(p.trackId) ?? p.trackId} track`;
  if (p.kind === 'stage') return `Stage ${labels.stages.get(p.stageId) ?? p.stageId}`;
  return `Certificate · ${labels.tracks.get(p.trackId) ?? p.trackId}`;
}

/* ---------------------------------------------------------- sign-in methods */

/** The providers this page knows how to talk about, in the order they are listed. */
const SIGN_IN_PROVIDERS: { id: string; label: string }[] = [
  { id: 'google', label: 'Google' },
  { id: 'github', label: 'GitHub' }
];

function shortDate(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

export const SettingsPage: React.FC = () => {
  const {
    user,
    stats,
    stages,
    tracks,
    serverStatus,
    logout,
    resetProgress,
    learningMode,
    setLearningMode,
    selectedTrackId,
    setSelectedTrack,
    oauthProviders,
    refreshAccount
  } = useSession();
  const { theme, toggleTheme } = useTheme();
  const openAuthModal = intents.openAuth;
  const [confirmingReset, setConfirmingReset] = useState(false);
  const signedIn = Boolean(user && user.provider !== 'guest');
  const level = levelProgress(stats.xp);

  const unlockedCount = (stats.unlockedStages ?? []).length;
  const plan = stats.isPremium ? 'Lifetime' : unlockedCount > 0 ? `${unlockedCount} ${unlockedCount === 1 ? 'stage' : 'stages'} unlocked` : 'Free';

  /* Purchases and certificates come from the server; the local copy never knows them. */
  const [orders, setOrders] = useState<BillingOrder[] | null>(null);
  const [certificates, setCertificates] = useState<Certificate[] | null>(null);
  const [billingError, setBillingError] = useState<string | null>(null);

  const loadBilling = useCallback(async () => {
    if (!signedIn || serverStatus !== 'online') return;
    setBillingError(null);
    try {
      const [o, c] = await Promise.all([api.myOrders(), api.myCertificates()]);
      setOrders(o.orders);
      setCertificates(c.certificates);
    } catch (err) {
      setBillingError(err instanceof Error ? err.message : 'Could not load purchases.');
    }
  }, [signedIn, serverStatus]);

  // Reload after an unlock too: the modal refreshes the account, which changes these.
  useEffect(() => {
    loadBilling();
  }, [loadBilling, stats.isPremium, stats.unlockedStages]);

  const labels = {
    tracks: new Map(tracks.map(({ track }) => [track.id, track.label])),
    stages: new Map(stages.map((s) => [s.id, `${String(s.index).padStart(2, '0')} · ${s.name}`]))
  };

  /* ------------------------------------------------------ sign-in methods */

  const identities = user?.identities ?? [];
  // An older server does not send the field; assume a password exists and let
  // the server be the one that refuses - it is the only real boundary anyway.
  const hasPassword = user?.hasPassword ?? true;
  const [signInBusy, setSignInBusy] = useState<string | null>(null);
  const [signInError, setSignInError] = useState<string | null>(null);
  const [signInNotice, setSignInNotice] = useState<string | null>(null);
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [passwordBusy, setPasswordBusy] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);

  /** Never leave an account with no way back in: that is a lockout, not a setting. */
  const canDisconnect = (provider: string) => hasPassword || identities.some((id) => id !== provider);

  const disconnect = async (provider: string, label: string) => {
    setSignInBusy(provider);
    setSignInError(null);
    setSignInNotice(null);
    try {
      await api.unlinkOAuth(provider);
      await refreshAccount();
      setSignInNotice(`${label} is no longer connected to this account.`);
    } catch (err) {
      setSignInError(err instanceof Error ? err.message : `Could not disconnect ${label}.`);
    } finally {
      setSignInBusy(null);
    }
  };

  /**
   * Connecting is a full page navigation, which cannot carry this page's
   * Authorization header - so ask the server for a one-shot ticket first and
   * send that instead. The session token never goes in a URL.
   */
  const connect = async (provider: string, label: string) => {
    setSignInBusy(provider);
    setSignInError(null);
    setSignInNotice(null);
    try {
      const { ticket } = await api.oauthLinkTicket(provider);
      window.location.assign(oauthStartUrl(provider, { ticket }));
    } catch (err) {
      setSignInError(err instanceof Error ? err.message : `Could not start connecting ${label}.`);
      setSignInBusy(null);
    }
  };

  const savePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordError(null);
    setSignInNotice(null);
    if (newPassword.length < 8) {
      setPasswordError('Use at least 8 characters.');
      return;
    }
    setPasswordBusy(true);
    try {
      await api.setPassword(hasPassword ? { currentPassword, newPassword } : { newPassword });
      // Nothing password-derived is kept in this page's state for a moment
      // longer than the request itself needs it.
      setCurrentPassword('');
      setNewPassword('');
      setPasswordOpen(false);
      await refreshAccount();
      setSignInNotice(hasPassword ? 'Password changed.' : 'Password set. You can now sign in with your email address too.');
    } catch (err) {
      setPasswordError(err instanceof Error ? err.message : 'Could not save that password.');
    } finally {
      setPasswordBusy(false);
    }
  };

  // A provider is listed when the server can start it, or when it is already
  // connected (credentials may have been removed after someone linked it).
  const signInRows = SIGN_IN_PROVIDERS.filter(
    (p) => identities.includes(p.id) || Boolean(oauthProviders?.[p.id as 'google' | 'github'])
  );

  return (
    <div className="page max-w-3xl">
      <PageHeader title="Settings" />

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
            {String(level.level).padStart(2, '0')} · {level.percent}% to {String(level.level + 1).padStart(2, '0')}
          </span>
        </Row>
        <Row
          title="Plan"
          description={
            stats.isPremium
              ? 'Every premium stage is open, now and in future.'
              : 'Premium stages are one-time purchases - a single stage, a whole track, or a lifetime licence. No subscription.'
          }
        >
          <span className={`font-mono text-sm ${stats.isPremium || unlockedCount > 0 ? 'text-accent' : 'text-fg'}`}>{plan}</span>
          <Button onClick={() => intents.openPro()} disabled={!signedIn && serverStatus === 'offline'}>
            Unlock stages &amp; certificates
          </Button>
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

      {signedIn && (
        <Section id="settings-signin" title="Sign-in methods">
          <p className="row-desc">
            Your password is never stored — only a scrambled (bcrypt) form of it that cannot be turned back into the
            original. Nobody can read it: not the app, not an administrator, not us.
          </p>

          {signInError && (
            <div className="notice notice-error" role="alert">
              {signInError}
            </div>
          )}
          {signInNotice && (
            <div className="notice notice-success" role="status">
              {signInNotice}
            </div>
          )}

          {signInRows.map(({ id, label }) => {
            const linked = identities.includes(id);
            const blocked = linked && !canDisconnect(id);
            return (
              <Row
                key={id}
                title={label}
                description={
                  linked
                    ? blocked
                      ? 'Connected. This is the only way into your account, so set a password before disconnecting it.'
                      : 'Connected.'
                    : `Sign in with your ${label} account instead of typing a password.`
                }
              >
                {linked ? (
                  <Button
                    variant="danger-line"
                    disabled={blocked || signInBusy === id || serverStatus !== 'online'}
                    onClick={() => disconnect(id, label)}
                  >
                    {signInBusy === id ? 'Working…' : 'Disconnect'}
                  </Button>
                ) : (
                  <Button
                    disabled={
                      signInBusy === id || serverStatus !== 'online' || !oauthProviders?.[id as 'google' | 'github']
                    }
                    onClick={() => connect(id, label)}
                  >
                    {signInBusy === id ? 'Working…' : `Connect ${label}`}
                  </Button>
                )}
              </Row>
            );
          })}

          <Row
            title="Password"
            description={
              hasPassword
                ? 'Set. You can sign in with your email address and password.'
                : 'Not set. Add one so you can sign in even without a connected account.'
            }
          >
            <Button
              onClick={() => {
                setPasswordOpen((open) => !open);
                setPasswordError(null);
              }}
              disabled={serverStatus !== 'online'}
            >
              {passwordOpen ? 'Cancel' : hasPassword ? 'Change password' : 'Set a password'}
            </Button>
          </Row>

          {passwordOpen && (
            <form onSubmit={savePassword} className="flex flex-col gap-3 pt-1 max-w-sm">
              {passwordError && (
                <div className="notice notice-error" role="alert">
                  {passwordError}
                </div>
              )}
              {hasPassword && (
                <div>
                  <label className="field-label" htmlFor="settings-current-password">
                    Current password
                  </label>
                  <input
                    id="settings-current-password"
                    type="password"
                    required
                    autoComplete="current-password"
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    className="w-full"
                    disabled={passwordBusy}
                  />
                </div>
              )}
              <div>
                <label className="field-label" htmlFor="settings-new-password">
                  New password
                </label>
                <input
                  id="settings-new-password"
                  type="password"
                  required
                  minLength={8}
                  autoComplete="new-password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="w-full"
                  placeholder="At least 8 characters"
                  disabled={passwordBusy}
                />
              </div>
              <Button type="submit" variant="primary" disabled={passwordBusy}>
                {passwordBusy ? 'Saving…' : hasPassword ? 'Change password' : 'Set password'}
              </Button>
            </form>
          )}
        </Section>
      )}

      {signedIn && (
        <Section id="settings-purchases" title="Purchases">
          {billingError && (
            <div className="notice notice-warn" role="alert">
              {billingError}{' '}
              <button type="button" className="underline underline-offset-2" onClick={loadBilling}>
                Try again
              </button>
            </div>
          )}
          {!orders && !billingError && <p className="text-sm text-fg-muted py-3">Loading…</p>}
          {orders && orders.length === 0 && <p className="text-sm text-fg-muted py-3">No purchases yet.</p>}
          {orders &&
            orders.map((order) => (
              <Row
                key={order.id}
                title={describeOrder(order, labels)}
                description={
                  <span className="font-mono text-xs">
                    {shortDate(order.paidAt ?? order.createdAt)} · {PROVIDER_LABEL[order.provider]} · {order.id}
                    {order.note && order.provider === 'admin' ? ` · ${order.note}` : ''}
                  </span>
                }
              >
                <span className="font-mono text-sm text-fg tabular-nums">{order.amount === 0 ? 'Free' : rupees(order.amount)}</span>
                <Badge tone={STATUS_TONE[order.status]}>{STATUS_LABEL[order.status]}</Badge>
              </Row>
            ))}
        </Section>
      )}

      {signedIn && (
        <Section id="settings-certificates" title="Certificates">
          {!certificates && !billingError && <p className="text-sm text-fg-muted py-3">Loading…</p>}
          {certificates && certificates.length === 0 && (
            <Row title="No certificates yet" description="Clear every stage in a track, then get its verified certificate.">
              <Button onClick={() => intents.openPro({ tab: 'certificates' })}>See what is left</Button>
            </Row>
          )}
          {certificates &&
            certificates.map((cert) => (
              <Row
                key={cert.id}
                title={cert.trackLabel}
                description={
                  <span className="font-mono text-xs">
                    {cert.learnerName} · issued {shortDate(cert.issuedAt)} · {cert.id}
                  </span>
                }
              >
                {cert.revoked ? (
                  <Badge tone="error">Revoked</Badge>
                ) : (
                  <>
                    <Link to={ROUTES.certificate(cert.id)} className="btn btn-secondary btn-sm">
                      View
                    </Link>
                    <Link to={ROUTES.verify(cert.id)} className="btn btn-ghost btn-sm">
                      Verify
                    </Link>
                  </>
                )}
              </Row>
            ))}
        </Section>
      )}

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

      <Section id="settings-danger" title="Danger zone">
        <Row
          title="Reset progress"
          description={`Erases XP, streaks and every solve${signedIn ? ' - on this device and on your account' : ' in this browser'}. Purchases are kept.`}
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
