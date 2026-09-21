/**
 * The admin console's AI question assistant: turn an admin's description
 * into a complete draft, judge whether the bank already covers it, and
 * suggest questions a stage is missing.
 *
 * Everything Gemini answers is treated as untrusted data. The prompts below
 * spell out the app's field conventions exactly, but the answer is still
 * coerced field by field, unknown keys are dropped, arrays are capped, and
 * every stage id is checked against the real stage list - so a bad answer
 * becomes a draft with a problem the wizard will point at, never a crash
 * and never a question that skips validation. The draft is the wizard's
 * own input shape, and saving it goes through the same checks and solution
 * run as a hand-written question (server/admin.js).
 *
 * No I/O except the injected `ai` (see server/ai.js), so the tests in
 * server/__tests__/ai-questions.test.mjs run with a canned client.
 */
import { rankSimilar, textOf } from './ai.js';
import {
  DIFFICULTIES,
  EXECUTABLE_LANGUAGES,
  LANGUAGES,
  MAX_BLANKS,
  MAX_CODE,
  MAX_CONSTRAINTS,
  MAX_EXAMPLES,
  MAX_LINES,
  MAX_OPTIONS,
  MAX_TEST_CASES,
  MAX_TEXT
} from './custom-challenges.js';

/** A request the assistant cannot act on (bad kind, unknown stage) - answered with 400. */
export class AiInputError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.name = 'AiInputError';
    this.status = status;
  }
}

/* --------------------------------------------------------------- kinds */

/** The wizard's kinds (src/modules/admin/components/QuestionWizard.tsx KINDS), in the same order. */
export const KINDS = ['quiz', 'multi_select', 'output_prediction', 'fill_blank', 'pseudocode_order', 'code_runner', 'debug', 'frontend'];

const KIND_TITLE = {
  quiz: 'Multiple choice',
  multi_select: 'Select all that apply',
  output_prediction: 'Predict the output',
  fill_blank: 'Fill in the blanks',
  pseudocode_order: 'Put the steps in order',
  code_runner: 'Write code',
  debug: 'Fix the bug',
  frontend: 'Frontend (HTML / CSS / JS)'
};

const CODE_KINDS = new Set(['code_runner', 'debug', 'frontend']);
const OPTION_KINDS = new Set(['quiz', 'multi_select', 'output_prediction']);

/** What the kind fixes on the draft - the same presets the wizard applies when a kind is picked. */
export function kindToPreset(kind) {
  switch (kind) {
    case 'quiz':
    case 'multi_select':
    case 'output_prediction':
    case 'fill_blank':
    case 'code_runner':
    case 'debug':
      return { type: kind, language: 'javascript' };
    case 'pseudocode_order':
      return { type: 'pseudocode_order', language: 'pseudocode' };
    case 'frontend':
      return { type: 'code_runner', language: 'html', uiPreview: true };
    default:
      throw new AiInputError(`"${String(kind)}" is not a question type - pick one of: ${KINDS.join(', ')}.`);
  }
}

/** The kind of a bank challenge - Frontend is derived, exactly as the wizard's kindOf does it. */
export const kindOf = (c) => (c?.type === 'code_runner' && (c.uiPreview || c.language === 'html') ? 'frontend' : c?.type);

const EMPTY_TEST = { input: '', expected: '', hidden: false, description: '' };

/**
 * The wizard's blank form (QuestionWizard.tsx `blank`), replicated here so
 * an AI draft carries every field the wizard expects and can be dropped
 * straight into it. Keep the two in step.
 */
