import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { AnalyticsSummary, ChallengeMisses, MostMissedRow, adminApi } from '../services/adminApi';
import { AdminPageHeader, Badge, Card, Drawer, EmptyState, ErrorText, Spinner, Table } from '../components/ui';
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

  useEffect(() => {
    adminApi
      .analytics()
      .then(setData)
      .catch((err) => setError(err.message ?? 'Failed to load analytics.'));
  }, []);

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
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>

      <MissesDrawer row={open} onClose={() => setOpen(null)} />
    </div>
  );
};
