import React, { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { useSession } from '@/platform/session';
import { useFocusTrap } from '@/ui/hooks/useFocusTrap';
import { Button } from '@/ui/primitives/Button';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
}

/**
 * Sign in / create an account against the local API. Guests can keep playing
 * without one; their browser-only progress is merged in when they sign up.
 */
export const AuthModal: React.FC<AuthModalProps> = ({ isOpen, onClose }) => {
  const { loginWithEmail, signupWithEmail, continueAsGuest, serverStatus, user } = useSession();
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [loading, setLoading] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);
  const firstFieldRef = useRef<HTMLInputElement>(null);

  useFocusTrap(dialogRef, isOpen, () =>
    firstFieldRef.current && !firstFieldRef.current.disabled ? firstFieldRef.current : dialogRef.current
  );

  useEffect(() => {
    if (!isOpen) return;
    setErrorMsg('');
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const offline = serverStatus === 'offline';
  const isGuest = !user || user.provider === 'guest';

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
        <div className="modal-header">
          <div className="modal-header-main">
            <div className="modal-stage-badge">Account</div>
            <h3 className="modal-title">{isSignUp ? 'Create an account' : 'Sign in'}</h3>
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