export function emptyDraft(stageId) {
  return {
    stageId: String(stageId ?? ''),
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

/* ------------------------------------------------------------- coercion */

const str = (v, max = MAX_TEXT) => (typeof v === 'string' ? v : v == null ? '' : typeof v === 'object' ? '' : String(v)).slice(0, max);
const trimmed = (v, max = MAX_TEXT) => str(v, max).trim();
const code = (v) => str(v, MAX_CODE).replace(/\r\n/g, '\n');
const list = (v) => (Array.isArray(v) ? v : []);
const strings = (v, cap, max = MAX_TEXT) => list(v).map((s) => trimmed(s, max)).filter(Boolean).slice(0, cap);
const int = (v) => {
  const n = typeof v === 'string' ? Number(v.trim()) : Number(v);
  return Number.isInteger(n) ? n : null;
};
const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));
const difficultyOf = (v, fallback = 'easy') => (DIFFICULTIES.includes(v) ? v : fallback);
const XP_DEFAULT = { easy: 40, medium: 60, hard: 100 };

const SHORT = 300;
const TITLE_MAX = 120;

/* ---------------------------------------------------------- the prompts */

/**
 * What every prompt starts with: the app, the eight kinds and the exact
 * field conventions the validator and the runners hold a question to. The
 * wording is deliberately concrete - a vague convention here turns into a
 * draft the admin has to repair by hand.
 */
const KIND_CONVENTIONS = `You write practice questions for Devlingo, an app that teaches programming through short interactive lessons. The bank is organised in stages (one topic each, e.g. "Programming Basics" in JavaScript or "Python Fundamentals"); every stage is a list of small questions a learner answers in the browser, and code questions are graded by actually running the learner's code against test cases.

There are exactly eight question kinds. Their fields, and the conventions the app checks before anything is saved:

FIELDS EVERY KIND HAS
- title: 3-8 plain words naming what is practised, e.g. "Reverse a string with a loop". No trailing period.
- prompt: 1-2 plain sentences telling the learner what to answer or do. No code in the prompt - code belongs in codeSnippet or starterCode. For code questions name the function and what it must return.
- explanation: 1-3 sentences saying WHY the right answer is right (shown after the learner answers). Teach the idea; do not merely restate the answer.
- difficulty: "easy", "medium" or "hard".
- xpReward: a whole number - easy 30-40, medium 50-70, hard 80-120.
- hints: 0-3 short nudges that point the way without giving the answer away.
- tags: 0-6 lowercase keywords such as "loops", "arrays", "closures".
- language: the language the question is about. The app can only RUN javascript, typescript and python, so code_runner and debug questions must use one of those; a frontend question is always html. Non-code kinds may also be about java, c, cpp, go, sql, css or bash.
- Set every field that does not apply to the kind to null.

THE EIGHT KINDS
1. quiz (multiple choice): options = 2-8 short, distinct, plausible answer texts with exactly ONE correct; correctIndex = the 0-based position of the correct option. codeSnippet is optional - a short program the question refers to. No correctIndices.
2. multi_select (select all that apply): options = 2-8 texts; correctIndices = the 0-based positions of EVERY correct option (at least one, normally two or more). No correctIndex.
3. output_prediction (predict the output): codeSnippet = a short, complete program (REQUIRED); options = 2-8 possible outputs written exactly as the program would print them; correctIndex = the truly correct one. Trace the program line by line before choosing - a wrong key here teaches the wrong thing.
4. fill_blank (fill in the blanks): codeSnippet = the code with ___ (exactly three underscores) where each hole goes, 1-12 holes; blanks = one object per hole, IN ORDER of appearance, each { answer: the exact text that fills the hole, alternatives: other spellings that are also exactly right (or null), choices: 2-5 dropdown choices that include the answer (or null for a typed answer) }. The number of blanks MUST equal the number of ___ markers. Each hole covers one meaningful token or short expression - a keyword, an operator, a method name - never a whole line.
5. pseudocode_order (put the steps in order): pseudocodeLines = 3-20 steps written in the CORRECT order (the app shuffles them for the learner). Indent lines nested inside a loop or condition with two spaces per level. One step per line, no numbering, no codeSnippet.
6. code_runner (write code): starterCode = the function signature with a TODO comment in the body (// TODO in JavaScript, # TODO in Python); entryFunction = the exact name of that function, which must be defined at top level in BOTH starterCode and solutionCode; solutionCode = a complete, correct implementation that RETURNS its result (never prints it); testCases = 3-8 cases, each { input, expected, hidden }:
   - input is the ARGUMENT LIST exactly as it would be written between the parentheses of a call: 1, 2 for add(1, 2); [3, 1, 2], "x" for a list and a string; "hello" for one string argument. Not the whole call, not wrapped in extra brackets.
   - expected is the RETURN VALUE as a literal in the question's language: numbers 3, strings "hello" in double quotes, arrays [1, 2, 3], objects {"a": 1}, booleans true/false (True/False in Python), null (None in Python).
   - The tests must be deterministic - no randomness, dates, network or console output - and cover an ordinary case, an edge case (empty, zero, one element) and a larger case. Mark at most two of the later cases hidden: true; the rest false.
   Optionally examples = 1-2 worked examples { input, output, explanation } and constraints = short limits like "1 <= n <= 1000".
7. debug (fix the bug): the same fields as code_runner, but starterCode is a COMPLETE implementation with ONE realistic bug (an off-by-one, the wrong operator or comparison, a missing return, a mutated argument) that makes it FAIL at least one of the test cases - the app runs the broken starter and rejects the question if it already passes. solutionCode is the fixed version. The prompt says the code is broken and what it should do, never what the bug is; a hint may point at the area.
8. frontend (HTML / CSS / JS in a live preview): language = html; starterCode and solutionCode are each ONE complete HTML document containing the markup, a <style> block and a <script> block - starterCode has the markup and TODO comments in the script, solutionCode is fully working. Give the elements stable ids (e.g. #counter, #add-btn) and name them in the prompt so the checks can find them. No entryFunction. testCases = 2-6 page checks, each { input, expected, hidden }: input is a JavaScript IIFE of the form (() => { ... })() that runs inside the finished page, inspects the DOM with document.querySelector, .textContent, .classList and .click() to simulate clicks, and returns true when that one requirement is met; expected is always the text true (no quotes). Compare text with .trim() and check that elements exist before reading them.`;

