import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Eye, EyeOff, Pencil, Plus, RotateCcw, Sparkles, Trash2 } from 'lucide-react';
import { Dropdown } from '@/ui';
import { AdminChallengeRow, AdminStageRow, QuestionInput, adminApi } from '../services/adminApi';
import { AdminPageHeader, Badge, Button, Card, ConfirmDialog, EmptyState, ErrorText, Spinner, Table } from '../components/ui';
import { KIND_LABEL, KINDS, Kind, QuestionWizard, kindOf } from '../components/QuestionWizard';
import { AiQuestionAssistant } from '../components/AiQuestionAssistant';

const DIFFICULTY_TONE: Record<string, 'default' | 'success' | 'warning' | 'danger'> = {
  easy: 'success',
  medium: 'warning',
  hard: 'danger'
};

/** The Dropdown's value for "every stage at once". */
const ALL_STAGES = '';

type Source = 'all' | 'authored' | 'modified' | 'custom';
const SOURCE_OPTIONS: { value: Source; label: string }[] = [
  { value: 'all', label: 'Source: All' },
  { value: 'authored', label: 'Source: Built-in' },
  { value: 'modified', label: 'Source: Edited here' },
  { value: 'custom', label: 'Source: Written here' }
];
const sourceOf = (c: AdminChallengeRow): Source => (c.custom ? 'custom' : c.modified ? 'modified' : 'authored');

/**
 * /admin/challenges.
 *
 * Every question is in one of three states. AUTHORED ones live in TypeScript
 * under src/modules/challenges/content and go through validate-content.mjs.
 * Editing one here saves a full replacement under the same id - it is then
 * MODIFIED ("Edited here"): learners see the replacement in the original's
 * place, and "Put the original back" deletes it again. CREATED ones ("Written
 * here") come from the wizard, sit after the authored lessons of their stage,
 * and can be deleted outright. Removing a question from a stage (hide) works
 * on all three and is reversible. Every save goes through the server's
 * content rules (and, for code, actually runs the solution).
 */
