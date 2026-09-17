#!/usr/bin/env node
/**
 * Prove the two content loaders agree.
 *
 * The browser discovers content with an `import.meta.glob` literal in each
 * module's content/index.ts; Node discovers it by walking the spec's directory.
 * Vite cannot run here and Node cannot evaluate import.meta.glob, so this
 * script does the one thing that keeps them honest: it reads the glob literal
 * out of the source, expands it against the real directory tree, and asserts
 * the file set is exactly what the spec (and therefore the Node loader, the
 * server and every script) selects. It then loads each kind through the Node
 * loader and asserts it is valid and non-empty.
 *
 * If someone adds a folder the glob misses, or excludes a file in one place
 * but not the other, this fails - instead of the app and the API silently
 * serving different challenge banks.
 */
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { discoverFiles, listFiles, loadContent, loadSpecs, SRC } from '../src/platform/content-registry/loader.build.mjs';

const registry = await loadSpecs();
let failures = 0;

/** Minimal glob: supports "./", "*" (no slash), "**" (any depth), literal rest. */
function globToRegExp(pattern) {
  let p = pattern.replace(/^\.\//, '');
  let re = '';
  for (let i = 0; i < p.length; i++) {
    const ch = p[i];
    if (ch === '*') {
      if (p[i + 1] === '*') {
        // "**/" matches zero or more directories
        if (p[i + 2] === '/') {
          re += '(?:.*/)?';
          i += 2;
        } else {
          re += '.*';
          i += 1;
        }
      } else re += '[^/]*';
    } else if ('.+?^${}()|[]\\'.includes(ch)) re += '\\' + ch;
    else re += ch;
  }
  return new RegExp('^' + re + '$');
}

function extractGlobPatterns(source) {
  const m = source.match(/import\.meta\.glob\(\s*(\[[\s\S]*?\]|'[^']*'|"[^"]*")/);
  if (!m) return null;
  return [...m[1].matchAll(/['"]([^'"]+)['"]/g)].map((x) => x[1]);
}

for (const spec of registry.CONTENT_SPECS) {
  const dirAbs = path.join(SRC, spec.dir);
  const indexSource = await readFile(path.join(dirAbs, 'index.ts'), 'utf8');
  const patterns = extractGlobPatterns(indexSource);
  if (!patterns) {
    console.log(`✗ ${spec.kind}: no import.meta.glob literal found in ${spec.dir}/index.ts`);
    failures++;
    continue;
  }

  const includes = patterns.filter((p) => !p.startsWith('!')).map(globToRegExp);
  const excludes = patterns.filter((p) => p.startsWith('!')).map((p) => globToRegExp(p.slice(1)));
  const all = await listFiles(dirAbs);
  const viteSet = all.filter((f) => includes.some((r) => r.test(f)) && !excludes.some((r) => r.test(f))).sort();
  const nodeSet = (await discoverFiles(spec, registry)).sort();

  const onlyVite = viteSet.filter((f) => !nodeSet.includes(f));
  const onlyNode = nodeSet.filter((f) => !viteSet.includes(f));
  if (onlyVite.length || onlyNode.length) {
    failures++;
    console.log(`✗ ${spec.kind}: loaders disagree on the file set`);
    for (const f of onlyVite) console.log(`    only the Vite glob:  ${spec.dir}/${f}`);
    for (const f of onlyNode) console.log(`    only the Node spec:  ${spec.dir}/${f}`);
  }

  const loaded = await loadContent(spec.kind);
  if (loaded.issues.length) {
    failures++;
    console.log(`✗ ${spec.kind}: ${loaded.issues.length} validation issue(s)`);
  } else if (loaded.items.length === 0) {
    failures++;
    console.log(`✗ ${spec.kind}: no items loaded`);
  } else if (!onlyVite.length && !onlyNode.length) {
    console.log(`✓ ${spec.kind}: ${nodeSet.length} file(s), ${loaded.items.length} item(s) - glob [${patterns.join(', ')}] matches the spec`);
  }
}

if (failures) {
  console.log(`\n${failures} parity failure(s).`);
  process.exit(1);
}
console.log('\nDev and build loaders agree.');