const KIND_MENU = KINDS.map((k, i) => `${i + 1}. ${k} - ${KIND_TITLE[k]}`).join('\n');

/* --------------------------------------------------------------- draft */

const STRING = { type: 'STRING' };
const NSTRING = { type: 'STRING', nullable: true };
const NSTRINGS = { type: 'ARRAY', items: STRING, nullable: true };

const DRAFT_SCHEMA = {
  type: 'OBJECT',
  properties: {
    title: STRING,
    prompt: STRING,
    explanation: STRING,
    difficulty: { type: 'STRING', enum: DIFFICULTIES },
    xpReward: { type: 'INTEGER' },
    language: NSTRING,
    hints: NSTRINGS,
    tags: NSTRINGS,
    codeSnippet: NSTRING,
    options: NSTRINGS,
    correctIndex: { type: 'INTEGER', nullable: true },
    correctIndices: { type: 'ARRAY', items: { type: 'INTEGER' }, nullable: true },
    blanks: {
      type: 'ARRAY',
      nullable: true,
      items: { type: 'OBJECT', properties: { answer: STRING, alternatives: NSTRINGS, choices: NSTRINGS }, required: ['answer'] }
    },
    pseudocodeLines: NSTRINGS,
    starterCode: NSTRING,
    entryFunction: NSTRING,
    solutionCode: NSTRING,
    testCases: {
      type: 'ARRAY',
      nullable: true,
      items: { type: 'OBJECT', properties: { input: STRING, expected: STRING, hidden: { type: 'BOOLEAN', nullable: true } }, required: ['input', 'expected'] }
    },
    examples: {
      type: 'ARRAY',
      nullable: true,
      items: { type: 'OBJECT', properties: { input: STRING, output: STRING, explanation: NSTRING }, required: ['input', 'output'] }
    },
    constraints: NSTRINGS,
    fit: {
      type: 'OBJECT',
      properties: {
        stageId: STRING,
        confidence: { type: 'NUMBER' },
        reason: STRING,
        alternatives: { type: 'ARRAY', items: { type: 'OBJECT', properties: { stageId: STRING, reason: STRING }, required: ['stageId', 'reason'] } }
      },
      required: ['stageId', 'confidence', 'reason', 'alternatives']
    }
  },
  required: ['title', 'prompt', 'explanation', 'difficulty', 'xpReward', 'fit']
};

