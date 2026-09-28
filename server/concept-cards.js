/**
 * Teaching cards ("concepts") an administrator writes or edits, and where
 * they are served.
 *
 * A concept is the short guided lesson Learn mode shows before a question
 * (src/types `Concept`). Eight ship in the authored content. Every card an
 * administrator touches is one record in server/db.js `conceptCards`:
 *
 *   { key, concept?, anchor, hidden?, revision?, createdAt, updatedAt }
 *
 * Two kinds, told apart by the key:
 *   - an EDITED built-in concept: the key is the authored concept's id, the
 *     anchor is fixed to the lesson that carries it. `concept` replaces the
 *     authored one (absent: the authored one, e.g. only `hidden` was set);
 *     reverting deletes the record.
 *   - a CREATED card: the key is `concept-<slug>-<4 chars>`, the anchor is a
 *     lesson, the start of a stage (its first lesson) or the start of a unit
 *     (its first lesson). A lesson carries at most one concept.
 * `hidden` stops a card being served. "Show it again" bumps `revision`, and
 * the served concept id becomes `<key>-r<revision>`, so learners who already
 * saw it (their `seenConcepts`) see it again.
 *
 * Pure functions, no I/O - server/content.js applies the cards to the bank
 * learners get, server/admin.js edits them.
 */

export const ANCHOR_KINDS = ['lesson', 'stage', 'unit'];
export const CONCEPT_LANGUAGES = ['javascript', 'typescript', 'python', 'java', 'c', 'cpp', 'go', 'sql', 'html', 'css', 'bash', 'pseudocode'];

/** Field limits: generous, but a card is a short lesson, not an article. */
export const CONCEPT_LIMITS = { title: 120, summary: 240, text: 4000, code: 8000, callout: 300, callouts: 12 };

const KEY_RE = /^[a-z0-9][a-z0-9-]*$/;

const str = (v) => (typeof v === 'string' ? v : v == null ? '' : String(v));
const trimmed = (v) => str(v).trim();
const list = (v) => (Array.isArray(v) ? v : []);

function plainObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

/** The concept id learners get for a card: its key, or `<key>-r<N>` once it was re-shown. */
export function conceptIdFor(key, revision = 0) {
  const n = Number.isInteger(revision) && revision > 0 ? revision : 0;
  return n > 0 ? `${key}-r${n}` : key;
}

/**
 * A key for a new card: `concept-<slug of the title>-<4 chars>`, never one in
 * `existing` (every card key and every built-in concept id).
 */
