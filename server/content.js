/**
 * Server-side view of the challenge bank.
 *
 * The authored content lives in TypeScript under src/data so the client and the
 * server can never drift. We compile it once with esbuild and cache the result
 * as JSON, rebuilding whenever a source file is newer than the cache.
 */
import { readdir, stat, mkdir, writeFile, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const SRC_DATA = path.join(ROOT, 'src', 'data');
const CACHE_DIR = path.join(HERE, 'generated');
const CACHE_FILE = path.join(CACHE_DIR, 'content.json');

let cached = null;

async function newestSourceMtime() {
  let newest = 0;
  const walk = async (dir) => {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) await walk(full);
      else if (entry.name.endsWith('.ts')) {
        const s = await stat(full);
        newest = Math.max(newest, s.mtimeMs);
      }
    }
  };
  await walk(SRC_DATA);
  const typesStat = await stat(path.join(ROOT, 'src', 'types.ts'));
  return Math.max(newest, typesStat.mtimeMs);
}

async function compile() {
  const esbuild = (await import('esbuild')).default;

  // Bundle in memory and import it as a data: URL. Writing a temp file and
  // importing THAT made it a module `node --watch` tracked, so deleting it
  // afterwards restarted the server.
  const result = await esbuild.build({
    stdin: {
      contents: [
        "export { ALL_CHALLENGES, buildStages } from './index';",
        "export { STAGE_META } from './stages';",
        "export { LANGUAGE_TRACKS } from './tracks';"
      ].join('\n'),
      resolveDir: SRC_DATA,
      loader: 'ts'
    },
    bundle: true,
    format: 'esm',
    platform: 'node',
    target: 'node18',
    write: false,
    logLevel: 'silent'
  });
  const code = result.outputFiles[0].text;
  const mod = await import('data:text/javascript;base64,' + Buffer.from(code, 'utf8').toString('base64'));

  return {
    builtAt: new Date().toISOString(),
    stages: mod.STAGE_META,
    challenges: mod.ALL_CHALLENGES,
    languageTracks: mod.LANGUAGE_TRACKS
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
        cached = JSON.parse(await readFile(CACHE_FILE, 'utf8'));
        index(cached);
        return cached;
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
 * exactly one merged view of the roadmap, never two.
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
 * excludes `language` - reassigning a stage to a different language track would
 * strand its challenges (they are matched to a track by stageId membership in
 * src/data/tracks.ts, not by a field on the stage itself) and desync the
 * per-language progress model in GameContext, so a language "change" is done by
 * moving challenges/stages in the authored content, not as a live admin toggle.
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
 * cases, `language`) and stays out of `type` - those drive grading and the
 * validate-content.mjs safety net that actually executes JS/Python solutions,
 * so they stay in the authored TypeScript (see docs/CONTENT_AUTHORING.md).
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
