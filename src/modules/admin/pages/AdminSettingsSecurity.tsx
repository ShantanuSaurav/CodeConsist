import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { KeyRound } from 'lucide-react';
import { AdminApiError, adminApi } from '../services/adminApi';
import { useAdminAuth } from '../services/AdminAuthContext';
import { AdminPageHeader, Button, Card, ErrorText, Field } from '../components/ui';

const passwordInputClass = 'w-full';

/**
 * /admin/settings/security - the ONLY supported way to change the Admin
 * User ID and/or Password once the account exists (ADMIN_USER_ID/
 * ADMIN_PASSWORD in .env are only ever read on first bootstrap - see
 * server/admin-auth.js).
 *
 * Changing credentials requires the CURRENT password even though this page
 * is already behind a valid admin session - a live token alone is not
 * enough to change what governs every future session. On success the
 * server bumps `credentialsVersion`, which immediately invalidates every
 * previously issued admin token, including the one this very request used -
 * so this page always force-logs-out and sends the admin back to
 * /admin/login to sign in again with the new credentials.
 */
export const AdminSettingsSecurity: React.FC = () => {
  const { admin, clearSession } = useAdminAuth();
  const navigate = useNavigate();

  const [newUserId, setNewUserId] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!currentPassword) {
      setError('Enter your current password to confirm this change.');
      return;
    }
    if (!newUserId.trim() && !newPassword) {
      setError('Enter a new Admin User ID and/or a new password.');
      return;
    }
    if (newPassword && newPassword.length < 12) {
      setError('New password must be at least 12 characters.');
      return;
    }
    if (newPassword && newPassword !== confirmNewPassword) {
      setError('New password and confirmation do not match.');
      return;
    }

    setSubmitting(true);
    try {
      await adminApi.updateCredentials({
        currentPassword,
        newUserId: newUserId.trim() || undefined,
        newPassword: newPassword || undefined,
        confirmNewPassword: newPassword ? confirmNewPassword : undefined
      });
      // The token used to make this request is already invalid server-side
      // (credentialsVersion just changed) - clear it locally and send the
      // admin to sign in again with whatever they just set.
      clearSession();
      navigate('/admin/login', { replace: true, state: { credentialsChanged: true } });
    } catch (err) {
      setError(err instanceof AdminApiError ? err.message : 'Could not update credentials.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-xl">
      <AdminPageHeader
        title="Security"
        description="Change the Admin User ID and/or Admin Password used to sign in to this console. This is the only way to change them - the ADMIN_USER_ID/ADMIN_PASSWORD environment variables are only ever read once, the first time this server starts with no administrator account yet."
      />

      <Card>
        <div className="flex items-center gap-2 mb-5">
          <KeyRound size={15} className="text-fg-muted" />
          <h2 className="text-sm font-medium text-fg">Update admin credentials</h2>
        </div>

        <form onSubmit={onSubmit} autoComplete="off">
          <Field label="Current Admin User ID">
            <input type="text" disabled value={admin?.userId ?? ''} className={passwordInputClass} />
          </Field>

          <Field label="New Admin User ID" hint="Leave blank to keep your current User ID.">
            <input
              type="text"
              value={newUserId}
              onChange={(e) => setNewUserId(e.target.value)}
              placeholder={admin?.userId}
              className={passwordInputClass}
            />
          </Field>

          <Field label="Current Password" hint="Required to confirm this change.">
            <input
              type="password"
              required
              autoComplete="current-password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              className={passwordInputClass}
            />
          </Field>

          <Field label="New Password" hint="Leave blank to keep your current password. At least 12 characters if set.">
            <input
              type="password"
              autoComplete="new-password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className={passwordInputClass}
            />
          </Field>

          <Field label="Confirm New Password">
            <input
              type="password"
              autoComplete="new-password"
              value={confirmNewPassword}
              onChange={(e) => setConfirmNewPassword(e.target.value)}
              disabled={!newPassword}
              className={passwordInputClass}
            />
          </Field>

          {error && <ErrorText>{error}</ErrorText>}

          <Button type="submit" variant="primary" disabled={submitting}>
            {submitting ? 'Updating…' : 'Update admin credentials'}
          </Button>
          <p className="text-xs text-fg-muted mt-3">
            Saving this signs you out of every admin session, including this one - you'll need to sign back in with the new
            credentials.
          </p>
        </form>
      </Card>
    </div>
  );
};
