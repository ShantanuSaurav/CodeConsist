#!/usr/bin/env node
/**
 * Quality lint for authored challenges.
 *
 * validate-content.mjs answers "is this challenge correct and solvable?".
 * This answers "is this challenge any GOOD?" - the mechanically detectable
 * subset of what a human reviewer catches:
 *
 *   - hints that hand over the answer verbatim
 *   - options that are duplicates once you normalise them
 *   - the correct option being reliably the longest (a classic tell)
 *   - correctIndex concentrated on one position across the bank
 *   - near-duplicate challenges inside a stage
 *   - explanations too thin to teach anything
 *
 * These are WARNINGS, not errors: each one needs a human to judge. Exits 0
 * unless --strict is passed.
 */
import { readdir, mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import esbuild from 'esbuild';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CHALLENGE_DIR = path.join(ROOT, 'src', 'data', 'challenges');
const TMP = path.join(ROOT, 'node_modules', '.cache', `codequest-lint-${process.pid}`);

const strict = process.argv.includes('--strict');
const filter = process.argv.slice(2).filter((a) => !a.startsWith('-'));

const findings = [];
const note = (id, kind, message) => findings.push({ id, kind, message });

/* ---------------------------------------------------------------- helpers */

/** Lowercase, collapse whitespace, drop punctuation that varies by phrasing. */
const norm = (s) =>
  String(s ?? '')
    .toLowerCase()
    .replace(/[`"'’]/g, '')
    .replace(/[^a-z0-9_$.+\-*/%<>=!&|[\]() ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

/** Content words, for overlap comparisons. */
const STOP = new Set(
  'the a an of to in on for and or is are was were be been it its this that these those with as at by from what which does do you your will not no if then else return'.split(
    ' '
  )
);
const words = (s) => norm(s).split(' ').filter((w) => w.length > 2 && !STOP.has(w));

function jaccard(a, b) {
  const A = new Set(a);
  const B = new Set(b);
  if (!A.size || !B.size) return 0;
  let shared = 0;
  for (const w of A) if (B.has(w)) shared++;
  return shared / (A.size + B.size - shared);
}

/* ----------------------------------------------------------------- checks */

function correctOptionTexts(c) {
  if (!Array.isArray(c.options)) return [];
  if (c.type === 'multi_select') return (c.correctIndices ?? []).map((i) => c.options[i]).filter(Boolean);
  if (typeof c.correctIndex === 'number') return [c.options[c.correctIndex]].filter(Boolean);
  return [];
}

function checkHintLeakage(c) {
  const hints = c.hints ?? [];
  if (!hints.length) return;

  for (const [i, hint] of hints.entries()) {
    const h = norm(hint);
    if (!h) continue;

    // The literal text of a correct option appearing inside a hint.
    for (const option of correctOptionTexts(c)) {
      const o = norm(option);
      if (o.length >= 8 && h.includes(o)) {
        note(c.id, 'hint-leak', `hint ${i + 1} contains the correct option verbatim ("${option}")`);
      }
    }

    // A fill-in-the-blank answer spelled out in a hint.
    //
    // A word that already appears in the challenge's own snippet or title is
    // not a leak - `await` shows up elsewhere in the very code being completed,
    // and a hint cannot avoid the vocabulary the exercise is written in.
    // Matched case-sensitively and un-normalised: these are code identifiers,
    // where `Set` the type and `set` the Map method are different things.
    const onScreen = `${c.title} ${c.codeSnippet ?? ''}`;

    for (const [b, blank] of (c.blanks ?? []).entries()) {
      const answer = String(blank.answer ?? '');
      if (answer.length < 3) continue;

      const word = new RegExp(
        `(^|[^A-Za-z0-9_])${answer.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^A-Za-z0-9_]|$)`
      );
      if (word.test(onScreen)) continue;

      if (word.test(hint)) {
        note(c.id, 'hint-leak', `hint ${i + 1} names blank ${b + 1}'s answer ("${answer}")`);
      }
    }
  }
}

