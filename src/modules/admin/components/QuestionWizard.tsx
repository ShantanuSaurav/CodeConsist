import React, { useCallback, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowDown, ArrowUp, Bug, Check, CheckSquare, Code2, Eye, ListOrdered, MonitorSmartphone, Plus, TextCursorInput, Trash2, X } from 'lucide-react';
import { AdminApiError, AdminChallengeRow, AdminStageRow, QuestionCheck, QuestionInput, QuestionIssue, SolutionRun, BlankWrongAnswer, adminApi } from '../services/adminApi';
import { MAX_WRONG_ANSWERS, NOTE_MAX, alignNotes, builtInPatch, feedbackIssues, leakWarnings, wrongChoicesOf } from '../services/questionFeedback';
import { Badge, Button, CodeArea, ConfirmDialog, Drawer, ErrorText, Field, NumberField, SelectField, TextArea, TextField, Toggle } from './ui';

/* ------------------------------------------------------------------ kinds */

/**
 * What the admin picks first. A "kind" is friendlier than the schema's type:
 * "Frontend" is not its own type (it is a code question in HTML with a live
 * preview), and "Fix the bug" reads better than "debug".
 */
export type Kind = 'quiz' | 'multi_select' | 'output_prediction' | 'fill_blank' | 'pseudocode_order' | 'code_runner' | 'debug' | 'frontend';

export interface KindMeta {
  kind: Kind;
  type: QuestionInput['type'];
  title: string;
  blurb: string;
  example: string;
  icon: React.ReactNode;
  /** Presets applied when this kind is chosen. */
  preset: Partial<QuestionInput>;
}

export const KINDS: KindMeta[] = [
  {
    kind: 'quiz',
    type: 'quiz',
    title: 'Multiple choice',
    blurb: 'One correct answer out of 2-8 options. A code snippet is optional.',
    example: '"Which keyword declares a constant?" - A: var, B: let, C: const',
    icon: <Check size={18} />,
    preset: { language: 'javascript' }
  },
  {
    kind: 'multi_select',
    type: 'multi_select',
    title: 'Select all that apply',
    blurb: 'Several correct answers. The learner must tick every right one and no wrong one.',
    example: '"Which of these are falsy?" - 0, "", null ... tick all three',
    icon: <CheckSquare size={18} />,
    preset: { language: 'javascript' }
  },
  {
    kind: 'output_prediction',
    type: 'output_prediction',
    title: 'Predict the output',
    blurb: 'Show a short program; the learner picks what it prints from 2-8 options.',
    example: 'console.log(typeof null) - A: "null", B: "object", C: "undefined"',
    icon: <Eye size={18} />,
    preset: { language: 'javascript' }
  },
  {
    kind: 'fill_blank',
    type: 'fill_blank',
    title: 'Fill in the blanks',
    blurb: 'Code with ___ holes. The learner types (or picks from a dropdown) what goes in each.',
    example: 'for (let i = 0; i ___ 10; i++) - answer: <',
    icon: <TextCursorInput size={18} />,
    preset: { language: 'javascript' }
  },
  {
    kind: 'pseudocode_order',
    type: 'pseudocode_order',
    title: 'Put the steps in order',
    blurb: 'You write 3-20 steps in the right order; CodeConsist shuffles them and the learner reorders them.',
    example: 'SET total TO 0 / FOR EACH n IN numbers / ADD n TO total / RETURN total',
    icon: <ListOrdered size={18} />,
    preset: { language: 'pseudocode' }
  },
  {
    kind: 'code_runner',
    type: 'code_runner',
    title: 'Write code',
    blurb: 'Starter code, a function name and test cases. Graded by actually running the code.',
    example: 'function add(a, b) { } - test: add(1, 2) should return 3',
    icon: <Code2 size={18} />,
    preset: { language: 'javascript' }
  },
  {
    kind: 'debug',
    type: 'debug',
    title: 'Fix the bug',
    blurb: 'Broken code that fails the tests. The learner repairs it until every test passes.',
    example: 'return a - b; // should be a + b',
    icon: <Bug size={18} />,
    preset: { language: 'javascript' }
  },
  {
    kind: 'frontend',
    type: 'code_runner',
    title: 'Frontend (HTML / CSS / JS)',
    blurb: 'A small page built in a live preview, checked by JavaScript tests that inspect the page.',
    example: 'Build a #counter button - test: document.querySelector("#counter") exists',
    icon: <MonitorSmartphone size={18} />,
    preset: { language: 'html', uiPreview: true, entryFunction: '' }
  }
];

/** The kind of any question or row - Frontend is derived, so the list page uses this too for its counts. */
export const kindOf = (q: { type: string; language: string; uiPreview?: boolean }): Kind =>
  q.type === 'code_runner' && (q.uiPreview || q.language === 'html') ? 'frontend' : (q.type as Kind);

/** Short names for the list page's pills and Type column; the cards above carry the full titles. */
export const KIND_LABEL: Record<Kind, string> = {
  quiz: 'Multiple choice',
  multi_select: 'Select all',
  output_prediction: 'Predict output',
  fill_blank: 'Fill blanks',
  pseudocode_order: 'Order steps',
  code_runner: 'Code',
  debug: 'Fix the bug',
  frontend: 'Frontend'
};

const LANGUAGES: { value: string; label: string }[] = [
  { value: 'javascript', label: 'JavaScript' },
  { value: 'typescript', label: 'TypeScript' },
  { value: 'python', label: 'Python' },
  { value: 'java', label: 'Java' },
  { value: 'c', label: 'C' },
  { value: 'cpp', label: 'C++' },
  { value: 'go', label: 'Go' },
  { value: 'sql', label: 'SQL' },
  { value: 'html', label: 'HTML' },
  { value: 'css', label: 'CSS' },
  { value: 'bash', label: 'Bash' },
  { value: 'pseudocode', label: 'Pseudocode' }
];

/** Languages the server can execute. Code questions are limited to these (HTML for frontend). */
const EXECUTABLE = new Set(['javascript', 'typescript', 'python']);
const CODE_LANGUAGES = LANGUAGES.filter((l) => EXECUTABLE.has(l.value));

/** The example shown in an empty code field, in the language the admin picked. */
const SNIPPET_EXAMPLE: Record<string, string> = {
  python: 'score = None\nprint(type(score))\nscore = 100\nprint(type(score))',
  javascript: 'console.log(typeof score);\nvar score = 100;\nconsole.log(typeof score);',
  typescript: 'let score: number | undefined;\nconsole.log(typeof score);',
  java: 'int score = 100;\nSystem.out.println(score / 3);',
  c: 'int score = 7;\nprintf("%d", score / 2);',
  cpp: 'int score = 7;\nstd::cout << score / 2;',
  go: 'score := 7\nfmt.Println(score / 2)',
  sql: 'SELECT COUNT(*) FROM users WHERE age > 30;',
  html: '<p id="greeting">Hello</p>',
  css: '.card { display: flex; gap: 8px; }',
  bash: 'for f in *.txt; do echo "$f"; done',
  pseudocode: 'SET total TO 0\nFOR EACH n IN numbers\n  ADD n TO total'
};

/**
 * A comma-separated list that keeps what the admin is typing. Splitting on
 * every keystroke would swallow the comma itself ("a," -> ["a"] -> "a"), so
 * the raw text is local state and only the parsed list goes up.
 */
const ListField: React.FC<{
  label: string;
  value: string[];
  onChange: (v: string[]) => void;
  placeholder?: string;
  hint?: string;
  error?: string;
  /** Code-like lists (answers, choices) are monospace; prose lists (tags) are not. */
  mono?: boolean;
}> = ({ label, value, onChange, placeholder, hint, error, mono = true }) => {
  const [text, setText] = useState(value.join(', '));
  return (
    <TextField
      label={label}
      mono={mono}
      value={text}
      onChange={(v) => {
        setText(v);
        onChange(
          v
            .split(',')
            .map((x) => x.trim())
            .filter(Boolean)
        );
      }}
      placeholder={placeholder}
      hint={hint}
      error={error}
    />
  );
};

/** Same rule as the grader: whitespace collapsed; case ignored only for a single plain word. */
const blankMatches = (given: string, accepted: string) => {
  const norm = (s: string) => s.trim().replace(/\s+/g, ' ');
  const g = norm(given);
  const a = norm(accepted);
  return /^[a-z0-9_]+$/i.test(a) ? g.toLowerCase() === a.toLowerCase() : g === a;
};

/** Blanks follow the ___ markers: one per hole, existing answers kept. */
const syncBlanks = (codeSnippet: string, blanks: QuestionInput['blanks']) => {
  const n = (codeSnippet.match(/___/g) ?? []).length;
  const next = (blanks ?? []).slice(0, n);
  while (next.length < n) next.push({ ...EMPTY_BLANK });
  return next;
};

const letter = (i: number) => String.fromCharCode(65 + i);

