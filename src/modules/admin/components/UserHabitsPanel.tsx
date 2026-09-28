import React, { useEffect, useState } from 'react';
import { formatDayLabel } from '@/platform/time/days';
import { StreakStrip } from '@/ui';
import { AdminUserRow, UserLearning, UserLearningPatch, adminApi } from '../services/adminApi';
import { Badge, Button, ConfirmDialog, EmptyState, ErrorText, Toggle } from './ui';

const ENDED: Record<string, string> = { missed: 'a missed day', reset: 'a progress reset', admin: 'support' };
const FIELD_NAME: Record<string, string> = { freezes: 'freezes', streak: 'streak', dailyGoalId: 'daily goal', clearTimeZone: 'time zone' };

/**
 * One learner's streak and goal in the Users drawer: how they stand today,
 * the last 30 days, past runs - and the support edit (freezes, the streak,
 * the goal, forgetting the time zone). The server range-checks every change
 * and writes it to the audit log with its before and after.
 */
export const UserHabitsPanel: React.FC<{ user: AdminUserRow; data: UserLearning; onSaved: (next: UserLearning) => void }> = ({ user, data, onSaved }) => {
  const summary = data.summary!;
  const stored = data.habit!;
  const [freezes, setFreezes] = useState(String(summary.freezes));
  const [streakValue, setStreakValue] = useState(String(summary.streak));
  const [lastDay, setLastDay] = useState(summary.lastActiveDay ?? data.today);
  const [goalId, setGoalId] = useState(data.preferences?.dailyGoalId ?? '');
  const [forgetZone, setForgetZone] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);

  // A fresh view (after a save) resets the form to what is stored.
  useEffect(() => {
    setFreezes(String(summary.freezes));
    setStreakValue(String(summary.streak));
    setLastDay(summary.lastActiveDay ?? data.today);
    setGoalId(data.preferences?.dailyGoalId ?? '');
    setForgetZone(false);
  }, [data, summary]);

  const patch: UserLearningPatch = {};
  if (Number(freezes) !== summary.freezes) patch.freezes = Number(freezes);
  const value = Number(streakValue);
  if (value !== summary.streak || (value > 0 && lastDay !== summary.lastActiveDay)) {
    patch.streak = value > 0 ? { value, lastActiveDay: lastDay } : { value: 0 };
  }
  if ((goalId || null) !== (data.preferences?.dailyGoalId ?? null)) patch.dailyGoalId = goalId || null;
  if (forgetZone) patch.clearTimeZone = true;
  const changed = Object.keys(patch);

  const save = async () => {
    setConfirming(false);
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const next = await adminApi.updateUserLearning(user.id, patch);
      onSaved(next);
      setNotice(next.changed.length ? 'Saved. The change is in the audit log.' : 'Nothing changed.');
    } catch (err: any) {
      setError(err.message ?? 'Could not save that change.');
    } finally {
      setSaving(false);
    }
  };

  const runs = [...(summary.runs ?? [])].reverse().slice(0, 6);
  const maxFreezes = data.maxFreezes ?? summary.maxFreezes;
  const goalBadge = summary.goal ? (summary.goal.met ? 'Met today' : 'Today ' + summary.goal.percent + '%') : null;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-2 text-sm">
        <Badge tone={summary.streak > 0 ? 'success' : 'default'}>Streak {summary.streak}</Badge>
        {summary.atRisk && <Badge tone="warning">At risk</Badge>}
        <Badge>Best {summary.bestStreak}</Badge>
        <Badge>
          Freezes {summary.freezes}/{summary.maxFreezes}
        </Badge>
        <Badge>
          Goal: {data.effectiveGoal?.label ?? 'off'}
          {data.preferences?.dailyGoalId ? '' : data.effectiveGoal ? ' (default)' : ''}
        </Badge>
        {goalBadge && <Badge tone={summary.goal?.met ? 'success' : 'default'}>{goalBadge}</Badge>}
      </div>
      <p className="text-xs text-fg-muted">
        Stored: {stored.streak} {stored.streak === 1 ? 'day' : 'days'} through {stored.lastActiveDay ?? '—'}. The badges show the streak as it stands today, in
        the learner's own time zone, with freezes applied.
      </p>
      {summary.repair && (
        <p className="text-sm text-warning">
          Repair on offer: the {summary.repair.lostStreak}-day streak comes back after {summary.repair.remaining} more{' '}
          {summary.repair.remaining === 1 ? 'lesson' : 'lessons'} by {formatDayLabel(summary.repair.deadline)}.
        </p>
      )}

      {data.strip && (
        <section>
          <h3 className="text-sm font-medium text-fg mb-2">Last 30 days</h3>
          <StreakStrip days={data.strip} formatDay={(d) => formatDayLabel(d)} legend />
        </section>
      )}

      <section>
        <h3 className="text-sm font-medium text-fg mb-2">Past streaks</h3>
        {runs.length === 0 ? (
          <EmptyState>None recorded yet.</EmptyState>
        ) : (
          <ul className="text-sm text-fg-secondary space-y-1">
            {runs.map((run) => (
              <li key={run.start + ':' + run.end + ':' + run.ended}>
                {run.length} {run.length === 1 ? 'day' : 'days'}, {run.start} to {run.end} · ended by {ENDED[run.ended] ?? run.ended}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-3">
        <h3 className="text-sm font-medium text-fg">Support edit</h3>
        <div className="flex flex-wrap items-end gap-4">
          <label className="text-xs text-fg-secondary">
            Freezes (0-{maxFreezes})
            <input type="number" className="block w-24 mt-1" min={0} max={maxFreezes} value={freezes} onChange={(e) => setFreezes(e.target.value)} />
          </label>
          <label className="text-xs text-fg-secondary">
            Streak (0-400)
            <input type="number" className="block w-24 mt-1" min={0} max={400} value={streakValue} onChange={(e) => setStreakValue(e.target.value)} />
          </label>
          <label className="text-xs text-fg-secondary">
            Its last day
            <input
              type="date"
              className="block mt-1"
              max={data.today}
              value={lastDay}
              disabled={Number(streakValue) === 0}
              onChange={(e) => setLastDay(e.target.value)}
            />
          </label>
          <label className="text-xs text-fg-secondary">
            Daily goal
            <select className="block mt-1" value={goalId} onChange={(e) => setGoalId(e.target.value)}>
              <option value="">The default</option>
              {(data.goalOptions ?? []).map((o) => (
                <option key={o.id} value={o.id}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
        </div>
        {data.preferences?.timeZone && (
          <Toggle
            label={'Forget the time zone (' + data.preferences.timeZone + ") - the learner's browser reports it again on its next solve"}
            checked={forgetZone}
            onChange={setForgetZone}
          />
        )}
        <p className="text-xs text-fg-muted">A streak of 0 ends the current run (it stays in the learner's history). Setting a streak closes any open repair offer.</p>
        {error && <ErrorText>{error}</ErrorText>}
        {notice && <p className="text-xs text-success">{notice}</p>}
        <Button variant="primary" disabled={saving || changed.length === 0} onClick={() => setConfirming(true)}>
          {saving ? 'Saving…' : changed.length === 0 ? 'No changes' : 'Save ' + changed.length + (changed.length === 1 ? ' change' : ' changes')}
        </Button>
      </section>

      <ConfirmDialog
        open={confirming}
        title="Change this learner's streak or goal?"
        message={'This changes ' + user.username + "'s " + changed.map((key) => FIELD_NAME[key] ?? key).join(', ') + ' and records it in the audit log.'}
        confirmLabel="Save"
        onConfirm={save}
        onCancel={() => setConfirming(false)}
      />
    </div>
  );
};