/**
 * Options are usually code literals, where punctuation IS the difference:
 * `0` and `"0"`, `[]` and `{}`, `==` and `===`. Compare them almost verbatim -
 * only whitespace is noise.
 */
const normOption = (s) => String(s ?? '').trim().replace(/\s+/g, ' ');

function checkOptions(c) {
  if (!Array.isArray(c.options) || c.options.length < 2) return;

  const seen = new Map();
  for (const [i, option] of c.options.entries()) {
    const key = normOption(option);
    if (seen.has(key)) {
      note(c.id, 'dup-option', `options ${seen.get(key) + 1} and ${i + 1} are the same once normalised`);
    } else {
      seen.set(key, i);
    }
    if (!String(option).trim()) note(c.id, 'empty-option', `option ${i + 1} is blank`);
  }

  // "The longest option is the right one" is the oldest tell in test writing.
  const correct = correctOptionTexts(c);
  if (correct.length === 1 && c.options.length >= 3) {
    const lengths = c.options.map((o) => String(o).length);
    const correctLen = String(correct[0]).length;
    const maxOther = Math.max(...lengths.filter((_, i) => i !== c.correctIndex));
    if (correctLen > maxOther * 1.6 && correctLen - maxOther > 25) {
      note(c.id, 'length-tell', `the correct option is far longer than every distractor (${correctLen} vs ${maxOther} chars)`);
    }
  }
}

function checkExplanation(c) {
  const e = String(c.explanation ?? '');
  if (e.length < 40) note(c.id, 'thin-explanation', `explanation is only ${e.length} characters`);

  // An explanation that is just the correct option restated teaches nothing.
  const correct = correctOptionTexts(c);
  if (correct.length === 1) {
    const o = norm(correct[0]);
    if (o.length > 10 && norm(e).replace(o, '').replace(/[^a-z0-9]/g, '').length < 25) {
      note(c.id, 'restated-explanation', 'explanation is little more than the correct option repeated');
    }
  }
}

function checkPrompt(c) {
  const p = norm(c.prompt);
  for (const option of correctOptionTexts(c)) {
    const o = norm(option);
    if (o.length >= 10 && p.includes(o)) {
      note(c.id, 'prompt-leak', `the prompt contains the correct option verbatim ("${option}")`);
    }
  }
  if (/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(`${c.prompt}${c.explanation}${(c.options ?? []).join('')}`)) {
    note(c.id, 'emoji', 'emoji in prompt, options or explanation (the style guide forbids it)');
  }
}

/* -------------------------------------------------------------------- main */

async function load() {
  await mkdir(TMP, { recursive: true });
  let files = (await readdir(CHALLENGE_DIR)).filter((f) => f.endsWith('.ts')).sort();
  if (filter.length) files = files.filter((f) => filter.some((s) => f.includes(s)));

  const rel = (t) => {
    const r = path.relative(TMP, t).split(path.sep).join('/');
    return r.startsWith('.') ? r : './' + r;
  };
  const entry = path.join(TMP, 'entry.mjs');
  await writeFile(
    entry,
    files
      .map((f, i) => `export { challenges as c${i} } from ${JSON.stringify(rel(path.join(CHALLENGE_DIR, f)))};`)
      .join('\n') +
      `\nexport { optionOrder, choiceOrder } from ${JSON.stringify(rel(path.join(ROOT, 'src', 'lib', 'checkAnswer.ts')))};\n`,
    'utf8'
  );

  const out = path.join(TMP, 'bundle.mjs');
  await esbuild.build({
    entryPoints: [entry],
    bundle: true,
    format: 'esm',
    platform: 'node',
    target: 'node18',
    outfile: out,
    logLevel: 'silent'
  });

  const mod = await import(pathToFileURL(out).href);
  const all = files.flatMap((_, i) => mod['c' + i] ?? []);
  const optionOrder = mod.optionOrder;
  const choiceOrder = mod.choiceOrder;
  await rm(TMP, { recursive: true, force: true });
  return { all, fileCount: files.length, optionOrder, choiceOrder };
}

const { all, fileCount, optionOrder, choiceOrder } = await load();

