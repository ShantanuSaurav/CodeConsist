import React, { useEffect, useState } from 'react';
import { AnalyticsSummary, adminApi } from '../services/adminApi';
import { Card, EmptyState, Spinner } from '../components/ui';

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

  if (error) return <p className="text-red-500 text-sm">{error}</p>;
  if (!data) return <Spinner label="Loading analytics…" />;

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-6">Analytics</h1>

      <div className="grid lg:grid-cols-2 gap-6 mb-6">
        <Card>
          <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-4">Challenges by language</h2>
          {Object.keys(data.challengesByLanguage).length === 0 ? (
            <EmptyState>No content yet.</EmptyState>
          ) : (
            <div className="space-y-2">
              {Object.entries(data.challengesByLanguage).map(([lang, count]) => {
                const max = Math.max(...Object.values(data.challengesByLanguage));
                return (
                  <div key={lang} className="flex items-center gap-3">
                    <span className="w-20 text-sm text-gray-600 dark:text-gray-400 shrink-0">{LANGUAGE_LABEL[lang] ?? lang}</span>
                    <div className="flex-1 h-3 bg-black/5 dark:bg-white/5 rounded-full overflow-hidden">
                      <div className="h-full bg-[var(--color-primary)] rounded-full" style={{ width: `${(count / max) * 100}%` }} />
                    </div>
                    <span className="text-sm text-gray-700 dark:text-gray-300 w-8 text-right">{count}</span>
                  </div>
                );
              })}
            </div>
          )}
        </Card>

        <Card>
          <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-4">Solves by stage</h2>
          {data.byStage.length === 0 ? (
            <EmptyState>No content yet.</EmptyState>
          ) : (
            <div className="max-h-56 overflow-y-auto space-y-2">
              {data.byStage.map((s) => (
                <div key={s.stageId} className="flex items-center justify-between text-sm">
                  <span className="text-gray-700 dark:text-gray-300 truncate">{s.name}</span>
                  <span className="text-gray-500 dark:text-gray-400 shrink-0 ml-2">{s.totalSolves} solves</span>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      <Card>
        <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">Most missed challenges</h2>
        <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">
          Attempted at least 3 times with more attempts than solves - a real signal something may be too hard or unclear.
        </p>
        {data.mostMissed.length === 0 ? (
          <EmptyState>Not enough attempts yet to surface anything.</EmptyState>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-gray-400 border-b border-black/5 dark:border-white/5">
                <th className="py-2 font-medium">Challenge</th>
                <th className="py-2 font-medium">Attempts</th>
                <th className="py-2 font-medium">Solved</th>
              </tr>
            </thead>
            <tbody>
              {data.mostMissed.map((m) => (
                <tr key={m.id} className="border-b border-black/5 dark:border-white/5 last:border-0">
                  <td className="py-2 text-gray-900 dark:text-white">{m.title}</td>
                  <td className="py-2 text-gray-700 dark:text-gray-300">{m.attempts}</td>
                  <td className="py-2 text-gray-700 dark:text-gray-300">{m.solved}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
};
