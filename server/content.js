/**
 * Server-side view of the challenge bank.
 *
 * The authored content lives in TypeScript under src/modules/<name>/content so the
 * client and the server can never drift. The content registry's Node loader
 * discovers and validates it with the same specs and schemas the browser uses;
 * we cache the result as JSON and rebuild whenever a source file is newer.
 */
import { readdir, stat, mkdir, writeFile, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as store from './db.js';
import { applyCards, assignConcepts } from './concept-cards.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const SRC_MODULES = path.join(ROOT, 'src', 'modules');
const SRC_TYPES = path.join(ROOT, 'src', 'types');
const CACHE_DIR = path.join(HERE, 'generated');
const CACHE_FILE = path.join(CACHE_DIR, 'content.json');

let cached = null;

async function newestSourceMtime() {
  let newest = 0;
  const walk = async (dir) => {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) await walk(full);
      else if (/.(ts|md)$/.test(entry.name)) {
        const s = await stat(full);
        newest = Math.max(newest, s.mtimeMs);
      }
    }
  };
  // Content, schemas and the shared types all decide what the bank looks like.
  await walk(SRC_MODULES);
  await walk(SRC_TYPES);
  return newest;
}

async function compile() {
  const { loadContent: loadKind, loadSpecs, formatIssuesFor } = await import('../src/platform/content-registry/loader.build.mjs');
  const result = await loadKind('challenges');
  if (result.issues.length) {
    // Fail loud: serving a half-valid bank would hand out XP for broken challenges.
    throw new Error(formatIssuesFor(result.spec, result.issues));
  }
  const { STAGE_META, LANGUAGE_TRACKS } = await loadSpecs();

  return {
    builtAt: new Date().toISOString(),
    stages: STAGE_META,
    challenges: result.items,
    languageTracks: LANGUAGE_TRACKS ?? []
  };
}

/** Load the challenge bank, rebuilding the cache when the sources changed. */
export async function loadContent({ force = false } = {}) {
  if (cached && !force) return cached;

  await mkdir(CACHE_DIR, { recursive: true });
  const newest = await newestSourceMtime();

  if (!force && existsSync(CACHE_FILE)) {
    try {
      const cacheStat = await stat(CACHE_FILE);
      if (cacheStat.mtimeMs >= newest) {
        const parsed = JSON.parse(await readFile(CACHE_FILE, 'utf8'));
        if (Array.isArray(parsed.languageTracks)) {
          cached = parsed;
          index(cached);
          return cached;
        }
      }
    } catch {
      /* fall through and rebuild */
    }
  }

  const payload = await compile();
  await writeFile(CACHE_FILE, JSON.stringify(payload), 'utf8');
  cached = payload;
  index(cached);
  console.log(`[content] compiled ${payload.challenges.length} challenges across ${payload.stages.length} stages`);
  return cached;
}

function index(payload) {
  // A cache written before tracks existed is rebuilt rather than served without them.
  if (!Array.isArray(payload.languageTracks)) payload.languageTracks = [];
  payload.byId = new Map(payload.challenges.map((c) => [c.id, c]));
  payload.byStage = new Map();
  for (const c of payload.challenges) {
    const list = payload.byStage.get(c.stageId);
    if (list) list.push(c);
    else payload.byStage.set(c.stageId, [c]);
  }
}

/**
 * Every question stored in server/db.js `customChallenges`, stripped of its
 * bookkeeping so it looks exactly like an authored Challenge. A stored record
 * is either a **created** question (an id the authored bank does not have) or
 * a **modified** one (an authored id whose full replacement lives here under
 * the same id) - the bank membership decides which, nothing on the record.
 */
export function customChallenges() {
  return store.allCustomChallenges().map(stripCustom);
}

/** Only createdAt/updatedAt are bookkeeping; the rest must pass the strict schema as-is. */
function stripCustom(record) {
  if (!record) return null;
  const { createdAt, updatedAt, ...challenge } = record;
  return challenge;
}

/** The untouched authored challenge (src/modules/challenges/content), or null. */
export function authoredChallenge(id) {
  return cached?.byId?.get(id) ?? null;
}

/**
 * Authored, modified or created - the store wins for any id, so a modified
 * question is served in place of its authored original.
 */
export function getChallenge(id) {
  return stripCustom(store.getCustomChallenge(id)) ?? authoredChallenge(id);
}

/**
 * The authored list in authored order with modified questions substituted in
 * place, then the created ones appended in store (creation) order - so an
 * edit never moves a lesson, and a new question lands at the end of its stage.
 */
function mergeBank(authored) {
  const stored = new Map(customChallenges().map((c) => [c.id, c]));
  const merged = authored.map((c) => stored.get(c.id) ?? c);
  const authoredIds = new Set(authored.map((c) => c.id));
  for (const c of stored.values()) if (!authoredIds.has(c.id)) merged.push(c);
  return merged;
}

