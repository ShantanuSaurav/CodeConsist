import React, { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useSession } from '@/platform/session';
import { ROUTES } from '@/config/routes';
import { CodeConsistLogo } from '@/ui';

/**
 * The token, and the sign-in it starts, both live OUTSIDE React.
 *
 * This page is reached exactly once per page load, by a redirect from the
 * API. But the fragment can only be read once - it is wiped immediately -
 * and React mounts every component twice in development, so a token held in
 * component state would be gone by the second mount and the first mount's
 * in-flight sign-in would be cancelled by its own cleanup. Module scope
 * lasts exactly as long as the page load that delivered the token, which is
 * the lifetime this actually has.
 */
let capturedToken: string | null = null;
let adoption: Promise<void> | null = null;

/**
 * Read `#token=…` from the address bar and take it straight back out again.
 *
 * The server puts the token in the fragment rather than the query string on
 * purpose: a fragment is never sent to a server, so it stays out of access
 * logs and out of the Referer header of anything this page loads. Once it is
 * in memory it has no business in the address bar, the history entry or a
 * bookmark either.
 */
function takeTokenFromHash(): string {
  if (capturedToken !== null) return capturedToken;
  if (typeof window === 'undefined') return '';
  const raw = window.location.hash.startsWith('#') ? window.location.hash.slice(1) : window.location.hash;
  capturedToken = (new URLSearchParams(raw).get('token') ?? '').trim();
  if (window.location.hash) {
    window.history.replaceState(null, '', window.location.pathname + window.location.search);
  }
  return capturedToken;
}

/**
 * /auth/callback - where Google and GitHub sign-ins land.
 *
 * Everything that matters already happened on the server: it talked to the
 * provider, checked that the email is verified, and decided which account
 * this is. All that is left here is to adopt the token, pull down the
 * profile, progress and saved code, and get out of the way.
 */
export const OAuthCallbackPage: React.FC = () => {
  const { adoptToken } = useSession();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const showing = useRef(true);

  useEffect(() => {
    showing.current = true;
    const token = takeTokenFromHash();
    if (!token) {
      setError('That sign-in link did not carry a token. It may have already been used, or been opened twice.');
      return;
    }

    // Started once per page load and shared by every mount, so a second mount
    // joins the sign-in already running instead of starting a rival one.
    if (!adoption) adoption = adoptToken(token);
    adoption
      .then(() => navigate(ROUTES.dashboard, { replace: true }))
      .catch((err: unknown) => {
        // Let a later mount try again rather than inheriting the failure.
        adoption = null;
        if (showing.current) setError(err instanceof Error ? err.message : 'Could not finish signing in.');
      });

    return () => {
      showing.current = false;
    };
  }, [adoptToken, navigate]);

  return (
    <div className="auth-callback-page">
      <Link to={ROUTES.landing} className="inline-flex">
        <CodeConsistLogo size="sm" wordmark />
      </Link>

      {error ? (
        <div className="auth-callback-card">
          <h1 className="section-title">Could not sign you in</h1>
          <div className="notice notice-error" role="alert">
            {error}
          </div>
          <p className="text-sm text-fg-secondary">
            Nothing has changed on your account. Start again from the home page, or sign in with your email address and
            password instead.
          </p>
          <Link to={ROUTES.landing} className="btn btn-primary">
            Try again
          </Link>
        </div>
      ) : (
        <div className="auth-callback-card" role="status">
          <h1 className="section-title">Signing you in…</h1>
          <p className="text-sm text-fg-secondary">Fetching your progress and the code you were working on.</p>
        </div>
      )}
    </div>
  );
};
