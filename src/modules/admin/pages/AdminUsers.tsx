import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Activity, Search, Trash2 } from 'lucide-react';
import { activityGridFromLog } from '@/platform/activity/log';
import { AdminUserRow, UserLearning, adminApi } from '../services/adminApi';
import { AdminPageHeader, Badge, Button, Card, ConfirmDialog, Drawer, EmptyState, ErrorText, Spinner, Table, Toggle } from '../components/ui';

const PROVIDER_LABEL: Record<string, string> = { google: 'Google', github: 'GitHub' };
/* The same heat scale as the learner dashboard. */
const HEAT = ['bg-surface-3', 'bg-accent/30', 'bg-accent/55', 'bg-accent/80', 'bg-accent'];

/** yyyy-mm-dd of an ISO timestamp, or an em dash. Times are noise in a list. */
function shortDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const at = new Date(iso);
  return Number.isNaN(at.getTime()) ? '—' : at.toISOString().slice(0, 10);
}

/** One learner's time zone, their last 14 weeks and the questions they miss most. */
const LearningDrawer: React.FC<{ user: AdminUserRow | null; onClose: () => void }> = ({ user, onClose }) => {
  const [data, setData] = useState<UserLearning | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setData(null);
    setError(null);
    if (!user) return;
    adminApi
      .userLearning(user.id)
      .then(setData)
      .catch((err) => setError(err.message ?? 'Could not load this learner’s activity.'));
  }, [user]);

  const grid = useMemo(() => (data ? activityGridFromLog(data.days, 14, data.today) : []), [data]);
  const totals = useMemo(() => {
    const days = Object.values(data?.days ?? {});
    return {
      active: days.filter((d) => d.lessons + d.tests + d.reSolves + d.mistakes > 0).length,
      xp: days.reduce((sum, d) => sum + d.xp, 0),
      mistakes: days.reduce((sum, d) => sum + d.mistakes, 0)
    };
  }, [data]);

  return (
    <Drawer open={Boolean(user)} title={user ? `Learning: ${user.username}` : ''} onClose={onClose} size="lg">
      {error && <ErrorText>{error}</ErrorText>}
      {!data && !error && <Spinner label="Loading activity…" />}
      {data && (
        <div className="space-y-6">
          <div className="flex flex-wrap gap-2 text-sm">
            <Badge>Time zone: {data.timeZone ?? 'server'}</Badge>
            {data.timeZoneSetAt && <Badge>set {shortDate(data.timeZoneSetAt)}</Badge>}
            <Badge>Today: {data.today}</Badge>
          </div>

          <section>
            <h3 className="text-sm font-medium text-fg mb-2">Last 14 weeks</h3>
            <div className="overflow-x-auto scroll-thin pb-1">
              <div className="flex gap-1">
                {grid.map((column, i) => (
                  <div key={i} className="flex flex-col gap-1">
                    {column.map((cell) => (
                      <div
                        key={cell.day}
                        className={`w-3 h-3 rounded-[2px] ${HEAT[cell.level]}`}
                        title={`${cell.day}: ${cell.count} solved${cell.xp !== undefined ? ` · ${cell.xp} XP` : ''}`}
                      />
                    ))}
                  </div>
                ))}
              </div>
            </div>
            <p className="text-xs text-fg-muted mt-2">
              {totals.active} active {totals.active === 1 ? 'day' : 'days'} · {totals.xp.toLocaleString()} XP · {totals.mistakes} wrong answers
            </p>
          </section>

          <section>
            <h3 className="text-sm font-medium text-fg mb-2">Most-missed questions</h3>
            {data.misses.length === 0 ? (
              <EmptyState>No wrong answers recorded.</EmptyState>
            ) : (
              <Table>
                <thead>
                  <tr>
                    <th>Question</th>
                    <th>Misses</th>
                    <th>Most common wrong answer</th>
                    <th>Last</th>
                  </tr>
                </thead>
                <tbody>
                  {data.misses.map((m) => (
                    <tr key={m.challengeId}>
                      <td className="cell-primary">{m.title}</td>
                      <td className="cell-num">{m.count}</td>
                      <td className="text-fg-secondary">{m.topWrong ?? '—'}</td>
                      <td className="cell-mono text-fg-muted">{shortDate(m.lastAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            )}
          </section>
        </div>
      )}
    </Drawer>
  );
};

/**
 * /admin/users. Every row comes from adminUserRow() in server/admin.js,
 * which never includes a password, a password hash, a JWT or any other
 * secret - see that function's doc comment. The Sign-in column is the
 * closest this page gets: WHICH methods exist (a password, Google, GitHub),
 * never anything derived from one. This list is learner accounts
 * ONLY: the administrator lives in a completely separate record (see
 * server/db.js's `admin` field) and can never appear here, so there is no
 * "role" column and nothing to promote/demote - deleting a row here only
 * ever removes a learner account and their progress.
 */
export const AdminUsers: React.FC = () => {
  const [users, setUsers] = useState<AdminUserRow[] | null>(null);
  const [query, setQuery] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<AdminUserRow | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [learningFor, setLearningFor] = useState<AdminUserRow | null>(null);

  const load = useCallback((q = '') => {
    adminApi
      .users(q)
      .then((res) => setUsers(res.users))
      .catch((err) => setError(err.message ?? 'Failed to load users.'));
  }, []);

  useEffect(() => load(), [load]);

  const onSearch = (e: React.FormEvent) => {
    e.preventDefault();
    load(query);
  };

  const togglePremium = async (user: AdminUserRow) => {
    setBusyId(user.id);
    setError(null);
    try {
      const res = await adminApi.updateUser(user.id, { isPremium: !user.isPremium });
      setUsers((prev) => prev?.map((u) => (u.id === user.id ? res.user : u)) ?? null);
    } catch (err: any) {
      setError(err.message ?? 'Could not update that user.');
    } finally {
      setBusyId(null);
    }
  };

  const confirmDelete = async () => {
    if (!pendingDelete) return;
    setBusyId(pendingDelete.id);
    setError(null);
    try {
      await adminApi.deleteUser(pendingDelete.id);
      setUsers((prev) => prev?.filter((u) => u.id !== pendingDelete.id) ?? null);
    } catch (err: any) {
      setError(err.message ?? 'Could not delete that user.');
    } finally {
      setBusyId(null);
      setPendingDelete(null);
    }
  };

  return (
    <div>
      <AdminPageHeader
        title="Users"
        description={users ? `${users.length} learner ${users.length === 1 ? 'account' : 'accounts'}` : undefined}
        actions={
          <form onSubmit={onSearch} className="flex items-center gap-2">
            <label className="relative block">
              <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-fg-muted pointer-events-none" />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search username or email"
                className="!pl-8 w-64"
                aria-label="Search users"
              />
            </label>
            <Button type="submit" variant="secondary">
              Search
            </Button>
          </form>
        }
      />

      {error && <ErrorText>{error}</ErrorText>}

      <p className="text-xs text-fg-muted mb-3 max-w-3xl">
        The Sign-in column shows how each learner gets in. Passwords are stored only as a bcrypt hash — a one-way
        scramble — so no page, route or export can show you one, and nobody, including an administrator, can read a
        learner's password.
      </p>

      <Card className="p-0 overflow-hidden">
        {!users ? (
          <Spinner />
        ) : users.length === 0 ? (
          <EmptyState>No users match that search.</EmptyState>
        ) : (
          <Table>
            <thead>
              <tr>
                <th>User</th>
                <th>Sign-in</th>
                <th>Premium</th>
                <th>XP</th>
                <th>Level</th>
                <th>Solved</th>
                <th>Stages</th>
                <th>Last login</th>
                <th>Last active</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id}>
                  <td>
                    <div className="cell-primary">{u.username}</div>
                    <div className="text-xs text-fg-muted">{u.email}</div>
                  </td>
                  <td>
                    {/* What they can sign in WITH - never anything derived from it. */}
                    <div className="flex flex-wrap items-center gap-1">
                      {u.hasPassword !== false && <Badge>Password</Badge>}
                      {(u.identities ?? []).map((id) => (
                        <Badge key={id} tone="success">
                          {PROVIDER_LABEL[id] ?? id}
                        </Badge>
                      ))}
                      {u.hasPassword === false && (u.identities ?? []).length === 0 && (
                        <span className="text-xs text-fg-muted">—</span>
                      )}
                    </div>
                  </td>
                  <td>
                    <Toggle label="" checked={u.isPremium} onChange={() => togglePremium(u)} />
                  </td>
                  <td className="cell-num">{u.xp.toLocaleString()}</td>
                  <td className="cell-num">{u.level}</td>
                  <td className="cell-num">{u.completedChallenges}</td>
                  <td className="cell-num">{u.completedStages}</td>
                  <td className="cell-mono text-fg-muted">{shortDate(u.lastLoginAt)}</td>
                  <td className="cell-mono text-fg-muted">{u.lastActiveDay ?? '—'}</td>
                  <td className="text-right whitespace-nowrap">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setLearningFor(u)}
                      title="Learning activity"
                      aria-label={`Learning activity of ${u.username}`}
                      className="!text-fg-muted hover:!text-fg"
                    >
                      <Activity size={14} />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={busyId === u.id}
                      onClick={() => setPendingDelete(u)}
                      title="Delete user"
                      aria-label={`Delete ${u.username}`}
                      className="!text-fg-muted hover:!text-error"
                    >
                      <Trash2 size={14} />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>

      <LearningDrawer user={learningFor} onClose={() => setLearningFor(null)} />

      <ConfirmDialog
        open={Boolean(pendingDelete)}
        title="Delete this account?"
        message={`This permanently removes ${pendingDelete?.username}'s account and progress. This cannot be undone.`}
        confirmLabel="Delete"
        onConfirm={confirmDelete}
        onCancel={() => setPendingDelete(null)}
      />
    </div>
  );
};