export function generateConceptKey(title, existing = [], random = Math.random) {
  const slug =
    String(title ?? '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 32)
      .replace(/-+$/g, '') || 'card';
  const taken = new Set(existing);
  for (let attempt = 0; attempt < 50; attempt++) {
    const suffix = Math.floor(random() * 36 ** 4)
      .toString(36)
      .padStart(4, '0');
    const key = `concept-${slug}-${suffix}`;
    if (!taken.has(key)) return key;
  }
  throw new Error('Could not allocate a unique card key.');
}

/**
 * Where a card is placed, tidied: `{ kind: 'lesson', challengeId }`,
 * `{ kind: 'stage', stageId }` (its first lesson) or `{ kind: 'unit',
 * unitId, stageId }` (its first lesson). Returns `{ anchor, issues }`.
 */
export function normalizeAnchor(raw) {
  const src = plainObject(raw);
  const kind = trimmed(src.kind);
  if (!ANCHOR_KINDS.includes(kind)) return { anchor: null, issues: [{ path: 'anchor', message: 'Choose where the card goes: a lesson, the start of a stage or the start of a unit.' }] };
  if (kind === 'lesson') {
    const challengeId = trimmed(src.challengeId);
    return challengeId ? { anchor: { kind, challengeId }, issues: [] } : { anchor: null, issues: [{ path: 'anchor.challengeId', message: 'Choose the lesson the card comes before.' }] };
  }
  if (kind === 'stage') {
    const stageId = trimmed(src.stageId);
    return stageId ? { anchor: { kind, stageId }, issues: [] } : { anchor: null, issues: [{ path: 'anchor.stageId', message: 'Choose the stage the card opens.' }] };
  }
  const unitId = trimmed(src.unitId);
  const stageId = trimmed(src.stageId);
  if (!unitId) return { anchor: null, issues: [{ path: 'anchor.unitId', message: 'Choose the unit the card opens.' }] };
  return { anchor: { kind, unitId, ...(stageId ? { stageId } : {}) }, issues: [] };
}

function example(raw, path, issues, required) {
  const src = plainObject(raw);
  const code = str(src.code).replace(/\s+$/, '');
  if (!code.trim()) {
    if (required) issues.push({ path: `${path}.code`, message: 'Add the example code.' });
    return null;
  }
  if (code.length > CONCEPT_LIMITS.code) issues.push({ path: `${path}.code`, message: `The example is too long (max ${CONCEPT_LIMITS.code} characters).` });
  const language = trimmed(src.language) || 'javascript';
  if (!CONCEPT_LANGUAGES.includes(language)) issues.push({ path: `${path}.language`, message: `"${language}" is not a language the app knows.` });
  const lines = code.split('\n').length;
  const callouts = [];
  list(src.callouts).forEach((c, i) => {
    const text = trimmed(c?.text);
    const line = Number(c?.line);
    if (!text && !(line > 0)) return; // an empty row the admin has not filled in
    if (!Number.isInteger(line) || line < 1) issues.push({ path: `${path}.callouts.${i}.line`, message: `Note ${i + 1}: pick the line it is about (1-${lines}).` });
    else if (line > lines) issues.push({ path: `${path}.callouts.${i}.line`, message: `Note ${i + 1} is about line ${line}, but the example has ${lines} line${lines === 1 ? '' : 's'}.` });
    if (!text) issues.push({ path: `${path}.callouts.${i}.text`, message: `Note ${i + 1} needs its text.` });
    else if (text.length > CONCEPT_LIMITS.callout) issues.push({ path: `${path}.callouts.${i}.text`, message: `Note ${i + 1} is too long (max ${CONCEPT_LIMITS.callout} characters).` });
    callouts.push({ line: Number.isInteger(line) ? line : 0, text });
  });
  if (callouts.length > CONCEPT_LIMITS.callouts) issues.push({ path: `${path}.callouts`, message: `At most ${CONCEPT_LIMITS.callouts} line notes.` });
  return { code, language, ...(callouts.length ? { callouts } : {}) };
}

/**
 * What the Teaching page's editor sends, tidied into a Concept the schema
 * can judge, with friendly field-level issues first (paths like `title`,
 * `example.code`, `example.callouts.1.line`, `tryIt.starterCode`). The id is
 * the card's served id (`conceptIdFor`). The zod ConceptSchema then gives
 * the authoritative verdict (server/admin.js).
 */
export function normalizeConceptInput(body, { id }) {
  const src = plainObject(body);
  const issues = [];
  const text = (field, label, max, required = true) => {
    const value = trimmed(src[field]);
    if (!value) {
      if (required) issues.push({ path: field, message: `Add the ${label}.` });
      return '';
    }
    if (value.length > max) issues.push({ path: field, message: `The ${label} is too long (max ${max} characters).` });
    return value;
  };

  const candidate = {
    id,
    title: text('title', 'title', CONCEPT_LIMITS.title),
    summary: text('summary', 'one-line summary', CONCEPT_LIMITS.summary),
    intro: text('intro', 'explanation', CONCEPT_LIMITS.text),
    example: example(src.example, 'example', issues, true) ?? { code: '', language: 'javascript' },
    why: text('why', '"why it works" part', CONCEPT_LIMITS.text)
  };
  const second = example(src.secondExample, 'secondExample', issues, false);
  if (second) candidate.secondExample = second;

  const tryIt = plainObject(src.tryIt);
  const instructions = trimmed(tryIt.instructions);
  const starterCode = str(tryIt.starterCode).replace(/\s+$/, '');
  if (instructions || starterCode.trim()) {
    if (!instructions) issues.push({ path: 'tryIt.instructions', message: 'Say what to try, or leave the try-it step empty.' });
    if (!starterCode.trim()) issues.push({ path: 'tryIt.starterCode', message: 'Add the code to start from, or leave the try-it step empty.' });
    if (instructions.length > CONCEPT_LIMITS.text) issues.push({ path: 'tryIt.instructions', message: `Too long (max ${CONCEPT_LIMITS.text} characters).` });
    if (starterCode.length > CONCEPT_LIMITS.code) issues.push({ path: 'tryIt.starterCode', message: `Too long (max ${CONCEPT_LIMITS.code} characters).` });
    const language = trimmed(tryIt.language) || candidate.example.language || 'javascript';
    if (!CONCEPT_LANGUAGES.includes(language)) issues.push({ path: 'tryIt.language', message: `"${language}" is not a language the app knows.` });
    candidate.tryIt = { instructions, starterCode, language, ...(tryIt.ui === true ? { ui: true } : {}) };
  }
  const plainer = trimmed(src.explainDifferently);
  if (plainer) {
    if (plainer.length > CONCEPT_LIMITS.text) issues.push({ path: 'explainDifferently', message: `Too long (max ${CONCEPT_LIMITS.text} characters).` });
    candidate.explainDifferently = plainer;
  }
  return { candidate, issues };
}

/* ------------------------------------------------------------- serving */

/** Built-in concept id -> the lesson carrying it, over a bank (every lesson, hidden ones too). */
export function authoredConceptIndex(bank) {
  const index = new Map();
  for (const c of bank ?? []) {
    const id = c?.concept?.id;
    if (typeof id === 'string' && id && !index.has(id)) index.set(id, c.id);
  }
  return index;
}

/** Is this a key a created card may use? */
export function isCardKey(key) {
  return typeof key === 'string' && key.length <= 80 && KEY_RE.test(key);
}

/**
 * The lesson a card's anchor lands on in `challenges` (the lessons learners
 * see, in order), or null: the lesson itself, a stage's first lesson, or a
 * unit's first lesson (`unitFirstLesson(unitId)`, from server/units.js).
 * Stage tests never carry a card.
 */
export function resolveAnchor(anchor, challenges, { unitFirstLesson } = {}) {
  const a = plainObject(anchor);
  const lessons = (challenges ?? []).filter((c) => !c.isStageTest);
  if (a.kind === 'lesson') return lessons.some((c) => c.id === a.challengeId) ? a.challengeId : null;
  if (a.kind === 'stage') return lessons.find((c) => c.stageId === a.stageId)?.id ?? null;
  if (a.kind === 'unit' && typeof unitFirstLesson === 'function') {
    const id = unitFirstLesson(a.unitId);
    return id && lessons.some((c) => c.id === id) ? id : null;
  }
  return null;
}

/**
 * Which concept each lesson of `challenges` carries once the cards are
 * applied: a Map of challengeId -> { key, source, concept, hidden, card }.
 * `source` is 'authored' (as shipped), 'modified' (an edited built-in) or
 * 'created'. A hidden concept is in the map with `hidden: true` (the admin
 * sees it; learners do not). Also returns the created cards that could not
 * be placed (`unplaced`: key -> 'anchor-missing' | 'lesson-has-concept').
 *
 * `bank` is every lesson (hidden ones too), to tell a built-in concept's key
 * from a created card's even when its lesson is hidden.
 */
export function assignConcepts(challenges, cards, { bank = challenges, unitFirstLesson } = {}) {
  const index = authoredConceptIndex(bank);
  const byKey = new Map((cards ?? []).map((card) => [card.key, card]));
  const assigned = new Map();
  const unplaced = new Map();

  for (const c of challenges ?? []) {
    if (!c?.concept?.id) continue;
    const card = byKey.get(c.concept.id) ?? null;
    const edited = Boolean(card?.concept);
    const concept = edited ? card.concept : c.concept;
    assigned.set(c.id, { key: c.concept.id, source: edited ? 'modified' : 'authored', concept, hidden: Boolean(card?.hidden), card });
  }

  for (const card of cards ?? []) {
    if (index.has(card.key) || !card.concept) continue;
    const lessonId = resolveAnchor(card.anchor, challenges, { unitFirstLesson });
    if (!lessonId) {
      unplaced.set(card.key, 'anchor-missing');
      continue;
    }
    // One concept per lesson: a built-in one, or the card placed first.
    if (assigned.has(lessonId)) {
      unplaced.set(card.key, 'lesson-has-concept');
      continue;
    }
    assigned.set(lessonId, { key: card.key, source: 'created', concept: card.concept, hidden: Boolean(card.hidden), card });
  }
  return { assigned, unplaced };
}

/**
 * The lessons learners get, with the cards applied: an edited built-in
 * concept replaces the authored one, a created card sets `concept` on the
 * lesson it lands on, and a hidden one leaves no concept at all.
 */
export function applyCards(challenges, cards, options = {}) {
  if (!cards?.length) return challenges;
  const { assigned } = assignConcepts(challenges, cards, options);
  return challenges.map((c) => {
    const entry = assigned.get(c.id);
    if (!entry || (entry.source === 'authored' && !entry.hidden)) return c;
    if (entry.hidden) {
      const { concept, ...rest } = c;
      return rest;
    }
    return { ...c, concept: entry.concept };
  });
}