/** "3 · Functions" - the same label in the Stage select and the read-only Stage field. */
const stageLabel = (stages: AdminStageRow[], stageId: string) => {
  const s = stages.find((st) => st.id === stageId);
  return s ? `${s.index} · ${s.name}` : stageId;
};

const EMPTY_TEST = { input: '', expected: '', hidden: false, description: '' };
const EMPTY_BLANK = { answer: '', alternatives: [] as string[], choices: [] as string[], wrongAnswers: [] as BlankWrongAnswer[] };
const EMPTY_EXAMPLE = { input: '', output: '', explanation: '' };
const MAX_EXAMPLES = 6;
const MAX_CONSTRAINTS = 10;

function blank(stageId: string): QuestionInput {
  return {
    stageId,
    type: 'quiz',
    title: '',
    prompt: '',
    explanation: '',
    language: 'javascript',
    difficulty: 'easy',
    xpReward: 40,
    hints: [],
    tags: [],
    codeSnippet: '',
    options: ['', '', '', ''],
    optionFeedback: [],
    correctIndex: undefined,
    correctIndices: [],
    blanks: [],
    pseudocodeLines: ['', '', ''],
    starterCode: '',
    entryFunction: '',
    solutionCode: '',
    testCases: [{ ...EMPTY_TEST }, { ...EMPTY_TEST }],
    uiPreview: false,
    examples: [],
    constraints: []
  };
}

/** Re-open any question - authored or written here - its row carries every field. */
function fromRow(row: AdminChallengeRow): QuestionInput {
  return {
    ...blank(row.stageId),
    type: row.type as QuestionInput['type'],
    title: row.title,
    prompt: row.prompt,
    explanation: row.explanation,
    language: row.language,
    difficulty: row.difficulty,
    xpReward: row.xpReward,
    hints: row.hints ?? [],
    tags: row.tags ?? [],
    codeSnippet: row.codeSnippet ?? '',
    options: row.options ?? ['', '', '', ''],
    optionFeedback: alignNotes(row.optionFeedback, (row.options ?? []).length),
    correctIndex: row.correctIndex,
    correctIndices: row.correctIndices ?? [],
    blanks: (row.blanks ?? []).map((b) => ({
      answer: b.answer,
      alternatives: b.alternatives ?? [],
      choices: b.choices ?? [],
      wrongAnswers: (b.wrongAnswers ?? []).map((w) => ({ answer: w.answer, feedback: w.feedback }))
    })),
    pseudocodeLines: row.pseudocodeLines ?? ['', '', ''],
    starterCode: row.starterCode ?? '',
    entryFunction: row.entryFunction ?? '',
    solutionCode: row.solutionCode ?? '',
    testCases: (row.testCases ?? []).map((t) => ({ input: t.input, expected: t.expected, hidden: Boolean(t.hidden), description: t.description ?? '' })),
    uiPreview: Boolean(row.uiPreview),
    examples: (row.examples ?? []).map((ex) => ({ input: ex.input, output: ex.output, explanation: ex.explanation ?? '' })),
    constraints: [...(row.constraints ?? [])]
  };
}

/* -------------------------------------------------------------- wizard */

export interface QuestionWizardProps {
  stages: AdminStageRow[];
  /** Stage pre-selected on the page. */
  stageId: string;
  /** When set, the wizard edits this question (authored or written here) instead of creating one. */
  existing?: AdminChallengeRow | null;
  /** Skip the type picker for a new question - e.g. from "Add a Frontend question" on an empty filter. */
  initialKind?: Kind;
  /**
   * A new question already written out (by the AI assistant) to review here
   * before saving. Ignored when `existing` is set. The form opens straight
   * away and counts as edited, so closing asks before throwing it away.
   */
  draft?: QuestionInput;
  /**
   * How many questions of each kind a stage already has, shown on the type
   * cards for the stage the question is going into. Null when the page does
   * not know (it only loaded another stage), and the cards say nothing.
   */
  countsFor?: (stageId: string) => Partial<Record<Kind, number>> | null;
  onClose: () => void;
  onSaved: (row: AdminChallengeRow) => void;
}

