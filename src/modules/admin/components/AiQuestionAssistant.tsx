import React, { useCallback, useEffect, useId, useRef, useState } from 'react';
import { CheckCircle2, Circle, Loader2, Sparkles, XCircle } from 'lucide-react';
import {
  AdminApiError,
  AdminChallengeRow,
  AdminStageRow,
  AiCandidate,
  AiFit,
  AiStatus,
  AiSuggestion,
  AiVerdict,
  QuestionCheck,
  QuestionInput,
  SolutionRun,
  adminApi
} from '../services/adminApi';
import { Badge, Button, ConfirmDialog, Drawer, ErrorText, NumberField, SelectField, Spinner, TextArea } from './ui';
import { KIND_LABEL, KINDS, Kind, KindPicker } from './QuestionWizard';

/**
 * The "AI new question" drawer. The admin picks a type and describes the
 * question in plain words; Gemini (server-side, see server/ai-questions.js)
 * writes it out in full, names the stage it fits best and compares it with
 * every question already in the bank. The result is a verdict - push it,
 * push with care, or don't - and a draft that can be saved as-is or opened
 * in the wizard. Nothing is saved until the admin says so, and a saved
 * draft goes through exactly the checks the wizard's "Save" does.
 */
export interface AiQuestionAssistantProps {
  stages: AdminStageRow[];
  /** The page's current stage (or its first) - the default for both tabs. */
  stageId: string;
  /** Per-stage counts for the type cards; see QuestionWizardProps. */
  countsFor?: (stageId: string) => Partial<Record<Kind, number>> | null;
  onClose: () => void;
  /** Hand the draft to the wizard for edits by hand. */
  onReview: (draft: QuestionInput, kind: Kind) => void;
  onSaved: (row: AdminChallengeRow) => void;
}

/* ------------------------------------------------------------------ pieces */

const MIN_TEXT = 10;
/** The Stage select's "Let Gemini choose" value - the draft route reads a missing stageId the same way. */
const LET_GEMINI_CHOOSE = '';

type Phase = 'input' | 'running' | 'done' | 'failed';
type StepStatus = 'idle' | 'running' | 'done' | 'failed';

interface Step {
  label: string;
  status: StepStatus;
  /** A few words on what the step found, shown once it is done. */
  note?: string;
  error?: string;
}

const STEP_LABELS = ['Drafting the question', 'Finding the best-fit stage', 'Checking whether it already exists', 'Checking the content rules'];
const freshSteps = (): Step[] => STEP_LABELS.map((label) => ({ label, status: 'idle' }));

/** What one analysis produces. Filled in step by step, so a retry can pick up where it stopped. */
interface Analysis {
  draft: QuestionInput;
  fit: AiFit;
  candidates: AiCandidate[];
  verdict: AiVerdict;
  check: QuestionCheck;
}

interface WriteInput {
  kind: Kind;
  text: string;
  /** '' lets Gemini choose. */
  stageId: string;
}

const isKind = (v: string): v is Kind => KINDS.some((k) => k.kind === v);

const stageLabel = (stages: AdminStageRow[], stageId: string) => {
  const s = stages.find((st) => st.id === stageId);
  return s ? `${s.index} · ${s.name}` : stageId;
};

const pct = (x: number) => `${Math.round(x * 100)}%`;
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;
const messageOf = (err: unknown) => (err instanceof Error && err.message) || 'Something went wrong.';

const TEXT_PLACEHOLDER: Record<Kind, string> = {
  quiz: 'e.g. Ask which keyword declares a constant in JavaScript. Options: var, let, const, static. Correct: const. Explain that const bindings cannot be reassigned.',
  multi_select:
    'e.g. Ask which of these values are falsy in JavaScript: 0, "", null, "0", []. Correct: 0, "" and null. Explain that a non-empty string and an empty array are truthy.',
  output_prediction:
    'e.g. Show a for loop with var i that logs i inside a setTimeout, and ask what it prints. Options: 0 1 2, 3 3 3, undefined. Correct: 3 3 3. Explain that var is function-scoped.',
  fill_blank: 'e.g. A for loop that runs exactly ten times, with two blanks: the comparison operator and the increment. Answers: < and i++.',
  pseudocode_order:
    'e.g. The steps to find the largest number in a list: set max to the first item, loop over the rest, replace max when an item is bigger, return max.',
  code_runner:
    'e.g. Write a function isPalindrome(s) that returns true when s reads the same backwards, ignoring case. Tests: "Racecar" gives true, "hello" gives false, "" gives true.',
  debug: 'e.g. A sum(numbers) function that returns the wrong total because its loop starts at index 1. The learner has to fix the loop so every number is added.',
  frontend:
    'e.g. Build a card with a heading (id "title") that reads "Hello" and a button (id "cta") that turns green when clicked. Check that both exist and that the click changes the colour.'
};

