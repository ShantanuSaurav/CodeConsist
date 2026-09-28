import React, { useEffect, useMemo, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { AdminApiError, adminApi } from '../services/adminApi';
import type { ConceptAnchor, ConceptExampleInput, ConceptInput, ConceptLesson, ConceptRow, QuestionIssue } from '../services/adminApi';
import { Badge, Button, CodeArea, Drawer, ErrorText, SelectField, TextArea, TextField } from './ui';

/** Languages a card's examples may be in (the content schema's list). */
const LANGUAGES = ['javascript', 'typescript', 'python', 'java', 'c', 'cpp', 'go', 'sql', 'html', 'css', 'bash', 'pseudocode'];
/** Languages the browser runs by itself; the rest need the server's Judge0 for the try-it step. */
const RUNS_IN_BROWSER = new Set(['javascript', 'typescript', 'python', 'html', 'css']);

interface ExampleForm {
  code: string;
  language: string;
  callouts: { line: string; text: string }[];
}

interface ConceptForm {
  title: string;
  summary: string;
  intro: string;
  why: string;
  explainDifferently: string;
  example: ExampleForm;
  secondOn: boolean;
  secondExample: ExampleForm;
  tryOn: boolean;
  tryIt: { instructions: string; starterCode: string; language: string; ui: boolean };
}

const emptyExample = (language = 'javascript'): ExampleForm => ({ code: '', language, callouts: [] });

function exampleForm(e: ConceptExampleInput | undefined, fallbackLanguage: string): ExampleForm {
  if (!e) return emptyExample(fallbackLanguage);
  return { code: e.code ?? '', language: e.language ?? fallbackLanguage, callouts: (e.callouts ?? []).map((c) => ({ line: String(c.line), text: c.text })) };
}

function formOf(concept: ConceptRow['concept'] | null, language: string): ConceptForm {
  return {
    title: concept?.title ?? '',
    summary: concept?.summary ?? '',
    intro: concept?.intro ?? '',
    why: concept?.why ?? '',
    explainDifferently: concept?.explainDifferently ?? '',
    example: exampleForm(concept?.example, language),
    secondOn: Boolean(concept?.secondExample),
    secondExample: exampleForm(concept?.secondExample, language),
    tryOn: Boolean(concept?.tryIt),
    tryIt: {
      instructions: concept?.tryIt?.instructions ?? '',
      starterCode: concept?.tryIt?.starterCode ?? '',
      language: concept?.tryIt?.language ?? language,
      ui: Boolean(concept?.tryIt?.ui)
    }
  };
}

function exampleInput(e: ExampleForm): ConceptExampleInput {
  const callouts = e.callouts.filter((c) => c.line.trim() || c.text.trim()).map((c) => ({ line: Number(c.line), text: c.text }));
  return { code: e.code, language: e.language, ...(callouts.length ? { callouts } : {}) };
}

function inputOf(form: ConceptForm): ConceptInput {
  return {
    title: form.title,
    summary: form.summary,
    intro: form.intro,
    why: form.why,
    example: exampleInput(form.example),
    ...(form.secondOn ? { secondExample: exampleInput(form.secondExample) } : {}),
    ...(form.tryOn ? { tryIt: { ...form.tryIt, ui: form.tryIt.ui || undefined } } : {}),
    ...(form.explainDifferently.trim() ? { explainDifferently: form.explainDifferently } : {})
  };
}

/** One example: its code, its language, and notes pinned to single lines. */
const ExampleFields: React.FC<{
  label: string;
  path: string;
  value: ExampleForm;
  onChange: (next: ExampleForm) => void;
  issueFor: (path: string) => string | undefined;
}> = ({ label, path, value, onChange, issueFor }) => {
  const lines = value.code.split('\n').length;
  return (
    <div className="mb-2">
      <CodeArea label={label} value={value.code} onChange={(code) => onChange({ ...value, code })} error={issueFor(`${path}.code`)} required rows={5} />
      <SelectField
        label="Language"
        value={value.language}
        onChange={(language) => onChange({ ...value, language })}
        options={LANGUAGES.map((l) => ({ value: l, label: l }))}
        error={issueFor(`${path}.language`)}
      />
      <div className="mb-4">
        <span className="field-label">Line notes</span>
        {value.callouts.length === 0 && <p className="field-hint">Optional: a short note on one line of the example.</p>}
        {value.callouts.map((c, i) => (
          <div key={i} className="grid grid-cols-[5rem_1fr_auto] gap-2 mb-2 items-start">
            <input
              type="number"
              min={1}
              max={lines}
              aria-label={`Line of note ${i + 1}`}
              className={issueFor(`${path}.callouts.${i}.line`) ? 'is-invalid' : ''}
              value={c.line}
              onChange={(e) => onChange({ ...value, callouts: value.callouts.map((x, j) => (j === i ? { ...x, line: e.target.value } : x)) })}
            />
            <input
              type="text"
              aria-label={`Text of note ${i + 1}`}
              className={issueFor(`${path}.callouts.${i}.text`) ? 'is-invalid' : ''}
              value={c.text}
              maxLength={300}
              onChange={(e) => onChange({ ...value, callouts: value.callouts.map((x, j) => (j === i ? { ...x, text: e.target.value } : x)) })}
            />
            <Button variant="ghost" size="sm" onClick={() => onChange({ ...value, callouts: value.callouts.filter((_, j) => j !== i) })} aria-label={`Remove note ${i + 1}`}>
              <Trash2 size={13} />
            </Button>
            {(issueFor(`${path}.callouts.${i}.line`) || issueFor(`${path}.callouts.${i}.text`)) && (
              <p className="field-hint text-error col-span-3" role="alert">
                {issueFor(`${path}.callouts.${i}.line`) ?? issueFor(`${path}.callouts.${i}.text`)}
              </p>
            )}
          </div>
        ))}
        <Button variant="ghost" size="sm" onClick={() => onChange({ ...value, callouts: [...value.callouts, { line: String(Math.min(lines, value.callouts.length + 1)), text: '' }] })}>
          <Plus size={13} /> Add a line note
        </Button>
      </div>
    </div>
  );
};

export interface ConceptEditorProps {
  open: boolean;
  /** The stage being worked on: its lessons and units are where a new card can go. */
  stageId: string;
  stageLanguage?: string;
  lessons: ConceptLesson[];
  units: { id: string; name: string; firstLessonId: string | null }[];
  /** The card being edited, or null for a new one. */
  existing: ConceptRow | null;
  /** Where a new card goes to start with (the lesson a row's "Add" was on). */
  initialAnchor?: ConceptAnchor | null;
  onClose: () => void;
  onSaved: (row: ConceptRow) => void;
}

/**
 * The teaching-card editor: every field of a concept (title, summary, the
 * explanation, an example with line notes, why it works, a second example,
 * the try-it step and a plainer explanation), where it goes, and "show it
 * again to learners who already saw it". Checked by the server against the
 * content schema; its issues are shown beside their fields.
 */
export const ConceptEditor: React.FC<ConceptEditorProps> = ({ open, stageId, stageLanguage = 'javascript', lessons, units, existing, initialAnchor, onClose, onSaved }) => {
  const builtIn = existing ? existing.source !== 'created' : false;
  const [form, setForm] = useState<ConceptForm>(() => formOf(existing?.concept ?? null, stageLanguage));
  // A new card starts on the first lesson that has none (one concept per lesson).
  const firstLesson = (lessons.find((l) => !l.hidden && !l.concept) ?? lessons.find((l) => !l.hidden))?.id ?? '';
  const [anchor, setAnchor] = useState<ConceptAnchor>(() => existing?.anchor ?? initialAnchor ?? { kind: 'lesson', challengeId: firstLesson });
  const [showAgain, setShowAgain] = useState(false);
  const [issues, setIssues] = useState<QuestionIssue[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setForm(formOf(existing?.concept ?? null, stageLanguage));
    setAnchor(existing?.anchor ?? initialAnchor ?? { kind: 'lesson', challengeId: firstLesson });
    setShowAgain(false);
    setIssues([]);
    setError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, existing?.key]);

  const issueFor = (path: string) => issues.find((i) => i.path === path || i.path.startsWith(`${path}.`))?.message;
  const set = <K extends keyof ConceptForm>(key: K, value: ConceptForm[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    // An edited field's own complaint goes; the rest stay until the next save.
    setIssues((prev) => (prev.some((i) => i.path === key || i.path.startsWith(`${String(key)}.`)) ? prev.filter((i) => i.path !== key && !i.path.startsWith(`${String(key)}.`)) : prev));
  };
  const tryItNeedsServer = form.tryOn && !RUNS_IN_BROWSER.has(form.tryIt.language);

  const anchorLabel = useMemo(() => {
    if (anchor.kind === 'lesson') return lessons.find((l) => l.id === anchor.challengeId)?.title ?? anchor.challengeId;
    if (anchor.kind === 'unit') return `Start of ${units.find((u) => u.id === anchor.unitId)?.name ?? 'a unit'}`;
    return 'Start of the stage';
  }, [anchor, lessons, units]);

  const save = async () => {
    setSaving(true);
    setError(null);
    setIssues([]);
    try {
      const concept = inputOf(form);
      const res = existing
        ? await adminApi.replaceConcept(existing.key, { concept, ...(builtIn ? {} : { anchor }), showAgain })
        : await adminApi.createConcept(anchor, concept);
      onSaved(res.card);
    } catch (err) {
      if (err instanceof AdminApiError) {
        const payload = err.payload as { issues?: QuestionIssue[]; existingKey?: string } | null;
        setIssues(payload?.issues ?? []);
        setError(err.message);
      } else {
        setError('Could not save the card.');
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <Drawer
      open={open}
      title={existing ? `Edit teaching card: ${existing.concept?.title ?? existing.key}` : 'New teaching card'}
      onClose={onClose}
      size="lg"
      closable={!saving}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button variant="primary" onClick={() => void save()} disabled={saving}>
            {saving ? 'Saving…' : 'Save card'}
          </Button>
        </>
      }
    >
      {error && <ErrorText>{error}</ErrorText>}

      <section className="mb-6">
        <h3 className="text-sm font-medium text-fg mb-2">Where it goes</h3>
        {builtIn ? (
          <p className="text-sm text-fg-secondary">
            Before <strong>{anchorLabel}</strong> - a built-in card stays on its own lesson. <Badge>{existing?.source === 'modified' ? 'Edited' : 'Built in'}</Badge>
          </p>
        ) : (
          <div className="grid gap-x-4 sm:grid-cols-2">
            <SelectField
              label="Show it"
              value={anchor.kind}
              onChange={(kind) =>
                setAnchor(
                  kind === 'stage'
                    ? { kind: 'stage', stageId }
                    : kind === 'unit'
                      ? { kind: 'unit', unitId: units[0]?.id ?? '', stageId }
                      : { kind: 'lesson', challengeId: firstLesson }
                )
              }
              options={[
                { value: 'lesson', label: 'Before a lesson' },
                { value: 'stage', label: 'At the start of the stage' },
                { value: 'unit', label: 'At the start of a unit', disabled: units.length === 0 }
              ]}
              error={issueFor('anchor')}
            />
            {anchor.kind === 'lesson' && (
              <SelectField
                label="Lesson"
                value={anchor.challengeId}
                onChange={(challengeId) => setAnchor({ kind: 'lesson', challengeId })}
                options={lessons.map((l) => ({
                  value: l.id,
                  label: `${l.title}${l.hidden ? ' (hidden)' : ''}${l.concept && l.concept.key !== existing?.key ? ' - has a card' : ''}`
                }))}
                error={issueFor('anchor.challengeId')}
              />
            )}
            {anchor.kind === 'unit' && (
              <SelectField
                label="Unit"
                value={anchor.unitId}
                onChange={(unitId) => setAnchor({ kind: 'unit', unitId, stageId })}
                options={units.map((u) => ({ value: u.id, label: u.name }))}
                error={issueFor('anchor.unitId')}
              />
            )}
            {anchor.kind === 'stage' && <p className="text-sm text-fg-secondary sm:pt-7">Shown before the stage's first lesson.</p>}
          </div>
        )}
      </section>

      <section className="mb-2">
        <TextField label="Title" value={form.title} onChange={(v) => set('title', v)} error={issueFor('title')} required maxLength={120} placeholder="What is a variable?" />
        <TextField
          label="One-line summary"
          value={form.summary}
          onChange={(v) => set('summary', v)}
          error={issueFor('summary')}
          required
          maxLength={240}
          hint="Shown in the step header."
        />
        <TextArea label="Explanation" value={form.intro} onChange={(v) => set('intro', v)} error={issueFor('intro')} required rows={4} hint="Short and plain - a paragraph or two." />
        <ExampleFields label="Example" path="example" value={form.example} onChange={(v) => set('example', v)} issueFor={issueFor} />
        <TextArea label="Why it works" value={form.why} onChange={(v) => set('why', v)} error={issueFor('why')} required rows={3} />
      </section>

      <section className="mb-4">
        <label className="flex items-center gap-2 text-sm text-fg mb-2">
          <input type="checkbox" checked={form.secondOn} onChange={(e) => set('secondOn', e.target.checked)} />
          A second, slightly harder example
        </label>
        {form.secondOn && <ExampleFields label="Second example" path="secondExample" value={form.secondExample} onChange={(v) => set('secondExample', v)} issueFor={issueFor} />}
      </section>

      <section className="mb-4">
        <label className="flex items-center gap-2 text-sm text-fg mb-2">
          <input type="checkbox" checked={form.tryOn} onChange={(e) => set('tryOn', e.target.checked)} />
          A try-it step (ungraded code the learner can edit and run)
        </label>
        {form.tryOn && (
          <>
            <TextArea
              label="What to try"
              value={form.tryIt.instructions}
              onChange={(instructions) => set('tryIt', { ...form.tryIt, instructions })}
              error={issueFor('tryIt.instructions')}
              rows={2}
            />
            <CodeArea
              label="Code to start from"
              value={form.tryIt.starterCode}
              onChange={(starterCode) => set('tryIt', { ...form.tryIt, starterCode })}
              error={issueFor('tryIt.starterCode')}
              rows={4}
            />
            <SelectField
              label="Language"
              value={form.tryIt.language}
              onChange={(language) => set('tryIt', { ...form.tryIt, language })}
              options={LANGUAGES.map((l) => ({ value: l, label: l }))}
              error={issueFor('tryIt.language')}
            />
            {tryItNeedsServer && (
              <p className="field-hint text-warning mb-3">
                {form.tryIt.language} runs only when the server has Judge0 set up - without it, learners can read the code but not run it.
              </p>
            )}
            <label className="flex items-center gap-2 text-sm text-fg mb-2">
              <input type="checkbox" checked={form.tryIt.ui} onChange={(e) => set('tryIt', { ...form.tryIt, ui: e.target.checked })} />
              Show a live preview (HTML and CSS)
            </label>
          </>
        )}
      </section>

      <TextArea
        label="Explain it differently (optional)"
        value={form.explainDifferently}
        onChange={(v) => set('explainDifferently', v)}
        error={issueFor('explainDifferently')}
        rows={3}
        hint='A plainer version, shown when a learner asks for another explanation.'
      />

      {existing && (
        <label className="flex items-start gap-2 text-sm text-fg mt-2">
          <input type="checkbox" className="mt-1" checked={showAgain} onChange={(e) => setShowAgain(e.target.checked)} />
          <span>
            Show it again to learners who already saw it
            <span className="block text-xs text-fg-muted">Use this when the change matters; otherwise only learners who have not seen the card get the new version.</span>
          </span>
        </label>
      )}
    </Drawer>
  );
};
