import React, { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { Eye, EyeOff, ShieldAlert } from 'lucide-react';
import { AdminApiError, useAdminAuth } from '../services/AdminAuthContext';
import { Button } from '../components/ui';

/**
 * /admin/login - Devlingo's administrator console sign-in.
 *
 * Deliberately NOT the learner login screen wearing different colors: there
 * is no email field, no "Sign up" link (there is no public admin
 * registration - only the one administrator account configured via
 * ADMIN_USER_ID/ADMIN_PASSWORD, or changed later from
 * /admin/settings/security, can ever sign in here), and the visual treatment
 * (dark, high-contrast, a caution-toned accent) is intentionally distinct
 * from the friendly learner app so this always reads as an administrative
 * surface, not another product page.
 *
 * A wrong Admin User ID, a wrong password, no admin account configured at
 * all, and a temporary lockout after repeated failures all produce the exact
 * same message from the server ("Invalid administrator credentials.") - this
 * screen just displays whatever the server says, never inferring or adding
 * detail of its own.
 */
export const AdminLogin: React.FC = () => {
  const { admin, loading, login } = useAdminAuth();
  const [userId, setUserId] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (!loading && admin) return <Navigate to="/admin" replace />;

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await login(userId, password);
    } catch (err) {
      setError(err instanceof AdminApiError ? err.message : 'Sign in failed.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#05070a] px-4">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center gap-3 mb-6 text-center">
          <span className="flex items-center justify-center w-12 h-12 rounded-xl bg-amber-500/10 border border-amber-500/30">
            <ShieldAlert size={24} className="text-amber-400" />
          </span>
          <div>
            <div className="flex items-center justify-center gap-2 text-xl font-bold tracking-wide text-white">
              <span className="text-amber-400 font-mono">&lt;/&gt;</span>
              DEVLINGO ADMIN
            </div>
            <p className="text-xs uppercase tracking-[0.2em] text-gray-500 mt-1">Administrator Login</p>
          </div>
        </div>

        <div className="bg-[#0d1117] border border-amber-500/10 rounded-2xl shadow-[0_0_0_1px_rgba(245,158,11,0.05)] p-6">
          <form onSubmit={onSubmit} autoComplete="off">
            <label className="block mb-4">
              <span className="block text-sm font-medium text-gray-300 mb-1">Admin User ID</span>
              <input
                type="text"
                required
                autoFocus
                autoComplete="username"
                value={userId}
                onChange={(e) => setUserId(e.target.value)}
                placeholder="e.g. devlingo-admin"
                className="w-full px-3.5 py-2.5 rounded-xl bg-[#05070a] border border-white/10 text-gray-100 text-sm focus:outline-none focus:border-amber-500/80 focus:ring-2 focus:ring-amber-500/20 transition-all shadow-xs"
              />
            </label>

            <label className="block mb-5">
              <span className="block text-sm font-medium text-gray-300 mb-1">Admin Password</span>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full px-3.5 py-2.5 pr-28 rounded-xl bg-[#05070a] border border-white/10 text-gray-100 text-sm focus:outline-none focus:border-amber-500/80 focus:ring-2 focus:ring-amber-500/20 transition-all shadow-xs"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs text-gray-400 hover:text-gray-200 transition-colors cursor-pointer"
                  aria-pressed={showPassword}
                >
                  {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
                  Show Password
                </button>
              </div>
            </label>

            {error && (
              <p className="text-sm text-red-400 mb-4" role="alert">
                {error}
              </p>
            )}

            <Button type="submit" variant="primary" className="w-full !bg-amber-500 hover:!bg-amber-400 !text-black shadow-[0_4px_14px_rgba(245,158,11,0.3)] hover:-translate-y-0.5 active:scale-[0.98] transition-all cursor-pointer py-2.5 rounded-xl" disabled={submitting}>
              {submitting ? 'Signing in…' : 'Log In'}
            </Button>
          </form>
        </div>

        <p className="text-center text-xs text-gray-600 mt-4">
          Administrator access only. There is no public registration for this console.
        </p>
      </div>
    </div>
  );
};
