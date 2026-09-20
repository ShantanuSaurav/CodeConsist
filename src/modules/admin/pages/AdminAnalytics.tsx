import React, { useEffect, useState } from 'react';
import { AnalyticsSummary, adminApi } from '../services/adminApi';
import { AdminPageHeader, Card, EmptyState, ErrorText, Spinner, Table } from '../components/ui';
import { ProgressBar } from '@/ui';

const LANGUAGE_LABEL: Record<string, string> = { javascript: 'JavaScript', python: 'Python', c: 'C', cpp: 'C++' };

/**
 * /admin/analytics. Every number here is derived from real solve/attempt
 * records in server/db.js's progress store - "most missed" is attempted-but-
 * rarely-solved, which is an honest signal for "too hard or badly worded",
 * never invented (see the route's comment in server/admin.js).
 */
export const AdminAnalytics: React.FC = () => {
  const [data, setData] = useState<AnalyticsSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    adminApi
      .analytics()
      .then(setData)
      .catch((err) => setError(err.message ?? 'Failed to load analytics.'));
  }, []);

  if (error) return <ErrorText>{error}</ErrorText>;
  if (!data) return <Spinner label="Loading analytics…" />;

  return (
    <div>
      <AdminPageHeader title="Analytics" description="Derived from real solve and attempt records. Nothing here is invented." />

      <div className="grid lg:grid-cols-2 gap-6 mb-6">
        <Card>
          <h2 className="text-sm font-medium text-fg mb-4">Challenges by language</h2>
          {Object.keys(data.challengesByLanguage).length === 0 ? (
            <EmptyState>No content yet.</EmptyState>
          ) : (
            <div className="space-y-2">
              {Object.entries(data.challengesByLanguage).map(([lang, count]) => {
                const max = Math.max(...Object.values(data.challengesByLanguage));
                return (
                  <div key={lang} className="flex items-center gap-3">
                    <span className="w-20 text-sm text-fg-secondary shrink-0">{LANGUAGE_LABEL[lang] ?? lang}</span>
                    <ProgressBar value={(count / max) * 100} size="sm" tone="neutral" className="flex-1" label={`${count} ${lang} challenges`} />
                    <span className="text-xs font-mono tabular-nums text-fg w-8 text-right">{count}</span>
                  </div>
                );
              })}
            </div>
          )}
        </Card>

        <Card>
          <h2 className="text-sm font-medium text-fg mb-2">Solves by stage</h2>
          {data.byStage.length === 0 ? (
            <EmptyState>No content yet.</EmptyState>
          ) : (
            <div className="max-h-56 overflow-y-auto scroll-thin row-list">
              {data.byStage.map((s) => (
                <div key={s.stageId} className="row py-2 text-sm">
                  <span className="text-fg-secondary truncate">{s.name}</span>
                  <span className="font-mono text-xs tabular-nums text-fg shrink-0 ml-2">{s.totalSolves}</span>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      <Card className="p-0 overflow-hidden">
        <div className="panel-head">
          <div>
            <h2 className="panel-title">Most missed challenges</h2>
            <p className="text-xs text-fg-muted mt-0.5">
              Attempted at least 3 times with more attempts than solves - a real signal something may be too hard or unclear.
            </p>
          </div>
        </div>
        {data.mostMissed.length === 0 ? (
          <EmptyState>Not enough attempts yet to surface anything.</EmptyState>
        ) : (
          <Table>
            <thead>
              <tr>
                <th>Challenge</th>
                <th>Attempts</th>
                <th>Solved</th>
              </tr>
            </thead>
            <tbody>
              {data.mostMissed.map((m) => (
                <tr key={m.id}>
                  <td className="cell-primary">{m.title}</td>
                  <td className="cell-num">{m.attempts}</td>
                  <td className="cell-num">{m.solved}</td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </div>
  );
};
