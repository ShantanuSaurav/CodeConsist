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
const CHECK_LINKS = process.argv.includes('--links');

const { loadContent, loadSpecs, bundleAndImport, formatIssuesFor } = await import(
  '../src/platform/content-registry/loader.build.mjs'
);

const [articlesLoad, roadmapsLoad, challengesLoad, specs] = await Promise.all([
  loadContent('articles'),
  loadContent('roadmaps'),
  loadContent('challenges'),
  loadSpecs()
]);
for (const l of [articlesLoad, roadmapsLoad, challengesLoad]) {
  if (l.issues.length) {
    console.log(formatIssuesFor(l.spec, l.issues));
    process.exit(1);
  }
}
const ARTICLES = articlesLoad.items;
const ROADMAPS = roadmapsLoad.items;
const ALL_CHALLENGES = challengesLoad.items;
const STAGE_META = specs.STAGE_META;
const { STATIC_ROUTES } = await bundleAndImport("export { STATIC_ROUTES } from './config/routes';", 'routes');

// Same matching rule the articles module uses at runtime (kept in step by the parity check).
const ARTICLE_BY_STAGE = new Map(ARTICLES.map((a) => [a.stageId, a]));
function sectionFor(challenge) {
  const article = ARTICLE_BY_STAGE.get(challenge.stageId);
  if (!article || article.sections.length === 0) return null;
  const tags = new Set((challenge.tags ?? []).map((t) => t.toLowerCase()));
  let best = article.sections[0];
  let bestScore = 0;
  for (const s of article.sections) {
    const score = s.tags.reduce((n, t) => n + (tags.has(t.toLowerCase()) ? 1 : 0), 0);
    if (score > bestScore) {
      best = s;
      bestScore = score;
    }
  }
  return { article, section: best };
}

const errors = [];
const warnings = [];

/* ------------------------------------------------------------- articles */

const articleByStage = new Map(ARTICLES.map((a) => [a.stageId, a]));
// Every article must belong to a real stage; a stage without an article is a
// gap to author, not a broken build - the C and C++ tracks ship with concept
// teaching inside their lessons and no stage article yet, and the UI simply
// offers no "Read first" for them. It is reported, never hidden.
const stagesWithoutArticle = [];
for (const a of ARTICLES) {
  if (!STAGE_META.some((s) => s.id === a.stageId)) errors.push(`article "${a.stageId}" names a stage that does not exist`);
}
for (const stage of STAGE_META) {
  const a = articleByStage.get(stage.id);
  if (!a) {
    stagesWithoutArticle.push(stage.id);
    warnings.push(`${stage.id}: no article - the stage card offers no "Read first"`);
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
let noArticle = 0;
for (const c of ALL_CHALLENGES) {
  const m = sectionFor(c);
  if (!m) {
    if (stagesWithoutArticle.includes(c.stageId)) noArticle++;
    else errors.push(`${c.id}: no article for its stage`);
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

const KNOWN_ROUTES = STATIC_ROUTES;
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
const withArticle = ALL_CHALLENGES.length - noArticle;
console.log(`Challenges matched to a section by tag: ${withArticle - unmatched}/${withArticle}${noArticle ? ` (${noArticle} more in stages that have no article yet: ${stagesWithoutArticle.join(", ")})` : ""}`);

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
