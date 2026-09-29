import React, { useState } from 'react';
import { AdminUserRow, UserLearning, UserSetup, adminApi } from '../services/adminApi';
import { Badge, Button, ConfirmDialog, EmptyState, ErrorText, Table } from './ui';

/** yyyy-mm-dd hh:mm of an ISO timestamp, or an em dash. */
function when(iso: string | null | undefined): string {
  if (!iso) return '—';
  const at = new Date(iso);
  return Number.isNaN(at.getTime()) ? '—' : `${at.toISOString().slice(0, 10)} ${at.toISOString().slice(11, 16)}`;
}

const STATUS_TONE: Record<string, 'default' | 'success' | 'warning' | 'danger'> = {
  active: 'warning',
  passed: 'success',
  finished: 'default',
  failed: 'danger',
  expired: 'danger',
  abandoned: 'default'
};

const KIND_LABEL: Record<string, string> = { 'test-out': 'Test-out', placement: 'Placement' };

/**
 * One learner's first-run setup and test-outs in the Users drawer (Phase 5):
 * whether they finished or dismissed the setup and what they answered, the
 * stages they tested out of, their newest 20 test-outs and placements - and
 * "Clear test-out cooldowns", which lets them try again now (audited).
 */
export const UserSetupPanel: React.FC<{ user: AdminUserRow; setup: UserSetup; onSaved: (next: UserLearning) => void }> = ({ user, setup, onSaved }) => {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const clear = async () => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const next = await adminApi.clearAssessmentCooldown(user.id);
      onSaved(next);
      setNotice('Cooldowns cleared: the learner can take a test-out or placement again now. This is in the audit log.');
    } catch (err: any) {
      setError(err.message ?? 'Could not clear the cooldowns.');
    } finally {
      setBusy(false);
      setConfirming(false);
    }
  };

  const o = setup.onboarding;
  const a = setup.answers;
  const cleared = Object.entries(setup.cooldownClearedAt ?? {});

  return (
    <div className="space-y-6">
      <section>
        <h3 className="text-sm font-medium text-fg mb-2">First-run setup</h3>
        <div className="flex flex-wrap gap-2 text-sm">
          {o?.completedAt ? <Badge tone="success">Finished {when(o.completedAt)}</Badge> : null}
          {o?.dismissedAt ? <Badge>Dismissed {when(o.dismissedAt)}</Badge> : null}
          {!o && <Badge>Not done</Badge>}
        </div>
        <dl className="mt-3 grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1 text-sm">
          <dt className="text-fg-muted">Why learning</dt>
          <dd className="text-fg">{a.motivation ?? '—'}</dd>
          <dt className="text-fg-muted">Experience</dt>
          <dd className="text-fg">{a.experience ?? '—'}</dd>
          <dt className="text-fg-muted">Track</dt>
          <dd className="text-fg">{a.trackId ?? '—'}</dd>
          <dt className="text-fg-muted">Learning mode</dt>
          <dd className="text-fg">{a.learningMode ?? '—'}</dd>
        </dl>
      </section>

      <section>
        <h3 className="text-sm font-medium text-fg mb-2">Tested out of</h3>
        {setup.testedOut.length === 0 ? (
          <EmptyState>No stage tested out of.</EmptyState>
        ) : (
          <Table>
            <thead>
              <tr>
                <th>Stage</th>
                <th>How</th>
                <th>Clears it</th>
                <th>When</th>
              </tr>
            </thead>
            <tbody>
              {setup.testedOut.map((t) => (
                <tr key={t.stageId}>
                  <td className="cell-primary">{t.name}</td>
                  <td>{KIND_LABEL[t.via] ?? t.via}</td>
                  <td>{t.clears ? 'Yes' : 'No - the next stage waits for its lessons'}</td>
                  <td className="cell-mono text-fg-muted">{when(t.at)}</td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </section>

      <section>
        <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
          <h3 className="text-sm font-medium text-fg">Test-outs and placements (newest 20)</h3>
          <Button variant="secondary" size="sm" onClick={() => setConfirming(true)} disabled={busy}>
            Clear test-out cooldowns
          </Button>
        </div>
        {error && <ErrorText>{error}</ErrorText>}
        {notice && (
          <p className="text-sm text-success mb-2" role="status">
            {notice}
          </p>
        )}
        {cleared.length > 0 && (
          <p className="text-xs text-fg-muted mb-2">
            Cleared before: {cleared.map(([key, at]) => `${key === '*' ? 'everything' : key} ${when(at)}`).join(', ')}.
          </p>
        )}
        {setup.assessments.length === 0 ? (
          <EmptyState>No test-outs or placements yet.</EmptyState>
        ) : (
          <Table>
            <thead>
              <tr>
                <th>Kind</th>
                <th>Stages</th>
                <th>Status</th>
                <th>Started</th>
              </tr>
            </thead>
            <tbody>
              {setup.assessments.map((r) => (
                <tr key={r.id}>
                  <td>
                    {KIND_LABEL[r.kind] ?? r.kind}
                    {r.passMark !== null ? <span className="text-fg-muted"> · {r.passMark}%</span> : null}
                  </td>
                  <td className="text-fg-secondary">
                    {r.stages.map((s) => `${s.name}${s.outcome ? ` (${s.outcome}${s.runs ? `, ${s.runs} ${s.runs === 1 ? 'run' : 'runs'}` : ''})` : ''}`).join('; ')}
                  </td>
                  <td>
                    <Badge tone={STATUS_TONE[r.status] ?? 'default'}>{r.status}</Badge>
                  </td>
                  <td className="cell-mono text-fg-muted">{when(r.startedAt)}</td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </section>

      <ConfirmDialog
        open={confirming}
        title="Clear test-out cooldowns?"
        message={`${user.username} can start a test-out or placement again straight away: every one they started before now stops counting towards their limits and waits. Nothing they passed changes.`}
        confirmLabel="Clear cooldowns"
        busy={busy}
        onConfirm={() => void clear()}
        onCancel={() => setConfirming(false)}
      />
    </div>
  );
};
