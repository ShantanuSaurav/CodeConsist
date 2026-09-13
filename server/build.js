/**
 * Compile a TypeScript module from src/ into a plain ESM bundle the server (and
 * its child runners) can import. Keeps one source of truth for logic that must
 * behave identically in the browser and on the server - the grader especially.
 */
import { mkdir, writeFile } from 'node:fs/promises';
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

  // Always rebuild. It costs ~50ms at startup, and the alternative - deciding
  // freshness from the ENTRY file's mtime alone - silently kept a stale bundle
  // whenever an imported dependency changed and the entry did not.

  const esbuild = (await import('esbuild')).default;
  await esbuild.build({
    entryPoints: [entryTs],
    bundle: true,
    format: 'esm',
    platform: 'node',
    target: 'node18',
    outfile: outFile,
    logLevel: 'silent'
  });
  // Touch so the mtime comparison above is stable even on coarse filesystems.
  await writeFile(path.join(GENERATED_DIR, '.gitignore'), '*\n', 'utf8');
  return outFile;
}
