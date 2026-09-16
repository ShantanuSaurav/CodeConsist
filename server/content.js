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
        "export { STAGE_META } from './stages';"
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
    challenges: mod.ALL_CHALLENGES
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
