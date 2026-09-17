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
  const { STAGE_META } = await loadSpecs();

  return {
    builtAt: new Date().toISOString(),
    stages: STAGE_META,
    challenges: result.items
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