const stageLine = (s, count) =>
  `- ${s.id} | ${s.index ?? ''} | ${s.name ?? ''} | ${s.language ?? ''} | ${s.description ?? ''}${count == null ? '' : ` | ${count} questions`}`;

const findStage = (stages, id) => (typeof id === 'string' && id ? stages.find((s) => s?.id === id) ?? null : null);

/**
 * One Gemini call: the admin's words in, a complete draft plus the best-fit
 * stage out. The admin's own stage wins for `draft.stageId` when given; the
 * fit is reported either way so the console can show the disagreement.
 */
export async function draftQuestion({ ai, kind, text, stageId, stages, bank }) {
  const preset = kindToPreset(kind);
  const stageList = list(stages).filter((s) => s && typeof s.id === 'string');
  if (!stageList.length) throw new AiInputError('There are no stages to place a question in.');
  const description = trimmed(text, 6000);
  if (description.length < 10) throw new AiInputError('Describe the question in at least 10 characters.');
  const chosen = stageId ? findStage(stageList, String(stageId)) : null;
  if (stageId && !chosen) throw new AiInputError('No such stage.');
  const fallbackStage = chosen ?? stageList[0];

  const counts = new Map();
  for (const c of list(bank)) counts.set(c?.stageId, (counts.get(c?.stageId) ?? 0) + 1);

  const system = `${KIND_CONVENTIONS}

YOUR TASK
An administrator describes a question in their own words and names its kind. Write the complete question of that kind, following the conventions above to the letter, and fill in what they left out (options, code, tests, explanation) so it is correct and self-contained. Keep anything they specified (a correct answer, particular options, a code snippet) unless it is wrong. Then choose the ONE stage the question belongs in - by topic and by language - and report it as fit: { stageId (from the list), confidence 0-1, reason (one sentence), alternatives (up to 2 other plausible stages, each with a one-sentence reason) }. If the administrator already chose a stage, still report the best fit honestly; they see both. Answer with the JSON object only.`;

  const user = `Kind: ${kind} (${KIND_TITLE[kind]})
Administrator's chosen stage: ${chosen ? `${chosen.id} (${chosen.name})` : 'not chosen - pick the best fit'}

Stages (id | number | name | language | description | size):
${stageList.map((s) => stageLine(s, counts.get(s.id) ?? 0)).join('\n')}

The administrator's description of the question:
"""
${description}
"""`;

  const raw = await ai.generateJson({ system, user, schema: DRAFT_SCHEMA, temperature: 0.3 });
  const fit = coerceFit(raw?.fit, stageList, fallbackStage);
  const draft = coerceDraft(raw, { kind, preset, stageId: chosen ? chosen.id : fit.stageId, stage: chosen ?? findStage(stageList, fit.stageId) ?? fallbackStage });
  return { draft, fit };
}

function coerceFit(raw, stages, fallbackStage) {
  const r = raw && typeof raw === 'object' ? raw : {};
  const named = findStage(stages, r.stageId);
  if (!named) {
    return { stageId: fallbackStage.id, confidence: 0, reason: 'Gemini named a stage that does not exist.', alternatives: [] };
  }
  const confidence = Number(r.confidence);
  const seen = new Set([named.id]);
  const alternatives = [];
  for (const alt of list(r.alternatives)) {
    const stage = findStage(stages, alt?.stageId);
    if (!stage || seen.has(stage.id)) continue;
    seen.add(stage.id);
    alternatives.push({ stageId: stage.id, reason: trimmed(alt?.reason, SHORT) });
    if (alternatives.length === 2) break;
  }
  return {
    stageId: named.id,
    confidence: Number.isFinite(confidence) ? clamp(confidence, 0, 1) : 0,
    reason: trimmed(r.reason, SHORT),
    alternatives
  };
}