export const QuestionWizard: React.FC<QuestionWizardProps> = ({ stages, stageId, existing, initialKind, draft, countsFor, onClose, onSaved }) => {
  const [kind, setKind] = useState<Kind | null>(() => (existing ? kindOf(existing) : initialKind ?? (draft ? kindOf(draft) : null)));
  const [q, setQ] = useState<QuestionInput>(() => {
    if (existing) return fromRow(existing);
    // A draft carries its own type and stage; blank() only fills in anything it left out.
    if (draft) return { ...blank(stageId), ...draft };
    const meta = KINDS.find((k) => k.kind === initialKind);
    return meta ? { ...blank(stageId), type: meta.type, ...meta.preset } : blank(stageId);
  });
  // Built-in questions are edited as a replacement stored under the same id -
  // unless only their wording, XP, difficulty or notes changed (see
  // `builtInPatch`); a stage test on top of that has rules of its own (see
  // validateLocally).
  const authored = Boolean(existing && !existing.custom);
  const stageTest = Boolean(existing?.isStageTest);
  // The form as it opened, to tell what the admin changed.
  const [initial] = useState<QuestionInput | null>(() => (existing ? fromRow(existing) : null));
  // The type in force before "Change type", so the picker can be backed out of without losing edits.
  const [lastKind, setLastKind] = useState<Kind | null>(null);
  const [issues, setIssues] = useState<QuestionIssue[]>([]);
  const [showIssues, setShowIssues] = useState(false);
  const [check, setCheck] = useState<QuestionCheck | null>(null);
  const [busy, setBusy] = useState<'check' | 'save' | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Once anything has been typed, closing asks first: Escape or a stray click
  // on the backdrop must not throw away a half-written code question. An AI
  // draft is already worth keeping, so it starts out dirty.
  const [dirty, setDirty] = useState(Boolean(draft && !existing));
  const [confirmClose, setConfirmClose] = useState(false);

  // Any edit clears the server's verdict: the local checks update live, and
  // the server is asked again on the next Check / Save.
  const patch = useCallback((p: Partial<QuestionInput>) => {
    setQ((prev) => ({ ...prev, ...p }));
    setDirty(true);
    setIssues([]);
    setCheck(null);
    setError(null);
  }, []);

  const requestClose = useCallback(() => {
    if (dirty) setConfirmClose(true);
    else onClose();
  }, [dirty, onClose]);

  const pick = (meta: KindMeta) => {
    setKind(meta.kind);
    setQ((prev) => {
      const next = { ...prev, type: meta.type, uiPreview: false, ...meta.preset };
      // A code kind cannot keep a language the server cannot run.
      if ((meta.kind === 'code_runner' || meta.kind === 'debug') && !EXECUTABLE.has(next.language)) next.language = 'javascript';
      // Blanks must match the ___ holes in whatever snippet came along.
      if (meta.kind === 'fill_blank') next.blanks = syncBlanks(next.codeSnippet ?? '', next.blanks);
      return next;
    });
    setIssues([]);
    setCheck(null);
    setError(null);
    setShowIssues(false);
  };

  // Problems shown next to fields. Local checks give instant feedback; the
  // server's verdict replaces them once it has looked.
  const localIssues = useMemo(
    () => [...validateLocally(q, { stageTest, authoredStageId: authored ? existing?.stageId : undefined }), ...feedbackIssues(q)],
    [q, stageTest, authored, existing?.stageId]
  );
  const shown = showIssues ? [...localIssues, ...issues.filter((i) => !localIssues.some((l) => l.path === i.path))] : [];
  const errorAt = (path: string) => shown.find((i) => i.path === path)?.message;
  const unplaced = shown.filter((i) => !KNOWN_PATHS.test(i.path));
  // Notes that give the answer away: a warning next to the note, never a block.
  const leaks = useMemo(() => leakWarnings(q), [q]);
  const warnAt = (path: string) => leaks[path];
  // A built-in question (not already replaced here) whose logic is untouched
  // is saved by layering the changes on it - it stays live from source.
  const patchPlan = authored && existing && !existing.modified && initial ? builtInPatch(q, initial, existing) : null;

  const runCheck = async () => {
    setShowIssues(true);
    if (localIssues.length) {
      setIssues(localIssues);
      setCheck(null);
      return;
    }
    setBusy('check');
    setError(null);
    try {
      const result = await adminApi.validateQuestion(q, existing?.id);
      setIssues(result.issues);
      setCheck(result);
    } catch (err: any) {
      setError(err.message ?? 'Could not check the question.');
    } finally {
      setBusy(null);
    }
  };

  const save = async () => {
    setShowIssues(true);
    if (localIssues.length) {
      setIssues(localIssues);
      return;
    }
    setBusy('save');
    setError(null);
    try {
      if (existing && patchPlan) {
        // Only wording, XP, difficulty or notes changed on a built-in question:
        // layered on top, so the question is not frozen as a modified copy.
        if (Object.keys(patchPlan).length) await adminApi.updateChallenge(existing.id, patchPlan);
        const listed = await adminApi.challenges(existing.stageId);
        onSaved(listed.challenges.find((row) => row.id === existing.id) ?? existing);
        return;
      }
      // The server answers with the complete list row (custom/modified/hidden/original).
      const result = existing ? await adminApi.replaceQuestion(existing.id, q) : await adminApi.createQuestion(q);
      onSaved(result.challenge);
    } catch (err: any) {
      if (err instanceof AdminApiError && err.status === 400 && Array.isArray((err.payload as any)?.issues)) {
        // The notes route's own checks (a PATCH): shown next to their fields.
        setIssues((err.payload as { issues: QuestionIssue[] }).issues);
        setError('Not saved yet - fix the points marked below.');
      } else if (err instanceof AdminApiError && err.status === 422 && Array.isArray((err.payload as any)?.issues)) {
        const payload = err.payload as { issues: QuestionIssue[]; verification: QuestionCheck['verification'] };
        setIssues(payload.issues);
        setCheck({ ok: false, issues: payload.issues, verification: payload.verification });
        setError('Not saved yet - fix the points marked below.');
      } else {
        setError(err.message ?? 'Could not save the question.');
      }
    } finally {
      setBusy(null);
    }
  };

  const meta = KINDS.find((k) => k.kind === kind);
  const title = existing ? `Edit: ${existing.title}${authored ? ' (built-in)' : ''}` : meta ? `New question · ${meta.title}` : 'New question';

  return (
    <>
      <Drawer
        open
        size="lg"
        title={title}
        onClose={requestClose}
        closable={busy === null}
        footer={
          kind ? (
            <>
              {!stageTest && (
                <Button
                  variant="ghost"
                  onClick={() => {
                    setLastKind(kind);
                    setKind(null);
                  }}
                  disabled={busy !== null}
                >
                  Change type
                </Button>
              )}
              <Button variant="secondary" onClick={requestClose} disabled={busy !== null}>
                Cancel
              </Button>
              <Button variant="secondary" onClick={runCheck} disabled={busy !== null}>
                {busy === 'check' ? 'Checking…' : 'Check question'}
              </Button>
              <Button variant="primary" onClick={save} disabled={busy !== null}>
                {busy === 'save' ? 'Saving…' : existing ? 'Save changes' : 'Save question'}
              </Button>
            </>
          ) : (
            <>
              {lastKind && (
                <Button variant="ghost" onClick={() => setKind(lastKind)}>
                  Back
                </Button>
              )}
              <Button variant="secondary" onClick={requestClose}>
                Cancel
              </Button>
            </>
          )
        }
      >
        {!kind || !meta ? (
          <KindPicker onPick={pick} counts={countsFor?.(q.stageId) ?? null} stage={stageLabel(stages, q.stageId)} current={lastKind} />
        ) : (
          <div>
            {authored && (
              <div className="notice notice-info mb-4" role="note">
                {patchPlan
                  ? "This question comes from CodeConsist's built-in bank. Changes to its wording, hints, tags, XP, difficulty or wrong-answer notes are laid over it when you save, so it keeps following the built-in version. Changing its answers, options or code saves your own version instead. Learners see your changes straight away."
                  : existing?.modified
                    ? "This question comes from CodeConsist's built-in bank and your own version of it is saved here. Saving updates your version; you can put the original back from the list at any time."
                    : "This question comes from CodeConsist's built-in bank. You have changed its answers, options or code, so saving keeps your own version in its place - learners see it straight away, and you can put the original back from the list at any time."}
                {existing?.concept != null && ' Its Learn-mode teaching steps are kept exactly as they are.'}
                {stageTest &&
                  (EXECUTABLE.has(existing?.language ?? '')
                    ? " This is the stage's final test, so it must stay a code question."
                    : " This is the stage's final test, so its type is fixed - this language has no code engine here, so it stays answer-graded.")}
              </div>
            )}
            {existing && !stageTest && (
              <p className="text-xs text-fg-muted mb-4">
                Learn mode's teaching card for this lesson is edited under Teaching:{' '}
                <Link to={`/admin/teaching?stageId=${encodeURIComponent(existing.stageId)}`} className="link-btn">
                  {existing.conceptKey ? 'Edit teaching card' : 'Add a teaching card'}
                </Link>
              </p>
            )}
            <p className="text-xs text-fg-muted mb-4">
              Every field marked <span className="text-error">*</span> is required. Learners see exactly what you type here, so write it the
              way you would say it to them.
            </p>
            {error && <ErrorText>{error}</ErrorText>}
            {check && !error && (
              // The server's verdict for every kind - the code sections add their
              // per-test detail below, but a quiz has nowhere else to show it.
              <div className={`notice ${check.ok ? 'notice-success' : 'notice-error'} mb-4`} role="status">
                {check.ok
                  ? 'Checked - no problems found. Ready to save.'
                  : `${check.issues.length} problem${check.issues.length === 1 ? '' : 's'} found - see the fields marked below.`}
              </div>
            )}
            {unplaced.length > 0 && (
              <ul className="mb-4 text-sm text-error list-disc pl-5" role="alert">
                {unplaced.map((i) => (
                  <li key={`${i.path}:${i.message}`}>{i.message}</li>
                ))}
              </ul>
            )}

            <Section title="Where it goes">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {authored ? (
                  // The replacement is served in the original's position, so the
                  // server refuses a stage move - there is nothing to pick here.
                  <TextField
                    label="Stage"
                    required
                    disabled
                    value={stageLabel(stages, q.stageId)}
                    onChange={() => {}}
                    hint="Built-in questions keep their place in the stage."
                    error={errorAt('stageId')}
                  />
                ) : (
                  <SelectField
                    label="Stage"
                    required
                    value={q.stageId}
                    onChange={(v) => patch({ stageId: v })}
                    options={stages.map((s) => ({ value: s.id, label: stageLabel(stages, s.id) }))}
                    hint={existing ? "Moving it puts it at the end of the other stage's lessons." : "The question is added at the end of this stage's lessons."}
                    error={errorAt('stageId')}
                  />
                )}
                <SelectField
                  label="Difficulty"
                  required
                  value={q.difficulty}
                  onChange={(v) => patch({ difficulty: v as QuestionInput['difficulty'] })}
                  options={[
                    { value: 'easy', label: 'Easy' },
                    { value: 'medium', label: 'Medium' },
                    { value: 'hard', label: 'Hard' }
                  ]}
                  hint="Shown as a badge on the question."
                  error={errorAt('difficulty')}
                />
                <NumberField
                  label="XP reward"
                  required
                  value={q.xpReward}
                  onChange={(v) => patch({ xpReward: v })}
                  min={5}
                  max={500}
                  hint="Typical: easy 30-40, medium 50-60, hard 80+."
                  error={errorAt('xpReward')}
                />
              </div>
            </Section>

            <Section title="The question">
              <TextField
                label="Title"
                required
                value={q.title}
                onChange={(v) => patch({ title: v })}
                placeholder="e.g. Hoisting and var"
                hint="Short - 3 to 8 words. Shown in the lesson list and at the top of the question."
                maxLength={120}
                error={errorAt('title')}
              />
              <TextArea
                label="Prompt"
                required
                value={q.prompt}
                onChange={(v) => patch({ prompt: v })}
                rows={3}
                placeholder={PROMPT_PLACEHOLDER[kind]}
                hint="The question itself, as the learner reads it. One or two plain sentences; put code in the code field below, not here."
                error={errorAt('prompt')}
              />
              {kind !== 'frontend' && kind !== 'pseudocode_order' && stageTest ? (
                // A stage test is graded the way its stage's language allows
                // (run, or answer-checked); switching it would demand a type
                // change the wizard rightly refuses, so it is shown, not edited.
                <TextField
                  label="Language"
                  required
                  disabled
                  value={LANGUAGES.find((l) => l.value === q.language)?.label ?? q.language}
                  onChange={() => {}}
                  hint="A stage test is answered in its stage's language."
                  error={errorAt('language')}
                />
              ) : kind !== 'frontend' && kind !== 'pseudocode_order' ? (
                <SelectField
                  label="Language"
                  required
                  value={q.language}
                  onChange={(v) => patch({ language: v })}
                  options={kind === 'code_runner' || kind === 'debug' ? CODE_LANGUAGES : LANGUAGES}
                  hint={
                    kind === 'code_runner' || kind === 'debug'
                      ? 'Only these can be graded by running the code. For a web page, use the Frontend question type instead.'
                      : 'Used for syntax colouring of the code and for the language filter.'
                  }
                  error={errorAt('language')}
                />
              ) : null}
              {(kind === 'quiz' || kind === 'multi_select' || kind === 'output_prediction') && (
                <CodeArea
                  label={kind === 'output_prediction' ? 'Code to show' : 'Code snippet (optional)'}
                  required={kind === 'output_prediction'}
                  value={q.codeSnippet ?? ''}
                  onChange={(v) => patch({ codeSnippet: v })}
                  rows={5}
                  placeholder={SNIPPET_EXAMPLE[q.language] ?? 'Paste the short program here'}
                  hint={
                    kind === 'output_prediction'
                      ? 'The program the learner predicts the output of. Keep it under ~8 lines so it fits on screen.'
                      : 'Shown above the options, with syntax colouring. Leave empty for a text-only question.'
                  }
                  error={errorAt('codeSnippet')}
                />
              )}
            </Section>

            {existing?.feedbackStale && (
              <div className="notice notice-warn mb-4" role="note">
                <Badge tone="warning">Notes out of date</Badge> Wrong-answer notes were saved for this question, but its options (or blanks) have
                changed in the built-in bank since, so learners no longer see them. Write them again below, or review them on the Answer feedback
                page.
              </div>
            )}
            {(kind === 'quiz' || kind === 'multi_select' || kind === 'output_prediction') && (
              <OptionsEditor q={q} patch={patch} multi={kind === 'multi_select'} errorAt={errorAt} warnAt={warnAt} />
            )}
            {kind === 'fill_blank' && <BlanksEditor q={q} patch={patch} errorAt={errorAt} warnAt={warnAt} />}
            {kind === 'pseudocode_order' && <StepsEditor q={q} patch={patch} errorAt={errorAt} />}
            {(kind === 'code_runner' || kind === 'debug' || kind === 'frontend') && (
              <CodeEditorSection q={q} patch={patch} kind={kind} errorAt={errorAt} check={check} />
            )}
            {(kind === 'code_runner' || kind === 'debug' || kind === 'frontend') && stageTest && <ExamplesEditor q={q} patch={patch} errorAt={errorAt} />}

            <Section title="After answering">
              <TextArea
                label="Explanation"
                required
                value={q.explanation}
                onChange={(v) => patch({ explanation: v })}
                rows={3}
                placeholder={'e.g. `var` declarations are hoisted and start as undefined, so the first log prints "undefined"; after the assignment it holds a number.'}
                hint="Shown when the learner gets it right, or once their tries run out and the answer is shown (straight away in Learn mode; the number of tries is set under Rules & rewards). Explain WHY the right answer is right, not just what it is."
                error={errorAt('explanation')}
              />
              <HintsEditor value={q.hints} onChange={(hints) => patch({ hints })} />
              <ListField
                label="Tags (optional)"
                mono={false}
                value={q.tags}
                onChange={(tags) => patch({ tags })}
                placeholder="e.g. variables, hoisting"
                hint="Comma-separated keywords for search and roadmaps. Up to 8."
              />
            </Section>
          </div>
        )}
      </Drawer>
      <ConfirmDialog
        open={confirmClose}
        title={existing ? 'Discard your changes?' : 'Discard this question?'}
        message={existing ? 'What you changed here has not been saved.' : 'Nothing has been saved yet - the fields you filled in will be lost.'}
        confirmLabel="Discard"
        onCancel={() => setConfirmClose(false)}
        onConfirm={() => {
          setConfirmClose(false);
          onClose();
        }}
      />
    </>
  );
};

