import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Check, Pencil, Sparkles, X } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Dropdown } from '@/ui';
import { feedbackCoverage, feedbackLeaks } from '@/platform/grading-engine/feedback';
import {
  AdminApiError,
  AdminChallengeRow,
  AdminStageRow,
  BlankFeedback,
  FeedbackDraft,
  FeedbackItem,
  MostMissedRow,
  adminApi
} from '../services/adminApi';
import { AdminPageHeader, Badge, Button, Card, EmptyState, ErrorText, Spinner, Table } from '../components/ui';
import { KIND_LABEL, QuestionWizard, kindOf } from '../components/QuestionWizard';

/** Questions per Gemini request (the server's MAX_FEEDBACK_IDS), and per page run. */
const DRAFT_BATCH = 10;
const MAX_SELECTED = 50;

const ALL = '';
type Filter = 'all' | 'missing' | 'stale' | 'leaking';
const FILTERS: { value: Filter; label: string }[] = [
  { value: 'all', label: 'Every question with options or blanks' },
  { value: 'missing', label: 'No notes yet' },
  { value: 'stale', label: 'Notes out of date' },
  { value: 'leaking', label: 'Notes that give the answer away' }
];

const ELIGIBLE = new Set(['quiz', 'output_prediction', 'multi_select', 'fill_blank']);
const letter = (i: number) => String.fromCharCode(65 + i);

/** A draft being reviewed: Gemini's notes, as edited here, and the admin's verdict. */
interface Review {
  id: string;
  optionFeedback?: string[];
  blankFeedback?: BlankFeedback[];
  status: 'open' | 'accepted' | 'rejected';
  empty?: boolean;
}

/** Does the draft hold any note at all? Saving one without would save "no notes" over the question's. */
const reviewHasText = (review: Review): boolean =>
  (review.optionFeedback ?? []).some((n) => n.trim()) || (review.blankFeedback ?? []).some((b) => b.wrongAnswers.some((w) => w.feedback.trim()));

/** The question with the reviewed notes on it - for the live leak check. */
function withReview(row: AdminChallengeRow, review: Review): AdminChallengeRow {
  return {
    ...row,
    optionFeedback: review.optionFeedback ?? row.optionFeedback,
    blanks: row.blanks?.map((b, i) => ({ ...b, wrongAnswers: review.blankFeedback?.[i]?.wrongAnswers ?? b.wrongAnswers }))
  };
}

/**
 * /admin/feedback - the wrong-answer notes across the bank.
 *
 * Coverage per stage, then the questions to work on: no notes yet, notes out
 * of date (a built-in question's options changed in source since they were
 * saved), and notes that give the answer away (held back from learners until
 * the answer is shown). "Draft with Gemini" writes notes for the selected
 * questions; each draft is accepted, edited or rejected here, and "Save
 * accepted" stores the accepted ones. Nothing is saved without that click.
 */