for (const c of all) {
  checkHintLeakage(c);
  checkOptions(c);
  checkExplanation(c);
  checkPrompt(c);
}

/* Near-duplicate challenges within a stage. */
const byStage = new Map();
for (const c of all) {
  if (!byStage.has(c.stageId)) byStage.set(c.stageId, []);
  byStage.get(c.stageId).push(c);
}
for (const [, group] of byStage) {
  for (let i = 0; i < group.length; i++) {
    for (let j = i + 1; j < group.length; j++) {
      const a = group[i];
      const b = group[j];
      const sim = jaccard(
        words(`${a.title} ${a.prompt} ${a.codeSnippet ?? ''}`),
        words(`${b.title} ${b.prompt} ${b.codeSnippet ?? ''}`)
      );
      if (sim > 0.5) {
        note(a.id, 'near-duplicate', `looks like ${b.id} "${b.title}" (${Math.round(sim * 100)}% word overlap)`);
      }
    }
  }
}

/* Answer-position bias across the whole bank. */
const positions = {};
let single = 0;
for (const c of all) {
  if ((c.type === 'quiz' || c.type === 'output_prediction') && typeof c.correctIndex === 'number') {
    // The position the learner actually SEES, after the UI's display shuffle.
    const shown = optionOrder(c).indexOf(c.correctIndex);
    positions[shown] = (positions[shown] ?? 0) + 1;
    single++;
  }
}

/* Blank-choice bias: the answer's DISPLAYED position among a blank's chips. */
const blankPositions = {};
let blanksWithChoices = 0;
for (const c of all) {
  if (c.type !== 'fill_blank') continue;
  (c.blanks ?? []).forEach((b, i) => {
    if (!Array.isArray(b.choices) || b.choices.length < 2) return;
    const shown = choiceOrder(c, i, b.choices).indexOf(b.answer);
    blankPositions[shown] = (blankPositions[shown] ?? 0) + 1;
    blanksWithChoices++;
  });
}

/* --------------------------------------------------------------- reporting */

console.log(`\nLinted ${all.length} challenges across ${fileCount} file(s).\n`);

if (single > 0) {
  const spread = Object.entries(positions)
    .sort(([a], [b]) => Number(a) - Number(b))
    .map(([i, n]) => `${i}:${n} (${Math.round((n / single) * 100)}%)`)
    .join('  ');
  console.log(`  answer position as displayed, over ${single} single-answer challenges -> ${spread}`);
  const worst = Math.max(...Object.values(positions));
  if (worst / single > 0.4) {
    console.log(`  ^ warning: ${Math.round((worst / single) * 100)}% of answers sit at one position; a learner could guess it.\n`);
  } else {
    console.log('');
  }
}

if (blanksWithChoices > 0) {
  const spread = Object.entries(blankPositions)
    .sort(([a], [b]) => Number(a) - Number(b))
    .map(([i, n]) => `${i}:${n} (${Math.round((n / blanksWithChoices) * 100)}%)`)
    .join('  ');
  console.log(`  blank answer position as displayed, over ${blanksWithChoices} blanks with chips -> ${spread}`);
  const worst = Math.max(...Object.values(blankPositions));
  if (worst / blanksWithChoices > 0.5) {
    console.log(`  ^ warning: ${Math.round((worst / blanksWithChoices) * 100)}% of blank answers land on one chip position.\n`);
  } else {
    console.log('');
  }
}

if (!findings.length) {
  console.log('  No quality warnings.\n');
  process.exit(0);
}

const grouped = new Map();
for (const f of findings) {
  if (!grouped.has(f.kind)) grouped.set(f.kind, []);
  grouped.get(f.kind).push(f);
}

console.log(`  ${findings.length} warning(s):\n`);
for (const [kind, list] of [...grouped].sort((a, b) => b[1].length - a[1].length)) {
  console.log(`  ${kind} (${list.length})`);
  for (const f of list) console.log(`    ${f.id}: ${f.message}`);
  console.log('');
}

process.exit(strict ? 1 : 0);