/* ----------------------------------------------------------- type picker */

/** The type cards - the wizard's first step, and the AI assistant's too. */
export const KindPicker: React.FC<{ onPick: (meta: KindMeta) => void; counts: Partial<Record<Kind, number>> | null; stage: string; current: Kind | null }> = ({
  onPick,
  counts,
  stage,
  current
}) => (
  <div>
    <h3 className="text-base font-semibold text-fg mb-1">What kind of question is it?</h3>
    <p className="text-sm text-fg-secondary mb-4">
      {current
        ? 'Pick the new type - the fields that fit it (title, prompt, code, tests) are carried over; the rest start empty.'
        : 'Pick one - the next step only asks for what that kind needs.'}
      {counts && ` The counts are what ${stage} already has.`}
    </p>
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      {KINDS.map((k) => {
        const n = counts?.[k.kind];
        return (
          <button key={k.kind} type="button" className="kind-card" onClick={() => onPick(k)} aria-current={current === k.kind ? 'true' : undefined}>
            <span className="flex items-start justify-between gap-2">
              <span className="kind-icon" aria-hidden="true">
                {k.icon}
              </span>
              {current === k.kind && <Badge>Current type</Badge>}
            </span>
            <span className="block text-sm font-semibold text-fg">{k.title}</span>
            <span className="block text-xs text-fg-secondary mt-1 leading-relaxed">{k.blurb}</span>
            <span className="block text-[11px] font-mono text-fg-muted mt-2 truncate">{k.example}</span>
            {counts && <span className="block text-[11px] text-fg-muted mt-2">{n ? `${n} in this stage` : 'none in this stage yet'}</span>}
          </button>
        );
      })}
    </div>
  </div>
);

/* --------------------------------------------------------------- sections */

const Section: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <section className="mb-6">
    <h3 className="eyebrow">{title}</h3>
    {children}
  </section>
);

const PROMPT_PLACEHOLDER: Record<Kind, string> = {
  quiz: 'e.g. Which keyword declares a variable that cannot be reassigned?',
  multi_select: 'e.g. Which of these values are falsy in JavaScript? Select all that apply.',
  output_prediction: 'e.g. What does this program print?',
  fill_blank: 'e.g. Fill in the blanks so the loop runs exactly ten times.',
  pseudocode_order: 'e.g. Put these steps in the order that returns the largest number in a list.',
  code_runner: 'e.g. Write a function add(a, b) that returns the sum of two numbers.',
  debug: 'e.g. This function should return the sum of two numbers, but the tests fail. Find and fix the bug.',
  frontend: 'e.g. Build a card with a heading (id "title") that reads "Hello" and a button (id "cta") that turns green when clicked.'
};

type Patch = (p: Partial<QuestionInput>) => void;
type ErrorAt = (path: string) => string | undefined;

/**
 * A "why" note under an option or for a wrong answer: collapsed to a link
 * until there is something in it. `warning` names a note that gives the
 * answer away (saved, but held back from learners until the answer shows).
 */
const NoteField: React.FC<{
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  addLabel: string;
  error?: string;
  warning?: string;
}> = ({ label, value, onChange, placeholder, addLabel, error, warning }) => {
  const [open, setOpen] = useState(Boolean(value));
  if (!open && !value && !error) {
    return (
      <button type="button" className="link-btn text-xs mt-1" onClick={() => setOpen(true)}>
        {addLabel}
      </button>
    );
  }
  return (
    <div className="mt-2">
      <TextArea label={label} value={value} onChange={onChange} rows={2} maxLength={NOTE_MAX} placeholder={placeholder} error={error} />
      {warning && !error && (
        <p className="field-hint text-warning" role="note">
          {warning}
        </p>
      )}
    </div>
  );
};

const RowButtons: React.FC<{ onRemove?: () => void; onUp?: () => void; onDown?: () => void; removeLabel: string }> = ({ onRemove, onUp, onDown, removeLabel }) => (
  <span className="flex items-center gap-1 shrink-0">
    {onUp && (
      <Button variant="ghost" size="sm" onClick={onUp} aria-label="Move up" type="button">
        <ArrowUp size={13} />
      </Button>
    )}
    {onDown && (
      <Button variant="ghost" size="sm" onClick={onDown} aria-label="Move down" type="button">
        <ArrowDown size={13} />
      </Button>
    )}
    {onRemove && (
      <Button variant="ghost" size="sm" onClick={onRemove} aria-label={removeLabel} type="button">
        <Trash2 size={13} />
      </Button>
    )}
  </span>
);