const DIFFICULTY_TONE: Record<string, 'default' | 'success' | 'warning' | 'danger'> = { easy: 'success', medium: 'warning', hard: 'danger' };
const CANDIDATE_TONE: Record<AiCandidate['verdict'], 'default' | 'warning' | 'danger'> = { duplicate: 'danger', similar: 'warning', distinct: 'default' };
const CANDIDATE_LABEL: Record<AiCandidate['verdict'], string> = { duplicate: 'Duplicate', similar: 'Similar', distinct: 'Distinct' };
const VERDICT_TONE: Record<AiVerdict['push'], string> = { yes: 'notice-success', caution: 'notice-warn', no: 'notice-error' };
const VERDICT_HEAD: Record<AiVerdict['push'], string> = { yes: 'Push it', caution: 'Push with care', no: "Don't push" };

/* --------------------------------------------------------------- drawer */

export const AiQuestionAssistant: React.FC<AiQuestionAssistantProps> = ({ stages, stageId, countsFor, onClose, onReview, onSaved }) => {
  const [status, setStatus] = useState<AiStatus | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [tab, setTab] = useState<'write' | 'suggest'>('write');
  const ids = useId();

  // Write tab.
  const [kind, setKind] = useState<Kind | null>(null);
  // The type in force before "Change type", so the picker can highlight it.
  const [lastKind, setLastKind] = useState<Kind | null>(null);
  const [stageChoice, setStageChoice] = useState(stageId);
  const [text, setText] = useState('');
  const [phase, setPhase] = useState<Phase>('input');
  const [steps, setSteps] = useState<Step[]>(freshSteps);
  const [result, setResult] = useState<Partial<Analysis>>({});
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [confirmClose, setConfirmClose] = useState(false);

  // Suggest tab.
  const [suggestStage, setSuggestStage] = useState(stageId);
  const [suggestKind, setSuggestKind] = useState<Kind | ''>('');
  const [suggestCount, setSuggestCount] = useState(5);
  // The ideas travel with the stage they were written for: the select may
  // have moved on by the time "Write this one" is pressed.
  const [suggestions, setSuggestions] = useState<{ stageId: string; items: AiSuggestion[] } | null>(null);
  const [suggesting, setSuggesting] = useState(false);
  const [suggestError, setSuggestError] = useState<string | null>(null);

  // A failed setup check (API blip, expired token) gets a "Try again" instead
  // of a dead drawer, so the load is a function, not a one-shot effect body.
  const statusRun = useRef(0);
  const loadStatus = useCallback(() => {
    const id = ++statusRun.current;
    setStatus(null);
    setStatusError(null);
    adminApi
      .aiStatus()
      .then((s) => statusRun.current === id && setStatus(s))
      .catch((err) => statusRun.current === id && setStatusError(messageOf(err)));
  }, []);
  useEffect(() => {
    loadStatus();
    return () => {
      statusRun.current += 1;
    };
  }, [loadStatus]);

  const enabled = Boolean(status?.configured);
  const busy = phase === 'running' || saving || suggesting;
  // Only a save in flight locks the drawer. An analysis can take minutes
  // (two Gemini calls plus running the solution), so the admin must be able
  // to cancel it or leave; a superseded run's late answers are dropped by runId.
  const locked = saving;

  // A run that was superseded (Start over, a new suggestion) must not write its late answers over the new one.
  const runId = useRef(0);
  // The words the current results came from, so "Try again" re-uses them.
  const lastInput = useRef<WriteInput | null>(null);

  const analyze = useCallback(
    async (input: WriteInput, prior: Partial<Analysis> = {}) => {
      const id = ++runId.current;
      const live = () => runId.current === id;
      lastInput.current = input;
      const acc: Partial<Analysis> = { ...prior };
      setPhase('running');
      setSaveError(null);
      setResult(acc);
      setSteps(freshSteps());
      const mark = (i: number, patch: Partial<Step>) => {
        if (live()) setSteps((prev) => prev.map((s, j) => (j === i ? { ...s, ...patch } : s)));
      };
      const fail = (i: number, err: unknown) => {
        mark(i, { status: 'failed', error: messageOf(err) });
        if (live()) setPhase('failed');
      };

      // Steps 1 and 2 are one call: the draft comes back with its best-fit stage.
      if (!acc.draft || !acc.fit) {
        mark(0, { status: 'running' });
        try {
          const res = await adminApi.aiDraft({ kind: input.kind, text: input.text, stageId: input.stageId || undefined });
          if (!live()) return;
          acc.draft = res.draft;
          acc.fit = res.fit;
        } catch (err) {
          return fail(0, err);
        }
      }
      mark(0, { status: 'done', note: `"${acc.draft.title}"` });
      mark(1, { status: 'done', note: `${stageLabel(stages, acc.fit.stageId)} · ${pct(acc.fit.confidence)} sure` });
      setResult({ ...acc });

      if (!acc.candidates || !acc.verdict) {
        mark(2, { status: 'running' });
        try {
          const res = await adminApi.aiDuplicates({ draft: acc.draft, text: input.text });
          if (!live()) return;
          acc.candidates = res.candidates;
          acc.verdict = res.verdict;
        } catch (err) {
          return fail(2, err);
        }
      }
      const flagged = acc.candidates.filter((c) => c.verdict !== 'distinct').length;
      mark(2, { status: 'done', note: acc.candidates.length === 0 ? 'nothing overlaps' : flagged === 0 ? `${plural(acc.candidates.length, 'near match')}, none a real overlap` : `${plural(flagged, 'overlapping question')}` });
      setResult({ ...acc });

      // The same check as the wizard's "Check question" - for code it runs the solution.
      if (!acc.check) {
        mark(3, { status: 'running' });
        try {
          const check = await adminApi.validateQuestion(acc.draft);
          if (!live()) return;
          acc.check = check;
        } catch (err) {
          return fail(3, err);
        }
      }
      mark(3, { status: 'done', note: acc.check.ok ? 'no problems' : plural(acc.check.issues.length, 'problem') });
      setResult({ ...acc });
      setPhase('done');
    },
    [stages]
  );

  const startAnalysis = () => {
    if (!kind || text.trim().length < MIN_TEXT) return;
    void analyze({ kind, text: text.trim(), stageId: stageChoice });
  };

  const retry = () => {
    if (lastInput.current) void analyze(lastInput.current, result);
  };

  // Back to the words - the admin usually wants to rephrase, not retype.
  const startOver = () => {
    runId.current += 1;
    setPhase('input');
    setSteps(freshSteps());
    setResult({});
    setSaveError(null);
  };

  const useSuggestedStage = () => {
    setResult((prev) => (prev.draft && prev.fit ? { ...prev, draft: { ...prev.draft, stageId: prev.fit.stageId } } : prev));
  };

  const save = async () => {
    if (!result.draft || !kind) return;
    setSaving(true);
    setSaveError(null);
    try {
      const res = await adminApi.createQuestion(result.draft);
      onSaved(res.challenge);
    } catch (err) {
      // The server found field problems: the wizard shows them next to the fields.
      if (err instanceof AdminApiError && err.status === 422) onReview(result.draft, kind);
      else setSaveError(messageOf(err));
    } finally {
      setSaving(false);
    }
  };

  const suggest = async () => {
    const forStage = suggestStage;
    // Clamped here, not on every keystroke - clearing the field to type a
    // new number must not snap it to 1 mid-edit.
    const count = Math.max(1, Math.min(10, Math.round(suggestCount) || 5));
    setSuggesting(true);
    setSuggestError(null);
    try {
      const res = await adminApi.aiSuggest({ stageId: forStage, kind: suggestKind || undefined, count });
      setSuggestions({ stageId: forStage, items: res.suggestions });
    } catch (err) {
      setSuggestError(messageOf(err));
    } finally {
      setSuggesting(false);
    }
  };

  // Ideas are for one stage; changing the filters drops them rather than
  // showing stage A's list under a select that now says B.
  const changeSuggestFilter = (patch: { stageId?: string; kind?: Kind | '' }) => {
    if (patch.stageId !== undefined) setSuggestStage(patch.stageId);
    if (patch.kind !== undefined) setSuggestKind(patch.kind);
    setSuggestions(null);
    setSuggestError(null);
  };

  const writeSuggestion = (s: AiSuggestion) => {
    if (!isKind(s.kind) || !suggestions) return;
    const forStage = suggestions.stageId;
    const words = `${s.prompt.trim()} Difficulty: ${s.difficulty}.`;
    setKind(s.kind);
    setLastKind(null);
    setStageChoice(forStage);
    setText(words);
    setTab('write');
    void analyze({ kind: s.kind, text: words, stageId: forStage });
  };

  const dirty = text.trim().length > 0 || Boolean(result.draft) || Boolean(suggestions?.items.length);
  const requestClose = useCallback(() => {
    if (dirty) setConfirmClose(true);
    else onClose();
  }, [dirty, onClose]);

  const complete = result.draft && result.fit && result.candidates && result.verdict && result.check ? (result as Analysis) : null;
  const canSave = Boolean(complete && complete.check.ok && complete.verdict.push !== 'no');
  const meta = KINDS.find((k) => k.kind === kind);

  const footer =
    tab === 'suggest' ? (
      <>
        <Button variant="secondary" onClick={requestClose} disabled={locked}>
          Close
        </Button>
        <Button variant="primary" onClick={suggest} disabled={!enabled || busy || !suggestStage}>
          <Sparkles size={14} /> {suggesting ? 'Asking Gemini…' : 'Suggest new questions'}
        </Button>
      </>
    ) : phase === 'input' ? (
      <>
        {kind && (
          <Button
            variant="ghost"
            onClick={() => {
              setLastKind(kind);
              setKind(null);
            }}
            disabled={busy}
          >
            Change type
          </Button>
        )}
        <Button variant="secondary" onClick={requestClose} disabled={locked}>
          Cancel
        </Button>
        {kind && (
          <Button
            variant="primary"
            onClick={startAnalysis}
            disabled={!enabled || busy || text.trim().length < MIN_TEXT}
            title={text.trim().length < MIN_TEXT ? `Write at least ${MIN_TEXT} characters first` : undefined}
          >
            <Sparkles size={14} /> Analyze with Gemini
          </Button>
        )}
      </>
    ) : (
      <>
        <Button variant="ghost" onClick={startOver} disabled={locked}>
          {phase === 'running' ? 'Cancel analysis' : 'Start over'}
        </Button>
        {result.draft && kind && (
          <Button variant="secondary" onClick={() => onReview(result.draft!, kind)} disabled={locked}>
            Review in wizard
          </Button>
        )}
        {phase === 'failed' && (
          <Button variant="primary" onClick={retry} disabled={busy}>
            Try again
          </Button>
        )}
        {phase === 'running' && (
          <Button variant="primary" disabled>
            Analyzing…
          </Button>
        )}
        {phase === 'done' && complete && complete.verdict.push === 'no' && (
          <span className="self-center max-w-xs text-right text-xs text-fg-secondary" role="note">
            Saving is blocked because it duplicates an existing question - review it in the wizard if you still want it.
          </span>
        )}
        {phase === 'done' && complete && complete.verdict.push !== 'no' && (
          <Button variant="primary" onClick={save} disabled={busy || !canSave} title={!complete.check.ok ? 'Fix the problems in the wizard first' : undefined}>
            {saving ? 'Saving…' : 'Save now'}
          </Button>
        )}
      </>
    );

  return (
    <>
      <Drawer open size="lg" title="AI question assistant · Gemini" onClose={requestClose} closable={!locked} footer={footer}>
        {status === null && !statusError ? (
          <Spinner label="Checking the Gemini setup…" />
        ) : (
          <div>
            {statusError && (
              <div className="notice notice-error mb-4 flex items-center justify-between gap-3" role="alert">
                <span>Could not check the Gemini setup: {statusError}</span>
                <Button variant="secondary" size="sm" type="button" onClick={loadStatus}>
                  Try again
                </Button>
              </div>
            )}
            {status && !status.configured && (
              <div className="notice notice-warn mb-4" role="note">
                <strong>Gemini is not set up yet.</strong> Add <code>GEMINI_API_KEY=...</code> (a key from Google AI Studio) to the <code>.env</code> file
                at the project root and restart the API (<code>npm run dev</code>). The key stays on the server - it is never sent to the browser.
                Until then the assistant is switched off; the "New question" wizard works as usual.
              </div>
            )}

            <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
              <div className="segmented" role="tablist" aria-label="What the assistant does">
                {(
                  [
                    ['write', 'Write a question'],
                    ['suggest', 'Suggest new questions']
                  ] as const
                ).map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    role="tab"
                    id={`${ids}-tab-${value}`}
                    aria-selected={tab === value}
                    aria-controls={`${ids}-panel-${value}`}
                    className={`segmented-option ${tab === value ? 'is-active' : ''}`.trim()}
                    onClick={() => setTab(value)}
                  >
                    {label}
                  </button>
                ))}
              </div>
              {status?.configured && <span className="text-xs text-fg-muted font-mono">Model: {status.model}</span>}
            </div>

            {/* A disabled fieldset switches off every control inside it when Gemini is missing. */}
            <fieldset disabled={!enabled} className={`min-w-0 ${enabled ? '' : 'opacity-60'}`.trim()}>
              <div role="tabpanel" id={`${ids}-panel-${tab}`} aria-labelledby={`${ids}-tab-${tab}`}>
                {tab === 'write' ? (
                  phase === 'input' ? (
                    !kind || !meta ? (
                      <KindPicker onPick={(m) => setKind(m.kind)} counts={countsFor?.(stageChoice || stageId) ?? null} stage={stageLabel(stages, stageChoice || stageId)} current={lastKind} />
                    ) : (
                      <div>
                        <p className="text-sm text-fg-secondary mb-4">
                          <span className="font-medium text-fg">{meta.title}.</span> {meta.blurb}
                        </p>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <SelectField
                            label="Stage"
                            value={stageChoice}
                            onChange={setStageChoice}
                            options={[{ value: LET_GEMINI_CHOOSE, label: 'Let Gemini choose' }, ...stages.map((s) => ({ value: s.id, label: stageLabel(stages, s.id) }))]}
                            hint="Where the question goes. Gemini names the stage it fits best either way - pick one here to keep it there, or let Gemini choose."
                          />
                        </div>
                        <TextArea
                          label="The question, in your own words"
                          required
                          value={text}
                          onChange={setText}
                          rows={6}
                          placeholder={TEXT_PLACEHOLDER[kind]}
                          hint="Say what it should test, the right answer, and anything you already have in mind (options, code, tests). Gemini writes the full question; you review it before anything is saved."
                        />
                      </div>
                    )
                  ) : (
                    <div>
                      {kind && (
                        <p className="text-xs text-fg-muted mb-3">
                          {KIND_LABEL[kind]} · {result.draft ? stageLabel(stages, result.draft.stageId) : stageChoice ? stageLabel(stages, stageChoice) : 'stage chosen by Gemini'} ·{text.length > 140 ? `${text.slice(0, 140).trim()}…` : text}
                        </p>
                      )}
                      <StepList steps={steps} />
                      {saveError && <ErrorText>{saveError}</ErrorText>}
                      {phase === 'failed' && result.draft && (
                        <p className="text-sm text-fg-secondary mb-4">
                          The draft itself is ready - open it in the wizard to keep working on it, or try the check again.
                        </p>
                      )}
                      {phase === 'done' && complete && kind && <Results a={complete} kind={kind} stages={stages} onUseSuggestedStage={useSuggestedStage} />}
                    </div>
                  )
                ) : (
                  <div>
                    <p className="text-sm text-fg-secondary mb-4">
                      Gemini looks at what a stage already has and proposes questions that would be new. Each idea is compared with the bank, so you can see
                      which ones would only repeat something.
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <SelectField
                        label="Stage"
                        required
                        value={suggestStage}
                        onChange={(v) => changeSuggestFilter({ stageId: v })}
                        options={stages.map((s) => ({ value: s.id, label: stageLabel(stages, s.id) }))}
                        hint="The stage the ideas are for."
                      />
                      <SelectField
                        label="Type"
                        value={suggestKind}
                        onChange={(v) => changeSuggestFilter({ kind: isKind(v) ? v : '' })}
                        options={[{ value: '', label: 'Any type' }, ...KINDS.map((k) => ({ value: k.kind, label: k.title }))]}
                        hint="Leave on Any type and Gemini mixes them."
                      />
                      <NumberField
                        label="How many"
                        value={suggestCount}
                        onChange={setSuggestCount}
                        min={1}
                        max={10}
                        hint="Between 1 and 10."
                      />
                    </div>
                    {suggestError && <ErrorText>{suggestError}</ErrorText>}
                    {/* A live region: the wait and the arrival of the ideas are announced, not just drawn. */}
                    <div role="status" aria-live="polite">
                      {suggesting ? (
                        <Spinner label="Asking Gemini for ideas…" />
                      ) : suggestions === null ? null : suggestions.items.length === 0 ? (
                        <p className="text-sm text-fg-muted">Gemini had no new ideas for this stage - try another type or stage.</p>
                      ) : (
                        <>
                          <p className="text-xs text-fg-muted mb-2">
                            {plural(suggestions.items.length, 'idea')} for {stageLabel(stages, suggestions.stageId)} ·{' '}
                            {suggestions.items.filter((s) => s.novel).length} new, {suggestions.items.filter((s) => !s.novel).length} overlapping something
                            already there.
                          </p>
                          <ul className="flex flex-col gap-3" aria-label="Suggested questions">
                            {suggestions.items.map((s, i) => (
                              <SuggestionCard key={`${i}:${s.title}`} s={s} onWrite={() => writeSuggestion(s)} disabled={busy} />
                            ))}
                          </ul>
                        </>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </fieldset>
          </div>
        )}
      </Drawer>
      <ConfirmDialog
        open={confirmClose}
        title="Close the assistant?"
        message="Nothing has been saved - the draft and any suggestions here will be lost."
        confirmLabel="Close"
        onCancel={() => setConfirmClose(false)}
        onConfirm={() => {
          setConfirmClose(false);
          onClose();
        }}
      />
    </>
  );
};

/* ---------------------------------------------------------------- steps */

const StepList: React.FC<{ steps: Step[] }> = ({ steps }) => (
  <ol className="flex flex-col gap-2 mb-5" aria-live="polite" aria-label="Analysis progress">
    {steps.map((s) => (
      <li key={s.label} className="flex items-start gap-2 text-sm">
        <span className={`mt-0.5 shrink-0 ${s.status === 'done' ? 'text-success' : s.status === 'failed' ? 'text-error' : s.status === 'running' ? 'text-accent' : 'text-fg-disabled'}`} aria-hidden="true">
          {s.status === 'done' ? <CheckCircle2 size={15} /> : s.status === 'failed' ? <XCircle size={15} /> : s.status === 'running' ? <Loader2 size={15} className="animate-spin" /> : <Circle size={15} />}
        </span>
        <span className="min-w-0">
          <span className={s.status === 'idle' ? 'text-fg-muted' : 'text-fg'}>
            {s.label}
            {s.status === 'running' && '…'}
          </span>
          {s.note && <span className="text-fg-muted"> - {s.note}</span>}
          {s.error && (
            <span className="block text-error" role="alert">
              {s.error}
            </span>
          )}
        </span>
      </li>
    ))}
  </ol>
);

/* -------------------------------------------------------------- results */

const Panel: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <section className="panel panel-body mb-4">
    <h3 className="eyebrow">{title}</h3>
    {children}
  </section>
);

const Results: React.FC<{ a: Analysis; kind: Kind; stages: AdminStageRow[]; onUseSuggestedStage: () => void }> = ({ a, kind, stages, onUseSuggestedStage }) => {
  const { draft, fit, candidates, verdict, check } = a;
  const problems = check.issues.length;
  return (
    <div>
      <div className={`notice ${VERDICT_TONE[verdict.push]} mb-4`} role="status">
        <strong>{VERDICT_HEAD[verdict.push]}</strong> - {verdict.reason}
        {!check.ok && <span className="block mt-1">The draft still has {plural(problems, 'problem')} - open it in the wizard to fix them.</span>}
      </div>

      <Panel title="Best-fit stage">
        <p className="text-sm text-fg">
          <strong>{stageLabel(stages, fit.stageId)}</strong> <span className="text-fg-muted">· {pct(fit.confidence)} sure</span>
        </p>
        <p className="text-sm text-fg-secondary mt-1">{fit.reason}</p>
        {draft.stageId !== fit.stageId && (
          <div className="notice notice-info mt-3 flex flex-wrap items-center justify-between gap-3">
            <span>
              You chose {stageLabel(stages, draft.stageId)}; Gemini suggests {stageLabel(stages, fit.stageId)}.
            </span>
            <Button variant="secondary" size="sm" onClick={onUseSuggestedStage}>
              Use suggested stage
            </Button>
          </div>
        )}
        {fit.alternatives.length > 0 && (
          <p className="text-xs text-fg-muted mt-2">
            Also possible: {fit.alternatives.map((alt) => `${stageLabel(stages, alt.stageId)} (${alt.reason})`).join(' · ')}
          </p>
        )}
      </Panel>

      <Panel title="Already in the bank?">
        {candidates.length === 0 ? (
          <p className="text-sm text-fg-muted">No overlapping questions found.</p>
        ) : (
          <div className="row-list">
            {candidates.map((c) => (
              <div key={c.id} className="row items-start">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone={CANDIDATE_TONE[c.verdict]}>{CANDIDATE_LABEL[c.verdict]}</Badge>
                    <span className="text-sm font-medium text-fg">{c.title}</span>
                    <span className="text-xs text-fg-muted">{c.stageName}</span>
                  </div>
                  <p className="text-xs text-fg-secondary mt-1">{c.reason}</p>
                </div>
                <span className="text-xs font-mono text-fg-muted whitespace-nowrap">{pct(c.score)} overlap</span>
              </div>
            ))}
          </div>
        )}
      </Panel>

      <Panel title="The draft">
        <dl className="grid grid-cols-1 sm:grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
          <dt className="text-fg-muted">Saves into</dt>
          <dd className="text-fg-secondary">{stageLabel(stages, draft.stageId)}</dd>
          <dt className="text-fg-muted">Title</dt>
          <dd className="text-fg font-medium">{draft.title}</dd>
          <dt className="text-fg-muted">Prompt</dt>
          <dd className="text-fg-secondary">{draft.prompt}</dd>
          <dt className="text-fg-muted">Type</dt>
          <dd className="text-fg-secondary">
            {KIND_LABEL[kind]}
            {kind !== 'frontend' && kind !== 'pseudocode_order' && ` · ${draft.language}`}
          </dd>
          <dt className="text-fg-muted">Difficulty</dt>
          <dd className="flex items-center gap-2">
            <Badge tone={DIFFICULTY_TONE[draft.difficulty]}>{draft.difficulty}</Badge>
            <span className="text-fg-secondary">{draft.xpReward} XP</span>
          </dd>
        </dl>
        <DraftSummary draft={draft} kind={kind} />
      </Panel>

      <ContentCheck check={check} kind={kind} />
    </div>
  );
};

/** What the learner would answer, per kind, in one glance. */
const DraftSummary: React.FC<{ draft: QuestionInput; kind: Kind }> = ({ draft, kind }) => {
  switch (kind) {
    case 'quiz':
    case 'multi_select':
    case 'output_prediction': {
      const correct = new Set(kind === 'multi_select' ? draft.correctIndices ?? [] : draft.correctIndex === undefined ? [] : [draft.correctIndex]);
      return (
        <>
          {draft.codeSnippet?.trim() && <Code>{draft.codeSnippet}</Code>}
          <ol className="mt-3 flex flex-col gap-1.5" aria-label="Answer options">
            {(draft.options ?? []).map((o, i) => (
              <li key={i} className={`option-row ${correct.has(i) ? 'is-correct' : ''}`.trim()}>
                <span className="wizard-letter">{String.fromCharCode(65 + i)}</span>
                <span className="text-sm py-1 min-w-0 break-words">{o}</span>
                {correct.has(i) && <Badge tone="success">Correct</Badge>}
              </li>
            ))}
          </ol>
        </>
      );
    }
    case 'fill_blank': {
      const blanks = draft.blanks ?? [];
      return (
        <>
          {draft.codeSnippet?.trim() && <Code>{draft.codeSnippet}</Code>}
          <p className="text-sm text-fg-secondary mt-3">
            {plural(blanks.length, 'blank')}
            {blanks.length > 0 && (
              <>
                {' '}
                - answers:{' '}
                {blanks.map((b, i) => (
                  <React.Fragment key={i}>
                    {i > 0 && ', '}
                    <code className="font-mono text-xs text-fg">{b.answer}</code>
                  </React.Fragment>
                ))}
              </>
            )}
          </p>
        </>
      );
    }
    case 'pseudocode_order': {
      const lines = draft.pseudocodeLines ?? [];
      return (
        <>
          <p className="text-sm text-fg-secondary mt-3">{plural(lines.length, 'step')}, in the correct order:</p>
          <ol className="mt-2 flex flex-col gap-1 font-mono text-xs text-fg list-decimal pl-6 whitespace-pre">
            {lines.map((l, i) => (
              <li key={i}>{l}</li>
            ))}
          </ol>
        </>
      );
    }
    case 'code_runner':
    case 'debug': {
      const tests = draft.testCases ?? [];
      return (
        <>
          <p className="text-sm text-fg-secondary mt-3">
            {plural(tests.length, 'test')} - the tests call <code className="font-mono text-xs text-fg">{draft.entryFunction || '?'}()</code>.
            {kind === 'debug' && ' The starter code has the bug to find.'}
          </p>
          <details className="mt-2">
            <summary className="text-xs text-fg-muted cursor-pointer">Show the code and tests</summary>
            <p className="text-xs text-fg-muted mt-2">{kind === 'debug' ? 'Broken code' : 'Starter code'}</p>
            <Code>{draft.starterCode ?? ''}</Code>
            <p className="text-xs text-fg-muted mt-2">Working solution</p>
            <Code>{draft.solutionCode ?? ''}</Code>
            <p className="text-xs text-fg-muted mt-2">Tests</p>
            <ul className="mt-1 flex flex-col gap-1 font-mono text-xs text-fg-secondary">
              {tests.map((t, i) => (
                <li key={i}>
                  {draft.entryFunction || 'f'}({t.input}) → {t.expected}
                  {t.hidden && <span className="text-fg-muted"> · hidden</span>}
                </li>
              ))}
            </ul>
          </details>
        </>
      );
    }
    case 'frontend': {
      const tests = draft.testCases ?? [];
      return (
        <>
          <p className="text-sm text-fg-secondary mt-3">HTML page + {plural(tests.length, 'page check')}.</p>
          <details className="mt-2">
            <summary className="text-xs text-fg-muted cursor-pointer">Show the page and checks</summary>
            <p className="text-xs text-fg-muted mt-2">Starter page</p>
            <Code>{draft.starterCode ?? ''}</Code>
            <p className="text-xs text-fg-muted mt-2">Checks run in the page</p>
            {tests.map((t, i) => (
              <Code key={i}>{t.input}</Code>
            ))}
          </details>
        </>
      );
    }
  }
};

const Code: React.FC<{ children: string }> = ({ children }) => (
  <pre className="mt-2 p-3 rounded-md border border-border bg-surface-2 font-mono text-xs text-fg whitespace-pre-wrap break-words max-h-56 overflow-auto">{children}</pre>
);

/** "Passes the content rules" or the first problems, plus the solution run for code. */
const ContentCheck: React.FC<{ check: QuestionCheck; kind: Kind }> = ({ check, kind }) => {
  const run = (label: string, r: SolutionRun | null, wantPass: boolean) => {
    if (!r) return null;
    const good = r.status === 'skipped' ? null : (r.status === 'passed') === wantPass;
    return (
      <span className={`block text-xs ${good === null ? 'text-fg-muted' : good ? 'text-success' : 'text-error'}`}>
        {label}: {r.status}
        {r.reason ? ` - ${r.reason}` : ''}
      </span>
    );
  };
  return (
    <div className="flex items-start gap-2 text-sm mb-2">
      <span className={`mt-0.5 shrink-0 ${check.ok ? 'text-success' : 'text-error'}`} aria-hidden="true">
        {check.ok ? <CheckCircle2 size={15} /> : <XCircle size={15} />}
      </span>
      <div className="min-w-0">
        <span className="text-fg">
          {check.ok ? 'Passes the content rules.' : `${plural(check.issues.length, 'problem')}: ${check.issues.slice(0, 3).map((i) => i.message).join(' · ')}`}
        </span>
        {check.verification && (
          <>
            {run('Solution run', check.verification.solution, true)}
            {kind === 'debug' && run('Broken starter run (must fail)', check.verification.starter, false)}
          </>
        )}
      </div>
    </div>
  );
};

/* ----------------------------------------------------------- suggestions */

const SuggestionCard: React.FC<{ s: AiSuggestion; onWrite: () => void; disabled: boolean }> = ({ s, onWrite, disabled }) => {
  const top = s.overlaps[0];
  const kindLabel = isKind(s.kind) ? KIND_LABEL[s.kind] : s.kind;
  return (
    <li className="panel panel-body">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-semibold text-fg">{s.title}</span>
            <Badge>{kindLabel}</Badge>
            <Badge tone={DIFFICULTY_TONE[s.difficulty] ?? 'default'}>{s.difficulty}</Badge>
            {s.novel || !top ? <Badge tone="success">New</Badge> : <Badge tone="warning">{`Overlaps "${top.title}" (${pct(top.score)})`}</Badge>}
          </div>
          <p className="text-sm text-fg-secondary mt-1">{s.prompt}</p>
          <p className="text-xs text-fg-muted mt-1">{s.why}</p>
        </div>
        <Button variant="secondary" size="sm" onClick={onWrite} disabled={disabled || !isKind(s.kind)} aria-label={`Write "${s.title}"`}>
          <Sparkles size={13} /> Write this one
        </Button>
      </div>
    </li>
  );
};
