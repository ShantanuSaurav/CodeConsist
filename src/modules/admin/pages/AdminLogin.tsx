import React, { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { Eye, EyeOff, ShieldCheck } from 'lucide-react';
import { AdminApiError, useAdminAuth } from '../services/AdminAuthContext';
import { Button } from '../components/ui';

/**
 * /admin/login - Devlingo's administrator console sign-in.
 *
 * Deliberately NOT the learner login screen wearing different colors: there
 * is no email field, no "Sign up" link (there is no public admin
 * registration - only the one administrator account configured via
 * ADMIN_USER_ID/ADMIN_PASSWORD, or changed later from
 * /admin/settings/security, can ever sign in here), and the layout is a
 * plain, centred operations form rather than a product page, so this always
 * reads as an administrative surface.
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
    <div className="min-h-screen flex items-center justify-center bg-bg px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="flex items-center gap-2 mb-6">
          <span className="font-mono text-xs text-accent" aria-hidden="true">
            &lt;/&gt;
          </span>
          <span className="text-fg font-semibold tracking-tight">Devlingo</span>
          <span className="badge badge-mono">admin</span>
        </div>

        <div className="panel">
          <div className="panel-head">
            <div className="flex items-center gap-2">
              <ShieldCheck size={15} className="text-fg-muted" />
              <h1 className="panel-title">Administrator sign in</h1>
            </div>
          </div>
          <form onSubmit={onSubmit} autoComplete="off" className="panel-body">
            <label className="block mb-4">
              <span className="field-label">Admin User ID</span>
              <input
                type="text"
                required
                autoFocus
                autoComplete="username"
                value={userId}
                onChange={(e) => setUserId(e.target.value)}
                placeholder="e.g. devlingo-admin"
                className="w-full"
              />
            </label>

            <label className="block mb-5">
              <span className="field-label">Admin Password</span>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full !pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-1 top-1/2 -translate-y-1/2 btn btn-ghost btn-sm btn-icon"
                  aria-pressed={showPassword}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              </div>
            </label>

            {error && (
              <p className="text-sm text-error mb-4" role="alert">
                {error}
              </p>
            )}

            <Button type="submit" variant="primary" className="w-full" disabled={submitting}>
              {submitting ? 'Signing in…' : 'Log in'}
            </Button>
          </form>
        </div>

        <p className="text-center text-xs text-fg-muted mt-4">Administrator access only. There is no public registration for this console.</p>
      </div>
    </div>
  );
};