/** Options with one (radio) or several (checkbox) correct answers. Indices - and notes - are remapped when rows move or go. */
const OptionsEditor: React.FC<{ q: QuestionInput; patch: Patch; multi: boolean; errorAt: ErrorAt; warnAt: ErrorAt }> = ({ q, patch, multi, errorAt, warnAt }) => {
  const options = q.options ?? [];
  const notes = alignNotes(q.optionFeedback, options.length);
  const correctSet = new Set(multi ? q.correctIndices ?? [] : q.correctIndex === undefined ? [] : [q.correctIndex]);

  const setCount = (n: number) => {
    const count = Math.max(2, Math.min(8, Math.round(n)));
    const next = options.slice(0, count);
    while (next.length < count) next.push('');
    patch({
      options: next,
      optionFeedback: alignNotes(q.optionFeedback, count),
      correctIndex: q.correctIndex !== undefined && q.correctIndex < count ? q.correctIndex : undefined,
      correctIndices: (q.correctIndices ?? []).filter((i) => i < count)
    });
  };
  const setText = (i: number, text: string) => patch({ options: options.map((o, j) => (j === i ? text : o)) });
  const setNote = (i: number, text: string) => patch({ optionFeedback: notes.map((n, j) => (j === i ? text : n)) });
  const remove = (i: number) => {
    const next = options.filter((_, j) => j !== i);
    const shift = (idx: number) => (idx > i ? idx - 1 : idx);
    patch({
      options: next,
      optionFeedback: notes.filter((_, j) => j !== i),
      correctIndex: q.correctIndex === undefined || q.correctIndex === i ? undefined : shift(q.correctIndex),
      correctIndices: (q.correctIndices ?? []).filter((idx) => idx !== i).map(shift)
    });
  };
  const markCorrect = (i: number, on: boolean) => {
    if (!multi) patch({ correctIndex: i });
    else patch({ correctIndices: on ? [...new Set([...(q.correctIndices ?? []), i])].sort((a, b) => a - b) : (q.correctIndices ?? []).filter((x) => x !== i) });
  };

  return (
    <Section title={multi ? 'Answer options - tick every correct one' : 'Answer options - mark the correct one'}>
      <div className="max-w-xs">
        <SelectField
          label="How many options?"
          value={String(options.length)}
          onChange={(v) => setCount(Number(v))}
          options={[2, 3, 4, 5, 6, 7, 8].map((n) => ({ value: String(n), label: `${n} options` }))}
          hint="You can also add or remove rows below."
        />
      </div>
      <p className="text-xs text-fg-muted mb-3">
        Learners see the options in a shuffled order, so avoid "all of the above" or "both A and B".
        {!multi && ' Exactly one must be marked correct.'} A note under a wrong option is shown to a learner who picks it - say why it
        looks right and why it is not, without naming the right answer.
      </p>
      {errorAt('options') && <ErrorText>{errorAt('options')}</ErrorText>}
      {(errorAt('correctIndex') || errorAt('correctIndices')) && <ErrorText>{errorAt('correctIndex') ?? errorAt('correctIndices')}</ErrorText>}
      <ol className="flex flex-col gap-2">
        {options.map((text, i) => {
          const err = errorAt(`options.${i}`);
          return (
            <li key={i} className={`option-row ${correctSet.has(i) ? 'is-correct' : ''} ${err ? 'is-invalid' : ''}`.trim()}>
              <span className="wizard-letter">{letter(i)}</span>
              <div className="min-w-0 flex-1">
                <input
                  type="text"
                  className={`w-full ${err ? 'is-invalid' : ''}`.trim()}
                  value={text}
                  placeholder={`Option ${letter(i)} - what the learner can choose`}
                  aria-label={`Option ${letter(i)} text`}
                  aria-invalid={err ? true : undefined}
                  onChange={(e) => setText(i, e.target.value)}
                />
                {err && (
                  <span className="field-hint text-error" role="alert">
                    {err}
                  </span>
                )}
                <NoteField
                  key={`${i}:${correctSet.has(i)}`}
                  label={correctSet.has(i) ? `Why option ${letter(i)} is right (optional)` : `Why a learner might pick option ${letter(i)}, and why it is wrong`}
                  addLabel={correctSet.has(i) ? '+ Add why this is right' : '+ Add a note for this wrong option'}
                  placeholder={correctSet.has(i) ? 'Shown once the answer is revealed.' : 'e.g. It looks like it copies the array, but it only copies the reference.'}
                  value={notes[i] ?? ''}
                  onChange={(v) => setNote(i, v)}
                  error={errorAt(`optionFeedback.${i}`)}
                  warning={warnAt(`optionFeedback.${i}`)}
                />
              </div>
              <label className="option-correct">
                <input
                  type={multi ? 'checkbox' : 'radio'}
                  name="correct-option"
                  checked={correctSet.has(i)}
                  aria-label={`Mark option ${letter(i)} as correct`}
                  onChange={(e) => markCorrect(i, e.target.checked)}
                />
                Correct
              </label>
              <RowButtons onRemove={options.length > 2 ? () => remove(i) : undefined} removeLabel={`Remove option ${letter(i)}`} />
            </li>
          );
        })}
      </ol>
      {options.length < 8 && (
        <Button variant="ghost" size="sm" className="mt-2" type="button" onClick={() => setCount(options.length + 1)}>
          <Plus size={13} /> Add option
        </Button>
      )}
    </Section>
  );
};

/**
 * A blank's common wrong answers, each with why it is wrong. A dropdown
 * blank gets one row per wrong choice (the answer fixed); a typed blank gets
 * free rows. Rows without a note are not saved.
 */
const WrongAnswersEditor: React.FC<{
  blank: NonNullable<QuestionInput['blanks']>[number];
  index: number;
  onChange: (rows: BlankWrongAnswer[]) => void;
  errorAt: ErrorAt;
  warnAt: ErrorAt;
}> = ({ blank, index, onChange, errorAt, warnAt }) => {
  const rows = blank.wrongAnswers ?? [];
  const choices = wrongChoicesOf(blank);
  const dropdown = blank.choices.length > 0;
  const noteFor = (answer: string) => rows.find((r) => r.answer.trim() === answer.trim())?.feedback ?? '';

  if (dropdown) {
    // One row per wrong choice; the saved rows follow the choices.
    const setChoiceNote = (answer: string, feedback: string) =>
      onChange(choices.map((c) => ({ answer: c, feedback: c === answer ? feedback : noteFor(c) })).filter((r) => r.feedback));
    return (
      <Field label="Common wrong answers (optional)" hint="Shown to a learner who picks that choice: why it is wrong, without naming the right answer.">
        {choices.length === 0 ? (
          <p className="text-xs text-fg-muted">Every choice is accepted - there is no wrong choice to explain.</p>
        ) : (
          <div className="flex flex-col gap-2">
            {choices.map((choice) => {
              const j = rows.findIndex((r) => r.answer.trim() === choice.trim());
              const path = `blanks.${index}.wrongAnswers.${Math.max(0, j)}`;
              return (
                <div key={choice} className="min-w-0">
                  <div className="text-xs text-fg-secondary">
                    If they pick <code className="font-mono">{choice}</code>:
                  </div>
                  <NoteField
                    label={`Why "${choice}" is wrong`}
                    addLabel="+ Add a note"
                    placeholder="e.g. That method belongs to strings, not arrays."
                    value={noteFor(choice)}
                    onChange={(v) => setChoiceNote(choice, v)}
                    error={j >= 0 ? errorAt(path) : undefined}
                    warning={j >= 0 ? warnAt(path) : undefined}
                  />
                </div>
              );
            })}
          </div>
        )}
      </Field>
    );
  }

  const set = (j: number, p: Partial<BlankWrongAnswer>) => onChange(rows.map((r, k) => (k === j ? { ...r, ...p } : r)));
  return (
    <Field label="Common wrong answers (optional)" hint="An answer learners often type by mistake, and why it is wrong - shown when they type it, without naming the right answer." error={errorAt(`blanks.${index}.wrongAnswers`)}>
      <div className="flex flex-col gap-2">
        {rows.map((row, j) => {
          const path = `blanks.${index}.wrongAnswers.${j}`;
          return (
            <div key={j} className="grid grid-cols-1 sm:grid-cols-[10rem_1fr_auto] gap-2 items-start">
              <input
                type="text"
                className={`w-full font-mono ${errorAt(path) ? 'is-invalid' : ''}`.trim()}
                value={row.answer}
                placeholder="e.g. size"
                aria-label={`Blank ${index + 1}, wrong answer ${j + 1}`}
                onChange={(e) => set(j, { answer: e.target.value })}
              />
              <div className="min-w-0">
                <textarea
                  className={`w-full ${errorAt(path) ? 'is-invalid' : ''}`.trim()}
                  rows={2}
                  maxLength={NOTE_MAX}
                  value={row.feedback}
                  placeholder="Why it is wrong, e.g. Arrays have no size property - that is Set and Map."
                  aria-label={`Blank ${index + 1}, why wrong answer ${j + 1} is wrong`}
                  onChange={(e) => set(j, { feedback: e.target.value })}
                />
                {errorAt(path) && (
                  <span className="field-hint text-error" role="alert">
                    {errorAt(path)}
                  </span>
                )}
                {!errorAt(path) && warnAt(path) && (
                  <span className="field-hint text-warning" role="note">
                    {warnAt(path)}
                  </span>
                )}
              </div>
              <RowButtons onRemove={() => onChange(rows.filter((_, k) => k !== j))} removeLabel={`Remove wrong answer ${j + 1}`} />
            </div>
          );
        })}
        {rows.length < MAX_WRONG_ANSWERS && (
          <Button variant="ghost" size="sm" type="button" onClick={() => onChange([...rows, { answer: '', feedback: '' }])}>
            <Plus size={13} /> Add a wrong answer
          </Button>
        )}
      </div>
    </Field>
  );
};

