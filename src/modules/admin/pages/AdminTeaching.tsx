import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Eye, EyeOff, Pencil, Plus, RotateCcw, Trash2 } from 'lucide-react';
import { Dropdown, ProgressBar } from '@/ui';
import { AdminApiError, adminApi } from '../services/adminApi';
import type { AdminStageRow, ConceptAnchor, ConceptLesson, ConceptRow, ConceptsView } from '../services/adminApi';
import { AdminPageHeader, Badge, Button, Card, ConfirmDialog, EmptyState, ErrorText, Spinner, Table } from '../components/ui';
import { ConceptEditor } from '../components/ConceptEditor';

const SOURCE_LABEL: Record<ConceptRow['source'], string> = { authored: 'Built in', modified: 'Edited', created: 'Admin card' };
const PROBLEM_LABEL: Record<string, string> = {
  'anchor-missing': 'Its lesson is hidden or gone - learners do not get it.',
  'lesson-has-concept': 'Its lesson already has another card - learners do not get this one.'
};

/**
 * /admin/teaching - the Learn-mode teaching cards ("concepts") of a stage.
 *
 * A coverage bar ("2 of 20 lessons have teaching"), then one row per lesson:
 * none, a built-in card, one edited here, a card written here, or hidden.
 * Add, Edit, Hide or Unhide, Revert (a built-in card edited here) and Delete
 * (a card written here). A card goes before a lesson, at the start of the
 * stage or at the start of a unit; the editor has every field of a concept.
 * Learners get the change on their next content load - nothing is deployed.
 */
