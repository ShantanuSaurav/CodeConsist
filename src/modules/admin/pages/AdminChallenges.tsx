import React, { useCallback, useEffect, useState } from 'react';
import { Pencil } from 'lucide-react';
import { Dropdown } from '@/ui';
import { AdminChallengeRow, AdminStageRow, adminApi } from '../services/adminApi';
import {
  AdminPageHeader,
  Badge,
  Button,
  Card,
  Drawer,
  EmptyState,
  ErrorText,
  NumberField,
  SelectField,
  Spinner,
  Table,
  TagsField,
  TextArea,
  TextField,
  Toggle
} from '../components/ui';

const DIFFICULTY_TONE: Record<string, 'default' | 'success' | 'warning' | 'danger'> = {
  easy: 'success',
  medium: 'warning',
  hard: 'danger'
};

/**
 * /admin/challenges. Only presentational/operational fields are editable
 * here (title, prompt, explanation, hints, tags, XP, difficulty, hidden) -
 * never the question's actual logic (options, correct answers, test cases).
 * That stays in the authored TypeScript under src/data/challenges/, so every
 * challenge keeps going through validate-content.mjs, which actually
 * EXECUTES every JS/Python solution before it ships - see
 * docs/CONTENT_AUTHORING.md. A typo in the grading logic is exactly the kind
 * of mistake a "full" editor here could introduce with nothing to catch it.
 */
export const AdminChallenges: React.FC = () => {
  const [stages, setStages] = useState<AdminStageRow[] | null>(null);
  const [stageId, setStageId] = useState<string>('');
  const [challenges, setChallenges] = useState<AdminChallengeRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<AdminChallengeRow | null>(null);

  useEffect(() => {
    adminApi
      .stages()
      .then((res) => {
        setStages(res.stages);
        if (res.stages.length > 0) setStageId(res.stages[0].id);
      })
      .catch((err) => setError(err.message ?? 'Failed to load stages.'));
  }, []);

  const loadChallenges = useCallback((forStageId: string) => {
    if (!forStageId) return;
    adminApi
      .challenges(forStageId)
      .then((res) => setChallenges(res.challenges))
      .catch((err) => setError(err.message ?? 'Failed to load challenges.'));
  }, []);

  useEffect(() => {
    if (stageId) loadChallenges(stageId);
  }, [stageId, loadChallenges]);

  return (
    <div>
      <AdminPageHeader
        title="Challenges"
        description="Presentational fields only - answers, test cases and code stay in the authored content."
        actions={
          stages && stages.length > 0 ? (
            <Dropdown
              value={stageId}
              onChange={setStageId}
              size="md"
              options={stages.map((s) => ({ value: s.id, label: s.name }))}
              ariaLabel="Select stage"
            />
          ) : undefined
        }
      />

      {error && <ErrorText>{error}</ErrorText>}

      {!stages || !challenges ? (
        <Spinner />
      ) : challenges.length === 0 ? (
        <EmptyState>This stage has no challenges.</EmptyState>
      ) : (
        <Card className="p-0 overflow-hidden">
          <Table>
            <thead>
              <tr>
                <th>Challenge</th>
                <th>Type</th>
                <th>Difficulty</th>
                <th>XP</th>
                <th>Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {challenges.map((c) => (
                <tr key={c.id}>
                  <td>
                    <div className="cell-primary flex items-center gap-2">
                      {c.title}
                      {c.isStageTest && <Badge>Stage test</Badge>}
                    </div>
                    <div className="text-xs text-fg-muted line-clamp-1 max-w-md">{c.prompt}</div>
                  </td>
                  <td className="cell-mono">{c.type}</td>
                  <td>
                    <Badge tone={DIFFICULTY_TONE[c.difficulty]}>{c.difficulty}</Badge>
                  </td>
                  <td className="cell-num">{c.xpReward}</td>
                  <td>{c.hidden ? <Badge tone="warning">Hidden</Badge> : <Badge tone="success">Live</Badge>}</td>
                  <td className="text-right">
                    <Button variant="ghost" size="sm" onClick={() => setEditing(c)} aria-label={`Edit ${c.title}`}>
                      <Pencil size={14} />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Card>
      )}

      {editing && (
        <ChallengeEditor
          challenge={editing}
          onClose={() => setEditing(null)}
          onSaved={(updated) => {
            setChallenges((prev) => prev?.map((c) => (c.id === updated.id ? updated : c)) ?? null);
            setEditing(null);
          }}
        />
      )}
    </div>
  );
};

const ChallengeEditor: React.FC<{
  challenge: AdminChallengeRow;
  onClose: () => void;
  onSaved: (challenge: AdminChallengeRow) => void;
}> = ({ challenge, onClose, onSaved }) => {
  const [title, setTitle] = useState(challenge.title);
  const [prompt, setPrompt] = useState(challenge.prompt);
  const [explanation, setExplanation] = useState(challenge.explanation);
  const [hints, setHints] = useState<string[]>(challenge.hints ?? []);
  const [tags, setTags] = useState<string[]>(challenge.tags ?? []);
  const [xpReward, setXpReward] = useState(challenge.xpReward);
  const [difficulty, setDifficulty] = useState(challenge.difficulty);
  const [hidden, setHidden] = useState(challenge.hidden);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      await adminApi.updateChallenge(challenge.id, {
        title: title.trim() === challenge.original.title ? null : title.trim(),
        prompt: prompt.trim() === challenge.original.prompt ? null : prompt.trim(),
        explanation: explanation.trim() === challenge.original.explanation ? null : explanation.trim(),
        hints,
        tags,
        xpReward: xpReward === challenge.original.xpReward ? null : xpReward,
        difficulty: difficulty === challenge.original.difficulty ? null : difficulty,
        hidden
      });
      onSaved({ ...challenge, title, prompt, explanation, hints, tags, xpReward, difficulty, hidden });
    } catch (err: any) {
      setError(err.message ?? 'Could not save this challenge.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Drawer
      open
      title={`Edit ${challenge.original.title}`}
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
      <p className="text-xs text-fg-muted mb-4">
        The question logic (answers, test cases, code) isn't editable here - see docs/CONTENT_AUTHORING.md. Presentational fields only.
      </p>
      <TextField label="Title" value={title} onChange={setTitle} maxLength={120} />
      <TextArea label="Prompt" value={prompt} onChange={setPrompt} rows={3} />
      <TextArea label="Explanation" value={explanation} onChange={setExplanation} rows={3} />
      <TagsField label="Hints" value={hints} onChange={setHints} hint="Comma-separated; shown one at a time, on request." />
      <TagsField label="Tags" value={tags} onChange={setTags} />
      <div className="grid grid-cols-2 gap-3">
        <NumberField label="XP reward" value={xpReward} onChange={setXpReward} min={0} max={1000} />
        <SelectField
          label="Difficulty"
          value={difficulty}
          onChange={(v) => setDifficulty(v as typeof difficulty)}
          options={[
            { value: 'easy', label: 'Easy' },
            { value: 'medium', label: 'Medium' },
            { value: 'hard', label: 'Hard' }
          ]}
        />
      </div>
      <Toggle label="Hidden" checked={hidden} onChange={setHidden} hint="Removed from the learner-facing stage entirely." />
    </Drawer>
  );
};
