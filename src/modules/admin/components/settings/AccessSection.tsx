import React, { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { RATE_LIMIT_BUCKETS } from '@/platform/settings';
import { adminApi } from '../../services/adminApi';
import type { AccessStatus, ProgressionGateCounter } from '../../services/adminApi';
import { Badge, Button, Card, ErrorText, Spinner, Table } from '../ui';
import { GenericSection } from './GenericSection';
import type { SectionProps } from './GenericSection';

/** A bucket's label from the settings metadata, found by its settings key (`loginAccount`). */
const bucketLabel = (setting: string, bucket: string) => RATE_LIMIT_BUCKETS.find((b) => b.key === setting)?.label ?? bucket;

const SOURCE_LABEL: Record<string, string> = { APP_ORIGIN: 'APP_ORIGIN', env: 'CORS_ORIGINS', admin: 'added here', dev: 'development' };

function when(iso: string | null | undefined): string {
  if (!iso) return '—';
  const at = new Date(iso);
  return Number.isNaN(at.getTime()) ? '—' : at.toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

/**
 * What the server is doing right now: the admin's own request as the server
 * sees it (to check the trusted hops), every rate-limit bucket with an
 * Unblock per key, the code-runner slots, the CORS allow-list and the
 * foreign origins it recorded, and the premium lock's blocks. In memory on
 * the server - a restart clears all of it.
 */
const LiveStatus: React.FC = () => {
  const [status, setStatus] = useState<AccessStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setStatus(await adminApi.accessStatus());
      setError(null);
    } catch (err) {
      setError((err as Error).message ?? 'Could not load the live status.');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const unblock = async (bucket: string, key?: string) => {
    setBusy(`${bucket}\n${key ?? ''}`);
    try {
      await adminApi.resetRateLimit({ bucket, key });
      await load();
    } catch (err) {
      setError((err as Error).message ?? 'Could not unblock that.');
    } finally {
      setBusy(null);
    }
  };

  if (error && !status) return <ErrorText>{error}</ErrorText>;
  if (!status) return <Spinner label="Loading the live status…" />;

  const buckets = Object.entries(status.limiter.buckets);
  const recentRefused = status.cors?.recent ?? [];

  return (
    <div className="space-y-5 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-fg-muted">
          Live, in memory since the server started{status.bootedAt ? ` (${when(status.bootedAt)})` : ''}. A restart clears it.
        </p>
        <Button variant="secondary" size="sm" onClick={() => void load()}>
          <RefreshCw size={13} /> Refresh
        </Button>
      </div>
      {error && <ErrorText>{error}</ErrorText>}

      <section aria-label="Your request">
        <h4 className="font-medium text-fg mb-1">Your request, as the server sees it</h4>
        <dl className="grid grid-cols-[10rem_minmax(0,1fr)] gap-x-3 gap-y-1 font-mono text-xs">
          <dt className="text-fg-muted">Socket</dt>
          <dd>{status.ip.socket ?? '—'}</dd>
          <dt className="text-fg-muted">X-Forwarded-For</dt>
          <dd className="break-all">{status.ip.forwardedFor.length ? status.ip.forwardedFor.join(', ') : 'none'}</dd>
          <dt className="text-fg-muted">Trusted hops</dt>
          <dd>{status.ip.hops}</dd>
          <dt className="text-fg-muted">Your address</dt>
          <dd>
            {status.ip.derived ?? 'unknown'} {status.ip.trustworthy ? <Badge tone="success">trustworthy</Badge> : <Badge tone="warning">check the hops</Badge>}
          </dd>
        </dl>
        {status.ip.notes.map((note) => (
          <p key={note} className="mt-2 flex items-start gap-2 text-warning text-xs">
            <AlertTriangle size={13} className="shrink-0 mt-0.5" /> {note}
          </p>
        ))}
        <p className="mt-2 text-xs text-fg-muted">
          Open this page through the public site: "Your address" should be your own public address. A request straight to the tunnel
          shows the difference.
        </p>
      </section>

      <section aria-label="Rate limits">
        <h4 className="font-medium text-fg mb-1">
          Rate limits <Badge tone={status.limiter.mode === 'enforce' ? 'success' : 'warning'}>{status.limiter.mode}</Badge>
        </h4>
        <Table>
          <thead>
            <tr>
              <th>Bucket</th>
              <th>Rule</th>
              <th>Refused</th>
              <th>Busiest keys</th>
            </tr>
          </thead>
          <tbody>
            {buckets.map(([bucket, row]) => (
              <tr key={bucket}>
                <td>
                  <div className="cell-primary">{bucketLabel(row.setting, bucket)}</div>
                  <div className="text-[11px] font-mono text-fg-muted">{bucket}</div>
                </td>
                <td className="cell-mono text-fg-muted">{row.rule ? `${row.rule.limit} / ${row.rule.windowSeconds}s` : '—'}</td>
                <td className="cell-num">
                  {row.blocked}
                  {row.lastBlockedAt && <div className="text-[11px] text-fg-muted">last {when(row.lastBlockedAt)}</div>}
                </td>
                <td>
                  {row.top.length === 0 ? (
                    <span className="text-fg-muted">—</span>
                  ) : (
                    <ul className="space-y-1">
                      {row.top.map((entry) => (
                        <li key={entry.key} className="flex flex-wrap items-center gap-2">
                          <span className="font-mono text-xs break-all">{entry.username ? `${entry.username} (${entry.key})` : entry.key}</span>
                          <span className="text-xs text-fg-muted">
                            {entry.count} · resets in {entry.resetsInSeconds}s
                          </span>
                          <Button variant="ghost" size="sm" disabled={busy !== null} onClick={() => void unblock(bucket, entry.key)}>
                            Unblock
                          </Button>
                        </li>
                      ))}
                    </ul>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </Table>
      </section>

      {status.slots && (
        <section aria-label="Code runner">
          <h4 className="font-medium text-fg mb-1">Code runner</h4>
          <p className="text-fg-secondary">
            {status.slots.running} of {status.slots.maxConcurrent} running · {status.slots.queued} waiting (at most {status.slots.maxQueued}, for{' '}
            {status.slots.queueWaitMs} ms) · {status.slots.completed} runs since boot · busy {status.slots.queueFull + status.slots.timedOut} times
            {status.slots.lastBusyAt ? ` (last ${when(status.slots.lastBusyAt)})` : ''}
          </p>
        </section>
      )}

      {status.cors && (
        <section aria-label="Cross-site requests">
          <h4 className="font-medium text-fg mb-1">
            Cross-site requests (CORS) <Badge tone={status.cors.mode === 'enforce' ? 'success' : 'warning'}>{status.cors.mode}</Badge>
          </h4>
          <ul className="flex flex-wrap gap-2 mb-2">
            {status.cors.allowed.map((entry) => (
              <li key={entry.origin} className="font-mono text-xs">
                {entry.origin} <span className="text-fg-muted">({SOURCE_LABEL[entry.source] ?? entry.source})</span>
              </li>
            ))}
          </ul>
          {recentRefused.length === 0 ? (
            <p className="text-fg-muted text-xs">No writes from other sites recorded. Once this stays empty for a few days of normal use, switch the mode to enforce.</p>
          ) : (
            <Table>
              <thead>
                <tr>
                  <th>Origin</th>
                  <th>Requests</th>
                  <th>Last</th>
                  <th>Path</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {recentRefused.map((entry) => (
                  <tr key={entry.origin}>
                    <td className="cell-mono break-all">{entry.origin}</td>
                    <td className="cell-num">{entry.count}</td>
                    <td className="cell-mono text-fg-muted">{when(entry.lastAt)}</td>
                    <td className="cell-mono text-fg-muted">
                      {entry.method} {entry.path}
                    </td>
                    <td>{entry.refused ? <Badge tone="danger">refused</Badge> : <Badge tone="warning">reported</Badge>}</td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </section>
      )}

      <section aria-label="Premium lock">
        <h4 className="font-medium text-fg mb-1">
          Server-side premium lock <Badge tone={status.premium.mode === 'enforce' ? 'success' : 'warning'}>{status.premium.mode === 'enforce' ? 'enforced' : 'logging only'}</Badge>
        </h4>
        <p className="text-fg-secondary">
          {status.premium.blocked} refused and {status.premium.wouldBlock} logged since boot
          {Object.keys(status.premium.byRoute).length > 0 &&
            ` (${Object.entries(status.premium.byRoute)
              .map(([route, n]) => `${route}: ${n}`)
              .join(', ')})`}
          {status.premium.lastAt ? ` · last ${when(status.premium.lastAt)}` : ''}.
        </p>
      </section>

      {status.progression && (
        <section aria-label="Stage order">
          <h4 className="font-medium text-fg mb-1">Stage order</h4>
          <p className="text-fg-muted text-xs mb-2">
            Watch these while the gates only log. Once they stay at 0 for a week, switching to enforce refuses nothing a learner would have been allowed.
          </p>
          <GateRow title="Solves" mode={status.progression.solveGate} counter={status.progression.solve} unit="solve" />
          <GateRow title="Guest merges" mode={status.progression.mergeGate} counter={status.progression.merge} unit="merged solve" />
        </section>
      )}
    </div>
  );
};

/** One stage-order gate: its mode, and what it refused (or would have) since boot and in the last 24 hours. */
const GateRow: React.FC<{ title: string; mode: string; counter: ProgressionGateCounter; unit: string }> = ({ title, mode, counter, unit }) => {
  const plural = (n: number) => `${n} ${unit}${n === 1 ? '' : 's'}`;
  const tone = mode === 'enforce' ? 'success' : mode === 'log' ? 'warning' : 'default';
  const label = mode === 'enforce' ? 'enforced' : mode === 'log' ? 'logging only' : 'off';
  const reasons = Object.entries(counter.byReason);
  return (
    <p className="text-fg-secondary mb-1">
      <span className="font-medium text-fg">{title}</span> <Badge tone={tone}>{label}</Badge>{' '}
      {mode === 'enforce' || counter.refused > 0 ? `${plural(counter.refused24h)} refused in 24h (${counter.refused} since boot)` : null}
      {(mode === 'enforce' || counter.refused > 0) && (mode === 'log' || counter.wouldRefuse > 0) ? ' · ' : null}
      {mode === 'log' || counter.wouldRefuse > 0 ? `${plural(counter.wouldRefuse24h)} would have been refused in 24h (${counter.wouldRefuse} since boot)` : null}
      {mode === 'off' && counter.refused === 0 && counter.wouldRefuse === 0 ? 'not checked' : null}
      {reasons.length > 0 && ` - ${reasons.map(([reason, n]) => `${reason}: ${n}`).join(', ')}`}
      {counter.lastAt ? ` · last ${when(counter.lastAt)}` : ''}.
    </p>
  );
};

/**
 * Limits & access: every number and mode of the `access` section as a form
 * (from the settings metadata, like any section), plus the live status card
 * that says whether they are right - the proxy diagnostic above all.
 */
export const AccessSection: React.FC<SectionProps> = (props) => (
  <div>
    <Card className="mb-4 !bg-surface-2">
      <LiveStatus />
    </Card>
    <GenericSection {...props} />
  </div>
);
