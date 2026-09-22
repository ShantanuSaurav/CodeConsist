import React, { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { useSession } from '@/platform/session';
import { oauthStartUrl } from '@/platform/api-client/api';
import { useFocusTrap } from '@/ui/hooks/useFocusTrap';
import { Button } from '@/ui/primitives/Button';
import { DevlingoLogo } from '@/ui/primitives/DevlingoLogo';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
}

/**
 * The reason a Google / GitHub sign-in did not work, which the API put in
 * `?auth_error=` when it sent the learner back. Read during render (once per
 * mount - React runs effects twice in development, and the second pass would
 * find the address bar already cleaned and wipe the message off the screen).
 */
function authErrorFromUrl(): string {
  if (typeof window === 'undefined') return '';
  return (new URLSearchParams(window.location.search).get('auth_error') ?? '').slice(0, 200);
}

/* The provider marks. lucide dropped its brand icons, so these are inline. */

const GoogleMark: React.FC = () => (
  <svg width="16" height="16" viewBox="0 0 48 48" aria-hidden="true" focusable="false">
    <path
      fill="#FFC107"
      d="M43.611 20.083H42V20H24v8h11.303c-1.649 4.657-6.08 8-11.303 8-6.627 0-12-5.373-12-12s5.373-12 12-12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 12.955 4 4 12.955 4 24s8.955 20 20 20 20-8.955 20-20c0-1.341-.138-2.65-.389-3.917z"
    />
    <path
      fill="#FF3D00"
      d="M6.306 14.691l6.571 4.819C14.655 15.108 18.961 12 24 12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 16.318 4 9.656 8.337 6.306 14.691z"
    />
    <path
      fill="#4CAF50"
      d="M24 44c5.166 0 9.86-1.977 13.409-5.192l-6.19-5.238A11.91 11.91 0 0 1 24 36c-5.202 0-9.619-3.317-11.283-7.946l-6.522 5.025C9.505 39.556 16.227 44 24 44z"
    />
    <path
      fill="#1976D2"
      d="M43.611 20.083H42V20H24v8h11.303a12.04 12.04 0 0 1-4.087 5.571l.003-.002 6.19 5.238C36.971 39.205 44 34 44 24c0-1.341-.138-2.65-.389-3.917z"
    />
  </svg>
);

const GitHubMark: React.FC = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true" focusable="false">
    <path
      fillRule="evenodd"
      clipRule="evenodd"
      d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27s1.36.09 2 .27c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.012 8.012 0 0 0 16 8c0-4.42-3.58-8-8-8z"
    />
  </svg>
);

/**
 * Sign in / create an account against the local API - with Google, with
 * GitHub, or with an email address and a password. Guests can keep playing
 * without an account; their browser-only progress is merged in when they
 * sign up.
 *
 * The provider buttons appear only when the server says it has credentials
 * for them. With none configured this modal is exactly what it always was.
 */
