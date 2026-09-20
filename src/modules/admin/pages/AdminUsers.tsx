import React, { useCallback, useEffect, useState } from 'react';
import { Search, Trash2 } from 'lucide-react';
import { AdminUserRow, adminApi } from '../services/adminApi';
import { AdminPageHeader, Button, Card, ConfirmDialog, EmptyState, ErrorText, Spinner, Table, Toggle } from '../components/ui';

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
                <th>Premium</th>
                <th>XP</th>
                <th>Level</th>
                <th>Solved</th>
                <th>Stages</th>
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
                    <Toggle label="" checked={u.isPremium} onChange={() => togglePremium(u)} />
                  </td>
                  <td className="cell-num">{u.xp.toLocaleString()}</td>
                  <td className="cell-num">{u.level}</td>
                  <td className="cell-num">{u.completedChallenges}</td>
                  <td className="cell-num">{u.completedStages}</td>
                  <td className="cell-mono text-fg-muted">{u.lastActiveDay ?? '—'}</td>
                  <td className="text-right">
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