/** Every challenge in a stage, in the order learners see them. */
export function stageChallenges(stageId) {
  return allChallenges().filter((c) => c.stageId === stageId);
}

/** The whole bank, authored + modified + created, hidden ones included. */
export function allChallenges() {
  return mergeBank(cached?.challenges ?? []);
}

/** True only for a created question: written in the console, no authored original. */
export function isCustomChallenge(id) {
  return Boolean(store.getCustomChallenge(id)) && !cached?.byId?.has(id);
}

/** True for a modified question: an authored id whose replacement is in the store. */
export function isModifiedChallenge(id) {
  return Boolean(cached?.byId?.has(id) && store.getCustomChallenge(id));
}

export function contentSnapshot() {
  return cached;
}

/* ------------------------------------------------------ admin overrides */

/**
 * Non-destructive edits an admin made (server/db.js's `contentOverrides`),
 * merged onto the authored content. This is the ONLY place either the
 * learner-facing `/api/content` or the admin content endpoints turn
 * "authored data + overrides" into "what actually gets shown" - so there is
 * exactly one merged view of the bank, never two.
 *
 * Hidden stages/challenges are removed entirely for learners; the admin
 * endpoints (server/admin.js) merge overrides differently so a hidden item
 * still shows up there, with a control to unhide it.
 *
 * The admin's teaching cards (server/concept-cards.js) are applied last -
 * `{ concepts: false }` leaves them out, for callers that only need which
 * lessons exist (the units service, which the unit anchors themselves read).
 */
export function applyLearnerOverrides(snapshot, overrides, options = {}) {
  const stageOverrides = overrides?.stages ?? {};
  const challengeOverrides = overrides?.challenges ?? {};

  const stages = snapshot.stages
    .map((stage, i) => ({ stage, order: stageOverrides[stage.id]?.order ?? i }))
    .filter(({ stage }) => !stageOverrides[stage.id]?.hidden)
    .sort((a, b) => a.order - b.order)
    .map(({ stage }) => applyStageOverride(stage, stageOverrides));

  const visibleStageIds = new Set(stages.map((s) => s.id));
  // The same merged bank as allChallenges(): modified questions replace their
  // original in place, created ones follow the authored lessons of their stage.
  const bank = mergeBank(snapshot.challenges);
  const challenges = bank
    .filter((c) => visibleStageIds.has(c.stageId) && !challengeOverrides[c.id]?.hidden)
    .map((c) => applyChallengeOverride(c, challengeOverrides));

  return { stages, challenges: options.concepts === false ? challenges : applyConceptCards(challenges, { bank }) };
}

/* ---------------------------------------------------------- teaching cards */

/**
 * Where a unit starts (its first lesson learners see), for cards anchored to
 * "the start of a unit". Set by server/index.js once the units service
 * exists; until then (and in tests without it) a unit anchor lands nowhere.
 */
let unitFirstLesson = null;
export function setUnitFirstLessonResolver(fn) {
  unitFirstLesson = typeof fn === 'function' ? fn : null;
}

/**
 * The lessons with the admin's teaching cards applied (see
 * server/concept-cards.js): an edited built-in concept replaces the authored
 * one, a created card becomes the concept of the lesson it is anchored to,
 * and a hidden one is not served. `bank` is every lesson, hidden ones too.
 */
export function applyConceptCards(challenges, { bank = allChallenges(), cards = store.allConceptCards() } = {}) {
  return applyCards(challenges, cards, { bank, unitFirstLesson });
}

/**
 * Which concept each lesson carries for the admin (hidden lessons and
 * hidden cards included): challengeId -> { key, source, hidden, ... }, and
 * the created cards that could not be placed.
 */
export function conceptAssignments(challenges = allChallenges(), { bank = allChallenges(), cards = store.allConceptCards() } = {}) {
  return assignConcepts(challenges, cards, { bank, unitFirstLesson });
}

/**
 * Applies one stage's safe, presentational override fields, if any. Deliberately
 * excludes `language` and track membership - moving a stage between tracks
 * would desync the per-track progress model, so that is done in the authored
 * content (src/modules/challenges/content/tracks.ts), not as a live toggle.
 */
export function applyStageOverride(stage, stageOverrides) {
  const o = stageOverrides?.[stage.id];
  if (!o) return stage;
  return {
    ...stage,
    name: o.name ?? stage.name,
    description: o.description ?? stage.description,
    icon: o.icon ?? stage.icon,
    isPremium: o.isPremium ?? stage.isPremium
  };
}

/** The only fields a locked stub carries - enough to list, count and label it. */
const STUB_FIELDS = ['id', 'stageId', 'type', 'title', 'difficulty', 'xpReward', 'language', 'isStageTest', 'tags'];