/** Gemini's answer folded onto the wizard's blank form, field by field, with the kind's presets on top. */
function coerceDraft(raw, { kind, preset, stageId, stage }) {
  const r = raw && typeof raw === 'object' ? raw : {};
  const draft = emptyDraft(stageId);
  const isCode = CODE_KINDS.has(kind);

  draft.type = preset.type;
  draft.uiPreview = Boolean(preset.uiPreview);
  draft.language = languageFor(kind, preset, r.language, stage?.language);

  draft.title = trimmed(r.title, TITLE_MAX);
  draft.prompt = trimmed(r.prompt);
  draft.explanation = trimmed(r.explanation);
  draft.difficulty = difficultyOf(r.difficulty);
  const xp = int(r.xpReward);
  draft.xpReward = xp == null ? XP_DEFAULT[draft.difficulty] : clamp(xp, 5, 500);
  draft.hints = strings(r.hints, 6, SHORT);
  draft.tags = strings(r.tags, 8, 40).map((t) => t.toLowerCase());

  if (OPTION_KINDS.has(kind) || kind === 'fill_blank') draft.codeSnippet = code(r.codeSnippet);

  if (OPTION_KINDS.has(kind)) {
    const options = list(r.options)
      .map((o) => trimmed(o))
      .slice(0, MAX_OPTIONS);
    if (options.length) draft.options = options;
    const inRange = (i) => i != null && i >= 0 && i < draft.options.length;
    if (kind === 'multi_select') {
      draft.correctIndices = [...new Set(list(r.correctIndices).map(int).filter(inRange))].sort((a, b) => a - b);
    } else {
      const correct = int(r.correctIndex);
      draft.correctIndex = inRange(correct) ? correct : undefined;
    }
  }

  if (kind === 'fill_blank') {
    draft.blanks = list(r.blanks)
      .slice(0, MAX_BLANKS)
      .map((b) => ({
        answer: trimmed(b?.answer, SHORT),
        alternatives: strings(b?.alternatives, 8, SHORT),
        choices: strings(b?.choices, 8, SHORT)
      }));
  }

  if (kind === 'pseudocode_order') {
    // Leading spaces are the nesting, so only the tail is trimmed.
    const lines = list(r.pseudocodeLines)
      .map((l) => str(l, SHORT).replace(/\s+$/, ''))
      .filter((l) => l.trim())
      .slice(0, MAX_LINES);
    if (lines.length) draft.pseudocodeLines = lines;
  }

  if (isCode) {
    draft.starterCode = code(r.starterCode);
    draft.solutionCode = code(r.solutionCode);
    draft.entryFunction = kind === 'frontend' ? '' : trimmed(r.entryFunction, 80);
    const tests = list(r.testCases)
      .slice(0, MAX_TEST_CASES)
      .map((t) => ({ input: trimmed(t?.input), expected: trimmed(t?.expected), hidden: t?.hidden === true, description: '' }));
    if (tests.length) draft.testCases = tests;
    draft.examples = list(r.examples)
      .slice(0, MAX_EXAMPLES)
      .map((e) => ({ input: trimmed(e?.input), output: trimmed(e?.output), explanation: trimmed(e?.explanation) }));
    draft.constraints = strings(r.constraints, MAX_CONSTRAINTS, SHORT);
  }

  return draft;
}

/**
 * The kind decides the language family; Gemini's pick is kept only when the
 * app can grade it. A quiz about Python in the Python stage should not come
 * back labelled JavaScript just because the wizard's preset says so.
 */
