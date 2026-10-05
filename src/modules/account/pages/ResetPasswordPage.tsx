import '../styles/account.css';
import React, { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { intents } from '@/platform/events';
import { useSession } from '@/platform/session';
import { useCopy } from '@/platform/settings';
import { api, ApiError, OfflineError } from '@/platform/api-client/api';
import { ROUTES } from '@/config/routes';
import { Button, CodeConsistLogo } from '@/ui';
import { failedCheckView, pickResetToken } from './resetLink';

/** The same rule the server applies to every password. */
const MIN_PASSWORD = 8;

/**
 * The token lives OUTSIDE React, for the same reason as on /auth/callback:
 * the fragment is wiped the moment it is read, and React mounts every
 * component twice in development - a token held in state would be gone by the
 * second mount. It is kept in memory for this page load only, so a retry
 * after a network failure needs no second click on the link.
 */
let capturedToken: string | null = null;

/**
 * Read `#token=...` and take it straight back out of the address bar. The
 * admin's link puts the token in the fragment because a fragment is never
 * sent to a server: it stays out of access logs, proxy logs and the Referer
 * of anything this page loads. It has no business in the history entry or a
 * bookmark either.
 *
 * A token in the address bar wins over the one already captured: a new link
 * pasted into this same tab changes only the fragment, so nothing reloads,
 * and it must not be answered with the old (perhaps dead) link.
 */
function takeTokenFromHash(): string {
  if (typeof window === 'undefined') return capturedToken ?? '';
  capturedToken = pickResetToken(window.location.hash, capturedToken) || null;
  if (window.location.hash) window.history.replaceState(null, '', window.location.pathname + window.location.search);
  return capturedToken ?? '';
}

type DeadReason = 'unknown' | 'expired' | 'used' | 'revoked';

type View =
  | { kind: 'checking' }
  | { kind: 'ready'; username: string; expiresAt: string }
  | { kind: 'dead'; reason: DeadReason }
  | { kind: 'offline' }
  /** The link could not be checked right now (too many checks, a server error) - not a verdict on it. */
  | { kind: 'unchecked'; message: string }
  | { kind: 'done' }
  /** The password is set, but signing this browser in did not finish. The link is spent. */
  | { kind: 'set-sign-in' };

const DEAD_TEXT: Record<DeadReason, string> = {
  unknown: 'This reset link is not valid.',
  expired: 'This reset link has expired.',
  used: 'This reset link has already been used.',
  revoked: 'This reset link was replaced or withdrawn.'
};

function formatExpiry(iso: string): string {
  const at = new Date(iso);
  return Number.isNaN(at.getTime()) ? '' : at.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

/**
 * /reset-password#token=... - where a password reset link an administrator
 * issued from Users lands. There is no email in this app: the admin sends the
 * link privately and the learner sets a new password here.
 *
 * Setting it signs out every other session of the account (the server bumps
 * its token version) and signs this browser in, the same way a login does -
 * including carrying a guest's progress into the account.
 *
 * Keyed on the token: a new link pasted into this tab (only the fragment
 * changes, so nothing reloads) starts the page over and checks that link.
 */
export const ResetPasswordPage: React.FC = () => {
  const [token, setLinkToken] = useState(takeTokenFromHash);

  useEffect(() => {
    const onHashChange = () => {
      const next = takeTokenFromHash();
      if (next) setLinkToken(next);
    };
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  return <ResetPasswordFlow key={token} token={token} />;
};

const ResetPasswordFlow: React.FC<{ token: string }> = ({ token }) => {
  const { user, adoptToken } = useSession();
  const copy = useCopy();
  const navigate = useNavigate();
  const [view, setView] = useState<View>(() => (token ? { kind: 'checking' } : { kind: 'dead', reason: 'unknown' }));
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const inspect = useCallback(async () => {
    if (!token) return;
    setView({ kind: 'checking' });
    try {
      const res = await api.inspectPasswordReset(token);
      setView(res.valid ? { kind: 'ready', username: res.username, expiresAt: res.expiresAt } : { kind: 'dead', reason: res.reason });
    } catch (err) {
      // Only the server's `valid: false` above says the link is dead. An
      // error is not a verdict on it: offer to check again.
      setView(failedCheckView(err));
    }
  }, [token]);

  useEffect(() => {
    void inspect();
  }, [inspect]);

  const signedInAs = user && user.provider !== 'guest' ? user.username : null;
  const switching = view.kind === 'ready' && signedInAs !== null && signedInAs.toLowerCase() !== view.username.toLowerCase();

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (password.length < MIN_PASSWORD) {
      setError(`Use at least ${MIN_PASSWORD} characters.`);
      return;
    }
    if (password !== confirm) {
      setError('The two passwords do not match.');
      return;
    }
    setBusy(true);
    try {
      const result = await api.resetPassword(token, password);
      setView({ kind: 'done' });
      // The existing sign-in path: profile, progress (a guest's is merged in),
      // activity, saved code. The password is already set and the link spent,
      // so a failure here (the profile fetch hiccuped) is not the form's
      // error - adoptToken has dropped the token, and the way on is an
      // ordinary sign-in with the new password.
      try {
        await adoptToken(result.token);
      } catch {
        setView({ kind: 'set-sign-in' });
        return;
      }
      navigate(ROUTES.dashboard, { replace: true });
    } catch (err) {
      if (err instanceof OfflineError) {
        setView({ kind: 'offline' });
      } else if (err instanceof ApiError && err.status === 410) {
        const reason = (['unknown', 'expired', 'used', 'revoked'] as const).find((r) => r === err.reason) ?? 'unknown';
        setView({ kind: 'dead', reason });
      } else {
        setError(err instanceof Error && err.message ? err.message : 'Could not set the password.');
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="auth-callback-page">
      <Link to={ROUTES.landing} className="inline-flex">
        <CodeConsistLogo size="sm" wordmark />
      </Link>

      <div className="auth-callback-card">
        {view.kind === 'checking' && (
          <div role="status">
            <h1 className="section-title">Checking your link…</h1>
          </div>
        )}

        {view.kind === 'dead' && (
          <>
            <h1 className="section-title">This link cannot be used</h1>
            <div className="notice notice-error" role="alert">
              {DEAD_TEXT[view.reason]} Ask the person who sent it for a new link.
            </div>
            <Link to={ROUTES.landing} className="btn btn-secondary">
              Go to the home page
            </Link>
          </>
        )}

        {view.kind === 'offline' && (
          <>
            <h1 className="section-title">Set a new password</h1>
            <div className="notice notice-warn" role="alert">
              {copy('copy.offline.generic')}
            </div>
            <Button variant="primary" onClick={() => void inspect()}>
              Try again
            </Button>
          </>
        )}

        {view.kind === 'unchecked' && (
          <>
            <h1 className="section-title">Set a new password</h1>
            <div className="notice notice-warn" role="alert">
              {view.message} Your link has not been used.
            </div>
            <Button variant="primary" onClick={() => void inspect()}>
              Try again
            </Button>
          </>
        )}

        {view.kind === 'ready' && (
          <>
            <h1 className="section-title">Set a new password for {view.username}</h1>
            {view.expiresAt && <p className="text-sm text-fg-secondary">This link works once, until {formatExpiry(view.expiresAt)}.</p>}
            {switching && (
              <div className="notice notice-warn">
                This browser is signed in as {signedInAs}. Setting this password signs you in as {view.username} instead.
              </div>
            )}
            <form onSubmit={submit} className="flex flex-col gap-4 w-full">
              <div>
                <label className="field-label" htmlFor="reset-password">
                  New password
                </label>
                <input
                  id="reset-password"
                  type="password"
                  required
                  minLength={MIN_PASSWORD}
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full"
                  placeholder={`At least ${MIN_PASSWORD} characters`}
                  disabled={busy}
                />
              </div>
              <div>
                <label className="field-label" htmlFor="reset-password-confirm">
                  Repeat it
                </label>
                <input
                  id="reset-password-confirm"
                  type="password"
                  required
                  minLength={MIN_PASSWORD}
                  autoComplete="new-password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  className="w-full"
                  disabled={busy}
                />
              </div>
              {error && (
                <div className="notice notice-error" role="alert">
                  {error}
                </div>
              )}
              <p className="text-xs text-fg-muted">Every other device signed in to this account is signed out.</p>
              <Button type="submit" variant="primary" block disabled={busy}>
                {busy ? 'Please wait…' : 'Set password and sign in'}
              </Button>
            </form>
          </>
        )}

        {view.kind === 'done' && (
          <div role="status">
            <h1 className="section-title">Password set</h1>
            <p className="text-sm text-fg-secondary">Signing you in…</p>
          </div>
        )}

        {view.kind === 'set-sign-in' && (
          <>
            <h1 className="section-title">Password set</h1>
            <div className="notice notice-info" role="status">
              Your new password is set, but signing you in did not finish. Sign in with your new password.
            </div>
            <Button
              variant="primary"
              onClick={() => {
                navigate(ROUTES.landing, { replace: true });
                intents.openAuth();
              }}
            >
              Sign in
            </Button>
          </>
        )}
      </div>
    </div>
  );
};
