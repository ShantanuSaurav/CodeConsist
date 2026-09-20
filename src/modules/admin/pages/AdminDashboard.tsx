import React, { useEffect, useState } from 'react';
import { DashboardSummary, adminApi } from '../services/adminApi';
import { AdminPageHeader, Badge, Card, ErrorText, Spinner } from '../components/ui';
import { Stat } from '@/ui';

/**
 * /admin - real numbers only, straight from server/admin.js's /dashboard
 * route (which itself only ever aggregates server/db.js's own records).
 * Nothing here is sample data or a placeholder - a fresh install with no
 * learners yet shows exactly that. There is no "Admins" count here: there is
 * always exactly one administrator (a separate record, not a learner row -
 * see server/db.js), so a count of it would never be informative.
 */
export const AdminDashboard: React.FC = () => {
  const [data, setData] = useState<DashboardSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    adminApi
      .dashboard()
      .then(setData)
      .catch((err) => setError(err.message ?? 'Failed to load the dashboard.'));
  }, []);

  if (error) return <ErrorText>{error}</ErrorText>;
  if (!data) return <Spinner label="Loading dashboard…" />;

  const maxSignups = Math.max(1, ...data.signupsByDay.map((d) => d.signups));

  const figures: Array<[string, string | number, string?]> = [
    ['Users', data.totals.users],
    ['Premium', data.totals.premium],
    ['Active · 7d', data.totals.activeLast7Days],
    ['Stages', data.totals.stages],
    ['Challenges', data.totals.challenges],
    ['XP awarded', data.totals.totalXpAwarded.toLocaleString()],
    ['Solves', data.totals.totalSolves.toLocaleString()]
  ];

  return (
    <div>
      <AdminPageHeader title="Dashboard" description="Live totals from this server's own records." />

      <div className="panel mb-6">
        <dl className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 divide-y sm:divide-y-0 divide-border-subtle sm:divide-x">
          {figures.map(([label, value]) => (
            <div key={label} className="px-4 py-3">
              <Stat label={label} value={value} />
            </div>
          ))}
        </dl>
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        <Card>
          <div className="flex items-baseline justify-between mb-4">
            <h2 className="text-sm font-medium text-fg">Signups</h2>
            <span className="text-xs text-fg-muted">Last 14 days</span>
          </div>
          <div className="flex items-end gap-1 h-28">
            {data.signupsByDay.map((d) => (
              <div key={d.day} className="flex-1 flex flex-col items-center justify-end h-full">
                <div
                  className="w-full rounded-[2px] bg-accent/70 hover:bg-accent transition-colors"
                  style={{ height: `${Math.max(3, (d.signups / maxSignups) * 100)}%` }}
                  title={`${d.day}: ${d.signups}`}
                />
              </div>
            ))}
          </div>
          <div className="flex justify-between text-[11px] font-mono text-fg-muted mt-2">
            <span>{data.signupsByDay[0]?.day}</span>
            <span>{data.signupsByDay[data.signupsByDay.length - 1]?.day}</span>
          </div>
        </Card>

        <Card>
          <h2 className="text-sm font-medium text-fg mb-2">Integrations</h2>
          <div className="row-list">
            <div className="row">
              <span className="text-sm text-fg-secondary">Judge0 (compiled languages)</span>
              <Badge tone={data.judge0Configured ? 'success' : 'default'}>{data.judge0Configured ? 'Configured' : 'Not configured'}</Badge>
            </div>
            <div className="row">
              <span className="text-sm text-fg-secondary">Microsoft Excel sync</span>
              <Badge tone={data.excel.configured ? 'success' : 'default'}>{data.excel.configured ? 'Configured' : 'Not configured'}</Badge>
            </div>
          </div>
          {!data.excel.configured && (
            <p className="text-xs text-fg-muted mt-3">See Excel sync in the sidebar to check what's missing, or .env.example for setup steps.</p>
          )}
        </Card>
      </div>
    </div>
  );
};
