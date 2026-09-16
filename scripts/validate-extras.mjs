#!/usr/bin/env node
/**
 * Validate the reading material and the roadmaps.
 *
 *   node scripts/validate-extras.mjs          structure only
 *   node scripts/validate-extras.mjs --links  also HEAD/GET every external URL
 *
 * Checks: every stage has an article with sections; section ids are unique;
 * every challenge in a stage matches at least one section by tag (reported,
 * not fatal - the modal falls back to the first section); roadmap slugs and
 * node ids are unique; every node has a description and at least one
 * resource; every resource URL parses; internal links point at real routes.
 */
import { mkdir, readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const CHECK_LINKS = process.argv.includes('--links');

const esbuild = (await import('esbuild')).default;

// `import x from './file.md?raw'` is a Vite idiom; teach esbuild the same.
const rawPlugin = {
  name: 'raw-md',
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
};

// Inside node_modules so the bundle's bare "react" import resolves.
const tmp = path.join(ROOT, 'node_modules', '.cache', `validate-extras-${process.pid}`);
await mkdir(tmp, { recursive: true });
const outFile = path.join(tmp, 'extras.mjs');
await esbuild.build({
  stdin: {
    contents: [
      "export { ARTICLES, sectionFor } from './articles/index';",
      "export { ROADMAPS } from './roadmaps/index';",
      "export { ALL_CHALLENGES } from './index';",
      "export { STAGE_META } from './stages';"
    ].join('\n'),
    resolveDir: path.join(ROOT, 'src', 'data'),
    loader: 'ts'
  },
  bundle: true,
  format: 'esm',
  platform: 'node',
  target: 'node18',
  outfile: outFile,
  plugins: [rawPlugin],
  // The markdown renderer imports React components; stub the JSX runtime.
  external: ['react', 'react/jsx-runtime'],
  logLevel: 'silent'
});

const mod = await import(pathToFileURL(outFile).href);
await rm(tmp, { recursive: true, force: true });

const { ARTICLES, sectionFor, ROADMAPS, ALL_CHALLENGES, STAGE_META } = mod;

const errors = [];
const warnings = [];

/* ------------------------------------------------------------- articles */

const articleByStage = new Map(ARTICLES.map((a) => [a.stageId, a]));
for (const stage of STAGE_META) {
  const a = articleByStage.get(stage.id);
  if (!a) {
    errors.push(`${stage.id}: no article`);
    continue;
  }
  if (!a.title || a.title === stage.id) errors.push(`${stage.id}: article has no "# " title`);
  if (!a.summary) warnings.push(`${stage.id}: article has no "> " summary`);
  if (a.sections.length < 4) errors.push(`${stage.id}: only ${a.sections.length} sections`);
  const ids = new Set();
  for (const s of a.sections) {
    if (ids.has(s.id)) errors.push(`${stage.id}: duplicate section id "${s.id}"`);
    ids.add(s.id);
    if (s.body.length < 200) warnings.push(`${stage.id}/${s.id}: thin section (${s.body.length} chars)`);
    if (s.tags.length === 0) warnings.push(`${stage.id}/${s.id}: no tags - nothing links here`);
    const fences = (s.body.match(/```/g) ?? []).length;
    if (fences % 2 !== 0) errors.push(`${stage.id}/${s.id}: unbalanced code fence`);
  }
}

let unmatched = 0;
for (const c of ALL_CHALLENGES) {
  const m = sectionFor(c);
  if (!m) {
    errors.push(`${c.id}: no article for its stage`);
    continue;
  }
  const tags = new Set((c.tags ?? []).map((t) => t.toLowerCase()));
  const hit = m.section.tags.some((t) => tags.has(t.toLowerCase()));
  if (!hit) {
    unmatched++;
    warnings.push(`${c.id} (${(c.tags ?? []).join(', ') || 'no tags'}): falls back to "${m.section.title}"`);
  }
}

/* ------------------------------------------------------------- roadmaps */

const KNOWN_ROUTES = ['/dashboard', '/dashboard/learn', '/dashboard/challenges', '/dashboard/practice', '/dashboard/roadmap', '/dashboard/leaderboard', '/dashboard/achievements', '/dashboard/settings'];
const slugs = new Set();
const urls = new Map(); // url -> where
for (const r of ROADMAPS) {
  if (slugs.has(r.slug)) errors.push(`duplicate roadmap slug ${r.slug}`);
  slugs.add(r.slug);
  if (!/^https:\/\/roadmap\.sh\//.test(r.roadmapShUrl)) errors.push(`${r.slug}: roadmapShUrl is not a roadmap.sh link`);
  const nodeIds = new Set();
  let nodes = 0;
  for (const s of r.sections) {
    if (s.nodes.length === 0) errors.push(`${r.slug}/${s.id}: empty section`);
    for (const n of s.nodes) {
      nodes++;
      if (nodeIds.has(n.id)) errors.push(`${r.slug}: duplicate node id "${n.id}"`);
      nodeIds.add(n.id);
      if (!n.description || n.description.length < 40) errors.push(`${r.slug}/${n.id}: description too short`);
      if (n.resources.length === 0) errors.push(`${r.slug}/${n.id}: no resources`);
      if (n.stageId && !STAGE_META.some((st) => st.id === n.stageId)) errors.push(`${r.slug}/${n.id}: unknown stageId ${n.stageId}`);
      for (const res of n.resources) {
        if (res.url.startsWith('/')) {
          if (!KNOWN_ROUTES.includes(res.url.split('#')[0])) errors.push(`${r.slug}/${n.id}: unknown internal route ${res.url}`);
          continue;
        }
        try {
          new URL(res.url);
        } catch {
          errors.push(`${r.slug}/${n.id}: bad URL ${res.url}`);
          continue;
        }
        if (!urls.has(res.url)) urls.set(res.url, `${r.slug}/${n.id}`);
      }
    }
  }
  if (nodes < 12) warnings.push(`${r.slug}: only ${nodes} nodes`);
}

/* ---------------------------------------------------------------- links */

let linkFailures = 0;
if (CHECK_LINKS) {
  const list = [...urls.entries()];
  console.log(`Checking ${list.length} external links…`);
  const check = async (url) => {
    const attempt = async (method) => {
      const ctl = new AbortController();
      const t = setTimeout(() => ctl.abort(), 15000);
      try {
        const res = await fetch(url, {
          method,
          redirect: 'follow',
          signal: ctl.signal,
          headers: { 'user-agent': 'Mozilla/5.0 (compatible; devlingo-linkcheck/1.0)' }
        });
        return res.status;
      } finally {
        clearTimeout(t);
      }
    };
    try {
      let status = await attempt('HEAD');
      if (status === 405 || status === 403 || status === 404 || status >= 500) status = await attempt('GET');
      return status;
    } catch (err) {
      return `ERR ${err?.cause?.code ?? err?.name ?? err}`;
    }
  };
  let i = 0;
  const workers = Array.from({ length: 8 }, async () => {
    while (i < list.length) {
      const [url, where] = list[i++];
      const status = await check(url);
      const ok = typeof status === 'number' && status < 400;
      if (!ok) {
        linkFailures++;
        console.log(`  ✗ ${status}  ${url}   (${where})`);
      }
    }
  });
  await Promise.all(workers);
}

/* --------------------------------------------------------------- report */

const totalNodes = ROADMAPS.reduce((n, r) => n + r.sections.reduce((m, s) => m + s.nodes.length, 0), 0);
console.log(`Articles: ${ARTICLES.length} (${ARTICLES.reduce((n, a) => n + a.sections.length, 0)} sections, ~${ARTICLES.reduce((n, a) => n + a.readingMinutes, 0)} min)`);
console.log(`Roadmaps: ${ROADMAPS.length} (${totalNodes} topics, ${urls.size} distinct external links)`);
console.log(`Challenges matched to a section by tag: ${ALL_CHALLENGES.length - unmatched}/${ALL_CHALLENGES.length}`);

if (warnings.length) {
  console.log(`\n${warnings.length} warning(s):`);
  for (const w of warnings) console.log('  - ' + w);
}
if (errors.length) {
  console.log(`\n${errors.length} error(s):`);
  for (const e of errors) console.log('  ✗ ' + e);
}
if (CHECK_LINKS) console.log(`\nBroken links: ${linkFailures}`);

if (errors.length || linkFailures) process.exit(1);
console.log('\nReading material and roadmaps valid.');
