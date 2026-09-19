import React, { useCallback, useEffect, useState } from 'react';
import { Search, Trash2 } from 'lucide-react';
import { AdminUserRow, adminApi } from '../services/adminApi';
import { Button, Card, ConfirmDialog, EmptyState, Spinner, Toggle } from '../components/ui';

/**
 * /admin/users. Every row comes from adminUserRow() in server/admin.js,
 * which never includes a password, a password hash, a JWT or any other
 * secret - see that function's doc comment. This list is learner accounts
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
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Users</h1>
        <form onSubmit={onSearch} className="flex items-center gap-2">
          <div className="relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search username or email"
              className="pl-9 pr-3.5 py-2.5 rounded-xl bg-gray-50 dark:bg-[#161b22] border border-black/10 dark:border-white/10 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:border-[var(--color-primary)] focus:ring-2 focus:ring-[var(--color-primary)]/20 transition-all w-64 shadow-xs"
            />
          </div>
          <Button type="submit" variant="secondary">
            Search
          </Button>
        </form>
      </div>

      {error && <p className="text-sm text-red-500 mb-4">{error}</p>}

      <Card className="p-0 overflow-hidden">
        {!users ? (
          <Spinner />
        ) : users.length === 0 ? (
          <EmptyState>No users match that search.</EmptyState>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-gray-400 border-b border-black/5 dark:border-white/5">
                  <th className="px-4 py-3 font-medium">User</th>
                  <th className="px-4 py-3 font-medium">Premium</th>
                  <th className="px-4 py-3 font-medium">XP / Level</th>
                  <th className="px-4 py-3 font-medium">Solved</th>
                  <th className="px-4 py-3 font-medium">Last active</th>
                  <th className="px-4 py-3 font-medium" />
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id} className="border-b border-black/5 dark:border-white/5 last:border-0">
                    <td className="px-4 py-3">
                      <div className="font-medium text-gray-900 dark:text-white">{u.username}</div>
                      <div className="text-xs text-gray-500 dark:text-gray-400">{u.email}</div>
                    </td>
                    <td className="px-4 py-3">
                      <Toggle label="" checked={u.isPremium} onChange={() => togglePremium(u)} />
                    </td>
                    <td className="px-4 py-3 text-gray-700 dark:text-gray-300">
                      {u.xp.toLocaleString()} XP · Lv {u.level}
                    </td>
                    <td className="px-4 py-3 text-gray-700 dark:text-gray-300">
                      {u.completedChallenges} challenges · {u.completedStages} stages
                    </td>
                    <td className="px-4 py-3 text-gray-500 dark:text-gray-400">{u.lastActiveDay ?? '—'}</td>
                    <td className="px-4 py-3 text-right">
                      <button
                        type="button"
                        disabled={busyId === u.id}
                        onClick={() => setPendingDelete(u)}
                        className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-500/10 disabled:opacity-30"
                        title="Delete user"
                        aria-label={`Delete ${u.username}`}
                      >
                        <Trash2 size={16} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

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
