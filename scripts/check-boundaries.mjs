#!/usr/bin/env node
/**
 * Enforce the dependency direction between areas of src/ (docs/adr/0004).
 *
 *     app  ->  modules  ->  platform  ->  ui / types / config
 *
 * Rules
 *   1. Arrows only point down: platform never imports modules; ui never
 *      imports platform or modules; types and config import nothing but each
 *      other.
 *   2. Modules are isolated: modules/challenges may not import
 *      modules/dashboard at all. They talk through platform/events or
 *      platform services, or the app composes them.
 *   3. Public surface only: anything outside a module may import it only
 *      through its barrel (`@/modules/<name>`) or its content spec
 *      (`@/modules/<name>/content/spec`, which the Node loader needs and
 *      which must stay pure).
 *   4. A module's content bank (`@/modules/<name>/content`) is public too,
 *      but only through a dynamic `import()` - that is what keeps it in its
 *      own chunk, out of the shell (ADR 0006). A static import is refused.
 *   5. The server (server/**) may import from platform only.
 *
 * Uses the TypeScript compiler's parser, so it sees exactly the imports the
 * build sees - static, dynamic, `export ... from`, and type-only imports.
 */
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(ROOT, 'src');
const posix = (p) => p.split(path.sep).join('/');

/** Which areas each area may import from (besides itself). */
const ALLOWED = {
  app: ['modules', 'platform', 'ui', 'types', 'config'],
  modules: ['platform', 'ui', 'types', 'config'],
  platform: ['ui', 'types', 'config'],
  ui: ['types', 'config'],
  types: ['config'],
  config: []
};

/** Paths outside a module that count as its public surface. */
const PUBLIC_ENTRIES = [/^modules\/[^/]+$/, /^modules\/[^/]+\/index$/, /^modules\/[^/]+\/content\/spec$/];
/** Public only via import() - see rule 4. */
const LAZY_ONLY_ENTRIES = [/^modules\/[^/]+\/content$/, /^modules\/[^/]+\/content\/index$/];

async function walk(dir, out = []) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === '__tests__') continue;
      await walk(full, out);
    } else if (/\.(ts|tsx|mjs|js)$/.test(entry.name) && !/\.d\.ts$/.test(entry.name)) out.push(full);
  }
  return out;
}

/** Every module specifier a file imports, as { spec, dynamic }. */
function importsOf(file, source) {
  const kind = file.endsWith('.tsx') ? ts.ScriptKind.TSX : file.endsWith('.ts') ? ts.ScriptKind.TS : ts.ScriptKind.JS;
  const sf = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, kind);
  const specs = [];
  const visit = (node) => {
    if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
      specs.push({ spec: node.moduleSpecifier.text, dynamic: false });
    } else if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword && node.arguments[0] && ts.isStringLiteral(node.arguments[0])) {
      specs.push({ spec: node.arguments[0].text, dynamic: true });
    } else if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument) && ts.isStringLiteral(node.argument.literal)) {
      specs.push({ spec: node.argument.literal.text, dynamic: false });
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return specs;
}

/** Resolve a specifier to a src-relative path without extension, or null for packages. */
function resolveSpec(fromFile, spec) {
  const clean = spec.replace(/\?.*$/, '');
  let abs;
  if (clean.startsWith('@/')) abs = path.join(SRC, clean.slice(2));
  else if (clean.startsWith('.')) abs = path.resolve(path.dirname(fromFile), clean);
  else return null;
  const rel = posix(path.relative(SRC, abs));
  if (rel.startsWith('..')) return { outside: true, rel };
  return { rel: rel.replace(/\.(ts|tsx|js|mjs|css|md)$/, '') };
}

const areaOf = (rel) => rel.split('/')[0];
const moduleOf = (rel) => {
  const parts = rel.split('/');
  return parts[0] === 'modules' ? `modules/${parts[1]}` : parts[0];
};

const violations = [];
const files = [...(await walk(SRC)), ...(await walk(path.join(ROOT, 'server')))];

for (const file of files) {
  const source = await readFile(file, 'utf8');
  const inServer = !posix(file).startsWith(posix(SRC));
  const fromRel = inServer ? null : posix(path.relative(SRC, file)).replace(/\.(ts|tsx|js|mjs)$/, '');
  const fromArea = inServer ? 'server' : areaOf(fromRel);

  for (const { spec, dynamic } of importsOf(file, source)) {
    const target = resolveSpec(file, spec);
    if (!target || target.outside && inServer && !/src\//.test(spec)) continue;

    // server/** -> platform only
    if (inServer) {
      if (target.outside) continue; // server-internal relative import
      if (areaOf(target.rel) !== 'platform') {
        violations.push(`${posix(path.relative(ROOT, file))}: server may only import platform/**, got "${spec}"`);
      }
      continue;
    }
    if (target.outside) {
      violations.push(`src/${fromRel}: imports outside src/ ("${spec}")`);
      continue;
    }

    const toArea = areaOf(target.rel);
    if (toArea !== fromArea && !(ALLOWED[fromArea] ?? []).includes(toArea)) {
      violations.push(`src/${fromRel}: ${fromArea} may not import ${toArea} ("${spec}")`);
      continue;
    }

    if (toArea === 'modules') {
      const fromModule = moduleOf(fromRel);
      const toModule = moduleOf(target.rel);
      if (fromArea === 'modules' && fromModule !== toModule) {
        violations.push(`src/${fromRel}: module ${fromModule} may not import ${toModule} - use platform/events or let app compose them ("${spec}")`);
        continue;
      }
      if (fromModule !== toModule) {
        if (LAZY_ONLY_ENTRIES.some((re) => re.test(target.rel))) {
          if (!dynamic) {
            violations.push(`src/${fromRel}: the content bank "${spec}" must be loaded with import() so it stays in its own chunk`);
          }
        } else if (!PUBLIC_ENTRIES.some((re) => re.test(target.rel))) {
          violations.push(`src/${fromRel}: import ${toModule} through its barrel, not "${spec}"`);
        }
      }
    }
  }
}

if (violations.length) {
  console.log(`${violations.length} boundary violation(s):`);
  for (const v of violations) console.log('  ✗ ' + v);
  process.exit(1);
}
console.log(`Boundaries hold across ${files.length} files: app -> modules -> platform -> ui/types/config; modules isolated; server -> platform only.`);
