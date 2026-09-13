#!/usr/bin/env node
/**
 * Validate every authored challenge.
 *
 *   node scripts/validate-content.mjs                 # all files
 *   node scripts/validate-content.mjs algorithms-a    # only matching files
 *
 * Checks structure per challenge type, uniqueness of ids, and - for JavaScript
 * `code_runner` / `debug` challenges - actually executes `solutionCode`
 * against every test case in a sandboxed VM. Exits non-zero on any error.
 */
import { readdir, mkdir, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';
import vm from 'node:vm';
import esbuild from 'esbuild';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CHALLENGE_DIR = path.join(ROOT, 'src', 'data', 'challenges');
// Unique per process: several agents may validate different batches at once.
const TMP = path.join(
  ROOT,
  'node_modules',
  '.cache',
  'codequest-validate',
  `run-${process.pid}-${Math.random().toString(36).slice(2, 8)}`
);

const filter = process.argv.slice(2).filter((a) => !a.startsWith('-'));
const errors = [];
const warnings = [];

function err(where, message) {
  errors.push(`${where}: ${message}`);
}
function warn(where, message) {
  warnings.push(`${where}: ${message}`);
}

/* ---------------------------------------------------------------- helpers */

async function transpile(files) {
  await mkdir(TMP, { recursive: true });
  const entry = path.join(TMP, 'entry.mjs');
  const gradingPath = path.join(ROOT, 'src', 'lib', 'grading.ts');

  // esbuild resolves relative specifiers from the importer's directory and does
  // not understand file:// URLs, so emit POSIX-style relative paths.
  const rel = (target) => {
    const r = path.relative(TMP, target).split(path.sep).join('/');
    return r.startsWith('.') ? r : './' + r;
  };

  const imports = files
    .map((f, i) => `import { challenges as c${i} } from ${JSON.stringify(rel(f))};`)
    .join('\n');
  const list = files
    .map((f, i) => `{ file: ${JSON.stringify(path.basename(f))}, challenges: c${i} }`)
    .join(',\n  ');

  await writeFile(
    entry,
    `${imports}\nexport * as grading from ${JSON.stringify(rel(gradingPath))};\n` +
      `export const batches = [\n  ${list}\n];\n`,
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
  return out;
}

const TYPES = new Set([
  'quiz',
  'multi_select',
  'output_prediction',
  'fill_blank',
  'pseudocode_order',
  'debug',
  'code_runner'
]);
const DIFFICULTIES = new Set(['easy', 'medium', 'hard']);
const EXECUTABLE = new Set(['javascript', 'python']);

/**
 * Mirrors server/runner/js-runner.mjs on the three things that decide a grade:
 * a bare context with no host objects, strict mode, and invoking the entry
 * INSIDE the context so the vm timeout actually bounds it. A host-side
 * `fn(...args)` is outside the vm's control - a planted infinite loop in a
 * `debug` starter used to hang `npm run check` forever.
 */
function runJsSolution(challenge) {
  const { solutionCode, entryFunction, testCases = [] } = challenge;
  const context = vm.createContext(Object.create(null));
  vm.runInContext(
    'var __logs = []; globalThis.console = { log: function(){ __logs.push([].slice.call(arguments).join(" ")); }, error: function(){}, warn: function(){}, info: function(){} };',
    context
  );
  const results = [];

  try {
    new vm.Script(`"use strict";\n${solutionCode}`).runInContext(context, { timeout: 3000 });
    const defined = new vm.Script(
      `globalThis.__entry = typeof ${entryFunction} === 'function' ? ${entryFunction} : null; globalThis.__entry !== null`
    ).runInContext(context, { timeout: 1000 });
    if (!defined) {
      return { fatal: `entryFunction "${entryFunction}" is not defined by solutionCode` };
    }
  } catch (e) {
    return { fatal: `solutionCode failed to evaluate: ${e.message}` };
  }

  for (const tc of testCases) {
    try {
      const actual = new vm.Script(`__entry(...[${tc.input}])`).runInContext(context, { timeout: 2000 });
      results.push({ tc, actual });
    } catch (e) {
      const timedOut = /timed out/i.test(e?.message ?? '');
      results.push({ tc, error: timedOut ? 'timed out after 2000ms (infinite loop?)' : e.message });
    }
  }
  return { results };
}

/* ------------------------------------------------------------ python runner */

let pythonExe = null;
let pythonProbed = false;
const pythonStats = { executed: 0, skipped: 0, jsExecuted: 0 };

/** Find a local CPython, once. Returns null when there is none. */
function findPython() {
  if (pythonProbed) return pythonExe;
  pythonProbed = true;
  for (const candidate of ['python3', 'python', 'py']) {
    try {
      const out = execFileSync(candidate, ['-c', 'import sys; print(sys.version_info[0])'], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
        timeout: 5000
      });
      if (out.trim().startsWith('3')) {
        pythonExe = candidate;
        return pythonExe;
      }
    } catch {
      /* try the next one */
    }
  }
  return null;
}

/**
 * Run a Python solution against its test cases, mirroring what the browser
 * does: evaluate the source ONCE, then call the entry function per case. That
 * ordering is what makes a mutable-default-argument bug observable, so it has
 * to match or a `debug` challenge could look unsolvable here and fine in the app.
 */
function runPythonSolution(code, entryFunction, testCases) {
  const exe = findPython();
  if (!exe) return { skipped: true };

  const harness = `
import json, sys, traceback
_src = json.loads(sys.stdin.readline())
_cases = json.loads(sys.stdin.readline())
_ns = {}
try:
    exec(_src["code"], _ns)
except Exception:
    print(json.dumps({"fatal": traceback.format_exc(limit=1).strip().split("\\n")[-1]}))
    sys.exit(0)

_fn = _ns.get(_src["entry"])
if not callable(_fn):
    print(json.dumps({"fatal": "no function named " + _src["entry"]}))
    sys.exit(0)

_out = []
for _tc in _cases:
    try:
        _args = eval("(" + _tc + ",)", _ns)
        _value = _fn(*_args)
        try:
            _out.append({"json": json.dumps(_value)})
        except TypeError:
            _out.append({"json": json.dumps(repr(_value))})
    except Exception:
        _out.append({"error": traceback.format_exc(limit=1).strip().split("\\n")[-1]})
print(json.dumps({"results": _out}))
`;

  try {
    const stdout = execFileSync(exe, ['-c', harness], {
      input:
        JSON.stringify({ code, entry: entryFunction }) +
        '\n' +
        JSON.stringify(testCases.map((t) => t.input)) +
        '\n',
      encoding: 'utf8',
      timeout: 20000,
      stdio: ['pipe', 'pipe', 'pipe']
    });
    return JSON.parse(stdout.trim().split('\n').pop());
  } catch (e) {
    return { fatal: `python harness failed: ${(e.message || String(e)).slice(0, 200)}` };
  }
}

/* -------------------------------------------------------------- validation */

function validateChallenge(c, file, seenIds, grading) {
  const where = `${file} > ${c.id ?? '(missing id)'}`;

  for (const field of [
    'id',
    'stageId',
    'title',
    'type',
    'difficulty',
    'language',
    'prompt',
    'explanation'
  ]) {
    if (!c[field] || typeof c[field] !== 'string') err(where, `missing or non-string "${field}"`);
  }
  if (seenIds.has(c.id)) err(where, `duplicate id (also in ${seenIds.get(c.id)})`);
  else seenIds.set(c.id, file);

  if (!TYPES.has(c.type)) err(where, `unknown type "${c.type}"`);
  if (!DIFFICULTIES.has(c.difficulty)) err(where, `unknown difficulty "${c.difficulty}"`);
  if (typeof c.xpReward !== 'number' || c.xpReward <= 0) {
    err(where, 'xpReward must be a positive number');
  }
  if (c.explanation && c.explanation.length < 25) {
    warn(where, 'explanation looks too short to teach anything');
  }

  const optionTypes = ['quiz', 'output_prediction'];
  if (optionTypes.includes(c.type)) {
    if (!Array.isArray(c.options) || c.options.length < 3) {
      err(where, 'needs at least 3 options');
    } else if (
      typeof c.correctIndex !== 'number' ||
      c.correctIndex < 0 ||
      c.correctIndex >= c.options.length
    ) {
      err(where, `correctIndex ${c.correctIndex} is out of range`);
    }
    if (Array.isArray(c.options) && new Set(c.options).size !== c.options.length) {
      err(where, 'duplicate options');
    }
  }

  if (c.type === 'output_prediction' && !c.codeSnippet) {
    err(where, 'output_prediction needs a codeSnippet');
  }

  if (c.type === 'multi_select') {
    if (!Array.isArray(c.options) || c.options.length < 4) {
      err(where, 'multi_select needs at least 4 options');
    }
    if (!Array.isArray(c.correctIndices) || c.correctIndices.length < 2) {
      err(where, 'multi_select needs at least 2 correctIndices');
    } else if (c.correctIndices.some((i) => i < 0 || i >= (c.options?.length ?? 0))) {
      err(where, 'correctIndices out of range');
    } else if (new Set(c.correctIndices).size !== c.correctIndices.length) {
      err(where, 'duplicate correctIndices');
    } else if (c.options && c.correctIndices.length === c.options.length) {
      err(where, 'every option marked correct');
    }
  }

  if (c.type === 'fill_blank') {
    const holes = (c.codeSnippet?.match(/___/g) ?? []).length;
    if (!c.codeSnippet) err(where, 'fill_blank needs a codeSnippet');
    else if (holes === 0) err(where, 'fill_blank codeSnippet has no ___ placeholder');
    if (!Array.isArray(c.blanks) || c.blanks.length === 0) err(where, 'fill_blank needs blanks[]');
    else {
      if (holes !== c.blanks.length) {
        err(where, `${holes} ___ placeholders but ${c.blanks.length} blanks`);
      }
      c.blanks.forEach((b, i) => {
        if (!b || typeof b.answer !== 'string' || !b.answer.trim()) {
          err(where, `blank ${i + 1} has no answer`);
        }
        if (b?.choices && !b.choices.includes(b.answer)) {
          err(where, `blank ${i + 1} answer is not among its choices`);
        }
      });
    }
  }

  if (c.type === 'pseudocode_order') {
    if (!Array.isArray(c.pseudocodeLines) || c.pseudocodeLines.length < 4) {
      err(where, 'pseudocode_order needs at least 4 pseudocodeLines');
    } else if (new Set(c.pseudocodeLines).size !== c.pseudocodeLines.length) {
      err(where, 'pseudocodeLines contains duplicates - order would be ambiguous');
    }
  }

  if (c.type === 'code_runner' || c.type === 'debug') {
    if (!EXECUTABLE.has(c.language)) {
      err(where, `${c.type} must be javascript or python (got "${c.language}")`);
    }
    if (!c.starterCode) err(where, 'needs starterCode');
    if (!c.entryFunction) err(where, 'needs entryFunction');
    if (!c.solutionCode) err(where, 'needs solutionCode');
    if (!Array.isArray(c.testCases) || c.testCases.length < 2) {
      err(where, 'needs at least 2 testCases');
    } else {
      c.testCases.forEach((tc, i) => {
        if (typeof tc.input !== 'string') err(where, `test ${i + 1} input must be a string`);
        if (typeof tc.expected !== 'string') err(where, `test ${i + 1} expected must be a string`);
        else if (!grading.parseExpected(tc.expected).ok) {
          warn(where, `test ${i + 1} expected "${tc.expected}" is not a JSON literal`);
        }
      });
    }
    if (
      c.type === 'debug' &&
      c.starterCode &&
      c.solutionCode &&
      c.starterCode.trim() === c.solutionCode.trim()
    ) {
      err(where, 'debug starterCode is identical to solutionCode - there is no bug to find');
    }

    if (c.language === 'javascript' && c.solutionCode && c.entryFunction && c.testCases?.length) {
      pythonStats.jsExecuted++;
      const outcome = runJsSolution(c);
      if (outcome.fatal) {
        err(where, outcome.fatal);
      } else {
        for (const r of outcome.results) {
          if (r.error) {
            err(where, `solution threw on ${c.entryFunction}(${r.tc.input}): ${r.error}`);
          } else if (!grading.matchesExpected(r.actual, r.tc.expected)) {
            err(
              where,
              `solution returned ${grading.displayValue(r.actual)} for ` +
                `${c.entryFunction}(${r.tc.input}), expected ${r.tc.expected}`
            );
          }
        }
      }
      if (c.type === 'debug' && c.starterCode) {
        const broken = runJsSolution({ ...c, solutionCode: c.starterCode });
        const stillPasses =
          !broken.fatal &&
          broken.results?.every((r) => !r.error && grading.matchesExpected(r.actual, r.tc.expected));
        if (stillPasses) err(where, 'debug starterCode already passes every test - the bug is missing');
      }
    }

    if (c.language === 'python' && c.solutionCode && c.entryFunction && c.testCases?.length) {
      const outcome = runPythonSolution(c.solutionCode, c.entryFunction, c.testCases);

      if (outcome.skipped) {
        pythonStats.skipped++;
      } else if (outcome.fatal) {
        err(where, `python solution failed to run: ${outcome.fatal}`);
      } else {
        pythonStats.executed++;
        outcome.results.forEach((r, i) => {
          const tc = c.testCases[i];
          if (r.error) {
            err(where, `solution threw on ${c.entryFunction}(${tc.input}): ${r.error}`);
            return;
          }
          const actual = JSON.parse(r.json);
          if (!grading.matchesExpected(actual, tc.expected)) {
            err(
              where,
              `solution returned ${grading.displayValue(actual)} for ` +
                `${c.entryFunction}(${tc.input}), expected ${tc.expected}`
            );
          }
        });

        if (c.type === 'debug' && c.starterCode) {
          const broken = runPythonSolution(c.starterCode, c.entryFunction, c.testCases);
          const stillPasses =
            !broken.fatal &&
            !broken.skipped &&
            broken.results?.every(
              (r, i) => !r.error && grading.matchesExpected(JSON.parse(r.json), c.testCases[i].expected)
            );
          if (stillPasses) err(where, 'debug starterCode already passes every test - the bug is missing');
        }
      }
    }
  }
}

/* -------------------------------------------------------------------- main */

async function main() {
  if (!existsSync(CHALLENGE_DIR)) {
    console.error(`No challenge directory at ${CHALLENGE_DIR}`);
    process.exit(1);
  }
  let files = (await readdir(CHALLENGE_DIR))
    .filter((f) => f.endsWith('.ts'))
    .map((f) => path.join(CHALLENGE_DIR, f))
    .sort();

  if (filter.length) files = files.filter((f) => filter.some((s) => path.basename(f).includes(s)));

  if (!files.length) {
    console.error('No challenge files matched.');
    process.exit(1);
  }

  let bundle;
  try {
    bundle = await transpile(files);
  } catch (e) {
    console.error('Failed to compile challenge files:\n' + (e.message || e));
    process.exit(1);
  }

  const mod = await import(pathToFileURL(bundle).href + `?t=${Date.now()}`);
  const seenIds = new Map();
  let total = 0;
  const byType = {};
  const byDifficulty = {};
  const byStage = {};

  for (const batch of mod.batches) {
    if (!Array.isArray(batch.challenges)) {
      err(batch.file, 'does not export a `challenges` array');
      continue;
    }
    if (batch.challenges.length === 0) err(batch.file, 'exports an empty challenges array');
    for (const c of batch.challenges) {
      total++;
      byType[c.type] = (byType[c.type] ?? 0) + 1;
      byDifficulty[c.difficulty] = (byDifficulty[c.difficulty] ?? 0) + 1;
      byStage[c.stageId] = (byStage[c.stageId] ?? 0) + 1;
      validateChallenge(c, batch.file, seenIds, mod.grading);
    }
  }

  await rm(TMP, { recursive: true, force: true });

  console.log(`\nChecked ${total} challenges across ${files.length} file(s).`);
  console.log('  by type:       ' + JSON.stringify(byType));
  console.log('  by difficulty: ' + JSON.stringify(byDifficulty));
  console.log('  by stage:      ' + JSON.stringify(byStage));

  // Say what was actually executed. "All challenges valid" over a set that
  // silently skipped every Python solution is a claim the run cannot support.
  console.log(
    `  executed:      ${pythonStats.jsExecuted} JavaScript solution(s), ${pythonStats.executed} Python`
  );
  if (pythonStats.skipped > 0) {
    console.log(
      `\n  NOTE: ${pythonStats.skipped} Python challenge(s) were NOT executed - no python3 on PATH.\n` +
        '        Structure was checked, but their solutions and test cases are unverified here.\n' +
        '        Install Python 3 to have them run, or rely on the browser (Pyodide) at runtime.'
    );
  }


  if (warnings.length) {
    console.log(`\n${warnings.length} warning(s):`);
    for (const w of warnings) console.log('  ! ' + w);
  }
  if (errors.length) {
    console.log(`\n${errors.length} ERROR(S):`);
    for (const e of errors) console.log('  x ' + e);
    process.exit(1);
  }
  console.log('\nAll challenges valid.\n');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