/** Blanks are derived from the ___ markers in the snippet, so the count can never drift. */
const BlanksEditor: React.FC<{ q: QuestionInput; patch: Patch; errorAt: ErrorAt; warnAt: ErrorAt }> = ({ q, patch, errorAt, warnAt }) => {
  const holes = (q.codeSnippet?.match(/___/g) ?? []).length;
  const blanks = q.blanks ?? [];

  const setSnippet = (codeSnippet: string) => patch({ codeSnippet, blanks: syncBlanks(codeSnippet, blanks) });
  const setBlank = (i: number, p: Partial<(typeof blanks)[number]>) => patch({ blanks: blanks.map((b, j) => (j === i ? { ...b, ...p } : b)) });

  return (
    <Section title="The code and its blanks">
      <CodeArea
        label="Code with blanks"
        required
        value={q.codeSnippet ?? ''}
        onChange={setSnippet}
        rows={6}
        placeholder={'for (let i = 0; i ___ 10; i++) {\n  total ___ i;\n}'}
        hint="Write ___ (three underscores) wherever the learner has to fill something in. One answer box appears below for each ___."
        error={errorAt('codeSnippet') ?? errorAt('blanks')}
      />
      {holes === 0 ? (
        <p className="text-sm text-fg-muted">No blanks yet - add ___ to the code above.</p>
      ) : (
        <ol className="flex flex-col gap-3">
          {blanks.map((b, i) => (
            <li key={i} className="panel panel-body">
              <div className="font-mono text-xs text-fg-muted mb-2">Blank {i + 1}</div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <TextField
                  label="Correct answer"
                  required
                  mono
                  value={b.answer}
                  onChange={(v) => setBlank(i, { answer: v })}
                  placeholder="e.g. <"
                  hint="Exactly what should go in the ___ . Extra spaces at the ends are ignored, but `a + b` and `a+b` are different - add the other spelling under 'Also accept'. A single word matches in any capitalisation."
                  error={errorAt(`blanks.${i}.answer`)}
                />
                <ListField
                  label="Also accept (optional)"
                  value={b.alternatives}
                  onChange={(alternatives) => setBlank(i, { alternatives })}
                  placeholder="e.g. <=, !=="
                  hint="Other answers that are also right, separated by commas."
                  error={errorAt(`blanks.${i}.alternatives`)}
                />
              </div>
              <ListField
                label="Dropdown choices (optional)"
                value={b.choices}
                onChange={(choices) => setBlank(i, { choices })}
                placeholder="e.g. <, >, ==, ==="
                hint="Separated by commas. Leave empty and the learner types the answer; fill it and they pick from these - so the correct answer must be one of them, spelled the same way."
                error={errorAt(`blanks.${i}.choices`)}
              />
              <WrongAnswersEditor blank={b} index={i} onChange={(wrongAnswers) => setBlank(i, { wrongAnswers })} errorAt={errorAt} warnAt={warnAt} />
            </li>
          ))}
        </ol>
      )}
    </Section>
  );
};

/** Steps in their correct order; the learner sees them shuffled. */
const StepsEditor: React.FC<{ q: QuestionInput; patch: Patch; errorAt: ErrorAt }> = ({ q, patch, errorAt }) => {
  const lines = q.pseudocodeLines ?? [];
  const set = (next: string[]) => patch({ pseudocodeLines: next });
  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= lines.length) return;
    const next = [...lines];
    [next[i], next[j]] = [next[j], next[i]];
    set(next);
  };
  return (
    <Section title="The steps, in the CORRECT order">
      <p className="text-xs text-fg-muted mb-3">
        Write them in the right order - CodeConsist shuffles them for the learner. Start a line with spaces to show it is nested (inside a loop or an
        if). Between 3 and 20 steps.
      </p>
      {errorAt('pseudocodeLines') && <ErrorText>{errorAt('pseudocodeLines')}</ErrorText>}
      <ol className="flex flex-col gap-2">
        {lines.map((line, i) => {
          const err = errorAt(`pseudocodeLines.${i}`);
          return (
            <li key={i} className={`option-row ${err ? 'is-invalid' : ''}`.trim()}>
              <span className="wizard-letter">{i + 1}</span>
              <div className="min-w-0 flex-1">
                <input
                  type="text"
                  className={`w-full font-mono ${err ? 'is-invalid' : ''}`.trim()}
                  value={line}
                  placeholder={STEP_PLACEHOLDER[i] ?? `Step ${i + 1}`}
                  aria-label={`Step ${i + 1}`}
                  aria-invalid={err ? true : undefined}
                  onChange={(e) => set(lines.map((l, j) => (j === i ? e.target.value : l)))}
                />
                {err && (
                  <span className="field-hint text-error" role="alert">
                    {err}
                  </span>
                )}
              </div>
              <RowButtons
                onUp={i > 0 ? () => move(i, -1) : undefined}
                onDown={i < lines.length - 1 ? () => move(i, 1) : undefined}
                onRemove={lines.length > 3 ? () => set(lines.filter((_, j) => j !== i)) : undefined}
                removeLabel={`Remove step ${i + 1}`}
              />
            </li>
          );
        })}
      </ol>
      {lines.length < 20 && (
        <Button variant="ghost" size="sm" className="mt-2" type="button" onClick={() => set([...lines, ''])}>
          <Plus size={13} /> Add step
        </Button>
      )}
    </Section>
  );
};

const STEP_PLACEHOLDER = ['e.g. SET total TO 0', 'e.g. FOR EACH n IN numbers', 'e.g.   ADD n TO total', 'e.g. END FOR', 'e.g. RETURN total'];

/** Starter, solution, entry function and test cases - plus the live "run the solution" check. */
const CodeEditorSection: React.FC<{ q: QuestionInput; patch: Patch; kind: Kind; errorAt: ErrorAt; check: QuestionCheck | null }> = ({
  q,
  patch,
  kind,
  errorAt,
  check
}) => {
  const frontend = kind === 'frontend';
  const tests = q.testCases ?? [];
  const setTest = (i: number, p: Partial<(typeof tests)[number]>) => patch({ testCases: tests.map((t, j) => (j === i ? { ...t, ...p } : t)) });
  const executable = EXECUTABLE.has(q.language);

  return (
    <>
      <Section title={kind === 'debug' ? 'The broken code' : frontend ? 'The page' : 'The code'}>
        {frontend && (
          <p className="text-xs text-fg-muted mb-3">
            One HTML document: markup, then a <code>&lt;style&gt;</code> block, then a <code>&lt;script&gt;</code> block. The learner edits it in a
            live preview.
          </p>
        )}
        <CodeArea
          label={kind === 'debug' ? 'Broken code the learner starts from' : 'Starter code the learner starts from'}
          required
          value={q.starterCode ?? ''}
          onChange={(v) => patch({ starterCode: v })}
          rows={frontend ? 10 : 6}
          placeholder={STARTER_PLACEHOLDER[kind]}
          hint={
            kind === 'debug'
              ? 'Must contain a real bug: before saving, the server checks that this version FAILS the tests.'
              : frontend
                ? 'Give them the skeleton: the elements with their ids (like id="title") so the checks can find them, and a comment where the work goes.'
                : 'Usually the first line of the function (its name and inputs) with a comment where the answer goes. Keep the function name exactly as in the tests.'
          }
          error={errorAt('starterCode')}
        />
        {!frontend && (
          <TextField
            label="Function the tests call"
            required
            mono
            value={q.entryFunction ?? ''}
            onChange={(v) => patch({ entryFunction: v })}
            placeholder="e.g. add"
            hint="Its exact name in the code. Each test calls it with the arguments you give below."
            error={errorAt('entryFunction')}
          />
        )}
        <CodeArea
          label="Working solution"
          required
          value={q.solutionCode ?? ''}
          onChange={(v) => patch({ solutionCode: v })}
          rows={frontend ? 10 : 6}
          placeholder={SOLUTION_PLACEHOLDER[kind]}
          hint={
            frontend
              ? 'A version that passes every test. Learners can reveal it after two attempts.'
              : q.language === 'python'
                ? 'Press "Check question" to run it against the test cases (when the server has Python installed). Learners can reveal it after two attempts.'
                : 'The server runs this against the test cases before saving, so a typo cannot ship. Learners can reveal it after two attempts.'
          }
          error={errorAt('solutionCode')}
        />
      </Section>

      <Section title="Test cases">
        <p className="text-xs text-fg-muted mb-3">
          {frontend
            ? 'Each test is a small piece of JavaScript that looks at the finished page and produces true when it is right. Copy the shape of the example - wrap the checks in (() => { ... })() so they run and hand back true or false. Expected is then "true".'
            : 'Each test calls the function with the arguments and compares what it returns with the expected value, written as a value: 3, "Fizz", [1, 2], true, null.'}
        </p>
        {errorAt('testCases') && <ErrorText>{errorAt('testCases')}</ErrorText>}
        <ol className="flex flex-col gap-3">
          {tests.map((t, i) => {
            const result = check?.verification?.solution?.testResults?.[i];
            return (
              <li key={i} className="panel panel-body">
                <div className="flex items-center justify-between mb-2">
                  <span className="font-mono text-xs text-fg-muted">
                    Test {i + 1}
                    {t.hidden && ' · hidden'}
                  </span>
                  <span className="flex items-center gap-2">
                    {result && (
                      <Badge tone={result.passed ? 'success' : 'danger'}>{result.passed ? 'solution passes' : `solution got ${result.actual ?? result.error ?? '?'}`}</Badge>
                    )}
                    <RowButtons onRemove={tests.length > 1 ? () => patch({ testCases: tests.filter((_, j) => j !== i) }) : undefined} removeLabel={`Remove test ${i + 1}`} />
                  </span>
                </div>
                {frontend ? (
                  <CodeArea
                    label="Check to run in the page"
                    required
                    value={t.input}
                    onChange={(v) => setTest(i, { input: v })}
                    rows={3}
                    placeholder={'(() => {\n  const el = document.querySelector("#title");\n  return Boolean(el) && el.textContent.trim() === "Hello";\n})()'}
                    hint="JavaScript that looks at the finished page and produces true when it is correct - keep the (() => { ... })() wrapper."
                    error={errorAt(`testCases.${i}.input`)}
                  />
                ) : (
                  <TextField
                    label="Arguments"
                    required
                    mono
                    value={t.input}
                    onChange={(v) => setTest(i, { input: v })}
                    placeholder={q.language === 'python' ? 'e.g. 1, 2   or   [3, 1, 2]' : 'e.g. 1, 2   or   [3, 1, 2], "x"'}
                    hint={`Exactly as you would write them between the brackets of ${q.entryFunction || 'the function'}( ... ). Several arguments: separate with commas.`}
                    error={errorAt(`testCases.${i}.input`)}
                  />
                )}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <TextField
                    label="Expected result"
                    required
                    mono
                    value={t.expected}
                    onChange={(v) => setTest(i, { expected: v })}
                    placeholder={frontend ? 'true' : 'e.g. 3   or   "Fizz"   or   [1, 2, 3]'}
                    hint={frontend ? 'Almost always true.' : 'Strings need quotes; numbers, arrays, true/false and null do not.'}
                    error={errorAt(`testCases.${i}.expected`)}
                  />
                  <TextField
                    label="Label (optional)"
                    value={t.description}
                    onChange={(v) => setTest(i, { description: v })}
                    placeholder={frontend ? 'e.g. heading reads "Hello"' : 'e.g. handles an empty list'}
                    hint="Shown to the learner instead of the raw arguments."
                  />
                </div>
                <Toggle label="Hidden test" ariaLabel={`Hide test ${i + 1}`} checked={t.hidden} onChange={(v) => setTest(i, { hidden: v })} hint="The learner sees only that it exists and whether it passed - never its arguments or expected value, like an interview." />
              </li>
            );
          })}
        </ol>
        {tests.length < 20 && (
          <Button variant="ghost" size="sm" className="mt-2" type="button" onClick={() => patch({ testCases: [...tests, { ...EMPTY_TEST }] })}>
            <Plus size={13} /> Add test case
          </Button>
        )}
        <RunSummary check={check} kind={kind} executable={executable} />
      </Section>
    </>
  );
};

