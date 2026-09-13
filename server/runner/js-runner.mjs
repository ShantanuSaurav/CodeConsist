/**
 * Sandboxed JavaScript test runner. Spawned as a short-lived child process by
 * the /api/execute route so that a runaway loop or a thrown stack cannot take
 * the API server with it.
 *
 * Contract: JSON payload on stdin, JSON result on stdout, nothing else.
 *   in  { code, entryFunction, testCases: [{input, expected}], gradingPath }
 *   out { status, stdout, stderr, testResults }
 */
import vm from 'node:vm';

const CASE_TIMEOUT_MS = 2000;
const SETUP_TIMEOUT_MS = 3000;
const MAX_LOG_CHARS = 8000;

function readStdin() {
  return new Promise((resolve, reject) => {
    let buf = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk) => {
      buf += chunk;
    });
    process.stdin.on('end', () => resolve(buf));
    process.stdin.on('error', reject);
  });
}

/**
 * Build the execution context.
 *
 * This is the whole security boundary, so the rule is worth stating plainly:
 * NOTHING from the host realm is placed inside the context. Not builtins, and
 * not even a console callback.
 *
 * Every host-realm object - `Object`, `Array`, and a host function alike -
 * carries a .constructor that resolves to the HOST `Function`, and from there
 * `Function('return this')()` is the host global: the real `process`, with
 * env, fs bindings and spawn. The previous allow-list of host builtins handed
 * submitted code a full unauthenticated RCE through exactly that chain.
 *
 * A fresh context already has its own `Object`, `Array`, `Math`, `JSON`,
 * `Promise` and the rest, so the submission needs nothing passed in. The one
 * thing it needs that a bare context lacks is `console` - so that is defined
 * INSIDE the context, writing to a context-realm array, and the host reads
 * that array out afterwards. Host reading sandbox objects is safe; sandbox
 * reaching host objects is the thing that must never happen.
 */
function makeContext() {
  // codeGeneration off: no eval / new Function / WebAssembly inside the sandbox.
  // Not the primary boundary (that is 'no host objects cross in'), but it removes
  // a whole class of trick for free.
  const context = vm.createContext(Object.create(null), {
    codeGeneration: { strings: false, wasm: false }
  });
  vm.runInContext(
    `
    var __cq_logs = [];
    var __cq_len = 0;
    (function () {
      var MAX = ${MAX_LOG_CHARS};
      function fmt(a) {
        if (typeof a === 'string') return a;
        try { var s = JSON.stringify(a); return s === undefined ? String(a) : s; }
        catch (e) { return String(a); }
      }
      function push(prefix) {
        return function () {
          if (__cq_len >= MAX) return;
          var line = prefix;
          for (var i = 0; i < arguments.length; i++) line += (i ? ' ' : '') + fmt(arguments[i]);
          var room = MAX - __cq_len;
          if (line.length > room) line = line.slice(0, room) + '… [output truncated]';
          __cq_logs.push(line);
          __cq_len += line.length;
        };
      }
      var log = push('');
      var err = push('error: ');
      globalThis.console = { log: log, info: log, debug: log, warn: log, error: err };
    })();
    `,
    context,
    { filename: 'console.js' }
  );
  return context;
}

/** Everything the submission printed, joined. Read from outside the context. */
function readLogs(context) {
  try {
    const lines = vm.runInContext('__cq_logs', context);
    return Array.from(lines, (l) => String(l)).join('\n');
  } catch {
    return '';
  }
}

async function main() {
  const raw = await readStdin();
  let payload;
  try {
    payload = JSON.parse(raw);
  } catch (e) {
    process.stdout.write(JSON.stringify({ status: 'error', stderr: 'Malformed runner payload' }));
    return;
  }

  const { code, entryFunction, testCases = [], gradingPath } = payload;
  const grading = await import(gradingPath);

  const context = makeContext();
  const logs = { get text() { return readLogs(context); } };

  // 1. Evaluate the submission.
  let hasEntry = false;
  try {
    // Strict mode, for parity with the browser worker and the validator: the
    // same submission must grade the same way on every engine.
    new vm.Script('"use strict";\n' + String(code), { filename: 'submission.js' }).runInContext(context, {
      timeout: SETUP_TIMEOUT_MS
    });
    if (entryFunction) {
      hasEntry = new vm.Script(
        `globalThis.__entry = typeof ${entryFunction} === 'function' ? ${entryFunction} : null;` +
          `globalThis.__entry !== null`,
        { filename: 'entry.js' }
      ).runInContext(context, { timeout: 1000 });
    }
  } catch (e) {
    const timedOut = /timed out/i.test(e?.message ?? '');
    process.stdout.write(
      JSON.stringify({
        status: 'error',
        stdout: logs.text,
        stderr: timedOut
          ? `Your code ran for over ${SETUP_TIMEOUT_MS}ms without finishing. That usually means a loop whose condition never becomes false.`
          : `${e.name ?? 'Error'}: ${e.message}`,
        testResults: []
      })
    );
    return;
  }

  // 2. No test cases means "just run it and show me the output".
  if (!testCases.length) {
    process.stdout.write(
      JSON.stringify({
        status: 'passed',
        stdout: logs.text,
        testResults: []
      })
    );
    return;
  }

  if (!hasEntry) {
    process.stdout.write(
      JSON.stringify({
        status: 'error',
        stdout: logs.text,
        stderr: `ReferenceError: no function named "${entryFunction}" was defined. Check the spelling and make sure it is declared at the top level.`,
        testResults: []
      })
    );
    return;
  }

  // 3. Run every case, isolating failures so one bad case still reports the rest.
  const testResults = [];
  let allPassed = true;

  for (const tc of testCases) {
    const before = logs.text.length;
    const started = process.hrtime.bigint();
    try {
      // Invoke *inside* the context so the vm timeout actually bounds the call.
      // A host-side `entry(...)` would spin forever on an infinite loop.
      const actual = new vm.Script(`__entry(...[${tc.input}])`, { filename: 'case.js' }).runInContext(
        context,
        { timeout: CASE_TIMEOUT_MS }
      );
      const elapsed = Number(process.hrtime.bigint() - started) / 1e6;

      if (actual && typeof actual.then === 'function') {
        throw new Error('async functions are not supported in this challenge - return a value directly');
      }

      const passed = grading.matchesExpected(actual, tc.expected);
      if (!passed) allPassed = false;
      testResults.push({
        input: tc.input,
        expected: tc.expected,
        actual: grading.displayValue(actual),
        passed,
        logs: logs.text.slice(before),
        timeMs: Math.round(elapsed * 100) / 100
      });
    } catch (e) {
      allPassed = false;
      const message =
        e && e.message && /Script execution timed out/i.test(e.message)
          ? `timed out after ${CASE_TIMEOUT_MS}ms - is there an infinite loop?`
          : `${e?.name ?? 'Error'}: ${e?.message ?? String(e)}`;
      testResults.push({
        input: tc.input,
        expected: tc.expected,
        actual: message,
        passed: false,
        logs: logs.text.slice(before)
      });
    }
  }

  process.stdout.write(
    JSON.stringify({
      status: allPassed ? 'passed' : 'failed',
      stdout: logs.text,
      testResults
    })
  );
}

main().catch((e) => {
  process.stdout.write(JSON.stringify({ status: 'error', stderr: String(e?.message ?? e) }));
});