export const AdminFeedback: React.FC = () => {
  const [stages, setStages] = useState<AdminStageRow[] | null>(null);
  const [rows, setRows] = useState<AdminChallengeRow[] | null>(null);
  const [missed, setMissed] = useState<MostMissedRow[]>([]);
  const [aiConfigured, setAiConfigured] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [stageId, setStageId] = useState(ALL);
  const [filter, setFilter] = useState<Filter>('missing');
  const [missedFirst, setMissedFirst] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [progress, setProgress] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [issues, setIssues] = useState<Array<{ id: string; message: string }>>([]);
  const [editing, setEditing] = useState<AdminChallengeRow | null>(null);

  const load = useCallback(() => {
    Promise.all([adminApi.stages(), adminApi.challenges()])
      .then(([s, c]) => {
        setStages(s.stages);
        setRows(c.challenges);
      })
      .catch((err) => setError(err.message ?? 'Could not load the questions.'));
    // Optional extras: the page works without them.
    adminApi
      .analytics()
      .then((a) => setMissed(a.mostMissed ?? []))
      .catch(() => setMissed([]));
    adminApi
      .aiStatus()
      .then((s) => setAiConfigured(s.configured))
      .catch(() => setAiConfigured(false));
  }, []);
  useEffect(load, [load]);

  const stageName = (id: string) => stages?.find((s) => s.id === id)?.name ?? id;

  /** Every question that takes notes, with what the page needs to know about it. */
  const eligible = useMemo(
    () =>
      (rows ?? [])
        .filter((r) => ELIGIBLE.has(r.type) && !r.hidden)
        .map((r) => ({ row: r, notes: feedbackCoverage(r).notes, stale: Boolean(r.feedbackStale), leaking: feedbackLeaks(r).size > 0 })),
    [rows]
  );

  const coverage = useMemo(() => {
    const out = new Map<string, { eligible: number; withNotes: number; stale: number; leaking: number }>();
    for (const item of eligible) {
      const c = out.get(item.row.stageId) ?? { eligible: 0, withNotes: 0, stale: 0, leaking: 0 };
      c.eligible += 1;
      if (item.notes > 0) c.withNotes += 1;
      if (item.stale) c.stale += 1;
      if (item.leaking) c.leaking += 1;
      out.set(item.row.stageId, c);
    }
    return out;
  }, [eligible]);

  const missRate = useMemo(() => new Map(missed.map((m) => [m.id, m])), [missed]);

  const visible = useMemo(() => {
    const list = eligible.filter(
      (item) =>
        (stageId === ALL || item.row.stageId === stageId) &&
        (filter === 'all' || (filter === 'missing' && item.notes === 0) || (filter === 'stale' && item.stale) || (filter === 'leaking' && item.leaking))
    );
    if (!missedFirst) return list;
    return [...list].sort((a, b) => (missRate.get(b.row.id)?.missRate ?? -1) - (missRate.get(a.row.id)?.missRate ?? -1));
  }, [eligible, stageId, filter, missedFirst, missRate]);

  const flash = (message: string) => {
    setNotice(message);
    window.setTimeout(() => setNotice((n) => (n === message ? null : n)), 5000);
  };

  const toggle = (id: string) =>
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : prev.length >= MAX_SELECTED ? prev : [...prev, id]));
  const allShown = visible.length > 0 && visible.slice(0, MAX_SELECTED).every((item) => selected.includes(item.row.id));
  const toggleAll = () => setSelected(allShown ? [] : visible.slice(0, MAX_SELECTED).map((item) => item.row.id));

  /** Gemini drafts notes for the selected questions, 10 per request; the drafts land below for review. */
  const draft = async () => {
    const ids = selected.filter((id) => !reviews.some((r) => r.id === id && r.status === 'open'));
    if (!ids.length) return;
    setError(null);
    setIssues([]);
    const drafted: FeedbackDraft[] = [];
    try {
      for (let i = 0; i < ids.length; i += DRAFT_BATCH) {
        const batch = ids.slice(i, i + DRAFT_BATCH);
        setProgress(`Drafting notes for ${Math.min(ids.length, i + batch.length)} of ${ids.length} questions…`);
        const res = await adminApi.aiFeedback(batch);
        drafted.push(...res.drafts);
      }
    } catch (err) {
      setError(err instanceof AdminApiError ? err.message : 'Gemini could not draft the notes.');
    } finally {
      setProgress(null);
    }
    if (!drafted.length) return;
    setReviews((prev) => [
      ...prev.filter((r) => !drafted.some((d) => d.id === r.id)),
      ...drafted.map((d): Review => ({ id: d.id, optionFeedback: d.optionFeedback, blankFeedback: d.blankFeedback, status: 'open', empty: d.empty }))
    ]);
    setSelected([]);
  };

  const updateReview = (id: string, patch: Partial<Review>) => setReviews((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  const accepted = reviews.filter((r) => r.status === 'accepted' && reviewHasText(r));

  const saveAccepted = async () => {
    if (!accepted.length) return;
    setSaving(true);
    setError(null);
    setIssues([]);
    try {
      const items: FeedbackItem[] = accepted.map((r) => (r.blankFeedback ? { id: r.id, blankFeedback: r.blankFeedback } : { id: r.id, optionFeedback: r.optionFeedback ?? null }));
      const res = await adminApi.saveFeedbackBulk(items);
      const saved = new Set(res.rows.map((r) => r.id));
      setRows((prev) => prev?.map((row) => res.rows.find((r) => r.id === row.id) ?? row) ?? null);
      setReviews((prev) => prev.filter((r) => !saved.has(r.id)));
      setIssues(res.issues.map((i) => ({ id: i.id, message: i.message })));
      if (saved.size) flash(`Saved the notes for ${saved.size} question${saved.size === 1 ? '' : 's'}. Learners see them now.`);
    } catch (err: any) {
      setError(err.message ?? 'Could not save the notes.');
    } finally {
      setSaving(false);
    }
  };

  const rowById = (id: string) => rows?.find((r) => r.id === id) ?? null;

  return (
    <div>
      <AdminPageHeader
        title="Answer feedback"
        description="The notes a learner reads after a wrong answer: one per option, or per common wrong answer to a blank. A note explains the mistake without giving the answer away - one that names the answer is held back until the answer is shown. How many tries come before that is set under Rules & rewards."
        actions={
          <Link to="/admin/rules/feedback" className="btn btn-line">
            Tries and retries
          </Link>
        }
      />

      {error && <ErrorText>{error}</ErrorText>}
      {notice && (
        <p className="text-sm text-success mb-4" role="status">
          {notice}
        </p>
      )}

      {!rows || !stages ? (
        <Spinner />
      ) : (
        <>
          <Card className="p-0 overflow-hidden mb-6">
            <Table>
              <thead>
                <tr>
                  <th>Stage</th>
                  <th>With options or blanks</th>
                  <th>With notes</th>
                  <th>Out of date</th>
                  <th>Give the answer away</th>
                </tr>
              </thead>
              <tbody>
                {stages
                  .filter((s) => coverage.has(s.id))
                  .map((s) => {
                    const c = coverage.get(s.id)!;
                    return (
                      <tr key={s.id}>
                        <td className="cell-primary">
                          <button type="button" className="link-btn" onClick={() => setStageId(s.id)}>
                            {s.name}
                          </button>
                        </td>
                        <td className="cell-num">{c.eligible}</td>
                        <td className="cell-num">
                          {c.withNotes} <span className="text-fg-muted">({Math.round((c.withNotes / Math.max(1, c.eligible)) * 100)}%)</span>
                        </td>
                        <td className="cell-num">{c.stale ? <Badge tone="warning">{c.stale}</Badge> : 0}</td>
                        <td className="cell-num">{c.leaking ? <Badge tone="warning">{c.leaking}</Badge> : 0}</td>
                      </tr>
                    );
                  })}
              </tbody>
            </Table>
          </Card>

          <div className="flex flex-wrap items-center gap-2 mb-3">
            <Dropdown
              value={stageId}
              onChange={setStageId}
              size="md"
              options={[{ value: ALL, label: 'All stages' }, ...stages.filter((s) => coverage.has(s.id)).map((s) => ({ value: s.id, label: s.name }))]}
              ariaLabel="Stage"
            />
            <Dropdown value={filter} onChange={(v) => setFilter(v as Filter)} size="md" options={FILTERS} ariaLabel="Show" />
            <label className="inline-flex items-center gap-2 text-sm text-fg-secondary">
              <input type="checkbox" checked={missedFirst} onChange={(e) => setMissedFirst(e.target.checked)} />
              Most missed first
            </label>
            <span className="flex-1" />
            <Button
              variant="primary"
              onClick={draft}
              disabled={!selected.length || progress !== null || aiConfigured === false}
              title={aiConfigured === false ? 'Gemini is not set up on this server.' : 'Gemini writes notes for the selected questions; nothing is saved until you accept them.'}
            >
              <Sparkles size={14} /> Draft with Gemini{selected.length ? ` (${selected.length})` : ''}
            </Button>
          </div>
          {aiConfigured === false && (
            <p className="text-xs text-fg-muted mb-3">Gemini is not set up on this server, so notes can be written by hand only (Edit on a row).</p>
          )}
          {progress && (
            <p className="text-sm text-fg-secondary mb-3" role="status">
              {progress}
            </p>
          )}

          {visible.length === 0 ? (
            <EmptyState>{filter === 'missing' ? 'Every question here has notes.' : 'No questions match.'}</EmptyState>
          ) : (
            <Card className="p-0 overflow-hidden mb-6">
              <Table>
                <thead>
                  <tr>
                    <th>
                      <input type="checkbox" checked={allShown} onChange={toggleAll} aria-label="Select every question shown (at most 50)" />
                    </th>
                    {stageId === ALL && <th>Stage</th>}
                    <th>Question</th>
                    <th>Type</th>
                    <th>Notes</th>
                    <th>Missed by</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {visible.map(({ row, notes, stale, leaking }) => {
                    const m = missRate.get(row.id);
                    return (
                      <tr key={row.id}>
                        <td>
                          <input type="checkbox" checked={selected.includes(row.id)} onChange={() => toggle(row.id)} aria-label={`Select ${row.title}`} />
                        </td>
                        {stageId === ALL && <td className="text-xs whitespace-nowrap">{stageName(row.stageId)}</td>}
                        <td>
                          <div className="cell-primary">{row.title}</div>
                          <div className="text-xs text-fg-muted line-clamp-1 max-w-md">{row.prompt}</div>
                        </td>
                        <td className="cell-mono">{KIND_LABEL[kindOf(row)] ?? row.type}</td>
                        <td>
                          <div className="flex flex-wrap gap-1">
                            {notes > 0 ? <Badge tone="success">{notes}</Badge> : <Badge>None</Badge>}
                            {stale && <Badge tone="warning">Out of date</Badge>}
                            {leaking && <Badge tone="warning">Gives the answer away</Badge>}
                          </div>
                        </td>
                        <td className="cell-num">{m ? `${Math.round(m.missRate * 100)}% of ${m.learners}` : '—'}</td>
                        <td className="text-right">
                          <Button variant="ghost" size="sm" onClick={() => setEditing(row)} aria-label={`Edit ${row.title}`} title="Edit the question and its notes">
                            <Pencil size={14} />
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </Table>
            </Card>
          )}

          {issues.length > 0 && (
            <ul className="mb-4 text-sm text-error list-disc pl-5" role="alert">
              {issues.map((i) => (
                <li key={`${i.id}:${i.message}`}>
                  {rowById(i.id)?.title ?? i.id}: {i.message}
                </li>
              ))}
            </ul>
          )}

          {reviews.length > 0 && (
            <section aria-label="Drafts to review">
              <div className="flex flex-wrap items-center gap-2 mb-3">
                <h2 className="text-base font-medium text-fg">Drafts to review</h2>
                <span className="text-sm text-fg-muted">
                  {accepted.length} of {reviews.length} accepted
                </span>
                <span className="flex-1" />
                <Button variant="primary" onClick={saveAccepted} disabled={!accepted.length || saving}>
                  {saving ? 'Saving…' : `Save accepted (${accepted.length})`}
                </Button>
              </div>
              <div className="flex flex-col gap-4">
                {reviews.map((review) => {
                  const row = rowById(review.id);
                  if (!row) return null;
                  return (
                    <DraftCard
                      key={review.id}
                      row={row}
                      review={review}
                      onChange={(patch) => updateReview(review.id, { ...patch, status: review.status === 'rejected' ? 'open' : review.status })}
                      onAccept={() => updateReview(review.id, { status: 'accepted' })}
                      onReject={() => updateReview(review.id, { status: 'rejected' })}
                      onDrop={() => setReviews((prev) => prev.filter((r) => r.id !== review.id))}
                    />
                  );
                })}
              </div>
            </section>
          )}
        </>
      )}

      {editing && stages && (
        <QuestionWizard
          stages={stages}
          stageId={editing.stageId}
          existing={editing}
          onClose={() => setEditing(null)}
          onSaved={(saved) => {
            setEditing(null);
            setRows((prev) => prev?.map((r) => (r.id === saved.id ? saved : r)) ?? null);
            flash(`"${saved.title}" saved.`);
          }}
        />
      )}
    </div>
  );
};

/** One draft: the question, each option (correct ones marked) or blank, the editable notes, and accept / reject. */
const DraftCard: React.FC<{
  row: AdminChallengeRow;
  review: Review;
  onChange: (patch: Partial<Review>) => void;
  onAccept: () => void;
  onReject: () => void;
  onDrop: () => void;
}> = ({ row, review, onChange, onAccept, onReject, onDrop }) => {
  const leaks = feedbackLeaks(withReview(row, review));
  const correct = new Set(row.type === 'multi_select' ? row.correctIndices ?? [] : [row.correctIndex]);
  // Accepting a draft with no note in it would save "no notes" over any the question has.
  const hasText = reviewHasText(review);
  const tone = review.status === 'accepted' ? 'border-success' : review.status === 'rejected' ? 'opacity-60' : '';

  return (
    <Card className={tone}>
      <div className="flex flex-wrap items-start gap-2 mb-3">
        <div className="min-w-0 flex-1">
          <div className="cell-primary">{row.title}</div>
          <div className="text-sm text-fg-secondary">{row.prompt}</div>
        </div>
        {review.status === 'accepted' && <Badge tone="success">Accepted</Badge>}
        {review.status === 'rejected' && <Badge>Rejected</Badge>}
        {review.empty && <Badge tone="warning">Gemini wrote nothing</Badge>}
      </div>

      {review.optionFeedback && (
        <ol className="flex flex-col gap-3">
          {(row.options ?? []).map((option, i) => (
            <li key={i} className="min-w-0">
              <div className="text-sm">
                <span className="font-mono text-fg-muted mr-2">{letter(i)}</span>
                <code className="font-mono">{option}</code>
                {correct.has(i) && (
                  <span className="ml-2">
                    <Badge tone="success">Correct</Badge>
                  </span>
                )}
              </div>
              <textarea
                className="w-full mt-1"
                rows={2}
                maxLength={600}
                value={review.optionFeedback?.[i] ?? ''}
                aria-label={correct.has(i) ? `Why option ${letter(i)} is right` : `Why option ${letter(i)} is wrong`}
                placeholder={correct.has(i) ? 'Why this is right (shown once the answer is revealed) - optional' : 'Why a learner might pick this, and why it is wrong'}
                onChange={(e) => onChange({ optionFeedback: (row.options ?? []).map((_, j) => (j === i ? e.target.value : review.optionFeedback?.[j] ?? '')) })}
              />
              {leaks.has(`o${i}`) && <p className="field-hint text-warning">This note gives the right answer away - learners see it only once the answer is shown.</p>}
            </li>
          ))}
        </ol>
      )}

      {review.blankFeedback && (
        <ol className="flex flex-col gap-3">
          {(row.blanks ?? []).map((blank, i) => {
            const wrong = review.blankFeedback?.[i]?.wrongAnswers ?? [];
            const setRows = (next: BlankFeedback['wrongAnswers']) =>
              onChange({ blankFeedback: (row.blanks ?? []).map((_, j) => (j === i ? { wrongAnswers: next } : review.blankFeedback?.[j] ?? { wrongAnswers: [] })) });
            return (
              <li key={i} className="min-w-0">
                <div className="text-sm">
                  Blank {i + 1} - answer <code className="font-mono">{blank.answer}</code>
                  {blank.choices?.length ? <span className="text-fg-muted"> (dropdown)</span> : null}
                </div>
                {wrong.length === 0 && <p className="text-xs text-fg-muted">No wrong answers drafted.</p>}
                {wrong.map((w, j) => (
                  <div key={j} className="grid grid-cols-1 sm:grid-cols-[9rem_1fr_auto] gap-2 mt-1 items-start">
                    <code className="font-mono text-sm pt-1 break-all">{w.answer}</code>
                    <div className="min-w-0">
                      <textarea
                        className="w-full"
                        rows={2}
                        maxLength={600}
                        value={w.feedback}
                        aria-label={`Why "${w.answer}" is wrong`}
                        onChange={(e) => setRows(wrong.map((x, k) => (k === j ? { ...x, feedback: e.target.value } : x)))}
                      />
                      {leaks.has(`b${i}.${j}`) && <p className="field-hint text-warning">This note names the right answer - learners see it only once the answer is shown.</p>}
                    </div>
                    <Button variant="ghost" size="sm" onClick={() => setRows(wrong.filter((_, k) => k !== j))} aria-label={`Remove the note for "${w.answer}"`}>
                      <X size={13} />
                    </Button>
                  </div>
                ))}
              </li>
            );
          })}
        </ol>
      )}

      <div className="flex flex-wrap gap-2 mt-4">
        <Button
          variant={review.status === 'accepted' ? 'secondary' : 'primary'}
          size="sm"
          onClick={onAccept}
          disabled={review.status === 'accepted' || !hasText}
          title={hasText ? undefined : 'There is no note to save yet - write one above, or reject this draft.'}
        >
          <Check size={13} /> Accept
        </Button>
        <Button variant="secondary" size="sm" onClick={onReject} disabled={review.status === 'rejected'}>
          Reject
        </Button>
        {review.status === 'rejected' && (
          <Button variant="ghost" size="sm" onClick={onDrop}>
            Remove from the list
          </Button>
        )}
      </div>
    </Card>
  );
};
