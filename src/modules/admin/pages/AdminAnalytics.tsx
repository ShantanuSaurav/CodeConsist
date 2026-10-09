import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Pencil } from 'lucide-react';
import { AdminChallengeRow, AdminStageRow, AnalyticsSummary, ChallengeMisses, MostMissedRow, OnboardingAnalytics, adminApi } from '../services/adminApi';
import { AdminPageHeader, Badge, Button, Card, Drawer, EmptyState, ErrorText, Spinner, Table } from '../components/ui';
import { QuestionWizard } from '../components/QuestionWizard';
import { ProgressBar } from '@/ui';

const LANGUAGE_LABEL: Record<string, string> = { javascript: 'JavaScript', python: 'Python', c: 'C', cpp: 'C++' };
const CONTEXT_LABEL: Record<string, string> = { lesson: 'Lesson', test: 'Stage test', review: 'Review', library: 'Library', assessment: 'Assessment' };

const percent = (rate: number) => `${Math.round(rate * 100)}%`;

function when(iso: string): string {
  const at = new Date(iso);
  return Number.isNaN(at.getTime()) ? iso : at.toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

/** The wrong answers to one question, across every learner - answers only, never who gave them. */
const MissesDrawer: React.FC<{ row: MostMissedRow | null; onClose: () => void }> = ({ row, onClose }) => {
  const [data, setData] = useState<ChallengeMisses | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setData(null);
    setError(null);
    if (!row) return;
    adminApi
      .challengeMisses(row.id)
      .then(setData)
      .catch((err) => setError(err.message ?? 'Could not load the answers.'));
  }, [row]);

  const max = Math.max(1, ...(data?.answers ?? []).map((a) => a.count));

  return (
    <Drawer open={Boolean(row)} title={row ? `Wrong answers: ${row.title}` : ''} onClose={onClose} size="lg">
      {error && <ErrorText>{error}</ErrorText>}
      {!data && !error && <Spinner label="Loading answers…" />}
      {data && (
        <div className="space-y-6">
          <div className="flex flex-wrap gap-2 text-sm">
            <Badge>{data.missedBy} learners missed it</Badge>
            <Badge>{data.totalMisses} wrong answers</Badge>
            <Badge tone={data.revealed > 0 ? 'warning' : 'default'}>{data.revealed} ended with the answer shown</Badge>
            <Badge>{data.challenge.type}</Badge>
          </div>

          <section>
            <h3 className="text-sm font-medium text-fg mb-2">Most common wrong answers</h3>
            {data.answers.length === 0 ? (
              <EmptyState>No answer details - code questions record only how many tests passed.</EmptyState>
            ) : (
              <div className="space-y-2">
                {data.answers.map((a) => (
                  <div key={a.key} className="flex items-center gap-3">
                    <span className="w-64 text-sm text-fg-secondary truncate" title={a.label}>
                      {a.label}
                    </span>
                    <ProgressBar value={(a.count / max) * 100} size="sm" tone="neutral" className="flex-1" label={`${a.count} times`} />
                    <span className="text-xs font-mono tabular-nums text-fg w-8 text-right">{a.count}</span>
                  </div>
                ))}
              </div>
            )}
          </section>

          {data.challenge.options && (
            <section>
              <h3 className="text-sm font-medium text-fg mb-2">The options</h3>
              <ol className="list-decimal pl-5 text-sm text-fg-secondary space-y-0.5">
                {data.challenge.options.map((option, i) => (
                  <li key={i}>{option}</li>
                ))}
              </ol>
            </section>
          )}

          <section>
            <h3 className="text-sm font-medium text-fg mb-2">Latest wrong answers</h3>
            {data.recent.length === 0 ? (
              <EmptyState>None kept.</EmptyState>
            ) : (
              <Table>
                <thead>
                  <tr>
                    <th>When</th>
                    <th>Where</th>
                    <th>Answer</th>
                  </tr>
                </thead>
                <tbody>
                  {data.recent.map((r, i) => (
                    <tr key={`${r.at}-${i}`}>
                      <td className="cell-mono text-fg-muted whitespace-nowrap">{when(r.at)}</td>
                      <td className="text-fg-secondary">
                        {CONTEXT_LABEL[r.context] ?? r.context}
                        {r.final && <span className="ml-1 text-xs text-warning">(shown)</span>}
                      </td>
                      <td className="text-fg">{r.answer}</td>
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
 * The first-run setup and placement (Phase 5), from every account: how many
 * finished or dismissed the setup, what they answered, placements, and each
 * stage's test-out pass rate. Guests are not counted - their answers stay in
 * their browser - and the card says so.
 */
const OnboardingCard: React.FC = () => {
  const [data, setData] = useState<OnboardingAnalytics | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    adminApi
      .onboardingAnalytics()
      .then(setData)
      .catch((err) => setError(err.message ?? 'Could not load the onboarding numbers.'));
  }, []);
  const bars = (rows: { id: string; label: string; count: number }[]) => {
    const max = Math.max(1, ...rows.map((r) => r.count));
    return (
      <div className="space-y-1.5">
        {rows.map((r) => (
          <div key={r.id} className="flex items-center gap-3">
            <span className="w-44 text-sm text-fg-secondary truncate" title={r.label}>
              {r.label}
            </span>
            <ProgressBar value={(r.count / max) * 100} size="sm" tone="neutral" className="flex-1" label={`${r.count} learners`} />
            <span className="text-xs font-mono tabular-nums text-fg w-8 text-right">{r.count}</span>
          </div>
        ))}
      </div>
    );
  };
  return (
    <Card className="mb-6">
      <h2 className="text-sm font-medium text-fg mb-1">Onboarding and placement</h2>
      <p className="text-xs text-fg-muted mb-4">
        Accounts only - guests are not counted, their answers stay in their browser. The setup's words and steps are under{' '}
        <Link to="/admin/rules/onboarding" className="underline">
          Onboarding
        </Link>
        .
      </p>
      {error && <ErrorText>{error}</ErrorText>}
      {!data && !error && <Spinner label="Loading onboarding numbers…" />}
      {data && (
        <div className="grid lg:grid-cols-2 gap-6">
          <section>
            <div className="flex flex-wrap gap-6 mb-4">
              <div>
                <div className="text-2xl font-semibold text-fg tabular-nums">{data.setup.completed}</div>
                <div className="text-xs text-fg-muted">finished the setup</div>
              </div>
              <div>
                <div className="text-2xl font-semibold text-fg tabular-nums">{data.setup.dismissed}</div>
                <div className="text-xs text-fg-muted">dismissed it</div>
              </div>
              <div>
                <div className="text-2xl font-semibold text-fg tabular-nums">{data.setup.notYet}</div>
                <div className="text-xs text-fg-muted">not yet ({data.setup.notYetWithProgress} with progress, never asked)</div>
              </div>
            </div>
            <h3 className="text-xs font-medium text-fg-secondary uppercase tracking-wide mb-2">Why they are learning</h3>
            {bars(data.answers.motivation.filter((r) => r.id !== 'other' || r.count > 0))}
            <p className="text-xs text-fg-muted mt-1">{data.answers.noMotivation} gave no answer.</p>
            <h3 className="text-xs font-medium text-fg-secondary uppercase tracking-wide mt-4 mb-2">How much they knew</h3>
            {bars(data.answers.experience)}
            <p className="text-xs text-fg-muted mt-1">{data.answers.noExperience} gave no answer.</p>
          </section>
          <section>
            <h3 className="text-xs font-medium text-fg-secondary uppercase tracking-wide mb-2">Placements</h3>
            <p className="text-sm text-fg-secondary">
              {data.placements.started} started · {data.placements.ended} ended · {data.placements.active} running
              {data.placements.medianStagesPlaced !== null ? ` · median ${data.placements.medianStagesPlaced} ${data.placements.medianStagesPlaced === 1 ? 'stage' : 'stages'} tested out` : ''}
            </p>
            <h3 className="text-xs font-medium text-fg-secondary uppercase tracking-wide mt-4 mb-2">Test-outs by stage</h3>
            {data.testOuts.length === 0 ? (
              <EmptyState>No test-outs yet.</EmptyState>
            ) : (
              <Table>
                <thead>
                  <tr>
                    <th>Stage</th>
                    <th>Taken</th>
                    <th>Passed</th>
                  </tr>
                </thead>
                <tbody>
                  {data.testOuts.map((t) => (
                    <tr key={t.stageId}>
                      <td className="cell-primary">{t.name}</td>
                      <td className="cell-num">{t.attempts}</td>
                      <td className="cell-num">
                        {t.passed} ({t.passRate}%)
                      </td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            )}
          </section>
        </div>
      )}
    </Card>
  );
};

/**
 * /admin/analytics. Every number here is derived from real records in
 * server/db.js: solves from the progress store, and "Most missed" from the
 * wrong answers learners actually gave (the activity store) - an honest
 * signal for "too hard or badly worded", never invented (see mostMissedRows
 * in server/admin.js).
 */
export const AdminAnalytics: React.FC = () => {
  const [data, setData] = useState<AnalyticsSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<MostMissedRow | null>(null);
  // "Edit feedback": the question wizard, on the question a row names.
  const [editing, setEditing] = useState<{ row: AdminChallengeRow; stages: AdminStageRow[] } | null>(null);
  const [editError, setEditError] = useState<string | null>(null);

  useEffect(() => {
    adminApi
      .analytics()
      .then(setData)
      .catch((err) => setError(err.message ?? 'Failed to load analytics.'));
  }, []);

  const editFeedback = async (m: MostMissedRow) => {
    setEditError(null);
    try {
      const [{ challenges }, { stages }] = await Promise.all([adminApi.challenges(m.stageId), adminApi.stages()]);
      const row = challenges.find((c) => c.id === m.id);
      if (!row) throw new Error('That question is no longer in the bank.');
      setEditing({ row, stages });
    } catch (err) {
      setEditError(err instanceof Error ? err.message : 'Could not open the question.');
    }
  };

  if (error) return <ErrorText>{error}</ErrorText>;
  if (!data) return <Spinner label="Loading analytics…" />;

  return (
    <div>
      <AdminPageHeader title="Analytics" description="Derived from real solves and real wrong answers. Nothing here is invented." />

      <div className="grid lg:grid-cols-2 gap-6 mb-6">
        <Card>
          <h2 className="text-sm font-medium text-fg mb-4">Challenges by language</h2>
          {Object.keys(data.challengesByLanguage).length === 0 ? (
            <EmptyState>No content yet.</EmptyState>
          ) : (
            <div className="space-y-2">
              {Object.entries(data.challengesByLanguage).map(([lang, count]) => {
                const max = Math.max(...Object.values(data.challengesByLanguage));
                return (
                  <div key={lang} className="flex items-center gap-3">
                    <span className="w-20 text-sm text-fg-secondary shrink-0">{LANGUAGE_LABEL[lang] ?? lang}</span>
                    <ProgressBar value={(count / max) * 100} size="sm" tone="neutral" className="flex-1" label={`${count} ${lang} challenges`} />
                    <span className="text-xs font-mono tabular-nums text-fg w-8 text-right">{count}</span>
                  </div>
                );
              })}
            </div>
          )}
        </Card>

        <Card>
          <h2 className="text-sm font-medium text-fg mb-2">Practice (7 days)</h2>
          {data.practice ? (
            <div className="flex flex-wrap gap-8">
              <div>
                <div className="text-2xl font-semibold text-fg tabular-nums">{data.practice.learners7d}</div>
                <div className="text-xs text-fg-muted">learners practiced</div>
              </div>
              <div>
                <div className="text-2xl font-semibold text-fg tabular-nums">{data.practice.xp7d.toLocaleString()}</div>
                <div className="text-xs text-fg-muted">Practice XP paid</div>
              </div>
            </div>
          ) : (
            <EmptyState>Practice numbers appear once the server has started fully.</EmptyState>
          )}
          <p className="text-xs text-fg-muted mt-3">
            Sessions over learners' mistakes and questions due for review. Their rules are under{' '}
            <Link to="/admin/rules/review" className="underline">
              Rules &amp; rewards › Practice sessions
            </Link>
            .
          </p>
        </Card>

        <Card>
          <h2 className="text-sm font-medium text-fg mb-2">Solves by stage</h2>
          {data.byStage.length === 0 ? (
            <EmptyState>No content yet.</EmptyState>
          ) : (
            <div className="max-h-56 overflow-y-auto scroll-thin row-list">
              {data.byStage.map((s) => (
                <div key={s.stageId} className="row py-2 text-sm">
                  <span className="text-fg-secondary truncate">{s.name}</span>
                  <span className="font-mono text-xs tabular-nums text-fg shrink-0 ml-2">{s.totalSolves}</span>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      <OnboardingCard />

      <Card className="p-0 overflow-hidden">
        <div className="panel-head">
          <div>
            <h2 className="panel-title">Most missed challenges</h2>
            <p className="text-xs text-fg-muted mt-0.5">
              The share of learners who got a question wrong at least once, from their recorded wrong answers. A question is listed once
              enough learners have missed it - set the minimum under{' '}
              <Link to="/admin/rules/retention" className="underline">
                Rules &amp; rewards › Data limits
              </Link>
              . Select a row for the wrong answers themselves.
            </p>
          </div>
        </div>
        {editError && (
          <div className="px-4 pt-3">
            <ErrorText>{editError}</ErrorText>
          </div>
        )}
        {data.mostMissed.length === 0 ? (
          <EmptyState>Not enough wrong answers yet to surface anything.</EmptyState>
        ) : (
          <Table>
            <thead>
              <tr>
                <th>Challenge</th>
                <th>Missed by</th>
                <th>Miss rate</th>
                <th>Wrong answers</th>
                <th>Most common wrong answer</th>
                <th>
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {data.mostMissed.map((m) => (
                <tr
                  key={m.id}
                  className="cursor-pointer hover:bg-surface-2"
                  tabIndex={0}
                  onClick={() => setOpen(m)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      setOpen(m);
                    }
                  }}
                  aria-label={`Show wrong answers for ${m.title}`}
                >
                  <td className="cell-primary">{m.title}</td>
                  <td className="cell-num">
                    {m.missedBy} / {m.learners}
                  </td>
                  <td className="cell-num">{percent(m.missRate)}</td>
                  <td className="cell-num">
                    {m.totalMisses}
                    {m.revealed > 0 && <span className="text-xs text-fg-muted"> · {m.revealed} shown</span>}
                  </td>
                  <td className="text-fg-secondary truncate max-w-xs">{m.topWrong[0]?.label ?? '—'}</td>
                  <td className="text-right">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={(e) => {
                        // The row opens the wrong answers; this opens the question itself.
                        e.stopPropagation();
                        void editFeedback(m);
                      }}
                      onKeyDown={(e) => e.stopPropagation()}
                      aria-label={`Edit the feedback on ${m.title}`}
                    >
                      <Pencil size={13} /> Edit feedback
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>

      <MissesDrawer row={open} onClose={() => setOpen(null)} />

      {editing && (
        <QuestionWizard
          stages={editing.stages}
          stageId={editing.row.stageId}
          existing={editing.row}
          onClose={() => setEditing(null)}
          onSaved={() => setEditing(null)}
        />
      )}
    </div>
  );
};
