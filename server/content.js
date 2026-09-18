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

export function getChallenge(id) {
  return cached?.byId?.get(id) ?? null;
}

export function stageChallenges(stageId) {
  return cached?.byStage?.get(stageId) ?? [];
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
 */
export function applyLearnerOverrides(snapshot, overrides) {
  const stageOverrides = overrides?.stages ?? {};
  const challengeOverrides = overrides?.challenges ?? {};

  const stages = snapshot.stages
    .map((stage, i) => ({ stage, order: stageOverrides[stage.id]?.order ?? i }))
    .filter(({ stage }) => !stageOverrides[stage.id]?.hidden)
    .sort((a, b) => a.order - b.order)
    .map(({ stage }) => applyStageOverride(stage, stageOverrides));

  const visibleStageIds = new Set(stages.map((s) => s.id));
  const challenges = snapshot.challenges
    .filter((c) => visibleStageIds.has(c.stageId) && !challengeOverrides[c.id]?.hidden)
    .map((c) => applyChallengeOverride(c, challengeOverrides));

  return { stages, challenges };
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

/**
 * Applies one challenge's safe, presentational override fields, if any.
 * Deliberately excludes the question's logic (options, correct answers, test
 * cases, `language`, `concept`) and stays out of `type` - those drive grading
 * and the validate-content.mjs safety net that actually executes JS/Python
 * solutions, so they stay in the authored TypeScript (docs/CONTENT_AUTHORING.md).
 */
export function applyChallengeOverride(challenge, challengeOverrides) {
  const o = challengeOverrides?.[challenge.id];
  if (!o) return challenge;
  return {
    ...challenge,
    title: o.title ?? challenge.title,
    prompt: o.prompt ?? challenge.prompt,
    explanation: o.explanation ?? challenge.explanation,
    hints: o.hints ?? challenge.hints,
    tags: o.tags ?? challenge.tags,
    difficulty: o.difficulty ?? challenge.difficulty,
    xpReward: typeof o.xpReward === 'number' ? o.xpReward : challenge.xpReward
  };
}
