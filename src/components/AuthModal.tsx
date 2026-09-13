import React, { useEffect, useRef, useState } from 'react';
import { useGame } from '../context/GameContext';
import { useFocusTrap } from '../lib/useFocusTrap';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const AuthModal: React.FC<AuthModalProps> = ({ isOpen, onClose }) => {
  const { loginWithEmail, signupWithEmail, continueAsGuest, serverStatus } = useGame();

  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const firstFieldRef = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  // Falls back to the dialog itself when the email field is disabled (offline).
  useFocusTrap(dialogRef, isOpen, () =>
    firstFieldRef.current && !firstFieldRef.current.disabled ? firstFieldRef.current : dialogRef.current
  );

  useEffect(() => {
    if (!isOpen) return;
    setError('');
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const offline = serverStatus === 'offline';

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      if (mode === 'signup') await signupWithEmail(email, username, password);
      else await loginWithEmail(email, password);
      onClose();
    } catch (err: any) {
      setError(err?.message ?? 'Authentication failed.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay" onMouseDown={onClose}>
      <div
        className="modal-card auth-card"
        onMouseDown={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={mode === 'signup' ? 'Create an account' : 'Sign in'}
        ref={dialogRef}
        tabIndex={-1}
      >
        <div className="modal-header">
          <div>
            <div className="modal-stage-badge">Account</div>
            <h3 className="modal-title">{mode === 'signup' ? 'Create an account' : 'Welcome back'}</h3>
          </div>
          <button type="button" className="modal-close-btn" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>

        <div className="modal-body">
          {offline && (
            <div className="notice notice-warn">
              The API server is not running, so accounts are unavailable. Start it with{' '}
              <code>npm run dev:api</code>, or keep playing as a guest — progress is saved in this
              browser either way.
            </div>
          )}

          {error && (
            <div className="notice notice-error" role="alert">
              {error}
            </div>
          )}

          <form onSubmit={submit} className="auth-form">
            <label className="field">
              <span>Email</span>
              <input
                ref={firstFieldRef}
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                disabled={offline || loading}
              />
            </label>

            {mode === 'signup' && (
              <label className="field">
                <span>Username</span>
                <input
                  type="text"
                  required
                  minLength={2}
                  maxLength={24}
                  autoComplete="username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="How you appear on the leaderboard"
                  disabled={offline || loading}
                />
              </label>
            )}

            <label className="field">
              <span>Password</span>
              <input
                type="password"
                required
                minLength={8}
                autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={mode === 'signup' ? 'At least 8 characters' : '••••••••'}
                disabled={offline || loading}
              />
            </label>

            <button
              type="submit"
              className="btn btn-solid auth-submit"
              disabled={offline || loading}
            >
              {loading ? 'Please wait…' : mode === 'signup' ? 'Create account' : 'Sign in'}
            </button>
          </form>

          <div className="auth-divider">
            <span>or</span>
          </div>

          <button
            type="button"
            className="btn btn-line auth-guest"
            onClick={() => {
              continueAsGuest();
              onClose();
            }}
          >
            Continue as a guest
          </button>
          <p className="auth-fineprint">
            Guest progress lives in this browser only. Sign in later and it is merged into your
            account.
          </p>

          <div className="auth-switch">
            {mode === 'signup' ? 'Already have an account?' : 'New here?'}{' '}
            <button
              type="button"
              onClick={() => {
                setMode(mode === 'signup' ? 'signin' : 'signup');
                setError('');
              }}
            >
              {mode === 'signup' ? 'Sign in' : 'Create one'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