/**
 * What `/api/content` sends for a challenge in a premium stage the viewer
 * has not unlocked: its place in the path and nothing that answers it. The
 * prompt, options, correct answers, blanks, line order, starter code, test
 * cases, solution, hints, explanation and concept are all left out, and
 * `locked: true` tells the client not to open it. An allow-list, so a field
 * added to challenges later is left out by default.
 */
export function lockedStub(challenge) {
  const stub = {};
  for (const field of STUB_FIELDS) {
    if (challenge?.[field] !== undefined) stub[field] = challenge[field];
  }
  stub.locked = true;
  return stub;
}

/* ------------------------------------------------- wrong-answer notes */

const OPTION_TYPES = ['quiz', 'output_prediction', 'multi_select'];

/**
 * What wrong-answer notes on a question are written AGAINST: its options and
 * which of them are right, or each blank's accepted answers and choices. An
 * admin's notes on a built-in question (`contentOverrides.challenges[id]`
 * `optionFeedback` / `blankFeedback`) are stored with this basis, and apply
 * only while the question still has it - if the authored options change in
 * source, the notes would describe the wrong options, so they are set aside
 * (and flagged "stale" in the admin) instead. Null for kinds without notes.
 */
export function feedbackBasisOf(c) {
  if (!c) return null;
  if (OPTION_TYPES.includes(c.type)) {
    const correct = c.type === 'multi_select' ? [...(c.correctIndices ?? [])].sort((a, b) => a - b) : [c.correctIndex ?? null];
    return [c.options ?? [], correct];
  }
  if (c.type === 'fill_blank') return (c.blanks ?? []).map((b) => [b.answer, b.alternatives ?? [], b.choices ?? []]);
  return null;
}

/** The basis as it is stored beside the notes: a string, so comparing two is one equality. */
export function feedbackBasisKey(c) {
  return JSON.stringify(feedbackBasisOf(c));
}

/** Does this override carry wrong-answer notes at all? */
export function hasFeedbackOverride(o) {
  return Boolean(o && (Array.isArray(o.optionFeedback) || Array.isArray(o.blankFeedback)));
}

/** Notes stored for a built-in question whose options (or blanks) have since changed in source. */
export function isFeedbackStale(challenge, o) {
  return hasFeedbackOverride(o) && o.feedbackBasis !== feedbackBasisKey(challenge);
}

/**
 * The question with an admin's notes laid over it: `optionFeedback` replaced
 * whole, and each blank's `wrongAnswers` replaced by the note rows stored
 * for it (an empty list removes them). Grading reads neither field.
 */
function withFeedback(challenge, o) {
  const out = { ...challenge };
  if (Array.isArray(o.optionFeedback) && OPTION_TYPES.includes(challenge.type)) {
    const notes = (challenge.options ?? []).map((_, i) => (typeof o.optionFeedback[i] === 'string' ? o.optionFeedback[i] : ''));
    if (notes.some(Boolean)) out.optionFeedback = notes;
    else delete out.optionFeedback;
  }
  if (Array.isArray(o.blankFeedback) && challenge.type === 'fill_blank' && Array.isArray(challenge.blanks)) {
    out.blanks = challenge.blanks.map((blank, i) => {
      const rows = Array.isArray(o.blankFeedback[i]?.wrongAnswers) ? o.blankFeedback[i].wrongAnswers : [];
      const { wrongAnswers, ...rest } = blank;
      return rows.length ? { ...rest, wrongAnswers: rows.map((r) => ({ answer: String(r.answer), feedback: String(r.feedback) })) } : rest;
    });
  }
  return out;
}

/**
 * Applies one challenge's safe, presentational override fields, if any.
 * Deliberately excludes the question's logic (options, correct answers, test
 * cases, `language`, `concept`) and stays out of `type` - those drive grading
 * and the validate-content.mjs safety net that actually executes JS/Python
 * solutions, so they stay in the authored TypeScript (docs/CONTENT_AUTHORING.md).
 *
 * Wrong-answer notes are applied only while the question still has the
 * options (or blanks) they were written for - see `feedbackBasisOf`.
 */
export function applyChallengeOverride(challenge, challengeOverrides) {
  const o = challengeOverrides?.[challenge.id];
  if (!o) return challenge;
  const merged = {
    ...challenge,
    title: o.title ?? challenge.title,
    prompt: o.prompt ?? challenge.prompt,
    explanation: o.explanation ?? challenge.explanation,
    hints: o.hints ?? challenge.hints,
    tags: o.tags ?? challenge.tags,
    difficulty: o.difficulty ?? challenge.difficulty,
    xpReward: typeof o.xpReward === 'number' ? o.xpReward : challenge.xpReward
  };
  return hasFeedbackOverride(o) && !isFeedbackStale(challenge, o) ? withFeedback(merged, o) : merged;
}
