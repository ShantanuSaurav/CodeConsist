import React, { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, RefreshCw, XCircle } from 'lucide-react';
import { adminApi } from '../services/adminApi';
import { Badge, Button, Card, EmptyState, Spinner } from '../components/ui';

type Status = Awaited<ReturnType<typeof adminApi.excelStatus>>;

/**
 * /admin/excel. Devlingo's own database is always the source of truth -
 * this page only reports on and controls the optional, best-effort mirror
 * into a Microsoft Excel table (see server/excel.js). Signup, login and
 * progress never depend on anything here succeeding.
 */
export const AdminExcelSettings: React.FC = () => {
  const [status, setStatus] = useState<Status | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [busy, setBusy] = useState<'test' | 'sync' | 'retry' | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  const load = useCallback(() => {
    adminApi
      .excelStatus()
      .then(setStatus)
      .catch((err) => setError(err.message ?? 'Failed to load Excel sync status.'));
  }, []);

  useEffect(() => load(), [load]);

  const runTest = async () => {
    setBusy('test');
    setTestResult(null);
    try {
      setTestResult(await adminApi.excelTestConnection());
    } catch (err: any) {
      setTestResult({ ok: false, message: err.message ?? 'Test failed.' });
    } finally {
      setBusy(null);
    }
  };

  const runSyncAll = async () => {
    setBusy('sync');
    setActionMessage(null);
    try {
      const res = await adminApi.excelSyncNow();
      setActionMessage(res.message ?? `Synced ${res.synced}/${res.total} users (${res.failed} failed).`);
      load();
    } catch (err: any) {
      setActionMessage(err.message ?? 'Sync failed.');
    } finally {
      setBusy(null);
    }
  };

  const runRetryFailed = async () => {
    setBusy('retry');
    setActionMessage(null);
    try {
      const res = await adminApi.excelRetryFailed();
      setActionMessage(res.message ?? `Retried ${res.retried} user(s); ${res.stillFailing} still failing.`);
      load();
    } catch (err: any) {
      setActionMessage(err.message ?? 'Retry failed.');
    } finally {
      setBusy(null);
    }
  };

  if (error) return <p className="text-red-500 text-sm">{error}</p>;
  if (!status) return <Spinner label="Loading Excel sync status…" />;

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-6">Microsoft Excel sync</h1>

      <Card className="mb-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Configuration</h2>
          <Badge tone={status.configured ? 'success' : 'default'}>{status.configured ? 'Configured' : 'Not configured'}</Badge>
        </div>
        {!status.configured && (
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
            Excel sync is not set up. Signup, login and progress all work normally without it - set the MICROSOFT_* variables described
            in .env.example, then restart the server, to enable it.
          </p>
        )}
        <div className="grid sm:grid-cols-3 gap-3 text-sm">
          <div className="flex items-center gap-2">
            {status.tenantConfigured ? (
              <CheckCircle2 size={16} className="text-emerald-500" />
            ) : (
              <XCircle size={16} className="text-gray-400" />
            )}
            <span className="text-gray-700 dark:text-gray-300">Azure tenant</span>
          </div>
          <div className="flex items-center gap-2">
            {status.clientConfigured ? (
              <CheckCircle2 size={16} className="text-emerald-500" />
            ) : (
              <XCircle size={16} className="text-gray-400" />
            )}
            <span className="text-gray-700 dark:text-gray-300">App credentials</span>
          </div>
          <div className="flex items-center gap-2">
            {status.workbookConfigured ? (
              <CheckCircle2 size={16} className="text-emerald-500" />
            ) : (
              <XCircle size={16} className="text-gray-400" />
            )}
            <span className="text-gray-700 dark:text-gray-300">Workbook location</span>
          </div>
        </div>
        <div className="text-xs text-gray-500 dark:text-gray-400 mt-3">
          Worksheet "{status.worksheetName}", table "{status.tableName}".
        </div>
      </Card>

      <Card className="mb-6">
        <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-4">Actions</h2>
        <div className="flex flex-wrap gap-2 mb-3">
          <Button variant="secondary" onClick={runTest} disabled={busy !== null}>
            <RefreshCw size={14} className="inline mr-1.5" />
            {busy === 'test' ? 'Testing…' : 'Test connection'}
          </Button>
          <Button variant="secondary" onClick={runSyncAll} disabled={busy !== null || !status.configured}>
            {busy === 'sync' ? 'Syncing…' : 'Sync users now'}
          </Button>
          <Button
            variant="secondary"
            onClick={runRetryFailed}
            disabled={busy !== null || !status.configured || status.sync.failures.length === 0}
          >
            {busy === 'retry' ? 'Retrying…' : `Retry failed syncs (${status.sync.failures.length})`}
          </Button>
        </div>
        {testResult && (
          <p className={`text-sm ${testResult.ok ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500'}`}>{testResult.message}</p>
        )}
        {actionMessage && <p className="text-sm text-gray-600 dark:text-gray-400">{actionMessage}</p>}
        {status.sync.lastFullSyncAt && (
          <p className="text-xs text-gray-400 mt-2">Last full sync: {new Date(status.sync.lastFullSyncAt).toLocaleString()}</p>
        )}
      </Card>

      <Card>
        <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-4">Recent failures</h2>
        {status.sync.failures.length === 0 ? (
          <EmptyState>No sync failures recorded.</EmptyState>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-gray-400 border-b border-black/5 dark:border-white/5">
                <th className="py-2 font-medium">User</th>
                <th className="py-2 font-medium">Reason</th>
                <th className="py-2 font-medium">Error</th>
                <th className="py-2 font-medium">When</th>
              </tr>
            </thead>
            <tbody>
              {status.sync.failures.map((f) => (
                <tr key={f.id} className="border-b border-black/5 dark:border-white/5 last:border-0">
                  <td className="py-2 text-gray-900 dark:text-white">{f.username}</td>
                  <td className="py-2 text-gray-700 dark:text-gray-300">{f.reason}</td>
                  <td className="py-2 text-gray-500 dark:text-gray-400 max-w-xs truncate">{f.error}</td>
                  <td className="py-2 text-gray-500 dark:text-gray-400 whitespace-nowrap">{new Date(f.at).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
};
