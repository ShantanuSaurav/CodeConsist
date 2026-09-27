import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, ChevronDown, Combine, Plus, RotateCcw, Scissors, Trash2 } from 'lucide-react';
import { DEFAULT_SETTINGS } from '@/platform/settings';
import type { UnitSettings } from '@/platform/settings';
import { estimateMinutes, validateUnitOverride } from '@/platform/progress';
import type { UnitIssue as LocalIssue } from '@/platform/progress';
import { AdminApiError, adminApi } from '../services/adminApi';
import type { AdminUnitsView, UnitIssue } from '../services/adminApi';
import {
  addUnit,
  assignQuestion,
  editUnit,
  mergeWithNext,
  moveAcross,
  moveQuestion,
  moveUnit,
  newUnitKey,
  removeUnit,
  splitAt,
  unplaced
} from '../services/unitEditing';
import type { EditorUnit } from '../services/unitEditing';
import { AdminPageHeader, Badge, Button, Card, ConfirmDialog, EmptyState, ErrorText, SelectField, Spinner, TextArea, TextField } from '../components/ui';

type Lesson = AdminUnitsView['lessons'][number];

function toEditor(view: AdminUnitsView): EditorUnit[] {
  return view.units.map((u) => ({ key: u.id ?? newUnitKey(), id: u.id, name: u.name, description: u.description, challengeIds: [...u.challengeIds] }));
}

/** The issues whose path is inside `prefix` (`units.2`), for one card. */
function issuesAt(issues: readonly (UnitIssue | LocalIssue)[], prefix: string): string[] {
  return issues.filter((i) => i.path === prefix || i.path.startsWith(`${prefix}.`)).map((i) => i.message);
}

/**
 * /admin/stages/:stageId/units - group one stage's lessons into units.
 *
 * Every lesson (hidden ones too) must be in exactly one unit; the stage test
 * is never in one. Sizes and times outside the targets in Rules > Units are
 * warnings, never blockers. Saving stores this stage's own grouping; "Reset
 * to default" goes back to the grouping derived from the unit settings.
 * Learners pick a change up with their next content load. Regrouping never
 * pays a unit bonus again: a bonus is paid once per unit id, only when a
 * first solve completes it.
 */
