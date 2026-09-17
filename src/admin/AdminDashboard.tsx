import React, { useEffect, useState } from 'react';
import { Activity, BookOpen, FileSpreadsheet, ListChecks, Users, Zap } from 'lucide-react';
import { DashboardSummary, adminApi } from './adminApi';
import { Badge, Card, Spinner } from './components/ui';

const StatCard: React.FC<{ icon: React.ReactNode; label: string; value: string | number }> = ({ icon, label, value }) => (
  <Card className="flex items-center gap-4">
    <div className="w-11 h-11 rounded-xl bg-[var(--color-primary)]/10 text-[var(--color-primary)] flex items-center justify-center shrink-0">
      {icon}
    </div>
    <div>
      <div className="text-2xl font-bold text-gray-900 dark:text-white leading-tight">{value}</div>
      <div className="text-sm text-gray-500 dark:text-gray-400">{label}</div>
    </div>
  </Card>
);

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

  if (error) return <p className="text-red-500 text-sm">{error}</p>;
  if (!data) return <Spinner label="Loading dashboard…" />;

  const maxSignups = Math.max(1, ...data.signupsByDay.map((d) => d.signups));

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-6">Dashboard</h1>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard icon={<Users size={20} />} label="Total users" value={data.totals.users} />
        <StatCard icon={<Zap size={20} />} label="Premium accounts" value={data.totals.premium} />
        <StatCard icon={<Activity size={20} />} label="Active last 7 days" value={data.totals.activeLast7Days} />
        <StatCard icon={<BookOpen size={20} />} label="Stages" value={data.totals.stages} />
        <StatCard icon={<ListChecks size={20} />} label="Challenges" value={data.totals.challenges} />
        <StatCard icon={<Zap size={20} />} label="Total XP awarded" value={data.totals.totalXpAwarded.toLocaleString()} />
        <StatCard icon={<ListChecks size={20} />} label="Total solves" value={data.totals.totalSolves.toLocaleString()} />
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        <Card>
          <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-4">Signups, last 14 days</h2>
          <div className="flex items-end gap-1.5 h-32">
            {data.signupsByDay.map((d) => (
              <div key={d.day} className="flex-1 flex flex-col items-center justify-end gap-1 group relative">
                <div
                  className="w-full rounded-t bg-[var(--color-primary)]/70 group-hover:bg-[var(--color-primary)] transition-colors"
                  style={{ height: `${Math.max(4, (d.signups / maxSignups) * 100)}%` }}
                  title={`${d.day}: ${d.signups}`}
                />
              </div>
            ))}
          </div>
          <div className="flex justify-between text-[10px] text-gray-400 mt-2">
            <span>{data.signupsByDay[0]?.day}</span>
            <span>{data.signupsByDay[data.signupsByDay.length - 1]?.day}</span>
          </div>
        </Card>

        <Card>
          <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-4">Integrations</h2>
          <div className="flex items-center justify-between py-2 border-b border-black/5 dark:border-white/5">
            <span className="text-sm text-gray-700 dark:text-gray-300">Judge0 (compiled languages)</span>
            <Badge tone={data.judge0Configured ? 'success' : 'default'}>{data.judge0Configured ? 'Configured' : 'Not configured'}</Badge>
          </div>
          <div className="flex items-center justify-between py-2">
            <span className="text-sm text-gray-700 dark:text-gray-300 flex items-center gap-2">
              <FileSpreadsheet size={16} /> Microsoft Excel sync
            </span>
            <Badge tone={data.excel.configured ? 'success' : 'default'}>{data.excel.configured ? 'Configured' : 'Not configured'}</Badge>
          </div>
          {!data.excel.configured && (
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
              See Excel Sync in the sidebar to check what's missing, or .env.example for setup steps.
            </p>
          )}
        </Card>
      </div>
    </div>
  );
};
