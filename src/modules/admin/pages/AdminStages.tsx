import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, Pencil } from 'lucide-react';
import { AdminStageRow, adminApi } from '../services/adminApi';
import { AdminPageHeader, Badge, Button, Card, Drawer, EmptyState, ErrorText, Spinner, Table, TextArea, TextField, Toggle } from '../components/ui';

const LANGUAGE_LABEL: Record<string, string> = { javascript: 'JavaScript', python: 'Python', c: 'C', cpp: 'C++' };

/**
 * /admin/stages. Stages are grouped by language track and shown in the
 * order that track presents them - the same order learners see on the Learn
 * page (see stagesForTrack in src/services/contentService.ts) - so reordering
 * here is reordering their actual roadmap, not a separate admin-only view of it.
 */
export const AdminStages: React.FC = () => {
  const [stages, setStages] = useState<AdminStageRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<AdminStageRow | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(() => {
    adminApi
      .stages()
      .then((res) => setStages(res.stages))
      .catch((err) => setError(err.message ?? 'Failed to load stages.'));
  }, []);

  useEffect(() => load(), [load]);

  // Grouped by TRACK (what reordering operates on), labelled by the track's
  // name; a stage's own language is shown on its row.
  const grouped = useMemo(() => {
    const byTrack = new Map<string, AdminStageRow[]>();
    for (const stage of stages ?? []) {
      const key = stage.trackLabel ?? LANGUAGE_LABEL[stage.language] ?? stage.language;
      const list = byTrack.get(key);
      if (list) list.push(stage);
      else byTrack.set(key, [stage]);
    }
    return Array.from(byTrack.entries());
  }, [stages]);

  const reorder = async (stage: AdminStageRow, direction: 'up' | 'down') => {
    setBusyId(stage.id);
    setError(null);
    try {
      await adminApi.reorderStage(stage.id, direction);
      load();
    } catch (err: any) {
      setError(err.message ?? 'Could not reorder that stage.');
    } finally {
      setBusyId(null);
    }
  };

  const toggleHidden = async (stage: AdminStageRow) => {
    setBusyId(stage.id);
    setError(null);
    try {
      await adminApi.updateStage(stage.id, { hidden: !stage.hidden });
      setStages((prev) => prev?.map((s) => (s.id === stage.id ? { ...s, hidden: !s.hidden } : s)) ?? null);
    } catch (err: any) {
      setError(err.message ?? 'Could not update that stage.');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div>
      <AdminPageHeader
        title="Stages"
        description="Rename, hide/unpublish, mark premium, or reorder a stage within its language track. The lessons and stage test inside a stage are edited from Challenges."
      />

      {error && <ErrorText>{error}</ErrorText>}

      {!stages ? (
        <Spinner />
      ) : stages.length === 0 ? (
        <EmptyState>No stages found.</EmptyState>
      ) : (
        <div className="space-y-8">
          {grouped.map(([group, rows]) => (
            <div key={group}>
              <h2 className="eyebrow">{group}</h2>
              <Card className="p-0 overflow-hidden">
                <Table>
                    <thead>
                      <tr>
                        <th>Stage</th>
                        <th>Lessons</th>
                        <th>Test</th>
                        <th>Status</th>
                        <th>Order</th>
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((stage, i) => (
                        <tr key={stage.id}>
                          <td>
                            <div className="cell-primary">{stage.name}</div>
                            <div className="text-xs text-fg-muted line-clamp-1 max-w-md">{stage.description}</div>
                          </td>
                          <td className="cell-num">{stage.challengeCount}</td>
                          <td>
                            <Badge tone={stage.hasTest ? 'success' : 'default'}>{stage.hasTest ? 'Yes' : 'No'}</Badge>
                          </td>
                          <td>
                            <button
                              type="button"
                              disabled={busyId === stage.id}
                              onClick={() => toggleHidden(stage)}
                              className="flex flex-wrap gap-1 cursor-pointer"
                              title={stage.hidden ? 'Unpublish - click to make visible to learners' : 'Live - click to hide from learners'}
                            >
                              {stage.hidden && <Badge tone="warning">Hidden</Badge>}
                              {stage.isPremium && <Badge tone="default">Premium</Badge>}
                              {!stage.hidden && !stage.isPremium && <Badge tone="success">Live</Badge>}
                            </button>
                          </td>
                          <td>
                            <div className="flex items-center gap-0.5">
                              <button
                                type="button"
                                disabled={busyId === stage.id || i === 0}
                                onClick={() => reorder(stage, 'up')}
                                className="btn btn-ghost btn-sm btn-icon disabled:opacity-25"
                                aria-label={`Move ${stage.name} up`}
                              >
                                <ArrowUp size={14} />
                              </button>
                              <button
                                type="button"
                                disabled={busyId === stage.id || i === rows.length - 1}
                                onClick={() => reorder(stage, 'down')}
                                className="btn btn-ghost btn-sm btn-icon disabled:opacity-25"
                                aria-label={`Move ${stage.name} down`}
                              >
                                <ArrowDown size={14} />
                              </button>
                            </div>
                          </td>
                          <td className="text-right">
                            <Button variant="ghost" size="sm" onClick={() => setEditing(stage)} aria-label={`Edit ${stage.name}`}>
                              <Pencil size={14} />
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                </Table>
              </Card>
            </div>
          ))}
        </div>
      )}

      {editing && (
        <StageEditor
          stage={editing}
          onClose={() => setEditing(null)}
          onSaved={(updated) => {
            setStages((prev) => prev?.map((s) => (s.id === updated.id ? updated : s)) ?? null);
            setEditing(null);
          }}
        />
      )}
    </div>
  );
};

const StageEditor: React.FC<{
  stage: AdminStageRow;
  onClose: () => void;
  onSaved: (stage: AdminStageRow) => void;
}> = ({ stage, onClose, onSaved }) => {
  const [name, setName] = useState(stage.name);
  const [description, setDescription] = useState(stage.description);
  const [icon, setIcon] = useState(stage.icon ?? '');
  const [isPremium, setIsPremium] = useState(Boolean(stage.isPremium));
  const [hidden, setHidden] = useState(stage.hidden);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      await adminApi.updateStage(stage.id, {
        name: name.trim() === stage.original.name ? null : name.trim(),
        description: description.trim() === stage.original.description ? null : description.trim(),
        icon: icon.trim() === (stage.original.icon ?? '') ? null : icon.trim(),
        isPremium: isPremium === stage.original.isPremium ? null : isPremium,
        hidden
      });
      onSaved({ ...stage, name, description, icon, isPremium, hidden });
    } catch (err: any) {
      setError(err.message ?? 'Could not save this stage.');
    } finally {
      setSaving(false);
    }
  };

  const revertToOriginal = () => {
    setName(stage.original.name);
    setDescription(stage.original.description);
    setIcon(stage.original.icon ?? '');
    setIsPremium(stage.original.isPremium);
  };

  return (
    <Drawer
      open
      title={`Edit ${stage.original.name}`}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={save} disabled={saving}>
            {saving ? 'Saving…' : 'Save changes'}
          </Button>
        </>
      }
    >
      {error && <ErrorText>{error}</ErrorText>}
      <TextField label="Name" value={name} onChange={setName} maxLength={80} />
      <TextArea label="Description" value={description} onChange={setDescription} rows={3} maxLength={400} />
      <TextField label="Icon (emoji)" value={icon} onChange={setIcon} maxLength={8} hint="Shown on the learner's path list." />
      <Toggle label="Premium" checked={isPremium} onChange={setIsPremium} hint="Locked for free accounts." />
      <Toggle label="Hidden" checked={hidden} onChange={setHidden} hint="Removed from the learner-facing roadmap entirely." />
      <button
        type="button"
        onClick={revertToOriginal}
        className="link-btn mt-2"
      >
        Reset text fields to the originally authored values
      </button>
    </Drawer>
  );
};
