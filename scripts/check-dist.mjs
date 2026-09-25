#!/usr/bin/env node
/**
 * Fail if a production build ships source maps.
 *
 * A .map file next to the bundle hands every visitor the original source,
 * comments and all. vite.config.ts turns them off for production builds; this
 * is the guard that keeps it that way. CI runs it after `npm run build`.
 *
 *   node scripts/check-dist.mjs
 */
import { existsSync } from 'node:fs';
import { readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(ROOT, 'dist');
const posix = (p) => p.split(path.sep).join('/');

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

const maps = await findMaps(DIST);
if (maps.length) {
  console.error(`${maps.length} source map(s) in dist/ - a production build must not ship them:`);
  for (const file of maps) console.error('  ✗ ' + file);
  console.error('Check build.sourcemap in vite.config.ts (and that SOURCEMAP is not set to true).');
  process.exit(1);
}
console.log('dist/ holds no source maps.');
