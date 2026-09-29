#!/usr/bin/env node
/**
 * Guard the production build:
 *
 *   - no source maps. A .map file next to the bundle hands every visitor the
 *     original source, comments and all. vite.config.ts turns them off for
 *     production builds; this keeps it that way.
 *   - the first-paint shell (the entry chunk plus everything index.html
 *     preloads with it) stays under its gzipped budget, and never carries
 *     zod, motion or the admin's settings metadata - each of those belongs
 *     in a lazy chunk (README "What the browser downloads").
 *
 * CI runs it after `npm run build`.
 *
 *   node scripts/check-dist.mjs
 */
import { existsSync, readFileSync } from 'node:fs';
import { readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(ROOT, 'dist');
const posix = (p) => p.split(path.sep).join('/');

/**
 * The shell's gzipped budget in kB (1000 bytes, as `vite build` prints them).
 * Measured at about 186 kB after the learning loop; lower it as the shell
 * shrinks, and raise it only on purpose.
 */
const SHELL_BUDGET_KB = 195;

/** Text that means a module the shell must not hold made it in. */
const SHELL_FORBIDDEN = [
  ['ZodError', 'zod (settings and content schemas: server, admin chunk and CI only)'],
  ['ZodObject', 'zod (settings and content schemas: server, admin chunk and CI only)'],
  ['motion-dom', 'framer-motion'],
  ['TRUST_PROXY_HOPS', "the admin's settings metadata (src/platform/settings/meta.ts)"]
];

async function findMaps(dir, out = []) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) await findMaps(full, out);
    else if (entry.name.endsWith('.map')) out.push(posix(path.relative(ROOT, full)));
  }
  return out;
}

if (!existsSync(DIST)) {
  console.error('No dist/ folder - run `npm run build` first.');
  process.exit(1);
}

let failed = false;

const maps = await findMaps(DIST);
if (maps.length) {
  console.error(`${maps.length} source map(s) in dist/ - a production build must not ship them:`);
  for (const file of maps) console.error('  ✗ ' + file);
  console.error('Check build.sourcemap in vite.config.ts (and that SOURCEMAP is not set to true).');
  failed = true;
} else {
  console.log('dist/ holds no source maps.');
}

// The shell: the module script index.html loads and the chunks it preloads.
const html = readFileSync(path.join(DIST, 'index.html'), 'utf8');
const shell = [
  ...[...html.matchAll(/<script\b[^>]*\btype="module"[^>]*\bsrc="([^"]+)"/g)].map((m) => m[1]),
  ...[...html.matchAll(/<link\b[^>]*\brel="modulepreload"[^>]*\bhref="([^"]+)"/g)].map((m) => m[1])
].filter((src, i, all) => src.endsWith('.js') && all.indexOf(src) === i);
if (shell.length === 0) {
  console.error('No module script in dist/index.html - cannot measure the shell.');
  process.exit(1);
}
let shellBytes = 0;
for (const src of shell) {
  const file = path.join(DIST, src.replace(/^\//, ''));
  const code = readFileSync(file);
  const gz = gzipSync(code).length;
  shellBytes += gz;
  console.log(`  shell: ${src}  ${(gz / 1000).toFixed(2)} kB gzipped`);
  const text = code.toString('utf8');
  for (const [needle, what] of SHELL_FORBIDDEN) {
    if (text.includes(needle)) {
      console.error(`  ✗ ${src} holds "${needle}": ${what} is in the first-paint shell. Import it lazily.`);
      failed = true;
    }
  }
}
const shellKb = shellBytes / 1000;
if (shellKb > SHELL_BUDGET_KB) {
  console.error(`The first-paint shell is ${shellKb.toFixed(2)} kB gzipped - over its ${SHELL_BUDGET_KB} kB budget (scripts/check-dist.mjs).`);
  failed = true;
} else {
  console.log(`First-paint shell: ${shellKb.toFixed(2)} kB gzipped (budget ${SHELL_BUDGET_KB} kB).`);
}

if (failed) process.exit(1);