function languageFor(kind, preset, suggested, stageLanguage) {
  if (kind === 'frontend' || kind === 'pseudocode_order') return preset.language;
  const wanted = trimmed(suggested, 20).toLowerCase();
  if (kind === 'code_runner' || kind === 'debug') {
    if (EXECUTABLE_LANGUAGES.includes(wanted)) return wanted;
    return EXECUTABLE_LANGUAGES.includes(stageLanguage) ? stageLanguage : 'javascript';
  }
  if (LANGUAGES.includes(wanted)) return wanted;
  return LANGUAGES.includes(stageLanguage) ? stageLanguage : preset.language;
}

/* ---------------------------------------------------------- duplicates */

const VERDICTS = ['duplicate', 'similar', 'distinct'];

const DUPLICATES_SCHEMA = {
  type: 'OBJECT',
  properties: {
    items: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: { id: STRING, verdict: { type: 'STRING', enum: VERDICTS }, reason: STRING },
        required: ['id', 'verdict', 'reason']
      }
    }
  },
  required: ['items']
};

const DUPLICATES_SYSTEM = `You review a proposed practice question for Devlingo, an app that teaches programming through short interactive lessons, against existing questions from its bank that share some wording with it. For EACH candidate, decide what the overlap means for a learner:

- "duplicate": it tests the same knowledge, so a learner who solved one gains nothing from the other - even if the wording, the variable names, the option order or the kind of question differ. Two questions that both ask which keyword declares a constant are duplicates; so are two "sum an array" coding tasks in the same language.
- "similar": the same topic from a different angle or at a different level - for example one asks what let does and the other asks what happens when you reassign a const, or the same task in a different language. Worth keeping both, but the author should know.
- "distinct": the shared words are incidental; the questions teach different things.

Judge by what is actually being tested, not by how many words match. Give every candidate a one-sentence reason in plain words. Answer with the JSON object only.`;

const clip = (s, max) => {
  const t = trimmed(s, MAX_CODE).replace(/\s+/g, ' ');
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
};

/** What a question expects, in one line - the part a duplicate check must see. */
function answerSummary(q) {
  const type = q?.type;
  const options = list(q?.options);
  if (type === 'quiz' || type === 'output_prediction') {
    const i = int(q?.correctIndex);
    return `Options: ${options.map(String).join(' / ')}. Correct: ${i != null && options[i] != null ? String(options[i]) : '?'}`;
  }
  if (type === 'multi_select') {
    const correct = list(q?.correctIndices)
      .map(int)
      .filter((i) => i != null && options[i] != null)
      .map((i) => String(options[i]));
    return `Options: ${options.map(String).join(' / ')}. Correct: ${correct.join('; ') || '?'}`;
  }
  if (type === 'fill_blank') return `Blank answers: ${list(q?.blanks).map((b) => String(b?.answer ?? '')).join(', ') || '?'}`;
  if (type === 'pseudocode_order') return `Steps in order: ${list(q?.pseudocodeLines).map((l) => String(l).trim()).join(' / ')}`;
  if (type === 'code_runner' || type === 'debug') {
    const tests = list(q?.testCases);
    if (q?.uiPreview || q?.language === 'html') return `Frontend page with ${tests.length} page check${tests.length === 1 ? '' : 's'}`;
    const first = tests[0];
    const call = q?.entryFunction ? `${q.entryFunction}(${first?.input ?? ''}) -> ${first?.expected ?? ''}` : '';
    return `${tests.length} test${tests.length === 1 ? '' : 's'}${call ? `, e.g. ${call}` : ''}`;
  }
  return '';
}

const snippetOf = (q) => q?.codeSnippet || q?.starterCode || (Array.isArray(q?.pseudocodeLines) ? q.pseudocodeLines.join('\n') : '') || '';

/**
 * Wording overlap first (cheap, deterministic), Gemini second (only when
 * something overlaps), and the push verdict last - computed here from the
 * labels, so "don't push" always means a candidate was labelled duplicate.
 */