export const AdminUnits: React.FC = () => {
  const { stageId = '' } = useParams();
  const [view, setView] = useState<AdminUnitsView | null>(null);
  const [units, setUnits] = useState<EditorUnit[]>([]);
  const [cfg, setCfg] = useState<UnitSettings>(DEFAULT_SETTINGS.units);
  const [error, setError] = useState<string | null>(null);
  const [serverIssues, setServerIssues] = useState<UnitIssue[]>([]);
  const [saving, setSaving] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const [showDefaults, setShowDefaults] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const adopt = useCallback((next: AdminUnitsView) => {
    setView(next);
    setUnits(toEditor(next));
    setServerIssues([]);
  }, []);

  useEffect(() => {
    setError(null);
    adminApi
      .stageUnits(stageId)
      .then(adopt)
      .catch((err) => setError(err.message ?? 'Could not load the units.'));
    // The unit targets (sizes, minutes per kind) the warnings use.
    adminApi
      .settings()
      .then((s) => setCfg(s.settings.units))
      .catch(() => {});
  }, [stageId, adopt]);

  const lessonById = useMemo(() => new Map<string, Lesson>((view?.lessons ?? []).map((l) => [l.id, l])), [view]);
  const allIds = useMemo(() => (view?.lessons ?? []).map((l) => l.id), [view]);
  const loose = useMemo(() => unplaced(units, allIds), [units, allIds]);

  // The same check the server runs, live - so problems show before a save.
  const local = useMemo(() => {
    if (!view) return { issues: [], warnings: [] };
    const lessons = view.lessons.map((l) => ({ id: l.id, type: l.type as never, xpReward: l.xpReward, title: l.title }));
    return validateUnitOverride(stageId, lessons, { units }, cfg);
  }, [view, units, cfg, stageId]);

  const saved = useMemo(() => (view ? JSON.stringify(toEditor(view).map(({ key: _k, ...u }) => u)) : ''), [view]);
  const dirty = useMemo(() => JSON.stringify(units.map(({ key: _k, ...u }) => u)) !== saved, [units, saved]);

  const save = async () => {
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const next = await adminApi.saveStageUnits(stageId, units.map(({ key: _k, ...u }) => u));
      adopt(next);
      setNotice('Saved. Learners get the new units the next time their content loads.');
    } catch (err) {
      if (err instanceof AdminApiError && err.status === 422) {
        const payload = err.payload as { issues?: UnitIssue[] } | null;
        setServerIssues(payload?.issues ?? []);
      }
      setError(err instanceof Error ? err.message : 'Could not save the units.');
    } finally {
      setSaving(false);
    }
  };

  const reset = async () => {
    setSaving(true);
    setError(null);
    try {
      adopt(await adminApi.resetStageUnits(stageId));
      setNotice('Back to the default grouping.');
      setConfirmReset(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not reset the units.');
    } finally {
      setSaving(false);
    }
  };

  if (error && !view) {
    return (
      <div>
        <BackLink />
        <ErrorText>{error}</ErrorText>
      </div>
    );
  }
  if (!view) return <Spinner />;

  const stageLabel = view.stage ? `Stage ${String(view.stage.index).padStart(2, '0')} · ${view.stage.name}` : stageId;
  const issues = [...serverIssues, ...local.issues];
  const general = issues.filter((i) => i.path === 'units').map((i) => i.message);

  return (
    <div>
      <BackLink />
      <AdminPageHeader
        title={`Units - ${stageLabel}`}
        description="Group this stage's lessons into short units. Every lesson - hidden ones too - belongs to exactly one unit; the stage test comes after the last. Learners take units in order."
        actions={
          <>
            <Badge tone={view.source === 'custom' ? 'warning' : 'default'}>{view.source === 'custom' ? 'Customised' : 'Default'}</Badge>
            <Button variant="secondary" onClick={() => setConfirmReset(true)} disabled={saving || view.source !== 'custom'}>
              <RotateCcw size={14} /> Reset to default
            </Button>
            <Button variant="primary" onClick={save} disabled={saving || !dirty || local.issues.length > 0}>
              {saving ? 'Saving…' : 'Save'}
            </Button>
          </>
        }
      />

      {error && <ErrorText>{error}</ErrorText>}
      {notice && <p className="text-sm text-success mb-4">{notice}</p>}
      {general.length > 0 && (
        <div className="mb-4 space-y-1" role="alert">
          {general.map((message) => (
            <p key={message} className="text-sm text-error">
              {message}
            </p>
          ))}
        </div>
      )}

      {units.length === 0 && <EmptyState>This stage has no units yet. Add one below.</EmptyState>}

      <div className="space-y-4">
        {units.map((unit, i) => {
          const lessons = unit.challengeIds.map((id) => lessonById.get(id)).filter((l): l is Lesson => Boolean(l));
          const minutes = estimateMinutes(lessons.map((l) => ({ type: l.type as never })), cfg);
          const xp = lessons.reduce((sum, l) => sum + (Number(l.xpReward) || 0), 0);
          const cardIssues = issuesAt(issues, `units.${i}`);
          const cardWarnings = issuesAt(local.warnings, `units.${i}`);
          return (
            <Card key={unit.key}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="text-[11px] font-mono text-fg-muted mb-1">
                    Unit {i + 1}
                    {unit.id ? ` · ${unit.id}` : ' · new'}
                  </div>
                  <TextField label="Name" value={unit.name} maxLength={60} onChange={(name) => setUnits((u) => editUnit(u, i, { name }))} />
                  <TextArea
                    label="Description (optional)"
                    value={unit.description ?? ''}
                    rows={2}
                    maxLength={200}
                    onChange={(description) => setUnits((u) => editUnit(u, i, { description: description || undefined }))}
                  />
                </div>
                <div className="flex items-center gap-0.5 shrink-0">
                  <IconButton label={`Move ${unit.name} up`} disabled={i === 0} onClick={() => setUnits((u) => moveUnit(u, i, -1))}>
                    <ArrowUp size={14} />
                  </IconButton>
                  <IconButton label={`Move ${unit.name} down`} disabled={i === units.length - 1} onClick={() => setUnits((u) => moveUnit(u, i, 1))}>
                    <ArrowDown size={14} />
                  </IconButton>
                  <IconButton label={`Merge ${unit.name} with the next unit`} disabled={i === units.length - 1} onClick={() => setUnits((u) => mergeWithNext(u, i))}>
                    <Combine size={14} />
                  </IconButton>
                  <IconButton label={`Delete ${unit.name}`} disabled={unit.challengeIds.length > 0} onClick={() => setUnits((u) => removeUnit(u, i))}>
                    <Trash2 size={14} />
                  </IconButton>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2 text-xs font-mono text-fg-muted mb-2">
                <span>
                  {lessons.length} {lessons.length === 1 ? 'question' : 'questions'} · ~{minutes} min · {xp} XP
                </span>
                {cardWarnings.length > 0 && <Badge tone="warning">Outside the targets</Badge>}
              </div>
              {cardWarnings.map((w) => (
                <p key={w} className="text-xs text-warning mb-1">
                  {w}
                </p>
              ))}
              {cardIssues.map((message) => (
                <p key={message} className="text-xs text-error mb-1" role="alert">
                  {message}
                </p>
              ))}

              <ol className="border-t border-border-subtle mt-2">
                {unit.challengeIds.map((id, q) => {
                  const lesson = lessonById.get(id);
                  return (
                    <li key={id} className="flex flex-wrap items-center gap-2 py-1.5 border-b border-border-subtle text-sm">
                      <span className="w-6 text-right font-mono text-[11px] text-fg-muted">{q + 1}</span>
                      <span className="flex-1 min-w-0 truncate text-fg">{lesson?.title ?? id}</span>
                      <span className="font-mono text-[11px] text-fg-muted">{lesson?.type}</span>
                      <span className="font-mono text-[11px] text-fg-muted">{lesson?.difficulty}</span>
                      {lesson?.hidden && <Badge tone="warning">Hidden</Badge>}
                      <span className="flex items-center gap-0.5">
                        <IconButton label="Move up" disabled={q === 0} onClick={() => setUnits((u) => moveQuestion(u, i, q, -1))}>
                          <ArrowUp size={12} />
                        </IconButton>
                        <IconButton label="Move down" disabled={q === unit.challengeIds.length - 1} onClick={() => setUnits((u) => moveQuestion(u, i, q, 1))}>
                          <ArrowDown size={12} />
                        </IconButton>
                        <IconButton label="Move to the previous unit" disabled={i === 0} onClick={() => setUnits((u) => moveAcross(u, i, q, -1))}>
                          <ArrowLeft size={12} />
                        </IconButton>
                        <IconButton label="Move to the next unit" disabled={i === units.length - 1} onClick={() => setUnits((u) => moveAcross(u, i, q, 1))}>
                          <ArrowRight size={12} />
                        </IconButton>
                        <IconButton label="Split the unit here (this question starts a new unit)" disabled={q === 0} onClick={() => setUnits((u) => splitAt(u, i, q))}>
                          <Scissors size={12} />
                        </IconButton>
                      </span>
                    </li>
                  );
                })}
              </ol>
            </Card>
          );
        })}
      </div>

      <Button variant="secondary" className="mt-4" onClick={() => setUnits((u) => addUnit(u))}>
        <Plus size={14} /> Add unit
      </Button>

      {/* Questions created after the grouping was saved, or taken out of every unit. */}
      {loose.length > 0 && (
        <Card className="mt-6">
          <h2 className="text-sm font-semibold text-fg mb-1">Not in a unit</h2>
          <p className="text-xs text-fg-muted mb-3">Every lesson must be in a unit before the grouping can be saved.</p>
          <ul className="space-y-2">
            {loose.map((id) => (
              <li key={id} className="flex flex-wrap items-end gap-3">
                <span className="flex-1 min-w-0 text-sm text-fg truncate pb-5">{lessonById.get(id)?.title ?? id}</span>
                <div className="w-56">
                  <SelectField
                    label="Add to unit"
                    value=""
                    onChange={(value) => value !== '' && setUnits((u) => assignQuestion(u, id, Number(value)))}
                    options={[{ value: '', label: 'Choose a unit…' }, ...units.map((u, i) => ({ value: String(i), label: `${i + 1}. ${u.name}` }))]}
                  />
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {/* The grouping the unit settings would produce, for comparison. */}
      <div className="mt-6">
        <button type="button" className="link-btn inline-flex items-center gap-1" onClick={() => setShowDefaults((v) => !v)} aria-expanded={showDefaults}>
          <ChevronDown size={14} className={showDefaults ? 'rotate-180' : ''} /> Default grouping
        </button>
        {showDefaults && (
          <Card className="mt-2">
            <ol className="space-y-2 text-sm">
              {view.defaults.map((u, i) => (
                <li key={u.id ?? i}>
                  <span className="font-medium text-fg">{u.name}</span>{' '}
                  <span className="font-mono text-[11px] text-fg-muted">
                    {u.id} · {u.size ?? u.challengeIds.length} questions · ~{u.estMinutes} min · {u.xp} XP
                  </span>
                  <div className="text-xs text-fg-muted">{u.challengeIds.map((id) => lessonById.get(id)?.title ?? id).join(' · ')}</div>
                </li>
              ))}
            </ol>
          </Card>
        )}
      </div>

      <ConfirmDialog
        open={confirmReset}
        title="Reset to the default grouping?"
        message="This stage's own units are removed and the default grouping (from Rules > Units) comes back. Learners' progress is not affected - a unit is done when its lessons are solved."
        confirmLabel="Reset"
        busy={saving}
        onConfirm={reset}
        onCancel={() => setConfirmReset(false)}
      />
    </div>
  );
};

const BackLink: React.FC = () => (
  <Link to="/admin/stages" className="inline-flex items-center gap-1 text-xs text-fg-muted hover:text-fg mb-3">
    <ArrowLeft size={12} /> Stages
  </Link>
);

const IconButton: React.FC<{ label: string; disabled?: boolean; onClick: () => void; children: React.ReactNode }> = ({ label, disabled, onClick, children }) => (
  <button
    type="button"
    className="btn btn-ghost btn-sm btn-icon disabled:opacity-25"
    aria-label={label}
    title={label}
    disabled={disabled}
    onClick={onClick}
  >
    {children}
  </button>
);
