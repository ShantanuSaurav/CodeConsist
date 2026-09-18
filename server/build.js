/**
 * Compile a TypeScript module from src/ into a plain ESM bundle the server (and
 * its child runners) can import. Keeps one source of truth for logic that must
 * behave identically in the browser and on the server - the grader especially.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const GENERATED_DIR = path.join(HERE, 'generated');

/**
 * @param {string} entryTs absolute path of the .ts entry
 * @param {string} outName file name to emit inside server/generated
 * @returns {Promise<string>} absolute path of the emitted .mjs bundle
 */
export async function compileTsModule(entryTs, outName) {
  await mkdir(GENERATED_DIR, { recursive: true });
  const outFile = path.join(GENERATED_DIR, outName);

  // Always compile, so a change in any transitive import is picked up (an
  // mtime check on the entry file alone missed those). But only WRITE when
  // the output differs: the server imports this file, `node --watch` watches
  // every imported module, and rewriting an identical bundle on each start
  // produced an infinite restart loop.
  const esbuild = (await import('esbuild')).default;
  const { registryPlugins } = await import('../src/platform/content-registry/loader.build.mjs');
  const result = await esbuild.build({
    entryPoints: [entryTs],
    plugins: registryPlugins,
    bundle: true,
    format: 'esm',
    platform: 'node',
    target: 'node18',
    write: false,
    logLevel: 'silent'
  });
  const next = result.outputFiles[0].text;

  let current = null;
  try {
    current = await readFile(outFile, 'utf8');
  } catch {
    /* first build */
  }
  if (current !== next) await writeFile(outFile, next, 'utf8');

  const ignore = path.join(GENERATED_DIR, '.gitignore');
  if (!(await readFile(ignore, 'utf8').catch(() => null))) await writeFile(ignore, '*\n', 'utf8');
  return outFile;
}