export async function findDuplicates({ ai, draft, text, bank, stages }) {
  const d = draft && typeof draft === 'object' ? draft : {};
  const stageList = list(stages);
  const stageName = (id) => findStage(stageList, id)?.name ?? String(id ?? '');
  const ranked = rankSimilar(`${textOf(d)} ${trimmed(text, 6000)}`, list(bank), { limit: 12 });
  if (!ranked.length) {
    return { candidates: [], verdict: { push: 'yes', reason: 'Nothing in the bank overlaps with this question.' } };
  }

  const user = `PROPOSED QUESTION
Title: ${clip(d.title, TITLE_MAX)}
Kind: ${kindOf(d) ?? d.type ?? '?'} | Language: ${d.language ?? '?'}
Prompt: ${clip(d.prompt, 600)}
${snippetOf(d) ? `Code: ${clip(snippetOf(d), SHORT)}\n` : ''}Answer: ${clip(answerSummary(d), 400)}

EXISTING CANDIDATES
${ranked
  .map(({ challenge: c }, i) => {
    const snippet = snippetOf(c);
    return `${i + 1}. id: ${c.id}
   Title: ${clip(c.title, TITLE_MAX)}
   Kind: ${kindOf(c) ?? c.type ?? '?'} | Language: ${c.language ?? '?'} | Stage: ${stageName(c.stageId)}
   Prompt: ${clip(c.prompt, 600)}
${snippet ? `   Code: ${clip(snippet, SHORT)}\n` : ''}   Answer: ${clip(answerSummary(c), 400)}`;
  })
  .join('\n')}

Label every candidate by id.`;

  const raw = await ai.generateJson({ system: DUPLICATES_SYSTEM, user, schema: DUPLICATES_SCHEMA, temperature: 0.2 });
  const byId = new Map();
  for (const item of list(raw?.items)) {
    const id = trimmed(item?.id, 200);
    if (!id || byId.has(id)) continue;
    byId.set(id, { verdict: VERDICTS.includes(item?.verdict) ? item.verdict : 'distinct', reason: trimmed(item?.reason, SHORT) || 'Not flagged.' });
  }

  const candidates = ranked.map(({ challenge: c, score }) => {
    const label = byId.get(c.id) ?? { verdict: 'distinct', reason: 'Not flagged.' };
    return {
      id: c.id,
      title: String(c.title ?? ''),
      stageId: String(c.stageId ?? ''),
      stageName: stageName(c.stageId),
      type: String(c.type ?? ''),
      score: Math.round(score * 1000) / 1000,
      verdict: label.verdict,
      reason: label.reason
    };
  });

  const duplicate = candidates.find((c) => c.verdict === 'duplicate');
  if (duplicate) {
    return { candidates, verdict: { push: 'no', reason: `Already covered by "${duplicate.title}" (${duplicate.stageName}).` } };
  }
  const close = candidates.find((c) => c.verdict === 'similar' && c.score >= 0.35);
  if (close) {
    return { candidates, verdict: { push: 'caution', reason: `Close to "${close.title}" - make sure it teaches something different.` } };
  }
  return { candidates, verdict: { push: 'yes', reason: 'Nothing in the bank covers this - go ahead.' } };
}

/* --------------------------------------------------------- suggestions */

const SUGGEST_SCHEMA = {
  type: 'OBJECT',
  properties: {
    suggestions: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          title: STRING,
          prompt: STRING,
          kind: { type: 'STRING', enum: KINDS },
          difficulty: { type: 'STRING', enum: DIFFICULTIES },
          why: STRING
        },
        required: ['title', 'prompt', 'kind', 'difficulty', 'why']
      }
    }
  },
  required: ['suggestions']
};

const MAX_SUGGESTIONS = 10;
const MAX_OTHER_TITLES = 600;

/**
 * Ideas for a stage, judged against the bank twice: Gemini sees what the
 * stage already has, and the wording check afterwards flags anything it
 * suggested that still overlaps an existing question.
 */
