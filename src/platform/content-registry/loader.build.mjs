/**
 * Node-side content loader - the build-time twin of loader.dev.ts.
 *
 * Used by the API server (server/content.js) and by every content script.
 * It reads the same specs (src/app/content-specs.ts), walks the same
 * directories, and runs the same validate.ts, so what is valid here is valid
 * in the browser. The only difference is how files are found: fs.readdir
 * instead of import.meta.glob. scripts/check-content-parity.mjs proves the
 * two agree.
 *
 * Plain JavaScript on purpose: the server imports it without a compile step.
 */
import { mkdir, readdir, readFile, rm } from 'node:fs/promises';
import * as fsSync from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const SRC = path.resolve(HERE, '..', '..');
export const ROOT = path.resolve(SRC, '..');
const SPECS_ENTRY = path.join(SRC, 'app', 'content-specs.ts');

/** esbuild plugin: `@/x` -> src/x, and `file.md?raw` -> the file's text. */
export const registryPlugins = [
  {
    name: 'devlingo-alias',
    setup(build) {
      build.onResolve({ filter: /^@\// }, (args) => {
        const raw = args.path.endsWith('?raw');
        const base = path.join(SRC, args.path.slice(2).replace(/\?raw$/, ''));
        return raw ? { path: base, namespace: 'raw' } : { path: resolveWithExtensions(base) };
      });
    }
  },
  {
    name: 'devlingo-raw',
    setup(build) {
      build.onResolve({ filter: /\?raw$/ }, (args) => ({
        path: path.resolve(args.resolveDir, args.path.replace(/\?raw$/, '')),
        namespace: 'raw'
      }));
      build.onLoad({ filter: /.*/, namespace: 'raw' }, async (args) => ({
        contents: await readFile(args.path, 'utf8'),
        loader: 'text'
      }));
    }
  }
];

function resolveWithExtensions(base) {
  const { existsSync, statSync } = fsSync;
  if (existsSync(base) && statSync(base).isFile()) return base;
  for (const ext of ['.ts', '.tsx', '.js', '.mjs']) if (existsSync(base + ext)) return base + ext;
  for (const ext of ['.ts', '.tsx', '.js']) if (existsSync(path.join(base, 'index' + ext))) return path.join(base, 'index' + ext);
  return base;
}

const posix = (p) => p.split(path.sep).join('/');

/** Bundle a TS entry (given as source text) and import it. */
export async function bundleAndImport(entrySource, label = 'entry') {
  const esbuild = (await import('esbuild')).default;
  // Inside node_modules so bare imports (zod, react) resolve from the bundle.
  const tmp = path.join(ROOT, 'node_modules', '.cache', 'content-registry', `${label}-${process.pid}-${Math.random().toString(36).slice(2, 8)}`);
  await mkdir(tmp, { recursive: true });
  const outFile = path.join(tmp, 'bundle.mjs');
  await esbuild.build({
    stdin: { contents: entrySource, resolveDir: SRC, loader: 'ts' },
    bundle: true,
    format: 'esm',
    platform: 'node',
    target: 'node18',
    outfile: outFile,
    plugins: registryPlugins,
    // React is only reached through the markdown renderer's component; keep it out.
    external: ['react', 'react/jsx-runtime', 'react-dom'],
    define: { 'import.meta.env.DEV': 'false', 'import.meta.env.PROD': 'true' },
    logLevel: 'silent'
  });
  try {
    return await import(pathToFileURL(outFile).href + `?t=${Date.now()}`);
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
}

let specsCache = null;

/** The content specs plus whatever else src/app/content-specs.ts exports. */
export async function loadSpecs() {
  if (!specsCache) {
    specsCache = await bundleAndImport(
      `export * from ${JSON.stringify(posix(path.relative(SRC, SPECS_ENTRY)).replace(/^/, './'))};\n` +
        `export { matchesSpec, validateRecords, formatIssues } from './platform/content-registry/index';`,
      'specs'
    );
  }
  return specsCache;
}

/** Recursively list files under dir, as POSIX paths relative to dir. */
export async function listFiles(dirAbs) {
  const out = [];
  const walk = async (d) => {
    for (const entry of await readdir(d, { withFileTypes: true })) {
      const full = path.join(d, entry.name);
      if (entry.isDirectory()) await walk(full);
      else out.push(posix(path.relative(dirAbs, full)));
    }
  };
  await walk(dirAbs);
  return out.sort();
}

/** The content files a spec matches on disk, relative to its dir. */
export async function discoverFiles(spec, registry) {
  const dirAbs = path.join(SRC, spec.dir);
  const all = await listFiles(dirAbs);
  return all.filter((f) => registry.matchesSpec(spec, f));
}

/**
 * Load one content kind: discover, import, validate.
 * Returns { spec, files, items, records, issues }.
 */
export async function loadContent(kind) {
  const registry = await loadSpecs();
  const spec = registry.CONTENT_SPECS.find((s) => s.kind === kind);
  if (!spec) throw new Error(`unknown content kind "${kind}"`);

  const files = await discoverFiles(spec, registry);
  const dirAbs = path.join(SRC, spec.dir);

  let raw = [];
  if (spec.shape === 'text') {
    for (const file of files) {
      const text = await readFile(path.join(dirAbs, file), 'utf8');
      raw.push({ item: spec.parse ? spec.parse(text, file) : text, file, index: 0 });
    }
  } else {
    const imports = files
      .map((f, i) => `import * as m${i} from ${JSON.stringify('./' + posix(path.join(spec.dir, f)))};`)
      .join('\n');
    const list = files.map((f, i) => `{ file: ${JSON.stringify(f)}, mod: m${i} }`).join(',\n  ');
    const mod = await bundleAndImport(`${imports}\nexport const modules = [\n  ${list}\n];\n`, spec.kind);
    for (const { file, mod: m } of mod.modules) {
      const exported = m[spec.exportName ?? 'default'];
      if (exported === undefined) {
        raw.push({ item: undefined, file, index: 0 });
        continue;
      }
      if (spec.shape === 'array') {
        if (!Array.isArray(exported)) throw new Error(`${spec.dir}/${file}: "${spec.exportName}" is not an array`);
        exported.forEach((item, index) => raw.push({ item, file, index }));
      } else raw.push({ item: exported, file, index: 0 });
    }
  }

  const result = registry.validateRecords(spec, raw);
  return { spec, files, ...result };
}

/** Load every content kind. */
export async function loadAllContent() {
  const registry = await loadSpecs();
  const out = {};
  for (const spec of registry.CONTENT_SPECS) out[spec.kind] = await loadContent(spec.kind);
  return out;
}

export function formatIssuesFor(spec, issues) {
  return [
    `${issues.length} problem(s) in ${spec.kind} content:`,
    ...issues.map((i) => `  ✗ src/${spec.dir}/${i.file}: ${i.message}`)
  ].join('\n');
}
