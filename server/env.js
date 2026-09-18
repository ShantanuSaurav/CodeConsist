/**
 * Loads the project's optional `.env` into process.env before anything else
 * reads it. Imported FIRST by server/index.js, so ESM evaluation order
 * guarantees it runs before db.js, excel.js or index.js's own top-level
 * `process.env` reads.
 *
 * Done in code rather than with `node --env-file-if-exists=.env` because that
 * flag, combined with `--watch-path` (npm run dev:api), makes Node on Windows
 * restart the API on any write under the project root - every db.json save
 * (a sign-in, a solve) and every content-cache rebuild bounced the server and
 * turned each request into a burst of proxy 500s in the browser. Loading the
 * file here keeps the watch list to the source files that actually matter.
 *
 * Same precedence as the flag: a variable already present in the environment
 * wins over the file.
 */
import path from 'node:path';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const ENV_FILE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '.env');

if (existsSync(ENV_FILE)) {
  try {
    process.loadEnvFile(ENV_FILE);
  } catch (err) {
    console.warn(`[env] could not read ${ENV_FILE}: ${err?.message ?? err}`);
  }
}