export const AuthModal: React.FC<AuthModalProps> = ({ isOpen, onClose }) => {
  const { loginWithEmail, signupWithEmail, continueAsGuest, serverStatus, user, oauthProviders } = useSession();
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [errorMsg, setErrorMsg] = useState(authErrorFromUrl);
  const [loading, setLoading] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);
  const firstFieldRef = useRef<HTMLInputElement>(null);

  useFocusTrap(dialogRef, isOpen, () =>
    firstFieldRef.current && !firstFieldRef.current.disabled ? firstFieldRef.current : dialogRef.current
  );

  // The reason has been read onto the screen; take it out of the address bar
  // so a refresh, a back button or a shared link does not repeat it.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (!params.has('auth_error')) return;
    params.delete('auth_error');
    const query = params.toString();
    window.history.replaceState(null, '', `${window.location.pathname}${query ? `?${query}` : ''}${window.location.hash}`);
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const offline = serverStatus === 'offline';
  const isGuest = !user || user.provider === 'guest';

  // Only providers the server actually has credentials for. A full page
  // navigation, not a fetch: the server answers with a redirect to the
  // provider, and nothing secret ever reaches the browser.
  const providers = [
    { id: 'google', label: 'Continue with Google', mark: <GoogleMark />, enabled: Boolean(oauthProviders?.google) },
    { id: 'github', label: 'Continue with GitHub', mark: <GitHubMark />, enabled: Boolean(oauthProviders?.github) }
  ].filter((p) => p.enabled);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setLoading(true);
    try {
      if (isSignUp) await signupWithEmail(email, username, password);
      else await loginWithEmail(email, password);
      onClose();
    } catch (err: any) {
      setErrorMsg(err?.message || 'Authentication failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay !z-[600]" onMouseDown={onClose}>
      <div
        onMouseDown={(e) => e.stopPropagation()}
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={isSignUp ? 'Create an account' : 'Sign in'}
        tabIndex={-1}
        className="modal-card !w-[min(26rem,100%)] !h-auto !max-h-[92vh] overflow-y-auto"
      >
        <div className="modal-header items-center">
          <div className="modal-header-main flex items-center gap-3">
            <DevlingoLogo size="md" decorative />
            <div>
              <div className="modal-stage-badge">CodeConsist account</div>
              <h3 className="modal-title">{isSignUp ? 'Create an account' : 'Sign in'}</h3>
            </div>
          </div>
          <button type="button" className="modal-close-btn" onClick={onClose} aria-label="Close">
            <X size={16} />
          </button>
        </div>

        <div className="modal-body">
          {offline && (
            <div className="notice notice-warn">
              The API server is not running, so accounts are unavailable. Start it with <code>npm run dev:api</code>, or keep
              practising as a guest — progress is saved in this browser either way.
            </div>
          )}

          {errorMsg && (
            <div className="notice notice-error" role="alert">
              {errorMsg}
            </div>
          )}

          {providers.length > 0 && !offline && (
            <>
              <div className="flex flex-col gap-2">
                {providers.map((provider) => (
                  <Button
                    key={provider.id}
                    block
                    disabled={loading}
                    onClick={() => window.location.assign(oauthStartUrl(provider.id))}
                  >
                    {provider.mark}
                    {provider.label}
                  </Button>
                ))}
              </div>
              <p className="text-xs text-fg-muted text-center">
                We only ever receive your name, email address and picture — never your password.
              </p>
              <div className="flex items-center gap-3">
                <div className="flex-1 h-px bg-border-subtle" />
                <span className="text-xs text-fg-muted font-mono">or use an email address</span>
                <div className="flex-1 h-px bg-border-subtle" />
              </div>
            </>
          )}

          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div>
              <label className="field-label" htmlFor="auth-email">
                Email
              </label>
              <input
                id="auth-email"
                ref={firstFieldRef}
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full"
                placeholder="developer@example.com"
                disabled={offline || loading}
              />
            </div>

            {isSignUp && (
              <div>
                <label className="field-label" htmlFor="auth-username">
                  Username
                </label>
                <input
                  id="auth-username"
                  type="text"
                  required
                  minLength={2}
                  maxLength={24}
                  autoComplete="username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="w-full"
                  placeholder="How you appear on the leaderboard"
                  disabled={offline || loading}
                />
              </div>
            )}

            <div>
              <label className="field-label" htmlFor="auth-password">
                Password
              </label>
              <input
                id="auth-password"
                type="password"
                required
                minLength={8}
                autoComplete={isSignUp ? 'new-password' : 'current-password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full"
                placeholder={isSignUp ? 'At least 8 characters' : ''}
                disabled={offline || loading}
              />
            </div>

            <Button type="submit" variant="primary" block disabled={offline || loading}>
              {loading ? 'Please wait…' : isSignUp ? 'Create account' : 'Sign in'}
            </Button>
          </form>

          {isGuest && (
            <>
              <div className="flex items-center gap-3">
                <div className="flex-1 h-px bg-border-subtle" />
                <span className="text-xs text-fg-muted font-mono">or</span>
                <div className="flex-1 h-px bg-border-subtle" />
              </div>

              <Button
                block
                onClick={() => {
                  continueAsGuest();
                  onClose();
                }}
              >
                Continue as a guest
              </Button>
              <p className="text-xs text-fg-muted text-center">
                Guest progress lives in this browser only. Sign in later and it is merged into your account.
              </p>
            </>
          )}

          <div className="text-center text-sm text-fg-secondary pt-1">
            {isSignUp ? 'Already have an account?' : "Don't have an account?"}{' '}
            <button
              type="button"
              onClick={() => {
                setIsSignUp(!isSignUp);
                setErrorMsg('');
              }}
              className="text-fg font-medium hover:underline underline-offset-2"
            >
              {isSignUp ? 'Sign in' : 'Sign up'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
