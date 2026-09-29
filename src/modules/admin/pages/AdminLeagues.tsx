import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowDown, ArrowUp, RefreshCw, SlidersHorizontal } from 'lucide-react';
import { formatDayLabel } from '@/platform/time/days';
import { AdminApiError, adminApi } from '../services/adminApi';
import type { AdminLeagueLine, AdminLeagueWeek, AdminLeagueWeeks } from '../services/adminApi';
import { AdminPageHeader, Badge, Button, Card, ConfirmDialog, Drawer, EmptyState, ErrorText, SelectField, Spinner, Table, TextField } from '../components/ui';

const REASON_MAX = 200;

const days = (start: string, end: string) => `${formatDayLabel(start)} – ${formatDayLabel(end, { year: true })}`;
const when = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : '—');
const closedByLabel = (by: string | null) => (!by ? '—' : by === 'auto' ? 'Automatically' : 'By an admin');
const WEEKDAY = ['Sunday', 'Monday'];

const OUTCOME: Record<string, string> = { promoted: 'Moved up', demoted: 'Moved down', stayed: 'Stayed', single: '—' };

const ZoneCell: React.FC<{ zone: AdminLeagueLine['zone'] }> = ({ zone }) =>
  zone === 'up' ? (
    <span className="inline-flex items-center gap-1 text-success">
      <ArrowUp size={12} /> Up
    </span>
  ) : zone === 'down' ? (
    <span className="inline-flex items-center gap-1 text-error">
      <ArrowDown size={12} /> Down
    </span>
  ) : (
    <span className="text-fg-muted">—</span>
  );

/**
 * /admin/leagues. The weekly league: its switches (edited on the rules page,
 * /admin/rules/league), the current week's standings - raw XP, the reset
 * baseline, exclusions, time zones and, with tiers on, groups and who is in
 * line to move - with Exclude/Reinstate and Move tier per learner, Close
 * week now and Reset week XP (each confirmed by typing the week id), and
 * the weeks before. Every change is audited by the server.
 */