const STARTER_PLACEHOLDER: Record<Kind, string> = {
  quiz: '',
  multi_select: '',
  output_prediction: '',
  fill_blank: '',
  pseudocode_order: '',
  code_runner: 'function add(a, b) {\n  // your code here\n}',
  debug: 'function add(a, b) {\n  return a - b; // wrong on purpose\n}',
  frontend: '<div class="card">\n  <h1 id="title"></h1>\n  <button id="cta">Click me</button>\n</div>\n\n<style>\n  .card { padding: 16px; }\n</style>\n\n<script>\n  // TODO: set the title text and handle the click\n</script>'
};
const SOLUTION_PLACEHOLDER: Record<Kind, string> = {
  ...STARTER_PLACEHOLDER,
  code_runner: 'function add(a, b) {\n  return a + b;\n}',
  debug: 'function add(a, b) {\n  return a + b;\n}',
  frontend: '<div class="card">\n  <h1 id="title">Hello</h1>\n  <button id="cta">Click me</button>\n</div>\n\n<style>\n  .card { padding: 16px; }\n</style>\n\n<script>\n  document.querySelector("#cta").addEventListener("click", (e) => { e.target.style.background = "green"; });\n</script>'
};

/** Stage tests only: the worked examples and constraints learners see in place of hints. */
const ExamplesEditor: React.FC<{ q: QuestionInput; patch: Patch; errorAt: ErrorAt }> = ({ q, patch, errorAt }) => {
  const examples = q.examples ?? [];
  const constraints = q.constraints ?? [];
  const setExample = (i: number, p: Partial<(typeof examples)[number]>) => patch({ examples: examples.map((ex, j) => (j === i ? { ...ex, ...p } : ex)) });

  return (
    <Section title="Worked examples & constraints">
      <p className="text-xs text-fg-muted mb-3">Stage tests show these instead of hints, like an interview problem. At least one example; up to {MAX_EXAMPLES}.</p>
      {errorAt('examples') && <ErrorText>{errorAt('examples')}</ErrorText>}
      <ol className="flex flex-col gap-3">
        {examples.map((ex, i) => (
          <li key={i} className="panel panel-body">
            <div className="flex items-center justify-between mb-2">
              <span className="font-mono text-xs text-fg-muted">Example {i + 1}</span>
              <RowButtons onRemove={() => patch({ examples: examples.filter((_, j) => j !== i) })} removeLabel={`Remove example ${i + 1}`} />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <TextField
                label="Input"
                required
                mono
                value={ex.input}
                onChange={(v) => setExample(i, { input: v })}
                placeholder="e.g. [3, 1, 2]"
                hint="What the function is called with, written the way the learner would read it."
                error={errorAt(`examples.${i}.input`)}
              />
              <TextField
                label="Output"
                required
                mono
                value={ex.output}
                onChange={(v) => setExample(i, { output: v })}
                placeholder="e.g. [1, 2, 3]"
                hint="What it returns for that input."
                error={errorAt(`examples.${i}.output`)}
              />
            </div>
            <TextField
              label="Why it's right (optional)"
              value={ex.explanation}
              onChange={(v) => setExample(i, { explanation: v })}
              placeholder="e.g. sorted ascending"
              hint="One short line connecting the input to the output."
            />
          </li>
        ))}
      </ol>
      {examples.length < MAX_EXAMPLES && (
        <Button variant="ghost" size="sm" className="mt-2" type="button" onClick={() => patch({ examples: [...examples, { ...EMPTY_EXAMPLE }] })}>
          <Plus size={13} /> Add example
        </Button>
      )}

      <div className="mt-4">
        <Field label="Constraints (optional)" hint={`Limits on the input, one per line - up to ${MAX_CONSTRAINTS}. Shown under the examples.`} error={errorAt('constraints')}>
          <div className="flex flex-col gap-2">
            {constraints.map((c, i) => (
              <div key={i} className="flex items-center gap-2">
                <input
                  type="text"
                  className="w-full"
                  value={c}
                  placeholder={i === 0 ? 'e.g. 1 <= nums.length <= 1000' : `Constraint ${i + 1}`}
                  aria-label={`Constraint ${i + 1}`}
                  onChange={(e) => patch({ constraints: constraints.map((x, j) => (j === i ? e.target.value : x)) })}
                />
                <RowButtons onRemove={() => patch({ constraints: constraints.filter((_, j) => j !== i) })} removeLabel={`Remove constraint ${i + 1}`} />
              </div>
            ))}
            {constraints.length < MAX_CONSTRAINTS && (
              <Button variant="ghost" size="sm" type="button" onClick={() => patch({ constraints: [...constraints, ''] })}>
                <Plus size={13} /> Add constraint
              </Button>
            )}
          </div>
        </Field>
      </div>
    </Section>
  );
};

/** The verdict of "Check question" for code: did the solution pass, did the broken starter fail. */
const RunSummary: React.FC<{ check: QuestionCheck | null; kind: Kind; executable: boolean }> = ({ check, kind, executable }) => {
  if (!check?.verification?.solution) {
    return (
      <p className="text-xs text-fg-muted mt-3">
        {kind === 'frontend'
          ? 'Frontend tests run in the learner\'s browser; the server cannot run them here, so try the question yourself after saving.'
          : executable
            ? 'Press "Check question" to run the solution against these tests before saving.'
            : 'The server cannot run this language, so the tests are not executed here.'}
      </p>
    );
  }
  const line = (label: string, run: SolutionRun | null, wantPass: boolean) => {
    if (!run) return null;
    const good = run.status === 'skipped' ? null : (run.status === 'passed') === wantPass;
    return (
      <div className="flex items-start gap-2 text-sm">
        <span className={`mt-0.5 ${good === null ? 'text-fg-muted' : good ? 'text-success' : 'text-error'}`} aria-hidden="true">
          {good === null ? '·' : good ? <Check size={14} /> : <X size={14} />}
        </span>
        <span>
          <strong>{label}:</strong> {run.status}
          {run.reason ? ` - ${run.reason}` : ''}
          {run.stderr ? <span className="block font-mono text-xs text-fg-muted whitespace-pre-wrap">{run.stderr.split('\n')[0]}</span> : null}
        </span>
      </div>
    );
  };
  return (
    <div className="mt-3 flex flex-col gap-1.5">
      {line('Solution', check.verification.solution, true)}
      {kind === 'debug' && line('Broken starter (must fail)', check.verification.starter, false)}
    </div>
  );
};