export const AdminTeaching: React.FC = () => {
  const [params, setParams] = useSearchParams();
  const [stages, setStages] = useState<AdminStageRow[] | null>(null);
  const [view, setView] = useState<ConceptsView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ row: ConceptRow | null; anchor: ConceptAnchor | null } | null>(null);
  const [confirm, setConfirm] = useState<{ kind: 'delete' | 'revert'; row: ConceptRow } | null>(null);
  const [busy, setBusy] = useState(false);

  const stageId = params.get('stageId') ?? stages?.[0]?.id ?? '';
  const stage = stages?.find((s) => s.id === stageId) ?? null;

  useEffect(() => {
    adminApi
      .stages()
      .then((s) => setStages(s.stages))
      .catch((err) => setError(err.message ?? 'Could not load the stages.'));
  }, []);

  const load = useCallback(() => {
    if (!stageId) return;
    adminApi
      .concepts(stageId)
      .then(setView)
      .catch((err) => setError(err.message ?? 'Could not load the teaching cards.'));
  }, [stageId]);
  useEffect(load, [load]);

  const flash = (message: string) => {
    setNotice(message);
    window.setTimeout(() => setNotice((m) => (m === message ? null : m)), 4000);
  };

  const rowsByKey = useMemo(() => new Map((view?.rows ?? []).map((r) => [r.key, r])), [view]);
  const coverage = view?.coverage.find((c) => c.stageId === stageId) ?? null;
  // Cards of this stage learners do not get (a hidden lesson, or two cards on one lesson).
  const unplaced = (view?.rows ?? []).filter((r) => r.orphaned);

  const act = async (fn: () => Promise<unknown>, done: string) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
      flash(done);
      load();
    } catch (err) {
      setError(err instanceof AdminApiError ? err.message : 'That did not work - try again.');
    } finally {
      setBusy(false);
      setConfirm(null);
    }
  };

  if (error && !stages) return <ErrorText>{error}</ErrorText>;
  if (!stages) return <Spinner label="Loading stages…" />;

  const statusOf = (lesson: ConceptLesson) => {
    if (!lesson.concept) return <span className="text-fg-muted">None</span>;
    return (
      <span className="inline-flex flex-wrap items-center gap-1.5">
        <Badge tone={lesson.concept.source === 'created' ? 'success' : 'default'}>{SOURCE_LABEL[lesson.concept.source]}</Badge>
        {lesson.concept.hidden && <Badge tone="warning">Hidden</Badge>}
        <span className="text-fg-secondary truncate">{lesson.concept.title}</span>
      </span>
    );
  };

  const actionsFor = (lesson: ConceptLesson) => {
    const row = lesson.concept ? rowsByKey.get(lesson.concept.key) ?? null : null;
    if (!row) {
      return (
        <Button size="sm" variant="secondary" onClick={() => setEditing({ row: null, anchor: { kind: 'lesson', challengeId: lesson.id } })} disabled={busy}>
          <Plus size={13} /> Add
        </Button>
      );
    }
    return (
      <div className="flex flex-wrap gap-1.5 justify-end">
        <Button size="sm" variant="secondary" onClick={() => setEditing({ row, anchor: null })} disabled={busy}>
          <Pencil size={13} /> Edit
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => void act(() => adminApi.setConceptHidden(row.key, !row.hidden), row.hidden ? 'Card shown to learners again.' : 'Card hidden from learners.')}
          disabled={busy}
        >
          {row.hidden ? <Eye size={13} /> : <EyeOff size={13} />} {row.hidden ? 'Unhide' : 'Hide'}
        </Button>
        {row.source === 'modified' && (
          <Button size="sm" variant="ghost" onClick={() => setConfirm({ kind: 'revert', row })} disabled={busy}>
            <RotateCcw size={13} /> Revert
          </Button>
        )}
        {row.source === 'created' && (
          <Button size="sm" variant="ghost" onClick={() => setConfirm({ kind: 'delete', row })} disabled={busy}>
            <Trash2 size={13} /> Delete
          </Button>
        )}
      </div>
    );
  };

  return (
    <div>
      <AdminPageHeader
        title="Teaching"
        description="The short lessons Learn mode shows before a question: what the idea is, an example, why it works and a try-it. Edit a built-in card, or write one for any lesson, the start of a stage or the start of a unit. Learners get changes the next time their lessons load."
        actions={
          <Button variant="primary" onClick={() => setEditing({ row: null, anchor: null })} disabled={!view}>
            <Plus size={14} /> New card
          </Button>
        }
      />

      {error && <ErrorText>{error}</ErrorText>}
      {notice && (
        <p className="text-sm text-success mb-4" role="status">
          {notice}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-3 mb-4">
        <Dropdown
          value={stageId}
          onChange={(id) => setParams({ stageId: id })}
          size="md"
          options={stages.map((s) => ({ value: s.id, label: `${s.index} · ${s.name}${s.hidden ? ' (hidden)' : ''}` }))}
          ariaLabel="Stage"
        />
        {coverage && (
          <div className="flex items-center gap-3 min-w-[14rem] flex-1 max-w-md">
            <ProgressBar
              value={(coverage.withConcept / Math.max(1, coverage.lessons)) * 100}
              size="sm"
              className="flex-1"
              label={`${coverage.withConcept} of ${coverage.lessons} lessons have teaching`}
            />
            <span className="text-sm text-fg-secondary whitespace-nowrap">
              {coverage.withConcept} of {coverage.lessons} lessons have teaching
            </span>
          </div>
        )}
      </div>

      {!view ? (
        <Spinner label="Loading teaching cards…" />
      ) : (
        <>
          {unplaced.length > 0 && (
            <Card className="mb-4">
              <h2 className="text-sm font-medium text-fg mb-2">Cards learners do not get</h2>
              <ul className="space-y-2">
                {unplaced.map((row) => (
                  <li key={row.key} className="flex flex-wrap items-center gap-2 text-sm">
                    <span className="text-fg">{row.concept?.title ?? row.key}</span>
                    <span className="text-fg-muted">{row.problem ? PROBLEM_LABEL[row.problem] : ''}</span>
                    <span className="flex-1" />
                    <Button size="sm" variant="secondary" onClick={() => setEditing({ row, anchor: null })} disabled={busy}>
                      <Pencil size={13} /> Edit
                    </Button>
                    {row.source === 'created' && (
                      <Button size="sm" variant="ghost" onClick={() => setConfirm({ kind: 'delete', row })} disabled={busy}>
                        <Trash2 size={13} /> Delete
                      </Button>
                    )}
                  </li>
                ))}
              </ul>
            </Card>
          )}

          {(view.lessons ?? []).length === 0 ? (
            <EmptyState>This stage has no lessons yet.</EmptyState>
          ) : (
            <Card className="p-0 overflow-hidden">
              <Table>
                <thead>
                  <tr>
                    <th>Lesson</th>
                    <th>Teaching card</th>
                    <th className="text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {(view.lessons ?? []).map((lesson) => (
                    <tr key={lesson.id}>
                      <td className="cell-primary">
                        {lesson.title}
                        {lesson.hidden && (
                          <span className="ml-2">
                            <Badge>Hidden lesson</Badge>
                          </span>
                        )}
                      </td>
                      <td className="max-w-xs">{statusOf(lesson)}</td>
                      <td className="text-right">{actionsFor(lesson)}</td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </Card>
          )}
        </>
      )}

      {editing && view && (
        <ConceptEditor
          open
          stageId={stageId}
          stageLanguage={stage?.language}
          lessons={view.lessons ?? []}
          units={view.units ?? []}
          existing={editing.row}
          initialAnchor={editing.anchor}
          onClose={() => setEditing(null)}
          onSaved={(row) => {
            setEditing(null);
            flash(`"${row.concept?.title ?? row.key}" saved.`);
            load();
          }}
        />
      )}

      <ConfirmDialog
        open={Boolean(confirm)}
        title={confirm?.kind === 'delete' ? 'Delete this card?' : 'Revert this card?'}
        message={
          confirm?.kind === 'delete'
            ? 'Learners stop seeing it the next time their lessons load. This cannot be undone.'
            : 'The card goes back to the version that ships with the app. Your edit is discarded.'
        }
        confirmLabel={confirm?.kind === 'delete' ? 'Delete' : 'Revert'}
        busy={busy}
        onCancel={() => setConfirm(null)}
        onConfirm={() => {
          if (!confirm) return;
          const { kind, row } = confirm;
          void act(
            () => (kind === 'delete' ? adminApi.deleteConcept(row.key) : adminApi.revertConcept(row.key)),
            kind === 'delete' ? 'Card deleted.' : 'Card reverted to the built-in version.'
          );
        }}
      />
    </div>
  );
};
