import React, { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { X } from 'lucide-react';
import { useSession } from '@/platform/session';
import { useFocusTrap } from '@/ui/hooks/useFocusTrap';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const FIELD =
  'w-full px-4 py-2.5 bg-gray-50 dark:bg-[#161b22] border border-black/10 dark:border-white/10 rounded-xl text-gray-900 dark:text-white placeholder:text-gray-400 focus:outline-none focus:border-[var(--color-primary)] focus:ring-2 focus:ring-[var(--color-primary)]/20 transition-all disabled:opacity-50 shadow-xs';

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
    <div
      className="fixed inset-0 z-[600] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
      onMouseDown={onClose}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        onMouseDown={(e) => e.stopPropagation()}
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={isSignUp ? 'Create an account' : 'Sign in'}
        tabIndex={-1}
        className="bg-white dark:bg-[#0d1117] border border-black/10 dark:border-white/10 rounded-2xl p-6 w-full max-w-md shadow-2xl relative outline-none max-h-[92vh] overflow-y-auto"
      >
        <div className="flex justify-between items-start mb-6">
          <div>
            <div className="text-[var(--color-primary)] font-mono text-xs font-bold uppercase tracking-wider mb-1">
              Authentication
            </div>
            <h3 className="text-2xl font-bold text-gray-900 dark:text-white">
              {isSignUp ? 'Join Devlingo' : 'Welcome Back'}
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors"
            aria-label="Close"
          >
            <X size={24} />
          </button>
        </div>

        <div className="space-y-4">
          {offline && (
            <div className="bg-amber-500/10 border border-amber-500/30 text-amber-700 dark:text-amber-300 text-sm p-3 rounded-lg">
              The API server is not running, so accounts are unavailable. Start it with{' '}
              <code className="font-mono">npm run dev:api</code>, or keep playing as a guest — progress is saved in
              this browser either way.
            </div>
          )}

          {errorMsg && (
            <div className="bg-red-500/10 border border-red-500/20 text-red-500 text-sm p-3 rounded-lg" role="alert">
              {errorMsg}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1" htmlFor="auth-email">
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
                className={FIELD}
                placeholder="developer@example.com"
                disabled={offline || loading}
              />
            </div>

            {isSignUp && (
              <div>
                <label
                  className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
                  htmlFor="auth-username"
                >
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
                  className={FIELD}
                  placeholder="How you appear on the leaderboard"
                  disabled={offline || loading}
                />
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1" htmlFor="auth-password">
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
                className={FIELD}
                placeholder={isSignUp ? 'At least 8 characters' : '••••••••'}
                disabled={offline || loading}
              />
            </div>

            <button
              type="submit"
              disabled={offline || loading}
              className="w-full py-3 bg-[var(--color-primary)] text-white dark:text-black font-bold rounded-xl hover:brightness-105 hover:-translate-y-0.5 active:scale-[0.98] shadow-[0_4px_14px_rgba(22,163,11,0.25)] dark:shadow-[0_4px_16px_rgba(57,255,20,0.3)] transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none"
            >
              {loading ? 'Please wait...' : isSignUp ? 'Create Account' : 'Sign In'}
            </button>
          </form>

          {isGuest && (
            <>
              <div className="flex items-center space-x-4 py-1">
                <div className="flex-1 h-px bg-black/5 dark:bg-white/10" />
                <span className="text-sm text-gray-500 font-mono">OR</span>
                <div className="flex-1 h-px bg-black/5 dark:bg-white/10" />
              </div>

              <button
                type="button"
                onClick={() => {
                  continueAsGuest();
                  onClose();
                }}
                className="w-full py-2.5 bg-black/5 dark:bg-white/5 text-gray-900 dark:text-white font-medium rounded-xl hover:bg-black/10 dark:hover:bg-white/10 hover:-translate-y-0.5 active:scale-[0.98] transition-all border border-black/5 dark:border-white/5 text-sm cursor-pointer shadow-xs"
              >
                ⚡ Continue as a guest
              </button>
              <p className="text-xs text-gray-500 text-center">
                Guest progress lives in this browser only. Sign in later and it is merged into your account.
              </p>
            </>
          )}

          <div className="text-center text-sm text-gray-600 dark:text-gray-400 pt-2">
            {isSignUp ? 'Already have an account?' : "Don't have an account?"}{' '}
            <button
              type="button"
              onClick={() => {
                setIsSignUp(!isSignUp);
                setErrorMsg('');
              }}
              className="text-[var(--color-primary)] font-semibold hover:underline"
            >
              {isSignUp ? 'Sign In' : 'Sign Up'}
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
};