/** Hints as a short list of inputs - a hint may contain commas, so not a tags field. */
const HintsEditor: React.FC<{ value: string[]; onChange: (v: string[]) => void }> = ({ value, onChange }) => (
  <Field label="Hints (optional)" hint="Up to 6, revealed one at a time when the learner asks. Each costs them 10% of the XP, so make every one count.">
    <div className="flex flex-col gap-2">
      {value.map((h, i) => (
        <div key={i} className="flex items-center gap-2">
          <input
            type="text"
            className="w-full"
            value={h}
            placeholder={i === 0 ? 'e.g. Think about what typeof returns for a declared-but-unassigned variable.' : `Hint ${i + 1}`}
            aria-label={`Hint ${i + 1}`}
            onChange={(e) => onChange(value.map((x, j) => (j === i ? e.target.value : x)))}
          />
          <RowButtons onRemove={() => onChange(value.filter((_, j) => j !== i))} removeLabel={`Remove hint ${i + 1}`} />
        </div>
      ))}
      {value.length < 6 && (
        <Button variant="ghost" size="sm" type="button" onClick={() => onChange([...value, ''])}>
          <Plus size={13} /> Add hint
        </Button>
      )}
    </div>
  </Field>
);

/* ------------------------------------------------------- local validation */

const KNOWN_PATHS =
  /^(stageId|difficulty|xpReward|title|prompt|language|codeSnippet|explanation|options(\.\d+)?|optionFeedback\.\d+|correctIndex|correctIndices|blanks(\.\d+\.(answer|alternatives|choices|wrongAnswers(\.\d+)?))?|pseudocodeLines(\.\d+)?|starterCode|entryFunction|solutionCode|testCases(\.\d+\.(input|expected))?|examples(\.\d+\.(input|output))?|constraints)$/;

/**
 * The same rules the server applies first (server/custom-challenges.js), so
 * the admin gets them instantly. The server remains the judge. `stageTest`
 * is true when editing a stage's final test, which has to keep its shape;
 * `authoredStageId` is set when editing any built-in question, which has to
 * keep its stage.
 */
function validateLocally(q: QuestionInput, { stageTest = false, authoredStageId }: { stageTest?: boolean; authoredStageId?: string } = {}): QuestionIssue[] {
  const out: QuestionIssue[] = [];
  const need = (cond: boolean, path: string, message: string) => {
    if (!cond) out.push({ path, message });
  };
  const frontend = q.type === 'code_runner' && (q.uiPreview || q.language === 'html');
  const executable = EXECUTABLE.has(q.language);

  // A stage test is answered in the stage's language: a code question where
  // the server can run it, an answer-graded one where it cannot. The `type`
  // path has no field of its own, so it is listed at the top of the form.
  if (stageTest) {
    if (executable) need(q.type === 'code_runner', 'type', "This is the stage's final test, so it has to stay a code question.");
    else need(q.type !== 'code_runner' && q.type !== 'debug', 'type', `This is the stage's final test and ${q.language} cannot be run here, so it has to stay an answer-graded question (not a code question).`);
  }

  need(Boolean(q.stageId), 'stageId', 'Pick the stage this question belongs to.');
  if (authoredStageId) need(q.stageId === authoredStageId, 'stageId', 'A built-in question stays in its stage - hide it here and write a new one in the other stage instead.');
  need(q.title.trim().length >= 3, 'title', 'Give the question a short title (at least 3 characters).');
  need(q.prompt.trim().length >= 10, 'prompt', 'Write the question itself - what the learner has to answer or do (at least 10 characters).');
  need(q.explanation.trim().length >= 10, 'explanation', 'Write the explanation shown after answering - why the right answer is right (at least 10 characters).');
  need(Number.isInteger(q.xpReward) && q.xpReward >= 5 && q.xpReward <= 500, 'xpReward', 'XP must be a whole number between 5 and 500.');

  const options = (q.options ?? []).map((o) => o.trim());
  // Exact matches only, like the server: options differing by case alone are a
  // legitimate question about case sensitivity.
  const checkOptions = () => {
    need(options.length >= 2, 'options', 'Add at least two answer options.');
    options.forEach((o, i) => need(Boolean(o), `options.${i}`, `Option ${letter(i)} is empty - write the option text or remove it.`));
    options.forEach((o, i) => need(!o || options.indexOf(o) === i, `options.${i}`, `Option ${letter(i)} repeats another option.`));
  };
  switch (q.type) {
    case 'quiz':
    case 'output_prediction':
      checkOptions();
      need(q.correctIndex !== undefined && q.correctIndex < options.length, 'correctIndex', 'Choose which option is the correct answer.');
      if (q.type === 'output_prediction') need(Boolean(q.codeSnippet?.trim()), 'codeSnippet', 'Predict-the-output needs the code whose output the learner predicts.');
      break;
    case 'multi_select':
      checkOptions();
      need((q.correctIndices ?? []).length >= 1, 'correctIndices', 'Tick every option that is correct (at least one).');
      break;
    case 'fill_blank': {
      const holes = (q.codeSnippet?.match(/___/g) ?? []).length;
      need(holes >= 1, 'codeSnippet', 'The code has no blanks yet - write ___ (three underscores) where the learner should type.');
      need((q.blanks ?? []).length === holes, 'blanks', `The code has ${holes} blank${holes === 1 ? '' : 's'} (___) but ${(q.blanks ?? []).length} answer${(q.blanks ?? []).length === 1 ? '' : 's'} - give exactly one answer per blank.`);
      (q.blanks ?? []).forEach((b, i) => {
        need(Boolean(b.answer.trim()), `blanks.${i}.answer`, `Blank ${i + 1} needs its correct answer.`);
        if (b.choices.length) {
          const accepted = [b.answer, ...b.alternatives];
          need(b.choices.some((c) => accepted.some((a) => blankMatches(c, a))), `blanks.${i}.choices`, `Blank ${i + 1}: the correct answer must be one of its dropdown choices (spelled the same way), or the blank can never be solved.`);
          need(b.choices.length >= 2, `blanks.${i}.choices`, `Blank ${i + 1}: a dropdown needs at least two choices (leave it empty for a typed answer).`);
        }
      });
      break;
    }
    case 'pseudocode_order':
      need((q.pseudocodeLines ?? []).length >= 3, 'pseudocodeLines', 'Add at least three steps - the learner puts them back in order.');
      (q.pseudocodeLines ?? []).forEach((l, i) => need(Boolean(l.trim()), `pseudocodeLines.${i}`, `Step ${i + 1} is empty - write it or remove it.`));
      break;
    case 'code_runner':
    case 'debug':
      need(frontend || EXECUTABLE.has(q.language), 'language', 'Code questions can only be graded in JavaScript, TypeScript or Python (or HTML for a frontend question) - pick one of those.');
      need(Boolean(q.starterCode?.trim()), 'starterCode', q.type === 'debug' ? 'Paste the broken code the learner has to fix.' : 'Write the starter code the learner begins from.');
      need(Boolean(q.solutionCode?.trim()), 'solutionCode', 'Paste a working solution - the server runs it against the test cases before saving.');
      if (!frontend) {
        need(Boolean(q.entryFunction?.trim()), 'entryFunction', 'Name the function the tests call, exactly as written in the code (e.g. fizzbuzz).');
        need(!q.entryFunction?.trim() || (q.solutionCode ?? '').includes(q.entryFunction.trim()), 'entryFunction', `The solution does not define a function called "${q.entryFunction?.trim()}".`);
      }
      need((q.testCases ?? []).length >= 1, 'testCases', "Add at least one test case - the learner's code is graded by running them.");
      (q.testCases ?? []).forEach((t, i) => {
        need(Boolean(t.input.trim()), `testCases.${i}.input`, frontend ? `Test ${i + 1}: write the JavaScript check to run against the page.` : `Test ${i + 1}: give the argument(s) to call the function with.`);
        need(Boolean(t.expected.trim()), `testCases.${i}.expected`, frontend ? `Test ${i + 1}: the expected result (usually true).` : `Test ${i + 1}: give the expected return value.`);
      });
      // Worked examples ride along on any code question; a stage test must have one.
      const examples = q.examples ?? [];
      need(examples.length <= MAX_EXAMPLES, 'examples', `At most ${MAX_EXAMPLES} worked examples.`);
      need((q.constraints ?? []).length <= MAX_CONSTRAINTS, 'constraints', `At most ${MAX_CONSTRAINTS} constraints.`);
      examples.forEach((ex, i) => {
        need(Boolean(ex.input.trim()), `examples.${i}.input`, `Example ${i + 1} needs the input the learner would be given.`);
        need(Boolean(ex.output.trim()), `examples.${i}.output`, `Example ${i + 1} needs the output a correct solution produces.`);
      });
      if (stageTest && executable) need(examples.length >= 1, 'examples', 'A stage test needs at least one worked example - learners see it instead of hints.');
      break;
  }
  return out;
}