export const AdminChallenges: React.FC = () => {
  const [stages, setStages] = useState<AdminStageRow[] | null>(null);
  // null until the stages arrive: '' is a real choice (all stages), so it cannot mean "not yet".
  const [stageId, setStageId] = useState<string | null>(null);
  const [challenges, setChallenges] = useState<AdminChallengeRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  // `draft` is a question the AI assistant wrote, handed over for edits by hand.
  const [wizard, setWizard] = useState<{ existing: AdminChallengeRow | null; initialKind?: Kind; draft?: QuestionInput } | null>(null);
  const [assistant, setAssistant] = useState(false);
  const [confirm, setConfirm] = useState<{ row: AdminChallengeRow; mode: 'delete' | 'hide' | 'revert' } | null>(null);
  const [kindFilter, setKindFilter] = useState<Kind | 'all'>('all');
  const [source, setSource] = useState<Source>('all');
  const [search, setSearch] = useState('');

  useEffect(() => {
    adminApi
      .stages()
      .then((res) => {
        setStages(res.stages);
        setStageId(res.stages[0]?.id ?? ALL_STAGES);
      })
      .catch((err) => setError(err.message ?? 'Failed to load stages.'));
  }, []);

  const loadChallenges = useCallback((forStageId: string) => {
    adminApi
      .challenges(forStageId || undefined)
      .then((res) => setChallenges(res.challenges))
      .catch((err) => setError(err.message ?? 'Failed to load challenges.'));
  }, []);

  useEffect(() => {
    if (stageId !== null) loadChallenges(stageId);
  }, [stageId, loadChallenges]);

  const stageName = (id: string) => stages?.find((s) => s.id === id)?.name ?? id;

  // Counts per kind over what is loaded: the stage, or every stage at once.
  const counts = useMemo(() => {
    const out: Partial<Record<Kind, number>> = {};
    for (const c of challenges ?? []) {
      const k = kindOf(c);
      out[k] = (out[k] ?? 0) + 1;
    }
    return out;
  }, [challenges]);

  // The same, per stage, for the wizard's type cards - which must talk about
  // the stage the question is going into, not whatever the table shows.
  const countsByStage = useMemo(() => {
    const out = new Map<string, Partial<Record<Kind, number>>>();
    for (const c of challenges ?? []) {
      const k = kindOf(c);
      const stageCounts = out.get(c.stageId) ?? {};
      stageCounts[k] = (stageCounts[k] ?? 0) + 1;
      out.set(c.stageId, stageCounts);
    }
    return out;
  }, [challenges]);
  // Only stages whose rows are loaded are known: in "All stages" that is every
  // stage (an unloaded one is simply empty); otherwise just the selected one.
  const countsFor = useCallback(
    (forStageId: string) => (stageId === ALL_STAGES || forStageId === stageId ? countsByStage.get(forStageId) ?? {} : null),
    [stageId, countsByStage]
  );

  // A question's number is its place in its stage's FULL list, whatever the filters hide.
  const positions = useMemo(() => {
    const perStage = new Map<string, number>();
    const out = new Map<string, number>();
    for (const c of challenges ?? []) {
      const n = (perStage.get(c.stageId) ?? 0) + 1;
      perStage.set(c.stageId, n);
      out.set(c.id, n);
    }
    return out;
  }, [challenges]);

  const visible = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return (challenges ?? []).filter(
      (c) =>
        (kindFilter === 'all' || kindOf(c) === kindFilter) &&
        (source === 'all' || sourceOf(c) === source) &&
        (!needle || c.title.toLowerCase().includes(needle) || c.prompt.toLowerCase().includes(needle) || c.id.toLowerCase().includes(needle))
    );
  }, [challenges, kindFilter, source, search]);

  const flash = (message: string) => {
    setNotice(message);
    window.setTimeout(() => setNotice((n) => (n === message ? null : n)), 4000);
  };

  const setHidden = async (row: AdminChallengeRow, hidden: boolean) => {
    setError(null);
    try {
      await adminApi.updateChallenge(row.id, { hidden });
      setChallenges((prev) => prev?.map((c) => (c.id === row.id ? { ...c, hidden } : c)) ?? null);
      flash(hidden ? `"${row.title}" removed from the stage. Learners will not see it; restore it any time.` : `"${row.title}" is back in the stage.`);
    } catch (err: any) {
      setError(err.message ?? 'Could not update the question.');
    }
  };

  const remove = async (row: AdminChallengeRow) => {
    setError(null);
    try {
      await adminApi.deleteQuestion(row.id);
      setChallenges((prev) => prev?.filter((c) => c.id !== row.id) ?? null);
      flash(`"${row.title}" deleted.`);
    } catch (err: any) {
      setError(err.message ?? 'Could not delete the question.');
    }
  };

  const revert = async (row: AdminChallengeRow) => {
    setError(null);
    try {
      const res = await adminApi.revertQuestion(row.id);
      setChallenges((prev) => prev?.map((c) => (c.id === row.id ? res.challenge : c)) ?? null);
      flash(`"${res.challenge.title}" is back to the built-in version.`);
    } catch (err: any) {
      setError(err.message ?? 'Could not put the original back.');
    }
  };

  const onSaved = (row: AdminChallengeRow, existing: AdminChallengeRow | null) => {
    setWizard(null);
    setChallenges((prev) => {
      if (!prev) return [row];
      const next = [...prev];
      const i = next.findIndex((c) => c.id === row.id);
      if (i !== -1) next[i] = row;
      else {
        // A created question goes last in its stage - in "All stages" that is not the end of the table.
        let after = -1;
        next.forEach((c, j) => {
          if (c.stageId === row.stageId) after = j;
        });
        next.splice(after === -1 ? next.length : after + 1, 0, row);
      }
      return next;
    });
    // Saved into another stage: follow it there so the admin sees the result.
    if (stageId !== ALL_STAGES && row.stageId !== stageId) setStageId(row.stageId);
    if (!existing) flash(`"${row.title}" added to ${stageName(row.stageId)}. Learners see it now.`);
    else if (!existing.custom) flash(`"${row.title}" updated - learners see your version now.`);
    else flash(`"${row.title}" updated.`);
  };

  const openNew = (initialKind?: Kind) => setWizard({ existing: null, initialKind });
  const total = challenges?.length ?? 0;
  const filterLabel = kindFilter === 'all' ? '' : KIND_LABEL[kindFilter];
  const stageWord = stageId === ALL_STAGES ? 'any stage' : 'this stage';

  return (
    <div>
      <AdminPageHeader
        title="Challenges"
        description="Built-in questions can be edited in full here - your version is saved alongside and shown to learners instead, and you can put the original back at any time. Questions written here with the wizard can be edited or deleted outright. Every save is checked against the content rules (and run, for code) first."
        actions={
          stages && stages.length > 0 ? (
            <>
              <Dropdown
                value={stageId ?? ALL_STAGES}
                onChange={setStageId}
                size="md"
                options={[{ value: ALL_STAGES, label: 'All stages' }, ...stages.map((s) => ({ value: s.id, label: s.name }))]}
                ariaLabel="Select stage"
              />
              <Button variant="primary" onClick={() => openNew()}>
                <Plus size={14} /> New question
              </Button>
              <Button variant="secondary" onClick={() => setAssistant(true)} title="Describe a question and let Gemini write it, place it and check it is not already in the bank">
                <Sparkles size={14} /> AI new question
              </Button>
            </>
          ) : undefined
        }
      />

      {error && <ErrorText>{error}</ErrorText>}
      {notice && (
        <p className="text-sm text-success mb-4" role="status">
          {notice}
        </p>
      )}

      {!stages || !challenges ? (
        <Spinner />
      ) : (
        <>
          <div className="flex flex-col gap-3 mb-4">
            <div className="type-pills" role="group" aria-label="Question type">
              <button type="button" className="type-pill" aria-pressed={kindFilter === 'all'} onClick={() => setKindFilter('all')}>
                All <span className="type-pill-count">({total})</span>
              </button>
              {KINDS.map((k) => {
                const n = counts[k.kind] ?? 0;
                return (
                  <button
                    key={k.kind}
                    type="button"
                    className={`type-pill ${n === 0 ? 'is-empty' : ''}`.trim()}
                    aria-pressed={kindFilter === k.kind}
                    onClick={() => setKindFilter(k.kind)}
                    title={n === 0 ? `No ${KIND_LABEL[k.kind]} questions in ${stageWord} yet` : k.title}
                  >
                    {KIND_LABEL[k.kind]} <span className="type-pill-count">({n})</span>
                  </button>
                );
              })}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <input
                type="search"
                className="w-full sm:w-72"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search title, prompt or id"
                aria-label="Search questions"
              />
              <Dropdown value={source} onChange={(v) => setSource(v as Source)} size="md" options={SOURCE_OPTIONS} ariaLabel="Source" />
            </div>
          </div>

          {challenges.length === 0 ? (
            <EmptyState>
              {stageId === ALL_STAGES ? 'There are no questions yet.' : 'This stage has no questions yet.'}
              <div className="mt-3">
                <Button variant="primary" onClick={() => openNew()}>
                  <Plus size={14} /> Add the first question
                </Button>
              </div>
            </EmptyState>
          ) : visible.length === 0 ? (
            <EmptyState>
              {kindFilter !== 'all' && !counts[kindFilter] ? `No ${filterLabel} questions in ${stageWord} yet.` : 'No questions match these filters.'}
              <div className="mt-3">
                <Button variant="primary" onClick={() => openNew(kindFilter === 'all' ? undefined : kindFilter)}>
                  <Plus size={14} /> {kindFilter === 'all' ? 'Add a question' : `Add a ${filterLabel} question`}
                </Button>
              </div>
            </EmptyState>
          ) : (
            <Card className="p-0 overflow-hidden">
              <Table>
                <thead>
                  <tr>
                    <th>#</th>
                    {stageId === ALL_STAGES && <th>Stage</th>}
                    <th>Challenge</th>
                    <th>Type</th>
                    <th>Difficulty</th>
                    <th>XP</th>
                    <th>Status</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {visible.map((c) => (
                    <tr key={c.id} className={c.hidden ? 'opacity-60' : ''}>
                      <td className="cell-mono text-fg-muted">{c.isStageTest ? 'test' : positions.get(c.id)}</td>
                      {stageId === ALL_STAGES && <td className="text-xs whitespace-nowrap">{stageName(c.stageId)}</td>}
                      <td>
                        <div className="cell-primary flex items-center gap-2">
                          {c.title}
                          {c.isStageTest && <Badge>Stage test</Badge>}
                          {c.custom && <Badge tone="default">Written here</Badge>}
                          {c.modified && <Badge tone="warning">Edited here</Badge>}
                        </div>
                        <div className="text-xs text-fg-muted line-clamp-1 max-w-md">{c.prompt}</div>
                      </td>
                      <td className="cell-mono">{KIND_LABEL[kindOf(c)] ?? c.type}</td>
                      <td>
                        <Badge tone={DIFFICULTY_TONE[c.difficulty]}>{c.difficulty}</Badge>
                      </td>
                      <td className="cell-num">{c.xpReward}</td>
                      <td>{c.hidden ? <Badge tone="warning">Removed</Badge> : <Badge tone="success">Live</Badge>}</td>
                      <td className="text-right whitespace-nowrap">
                        <Button variant="ghost" size="sm" onClick={() => setWizard({ existing: c })} aria-label={`Edit ${c.title}`} title="Edit the whole question">
                          <Pencil size={14} />
                        </Button>
                        {c.modified && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setConfirm({ row: c, mode: 'revert' })}
                            aria-label={`Put the original ${c.title} back`}
                            title="Put the original back"
                          >
                            <RotateCcw size={14} />
                          </Button>
                        )}
                        {c.hidden && (
                          <Button variant="ghost" size="sm" onClick={() => setHidden(c, false)} aria-label={`Restore ${c.title}`} title="Put it back in the stage">
                            <Eye size={14} />
                          </Button>
                        )}
                        {c.custom ? (
                          // Deletable whether or not it is hidden - restoring
                          // it first would show it to learners in between.
                          <Button variant="ghost" size="sm" onClick={() => setConfirm({ row: c, mode: 'delete' })} aria-label={`Delete ${c.title}`} title="Delete this question">
                            <Trash2 size={14} />
                          </Button>
                        ) : c.hidden ? null : (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setConfirm({ row: c, mode: 'hide' })}
                            aria-label={`Remove ${c.title} from the stage`}
                            title="Remove from the stage (built-in questions cannot be deleted from here)"
                          >
                            <EyeOff size={14} />
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </Card>
          )}
        </>
      )}

      {wizard && stages && (
        <QuestionWizard
          stages={stages}
          // "All stages" has no stage of its own; a new question starts in the first one.
          stageId={stageId || stages[0]?.id || ''}
          existing={wizard.existing}
          initialKind={wizard.initialKind}
          draft={wizard.draft}
          countsFor={countsFor}
          onClose={() => setWizard(null)}
          onSaved={(row) => onSaved(row, wizard.existing)}
        />
      )}

      {assistant && stages && stages.length > 0 && (
        <AiQuestionAssistant
          stages={stages}
          stageId={stageId || stages[0].id}
          countsFor={countsFor}
          onClose={() => setAssistant(false)}
          onReview={(draft, kind) => {
            setAssistant(false);
            setWizard({ existing: null, initialKind: kind, draft });
          }}
          onSaved={(row) => {
            setAssistant(false);
            onSaved(row, null);
          }}
        />
      )}

      <ConfirmDialog
        open={confirm !== null}
        title={confirm?.mode === 'delete' ? 'Delete this question?' : confirm?.mode === 'revert' ? 'Revert to the built-in version?' : 'Remove this question from the stage?'}
        message={
          confirm?.mode === 'delete'
            ? `"${confirm.row.title}" will be deleted permanently. Learners who already solved it keep their XP.`
            : confirm?.mode === 'revert'
              ? 'Your edits here are discarded; learners see the original again.'
              : `"${confirm?.row.title}" is built in, so it cannot be deleted from here - it will be hidden from learners instead. You can restore it from this list at any time.`
        }
        confirmLabel={confirm?.mode === 'delete' ? 'Delete' : confirm?.mode === 'revert' ? 'Put the original back' : 'Remove from stage'}
        onCancel={() => setConfirm(null)}
        onConfirm={() => {
          const c = confirm;
          setConfirm(null);
          if (!c) return;
          if (c.mode === 'delete') remove(c.row);
          else if (c.mode === 'revert') revert(c.row);
          else setHidden(c.row, true);
        }}
      />
    </div>
  );
};
