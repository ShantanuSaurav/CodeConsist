import React, { useEffect, useState } from 'react';
import { AuditEntry, adminApi } from '../services/adminApi';
import { AdminPageHeader, Card, EmptyState, ErrorText, Spinner, Table } from '../components/ui';

/**
 * /admin/audit-log. Every admin mutation appends one entry here
 * (server/db.js's appendAudit) - who, what action, on which target, and a
 * `details` object built ONLY from ids/flags/numbers by the route itself
 * (never a raw request body), so it is structurally impossible for a
 * password or token to end up in this log.
 */
export const AdminAuditLog: React.FC = () => {
  const [entries, setEntries] = useState<AuditEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    adminApi
      .auditLog(200)
      .then((res) => setEntries(res.entries))
      .catch((err) => setError(err.message ?? 'Failed to load the audit log.'));
  }, []);

  if (error) return <ErrorText>{error}</ErrorText>;

  return (
    <div>
      <AdminPageHeader title="Audit log" description="Every admin action, newest first. Never contains a password, hash, token, or other secret." />

      {!entries ? (
        <Spinner />
      ) : entries.length === 0 ? (
        <EmptyState>No admin actions recorded yet.</EmptyState>
      ) : (
        <Card className="p-0 overflow-hidden">
          <Table>
            <thead>
              <tr>
                <th>When</th>
                <th>Admin</th>
                <th>Action</th>
                <th>Target</th>
                <th>Details</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((e) => (
                <tr key={e.id}>
                  <td className="cell-mono text-fg-muted whitespace-nowrap">{new Date(e.at).toLocaleString()}</td>
                  <td className="cell-primary">{e.adminUsername}</td>
                  <td className="cell-mono">{e.action}</td>
                  <td className="cell-mono">{e.target ?? '—'}</td>
                  <td className="cell-mono text-fg-muted max-w-xs truncate">{e.details ? JSON.stringify(e.details) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Card>
      )}
    </div>
  );
};