export async function suggestQuestions({ ai, stage, kind, count, bank }) {
  if (!stage || typeof stage !== 'object' || typeof stage.id !== 'string') throw new AiInputError('No such stage.');
  const wantKind = kind == null || kind === '' || kind === 'any' ? null : String(kind);
  if (wantKind && !KINDS.includes(wantKind)) kindToPreset(wantKind); // throws the friendly AiInputError
  const n = int(count) ?? 5;
  const wanted = clamp(n, 1, MAX_SUGGESTIONS);

  const all = list(bank).filter((c) => c && typeof c === 'object');
  const inStage = all.filter((c) => c.stageId === stage.id);
  const counts = {};
  for (const k of KINDS) counts[k] = 0;
  for (const c of inStage) {
    const k = kindOf(c);
    if (k in counts) counts[k] += 1;
  }
  const otherTitles = all.filter((c) => c.stageId !== stage.id).map((c) => String(c.title ?? '')).filter(Boolean).slice(0, MAX_OTHER_TITLES);

  const system = `${KIND_CONVENTIONS}

YOUR TASK
Propose NEW practice questions for one stage of the app. You are given the stage, how many questions of each kind it already has, every question already in it, and the titles of every question elsewhere in the bank. Suggest ideas that fill gaps: sub-topics the stage description promises but no question covers, kinds the stage is short of, and difficulty levels that are missing. Never propose something an existing question already tests, in this stage or any other, even reworded. Each suggestion is { title (3-8 words), prompt (1-2 sentences saying what the learner must do or answer), kind (one of the eight), difficulty, why (one sentence naming the gap it fills) }. Use the stage's language. Answer with the JSON object only.`;

  const user = `Stage: ${stage.id} | ${stage.index ?? ''} | ${stage.name ?? ''} | language: ${stage.language ?? ''}
Description: ${stage.description ?? ''}

Questions wanted: ${wanted}${wantKind ? `, ALL of kind "${wantKind}" (${KIND_TITLE[wantKind]})` : ', of any of the eight kinds - vary them'}

Kinds available:
${KIND_MENU}

The stage already has (${inStage.length} questions): ${KINDS.map((k) => `${k} ${counts[k]}`).join(', ')}
${inStage.length ? inStage.map((c) => `- [${c.id}] ${kindOf(c) ?? c.type} | ${clip(c.title, TITLE_MAX)} | ${clip(c.prompt, 160)}`).join('\n') : '- (nothing yet)'}

Titles of questions in the other stages (do not repeat these either):
${otherTitles.length ? otherTitles.map((t) => `- ${clip(t, TITLE_MAX)}`).join('\n') : '- (none)'}`;

  const raw = await ai.generateJson({ system, user, schema: SUGGEST_SCHEMA, temperature: 0.9 });
  const suggestions = [];
  for (const s of list(raw?.suggestions)) {
    if (!s || typeof s !== 'object') continue;
    const suggestedKind = wantKind ?? (KINDS.includes(s.kind) ? s.kind : null);
    if (!suggestedKind) continue;
    const title = trimmed(s.title, TITLE_MAX);
    const prompt = trimmed(s.prompt, 600);
    if (!title || !prompt) continue;
    const overlaps = rankSimilar(`${title} ${prompt}`, all, { limit: 3, min: 0.2 }).map(({ challenge, score }) => ({
      id: String(challenge.id ?? ''),
      title: String(challenge.title ?? ''),
      score: Math.round(score * 1000) / 1000
    }));
    suggestions.push({
      title,
      prompt,
      kind: suggestedKind,
      difficulty: difficultyOf(s.difficulty, 'medium'),
      why: trimmed(s.why, SHORT),
      novel: overlaps.length === 0 || overlaps[0].score < 0.35,
      overlaps
    });
    if (suggestions.length === wanted) break;
  }
  return { suggestions };
}
