import React, { useEffect, useState } from 'react';
import { AuditEntry, adminApi } from './adminApi';
import { Card, EmptyState, Spinner } from './components/ui';

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

  if (error) return <p className="text-red-500 text-sm">{error}</p>;

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">Audit log</h1>
      <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
        Every admin action, newest first. Never contains a password, hash, token, or other secret.
      </p>

      {!entries ? (
        <Spinner />
      ) : entries.length === 0 ? (
        <EmptyState>No admin actions recorded yet.</EmptyState>
      ) : (
        <Card className="p-0 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-gray-400 border-b border-black/5 dark:border-white/5">
                  <th className="px-4 py-3 font-medium">When</th>
                  <th className="px-4 py-3 font-medium">Admin</th>
                  <th className="px-4 py-3 font-medium">Action</th>
                  <th className="px-4 py-3 font-medium">Target</th>
                  <th className="px-4 py-3 font-medium">Details</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((e) => (
                  <tr key={e.id} className="border-b border-black/5 dark:border-white/5 last:border-0 align-top">
                    <td className="px-4 py-3 text-gray-500 dark:text-gray-400 whitespace-nowrap">{new Date(e.at).toLocaleString()}</td>
                    <td className="px-4 py-3 text-gray-900 dark:text-white">{e.adminUsername}</td>
                    <td className="px-4 py-3 text-gray-700 dark:text-gray-300 font-mono text-xs">{e.action}</td>
                    <td className="px-4 py-3 text-gray-700 dark:text-gray-300 font-mono text-xs">{e.target ?? '—'}</td>
                    <td className="px-4 py-3 text-gray-500 dark:text-gray-400 font-mono text-xs max-w-xs truncate">
                      {e.details ? JSON.stringify(e.details) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
};
