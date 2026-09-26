import React, { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, Check, Copy, KeyRound } from 'lucide-react';
import { adminApi } from '../services/adminApi';
import type { AdminUserRow, PasswordResetIssued, PasswordResetRow } from '../services/adminApi';
import { Badge, Button, Drawer, EmptyState, ErrorText, Spinner, Table } from './ui';

function when(iso: string | null | undefined): string {
  if (!iso) return '—';
  const at = new Date(iso);
  return Number.isNaN(at.getTime()) ? '—' : at.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

const STATUS_TONE: Record<PasswordResetRow['status'], 'success' | 'default' | 'warning' | 'danger'> = {
  active: 'success',
  used: 'default',
  expired: 'warning',
  revoked: 'danger'
};

/** The link to hand over: the server's own origin when it knows it, else this admin page's. */
function linkFor(issued: PasswordResetIssued): string {
  if (issued.url) return issued.url;
  return typeof window === 'undefined' ? issued.path : `${window.location.origin}${issued.path}`;
}

function isLocalLink(link: string): boolean {
  try {
    const host = new URL(link).hostname;
    return host === 'localhost' || host === '127.0.0.1' || host === '[::1]' || host.endsWith('.localhost');
  } catch {
    return false;
  }
}

/**
 * Users > Reset link: issue a one-time password reset link for a learner who
 * cannot sign in (there is no email in this app - the admin sends the link
 * privately). The full link is shown ONCE, here, with a Copy button; the
 * server keeps only a hash of it and never logs it. Issuing a new link
 * withdraws the learner's earlier open one. Earlier links are listed with
 * their status, and a live one can be revoked.
 */
export const PasswordResetDialog: React.FC<{ user: AdminUserRow | null; onClose: () => void; onChanged?: () => void }> = ({ user, onClose, onChanged }) => {
  const [resets, setResets] = useState<PasswordResetRow[] | null>(null);
  const [issued, setIssued] = useState<PasswordResetIssued | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async (userId: string) => {
    try {
      setResets((await adminApi.passwordResets(userId)).resets);
    } catch (err) {
      setError((err as Error).message ?? 'Could not load the reset links.');
    }
  }, []);

  useEffect(() => {
    setResets(null);
    setIssued(null);
    setCopied(false);
    setError(null);
    if (user) void load(user.id);
  }, [user, load]);

  if (!user) return null;

  const issue = async () => {
    setBusy(true);
    setError(null);
    setCopied(false);
    try {
      setIssued(await adminApi.issuePasswordReset(user.id));
      await load(user.id);
      onChanged?.();
    } catch (err) {
      setError((err as Error).message ?? 'Could not issue a link.');
    } finally {
      setBusy(false);
    }
  };

  const revoke = async (id: string) => {
    setBusy(true);
    setError(null);
    try {
      await adminApi.revokePasswordReset(id);
      if (issued?.reset.id === id) setIssued(null);
      await load(user.id);
      onChanged?.();
    } catch (err) {
      setError((err as Error).message ?? 'Could not revoke that link.');
    } finally {
      setBusy(false);
    }
  };

  const link = issued ? linkFor(issued) : '';

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
    } catch {
      setError('Could not copy - select the link and copy it by hand.');
    }
  };

  return (
    <Drawer open title={`Reset link: ${user.username}`} onClose={onClose} closable={!busy}>
      <div className="space-y-5 text-sm">
        <p className="text-fg-secondary">
          A one-time link {user.username} can open to set a new password - for when they cannot sign in. Setting it signs out every
          device they are signed in on.{user.hasPassword === false ? ' This account signs in with Google or GitHub only; the link gives it a password too.' : ''}
        </p>

        {error && <ErrorText>{error}</ErrorText>}

        {issued ? (
          <div className="rounded-md border border-border bg-surface-2 p-3 space-y-2">
            <div className="font-medium text-fg flex items-center gap-2">
              <KeyRound size={14} /> New link - shown only this once
            </div>
            <input type="text" readOnly value={link} className="w-full font-mono text-xs" aria-label="Password reset link" onFocus={(e) => e.currentTarget.select()} />
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="primary" size="sm" onClick={() => void copy()}>
                {copied ? <Check size={13} /> : <Copy size={13} />} {copied ? 'Copied' : 'Copy link'}
              </Button>
              <span className="text-xs text-fg-muted">Works once, until {when(issued.reset.expiresAt)}.</span>
            </div>
            <p className="flex items-start gap-2 text-warning text-xs">
              <AlertTriangle size={13} className="shrink-0 mt-0.5" />
              Send this privately; anyone with it can set this learner's password.
            </p>
            {isLocalLink(link) && (
              <p className="flex items-start gap-2 text-warning text-xs">
                <AlertTriangle size={13} className="shrink-0 mt-0.5" />
                This link points at this computer (localhost), so it only works here. Set APP_ORIGIN on the server to the public site to get a link
                that works for the learner, or replace the start of it by hand.
              </p>
            )}
          </div>
        ) : (
          <Button variant="primary" onClick={() => void issue()} disabled={busy}>
            <KeyRound size={14} /> {busy ? 'Issuing…' : 'Issue a reset link'}
          </Button>
        )}
        {issued && (
          <Button variant="secondary" size="sm" onClick={() => void issue()} disabled={busy}>
            Issue another (withdraws this one)
          </Button>
        )}

        <section>
          <h3 className="text-sm font-medium text-fg mb-2">Links issued for {user.username}</h3>
          {!resets ? (
            <Spinner label="Loading…" />
          ) : resets.length === 0 ? (
            <EmptyState>No reset links yet.</EmptyState>
          ) : (
            <Table>
              <thead>
                <tr>
                  <th>Issued</th>
                  <th>Expires</th>
                  <th>Status</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {resets.map((row) => (
                  <tr key={row.id}>
                    <td className="cell-mono text-fg-muted">{when(row.createdAt)}</td>
                    <td className="cell-mono text-fg-muted">{when(row.expiresAt)}</td>
                    <td>
                      <Badge tone={STATUS_TONE[row.status]}>{row.status}</Badge>
                      {row.usedAt && <div className="text-[11px] text-fg-muted mt-0.5">used {when(row.usedAt)}</div>}
                    </td>
                    <td className="text-right">
                      {row.status === 'active' && (
                        <Button variant="ghost" size="sm" disabled={busy} onClick={() => void revoke(row.id)} className="!text-fg-muted hover:!text-error">
                          Revoke
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </section>
      </div>
    </Drawer>
  );
};
