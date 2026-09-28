/**
 * The content numbers the docs and the page meta quote, counted from the bank.
 * (No shebang: vite.config.ts imports this file, and Vite's config bundler
 * cannot inline a module that starts with one.)
 *
 * "232 lessons" was typed into README.md, package.json and index.html by
 * hand, and each drifted on its own (index.html still said 200 and "ten
 * stages" long after the C and C++ tracks arrived). Now the numbers come from
 * the same loader the server and the validators use, and `--check` fails
 * `npm run check` the moment a written copy falls behind.
 *
 *   node scripts/content-stats.mjs            print the numbers
 *   node scripts/content-stats.mjs --check    exit 1 if README.md or package.json is out of date
 *   node scripts/content-stats.mjs --write    rewrite them
 *
 * README.md: only the text between the content-stats markers is generated.
 * package.json: the `description` field. index.html is filled at build time
 * by scripts/vite-content-stats.mjs, so it has nothing to fall behind.
 *
 * Counts are of AUTHORED content. Questions an admin adds in the console come
 * on top, which is why the page meta rounds lessons down ("230+").
 */
import { realpathSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { formatIssuesFor, loadContent, loadSpecs } from '../src/platform/content-registry/loader.build.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const README = path.join(ROOT, 'README.md');
const PACKAGE_JSON = path.join(ROOT, 'package.json');

export const README_START = '<!-- content-stats:start -->';
export const README_END = '<!-- content-stats:end -->';

/**
 * Lessons, stage tests, stages and tracks in the authored bank, plus the
 * free/premium split and a per-track breakdown.
 */
export async function computeContentStats() {
  const { STAGE_META, LANGUAGE_TRACKS } = await loadSpecs();
  const loaded = await loadContent('challenges');
  if (loaded.issues.length) throw new Error(formatIssuesFor(loaded.spec, loaded.issues));
  const challenges = loaded.items;

  const isLesson = (c) => !c.isStageTest;
  const premiumStages = STAGE_META.filter((s) => s.isPremium).length;

  return {
    lessons: challenges.filter(isLesson).length,
    tests: challenges.filter((c) => c.isStageTest).length,
    stages: STAGE_META.length,
    tracks: LANGUAGE_TRACKS.length,
    freeStages: STAGE_META.length - premiumStages,
    premiumStages,
    byTrack: LANGUAGE_TRACKS.map((track) => {
      const ids = new Set(track.stageIds);
      return {
        id: track.id,
        label: track.label,
        stages: track.stageIds.length,
        lessons: challenges.filter((c) => ids.has(c.stageId) && isLesson(c)).length
      };
    })
  };
}

/** Lessons rounded down to a ten with a "+": questions added in the admin console never make it wrong. */
export function lessonsLabel(lessons) {
  return lessons >= 10 ? `${Math.floor(lessons / 10) * 10}+` : String(lessons);
}

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

/** The generated README paragraph (between the markers). */
export function readmeBlock(stats) {
  const tracks = stats.byTrack.map((t) => `${t.label}: ${plural(t.lessons, 'lesson')} in ${plural(t.stages, 'stage')}`).join(' · ');
  return (
    `**${plural(stats.lessons, 'lesson')} and ${plural(stats.tests, 'stage test')} across ` +
    `${plural(stats.stages, 'stage')} on ${plural(stats.tracks, 'track')}** ` +
    `(${stats.freeStages} free, ${stats.premiumStages} premium) - ${tracks}.`
  );
}

/** package.json `description`. */
export function packageDescription(stats) {
  return (
    `CodeConsist - the developer training environment. ${plural(stats.lessons, 'lesson')} and ` +
    `${plural(stats.tests, 'stage test')} across ${plural(stats.tracks, 'track')}, guided Learn mode, articles, ` +
    'roadmaps, real code execution and an admin console. Runs end to end on localhost.'
  );
}

/**
 * README text with the marked block regenerated, in the file's own line
 * endings (a Windows checkout has CRLF). Throws when the markers are missing.
 */
export function updateReadme(text, stats) {
  const start = text.indexOf(README_START);
  const end = text.indexOf(README_END);
  if (start === -1 || end === -1 || end < start) {
    throw new Error(`README.md needs a ${README_START} ... ${README_END} block for the content numbers.`);
  }
  const eol = text.includes('\r\n') ? '\r\n' : '\n';
  return text.slice(0, start + README_START.length) + eol + readmeBlock(stats) + eol + text.slice(end);
}

/** Line endings are the checkout's business, not a sign of stale numbers. */
const sameText = (a, b) => a.replace(/\r\n/g, '\n') === b.replace(/\r\n/g, '\n');

const DESCRIPTION_FIELD = /("description"\s*:\s*)"(?:[^"\\]|\\.)*"/;

/** package.json text with `description` regenerated, formatting untouched. */
export function updatePackageJson(text, stats) {
  if (!DESCRIPTION_FIELD.test(text)) throw new Error('package.json has no "description" field.');
  return text.replace(DESCRIPTION_FIELD, (_, key) => key + JSON.stringify(packageDescription(stats)));
}

async function main(argv) {
  const mode = argv.includes('--write') ? 'write' : argv.includes('--check') ? 'check' : 'print';
  const stats = await computeContentStats();

  if (mode === 'print') {
    console.log(JSON.stringify(stats, null, 2));
    return 0;
  }

  const files = [
    { file: README, name: 'README.md', update: updateReadme },
    { file: PACKAGE_JSON, name: 'package.json', update: updatePackageJson }
  ];
  const stale = [];
  for (const { file, name, update } of files) {
    const current = await readFile(file, 'utf8');
    const next = update(current, stats);
    if (sameText(next, current)) continue;
    stale.push(name);
    if (mode === 'write') await writeFile(file, next);
  }

  const summary = `${stats.lessons} lessons, ${stats.tests} stage tests, ${stats.stages} stages, ${stats.tracks} tracks`;
  if (mode === 'write') {
    console.log(stale.length ? `Updated ${stale.join(' and ')}: ${summary}.` : `Already up to date: ${summary}.`);
    return 0;
  }
  if (stale.length) {
    console.log(`Content numbers are out of date in ${stale.join(' and ')} (the bank has ${summary}).`);
    console.log('Run: node scripts/content-stats.mjs --write');
    return 1;
  }
  console.log(`Content numbers are current: ${summary}.`);
  return 0;
}

/**
 * Was this module the one node was asked to run? Compared as real paths:
 * Node resolves symlinks and junctions for import.meta.url but leaves
 * process.argv[1] as typed, so a checkout reached through a link would
 * otherwise look like an import - and `--check` would print nothing and exit 0
 * without checking anything.
 */
export function isDirectRun(moduleUrl, argv1) {
  if (!argv1) return false;
  try {
    return realpathSync(path.resolve(argv1)) === realpathSync(fileURLToPath(moduleUrl));
  } catch {
    return false;
  }
}

// Run only when invoked directly - vite.config.ts imports this file for its numbers.
if (isDirectRun(import.meta.url, process.argv[1])) {
  main(process.argv.slice(2)).then(
    (code) => process.exit(code),
    (err) => {
      console.error(err instanceof Error ? err.message : err);
      process.exit(1);
    }
  );
}
