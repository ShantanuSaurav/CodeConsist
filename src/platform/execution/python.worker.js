/* eslint-disable no-restricted-globals */
/**
 * Python execution worker.
 *
 * A CLASSIC worker (no ES imports) so it can importScripts() Pyodide from the
 * CDN. Written in plain JavaScript for the same reason.
 *
 * Why a worker at all: Pyodide's runPython is a synchronous CPython call. On
 * the main thread an infinite loop froze the whole tab - no spinner, no Escape,
 * no way out but killing the tab. Here the main thread can terminate() us,
 * which is the only way to stop synchronous code.
 *
 * Why a fresh namespace per run: the old code ran every submission into the
 * one shared pyodide.globals for the life of the page, so a helper defined in
 * challenge A stayed callable from challenge B and wrong code passed.
 *
 * Protocol (main -> worker):  { id, code, entryFunction, testCases }
 * Protocol (worker -> main):  { id, type: 'progress', message }
 *                             { id, type: 'ready' }         once Pyodide is loaded
 *                             { id, type: 'result', ... }   the ExecutionResult body
 */
var PYODIDE_VERSION = '0.26.4';
var INDEX_URL = 'https://cdn.jsdelivr.net/pyodide/v' + PYODIDE_VERSION + '/full/';

var pyodidePromise = null;

function loadRuntime(post) {
  if (pyodidePromise) return pyodidePromise;
  pyodidePromise = (function () {
    post({ type: 'progress', message: 'Downloading the Python runtime (about 10 MB, once per session)…' });
    try {
      importScripts(INDEX_URL + 'pyodide.js');
    } catch (e) {
      pyodidePromise = null;
      return Promise.reject(new Error('Could not download the Python runtime from ' + INDEX_URL));
    }
    post({ type: 'progress', message: 'Starting CPython…' });
    return self.loadPyodide({ indexURL: INDEX_URL }).catch(function (e) {
      pyodidePromise = null;
      throw e;
    });
  })();
  return pyodidePromise;
}

/**
 * Pyodide errors arrive with a JS stack glued on and several frames from
 * Pyodide's own eval_code plumbing. Keep the traceback header, the frames from
 * the learner's code, and the final error line - the rest is noise to them.
 */
function formatPythonError(e) {
  var raw = String((e && e.message) || e);
  var marker = raw.indexOf('Traceback (most recent call last)');
  var python = marker >= 0 ? raw.slice(marker) : raw;
  var lines = python.split('\n');
  var kept = [];
  var skipping = false;
  for (var i = 0; i < lines.length; i++) {
    var line = lines[i];
    // A frame inside Pyodide's runtime: drop it and its source line.
    if (/^\s*File "\/lib\/python[^"]*_pyodide/.test(line)) {
      skipping = true;
      continue;
    }
    if (skipping && /^\s{4,}\S/.test(line) && !/^\s*File /.test(line)) continue;
    skipping = false;
    kept.push(line);
  }
  return kept.slice(0, 12).join('\n').trim();
}

// Installed into each fresh namespace. Serialises through JSON so the main
// thread compares with exactly the same rules as every other engine.
var CALL_HELPER =
  'import json as __cq_json\n' +
  'def __cq_call(__fn, __args_src):\n' +
  '    __args = eval("(" + __args_src + ",)", globals())\n' +
  '    __value = __fn(*__args)\n' +
  '    try:\n' +
  '        return __cq_json.dumps(__value)\n' +
  '    except TypeError:\n' +
  '        return __cq_json.dumps(repr(__value))\n';

function run(pyodide, job, post) {
  var stdout = [];
  var stderr = [];
  pyodide.setStdout({ batched: function (m) { stdout.push(m); } });
  pyodide.setStderr({ batched: function (m) { stderr.push(m); } });

  // A brand-new globals dict for THIS submission only.
  var ns = pyodide.globals.get('dict')();

  try {
    pyodide.runPython(job.code, { globals: ns });
  } catch (e) {
    return {
      status: 'error',
      stdout: stdout.join('\n'),
      stderr: formatPythonError(e),
      testResults: []
    };
  }

  var testCases = job.testCases || [];
  if (!testCases.length) {
    return {
      status: 'passed',
      stdout: stdout.join('\n') || 'Program finished with no output.',
      testResults: []
    };
  }

  var fn = ns.get(job.entryFunction);
  if (!fn || typeof fn !== 'function') {
    return {
      status: 'error',
      stdout: stdout.join('\n'),
      stderr:
        'NameError: no function named "' + job.entryFunction + '" was defined. Check the spelling and the indentation.',
      testResults: []
    };
  }

  pyodide.runPython(CALL_HELPER, { globals: ns });
  var call = ns.get('__cq_call');

  var results = [];
  for (var i = 0; i < testCases.length; i++) {
    var tc = testCases[i];
    var before = stdout.length;
    var started = Date.now();
    try {
      var json = call(fn, tc.input);
      results.push({
        input: tc.input,
        expected: tc.expected,
        json: String(json),
        logs: stdout.slice(before).join('\n'),
        timeMs: Date.now() - started
      });
    } catch (e) {
      results.push({
        input: tc.input,
        expected: tc.expected,
        error: formatPythonError(e),
        logs: stdout.slice(before).join('\n')
      });
    }
  }

  try { call.destroy(); } catch (e) {}
  try { fn.destroy(); } catch (e) {}
  try { ns.destroy(); } catch (e) {}

  return {
    // The main thread decides pass/fail with the shared grader.
    status: 'ran',
    stdout: stdout.join('\n'),
    stderr: stderr.length ? stderr.join('\n') : undefined,
    testResults: results
  };
}

self.onmessage = function (event) {
  var job = event.data;
  var post = function (m) { self.postMessage(Object.assign({ id: job.id }, m)); };

  loadRuntime(post).then(
    function (pyodide) {
      post({ type: 'ready' });
      var body;
      try {
        body = run(pyodide, job, post);
      } catch (e) {
        body = { status: 'error', stderr: formatPythonError(e), testResults: [] };
      }
      post(Object.assign({ type: 'result' }, body));
    },
    function (e) {
      post({
        type: 'result',
        status: 'error',
        stderr:
          String((e && e.message) || e) +
          '\n\nPython runs through Pyodide, which is downloaded from a CDN on first use. Check your connection and try again.',
        engine: 'none',
        testResults: []
      });
    }
  );
};