export const AdminLeagues: React.FC = () => {
  const [list, setList] = useState<AdminLeagueWeeks | null>(null);
  const [listError, setListError] = useState<string | null>(null);
  const [picked, setPicked] = useState<string | null>(null);
  const [detail, setDetail] = useState<AdminLeagueWeek | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<'close' | 'reset' | null>(null);
  const [busy, setBusy] = useState(false);
  const [excluding, setExcluding] = useState<AdminLeagueLine | null>(null);
  const [reason, setReason] = useState('');
  const [moving, setMoving] = useState<AdminLeagueLine | null>(null);
  const [tierPick, setTierPick] = useState('');

  const loadList = useCallback(async () => {
    try {
      setList(await adminApi.leagueWeeks(26));
      setListError(null);
    } catch (err) {
      setListError((err as Error).message ?? 'Could not load the league.');
    }
  }, []);

  useEffect(() => {
    void loadList();
  }, [loadList]);

  // The week on screen: the one picked, else the current one once someone has played it.
  const weekId = picked ?? (list?.current.stored ? list.current.id : null);

  const loadDetail = useCallback(async (id: string) => {
    try {
      setDetail(await adminApi.leagueWeek(id));
      setDetailError(null);
    } catch (err) {
      setDetail(null);
      setDetailError((err as Error).message ?? 'Could not load that week.');
    }
  }, []);

  useEffect(() => {
    if (!weekId) {
      setDetail(null);
      return;
    }
    void loadDetail(weekId);
  }, [weekId, loadDetail]);

  const refresh = () => {
    void loadList();
    if (weekId) void loadDetail(weekId);
  };

  /** Show another week (null: the current one); the last action's message goes. */
  const pick = (id: string | null) => {
    setNotice(null);
    setActionError(null);
    setPicked(id);
  };

  /** Run one change: the week view it answers with replaces the one on screen. */
  async function act(run: () => Promise<AdminLeagueWeek | null>, done: (week: AdminLeagueWeek | null) => string) {
    setBusy(true);
    setActionError(null);
    setNotice(null);
    try {
      const week = await run();
      if (week) setDetail(week);
      setNotice(done(week));
      void loadList();
      return true;
    } catch (err) {
      setActionError((err as Error).message ?? 'That did not work.');
      // Closed meanwhile (the timer, another admin): show the week as it is now, not its stale buttons.
      if (err instanceof AdminApiError && err.status === 409) {
        void loadList();
        if (weekId) void loadDetail(weekId);
      }
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function runWeekAction() {
    if (!detail || !confirm) return;
    const id = detail.week.id;
    const kind = confirm;
    await act(
      () => (kind === 'close' ? adminApi.closeLeagueWeek(id, id) : adminApi.resetLeagueWeek(id, id)),
      (week) =>
        kind === 'close'
          ? `Week ${id} is closed: ${week?.results.length ?? 0} results written.`
          : `Week ${id} was reset: ${week?.affected ?? 0} learners start again from 0 XP.`
    );
    setConfirm(null);
  }

  async function saveExclusion() {
    if (!detail || !excluding) return;
    const line = excluding;
    const ok = await act(
      () => adminApi.excludeFromLeague(detail.week.id, line.userId, true, reason.trim()),
      () => `${line.username} is off this week's board.`
    );
    if (ok) setExcluding(null);
  }

  function reinstate(line: AdminLeagueLine) {
    if (!detail) return;
    void act(
      () => adminApi.excludeFromLeague(detail.week.id, line.userId, false),
      () => `${line.username} is back on this week's board.`
    );
  }

  async function saveTier() {
    if (!moving || !tierPick) return;
    const line = moving;
    const name = list?.settings.tiers.find((t) => t.id === tierPick)?.name ?? tierPick;
    const ok = await act(
      async () => {
        await adminApi.setLeagueTier(line.userId, tierPick);
        return weekId ? adminApi.leagueWeek(weekId) : null;
      },
      () => `${line.username} plays in ${name} from next week.`
    );
    if (ok) setMoving(null);
  }

  if (listError) return <ErrorText>{listError}</ErrorText>;
  if (!list) return <Spinner />;

  const { settings, current } = list;
  const open = detail?.week.status === 'open';
  const tiered = Boolean(detail?.week.rules.tiersEnabled);
  const past = list.weeks.filter((w) => w.id !== weekId);

  return (
    <div>
      <AdminPageHeader
        title="Weekly league"
        description="This week's standings and the weeks before. A lesson's XP counts only the first time it is solved; the league rules say which other XP counts. Every action here is recorded in the audit log."
        actions={
          <>
            <Button size="sm" variant="ghost" onClick={refresh}>
              <RefreshCw size={14} /> Refresh
            </Button>
            <Link to="/admin/rules/league" className="btn btn-secondary btn-sm">
              <SlidersHorizontal size={14} /> League rules
            </Link>
          </>
        }
      />

      <Card className="mb-4">
        <div className="flex flex-wrap items-center gap-2 text-sm text-fg-secondary">
          <Badge tone={settings.enabled ? 'success' : 'warning'}>{settings.enabled ? 'On' : 'Off'}</Badge>
          <span>
            Weeks start on {WEEKDAY[settings.weekStartsOn] ?? 'Monday'} · results final {settings.finalizeDelayHours} h after the last day ends (UTC) ·{' '}
            {settings.boardSize} rows shown ·{' '}
            {settings.tiersEnabled ? `tiers on (${settings.tiers.map((t) => t.name).join(', ')})` : 'tiers off'}
          </span>
        </div>
        {!settings.enabled && <p className="text-sm text-fg-secondary mt-2">Learners do not see the weekly board while the league is off. Their league XP is still recorded.</p>}
      </Card>

      {notice && (
        <p className="text-sm text-success mb-3" role="status">
          {notice}
        </p>
      )}
      {actionError && (
        <div className="mb-3">
          <ErrorText>{actionError}</ErrorText>
        </div>
      )}

      <Card className="mb-6">
        <div className="flex flex-wrap items-start justify-between gap-3 mb-3">
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-fg">
              {detail ? `Week ${detail.week.id}` : `Week ${current.id}`}{' '}
              {detail && <Badge tone={open ? 'default' : 'success'}>{open ? 'Open' : 'Closed'}</Badge>}
              {weekId === current.id && <span className="ml-2 text-xs font-normal text-fg-muted">current week</span>}
            </h2>
            <p className="text-xs text-fg-muted mt-0.5">
              {detail ? days(detail.week.startDay, detail.week.endDay) : days(current.startDay, current.endDay)}
              {detail && open && ` · closes by itself ${when(detail.finalizeAt)}`}
              {detail && !open && ` · closed ${when(detail.week.closedAt)} (${closedByLabel(detail.week.closedBy).toLowerCase()})`}
              {detail && detail.week.resets.length > 0 && ` · reset ${detail.week.resets.length}× (last ${when(detail.week.resets[detail.week.resets.length - 1].at)})`}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {picked && picked !== current.id && (
              <Button size="sm" variant="ghost" onClick={() => pick(null)}>
                Back to the current week
              </Button>
            )}
            {detail && open && (
              <>
                <Button size="sm" variant="secondary" disabled={busy} onClick={() => setConfirm('reset')}>
                  Reset week XP
                </Button>
                <Button size="sm" variant="danger" disabled={busy} onClick={() => setConfirm('close')}>
                  Close week now
                </Button>
              </>
            )}
          </div>
        </div>

        {detailError ? (
          <ErrorText>{detailError}</ErrorText>
        ) : !weekId ? (
          <EmptyState>No one has earned league XP this week yet.</EmptyState>
        ) : !detail ? (
          <Spinner />
        ) : open ? (
          detail.rows.length === 0 ? (
            <EmptyState>No one has earned league XP this week yet.</EmptyState>
          ) : (
            <>
              <p className="text-xs text-fg-muted mb-2">
                {detail.participants} learners on the board. Raw XP is their league XP this week; after a reset only what they earned since counts (raw XP minus the
                baseline).
                {tiered && ' With tiers on, each learner races their own group.'}
              </p>
              <Table>
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Learner</th>
                    <th className="text-right">Week XP</th>
                    <th className="text-right">Raw XP</th>
                    <th className="text-right">Baseline</th>
                    <th>Time zone</th>
                    <th>Joined</th>
                    {tiered && <th>Group</th>}
                    {tiered && <th>Zone</th>}
                    <th>Status</th>
                    <th className="text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {detail.rows.map((line) => (
                    <tr key={line.userId}>
                      <td className="cell-mono">{line.rank ?? '—'}</td>
                      <td className="cell-primary">{line.username}</td>
                      <td className="cell-mono text-right">{line.xp.toLocaleString()}</td>
                      <td className="cell-mono text-right">{line.rawXp.toLocaleString()}</td>
                      <td className="cell-mono text-right">{line.baseline ? line.baseline.toLocaleString() : '—'}</td>
                      <td className="cell-mono text-fg-muted">{line.timeZone ?? '—'}</td>
                      <td className="cell-mono text-fg-muted whitespace-nowrap">{when(line.joinedAt)}</td>
                      {tiered && (
                        <td className="whitespace-nowrap">
                          {line.tierName ?? '—'}
                          {line.groupId && <span className="ml-1 text-xs text-fg-muted font-mono">{line.groupId}</span>}
                        </td>
                      )}
                      {tiered && (
                        <td>
                          <ZoneCell zone={line.zone} />
                        </td>
                      )}
                      <td>
                        {line.excluded ? (
                          <span title={line.excluded.reason || undefined}>
                            <Badge tone="warning">Excluded</Badge>
                            {line.excluded.reason && <span className="ml-1 text-xs text-fg-muted">{line.excluded.reason}</span>}
                          </span>
                        ) : line.rank === null ? (
                          <span className="text-xs text-fg-muted">No XP this week</span>
                        ) : (
                          <span className="text-xs text-fg-muted">Counted</span>
                        )}
                      </td>
                      <td className="text-right whitespace-nowrap">
                        {line.excluded ? (
                          <Button size="sm" variant="ghost" disabled={busy} onClick={() => reinstate(line)}>
                            Reinstate
                          </Button>
                        ) : (
                          <Button
                            size="sm"
                            variant="ghost"
                            disabled={busy}
                            onClick={() => {
                              setReason('');
                              setExcluding(line);
                            }}
                          >
                            Exclude
                          </Button>
                        )}
                        {settings.tiersEnabled && (
                          <Button
                            size="sm"
                            variant="ghost"
                            disabled={busy}
                            onClick={() => {
                              setTierPick(line.memberTierId ?? settings.tiers[0]?.id ?? '');
                              setMoving(line);
                            }}
                          >
                            Move tier
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </>
          )
        ) : detail.results.length === 0 ? (
          <EmptyState>No one finished this week with XP.</EmptyState>
        ) : (
          <Table>
            <thead>
              <tr>
                <th>#</th>
                <th>Learner</th>
                <th className="text-right">XP</th>
                {tiered && <th>Tier</th>}
                {tiered && <th>Result</th>}
              </tr>
            </thead>
            <tbody>
              {detail.results.map((row, i) => (
                <tr key={`${row.userId ?? 'deleted'}-${i}`}>
                  <td className="cell-mono">{row.rank}</td>
                  <td className="cell-primary">{row.username ?? <span className="text-fg-muted">Deleted account</span>}</td>
                  <td className="cell-mono text-right">{row.xp.toLocaleString()}</td>
                  {tiered && <td>{row.tierName ?? '—'}</td>}
                  {tiered && (
                    <td>
                      {OUTCOME[row.outcome] ?? row.outcome}
                      {row.outcome !== 'stayed' && row.outcome !== 'single' && row.toTierName ? ` to ${row.toTierName}` : ''}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>

      <h2 className="text-base font-semibold text-fg mb-2">Weeks</h2>
      {past.length === 0 ? (
        <EmptyState>No other weeks yet.</EmptyState>
      ) : (
        <Card className="p-0 overflow-hidden">
          <Table>
            <thead>
              <tr>
                <th>Week</th>
                <th>Status</th>
                <th className="text-right">Learners</th>
                <th className="text-right">Total XP</th>
                <th>Closed</th>
                <th className="text-right" />
              </tr>
            </thead>
            <tbody>
              {past.map((w) => (
                <tr key={w.id}>
                  <td className="whitespace-nowrap">
                    <span className="cell-mono">{w.id}</span>
                    <span className="ml-2 text-xs text-fg-muted">{days(w.startDay, w.endDay)}</span>
                  </td>
                  <td>
                    <Badge tone={w.status === 'open' ? 'default' : 'success'}>{w.status === 'open' ? 'Open' : 'Closed'}</Badge>
                    {w.tiersEnabled && <span className="ml-1 text-xs text-fg-muted">tiers</span>}
                  </td>
                  <td className="cell-mono text-right">{w.participants}</td>
                  <td className="cell-mono text-right">{w.totalXp.toLocaleString()}</td>
                  <td className="text-fg-muted whitespace-nowrap text-xs">{w.status === 'closed' ? `${when(w.closedAt)} · ${closedByLabel(w.closedBy)}` : `Closes ${when(w.finalizeAt)}`}</td>
                  <td className="text-right">
                    <Button size="sm" variant="ghost" onClick={() => pick(w.id)}>
                      View
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Card>
      )}

      <ConfirmDialog
        open={confirm !== null && Boolean(detail)}
        title={confirm === 'close' ? 'Close this week now?' : "Reset this week's XP?"}
        message={
          confirm === 'close'
            ? `Week ${detail?.week.id ?? ''} closes now: its results are written${tiered ? ' and learners move up or down a tier' : ''}. XP earned on the days it has left counts for no week. This cannot be undone.`
            : `Every learner's XP in week ${detail?.week.id ?? ''} goes back to 0 on the board; only what they earn from now on counts. Their XP and history are not touched.`
        }
        confirmLabel={confirm === 'close' ? 'Close week' : 'Reset week XP'}
        confirmText={detail?.week.id}
        busy={busy}
        onConfirm={() => void runWeekAction()}
        onCancel={() => setConfirm(null)}
      />

      <Drawer
        open={excluding !== null}
        title={excluding ? `Exclude ${excluding.username}` : 'Exclude'}
        onClose={() => setExcluding(null)}
        closable={!busy}
        footer={
          <>
            <Button variant="secondary" onClick={() => setExcluding(null)} disabled={busy}>
              Cancel
            </Button>
            <Button variant="danger" onClick={() => void saveExclusion()} disabled={busy}>
              {busy ? 'Working…' : 'Exclude from this week'}
            </Button>
          </>
        }
      >
        <p className="text-sm text-fg-secondary mb-4">
          They drop off this week's board and get no result for it. Their XP is not touched, and they can be reinstated while the week is open.
        </p>
        <TextField label="Reason (optional)" value={reason} onChange={setReason} maxLength={REASON_MAX} hint="Kept with the week and in the audit log." />
      </Drawer>

      <Drawer
        open={moving !== null}
        title={moving ? `Move ${moving.username}` : 'Move tier'}
        onClose={() => setMoving(null)}
        closable={!busy}
        footer={
          <>
            <Button variant="secondary" onClick={() => setMoving(null)} disabled={busy}>
              Cancel
            </Button>
            <Button variant="primary" onClick={() => void saveTier()} disabled={busy || !tierPick}>
              {busy ? 'Working…' : 'Move'}
            </Button>
          </>
        }
      >
        <p className="text-sm text-fg-secondary mb-4">They stay in their group this week and play in the new tier from next week.</p>
        <SelectField label="Tier" value={tierPick} onChange={setTierPick} options={settings.tiers.map((t) => ({ value: t.id, label: t.name }))} />
      </Drawer>
    </div>
  );
};
