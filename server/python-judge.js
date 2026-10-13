import { runJudge0Submission } from './judge0.js';

const MARKER = '__CODECONSIST_PYTHON_RESULTS__';

/** Complete harness sent to Judge0; no learner Python is evaluated on the PC host. */
export function pythonTestHarness({ code, entryFunction, testCases }) {
  // Expected answers stay in the API process. Submitted Python can inspect
  // its own interpreter; never give that interpreter an answer key.
  const inputs = testCases.map(test => ({ input: String(test.input ?? '') }));
  const payload = Buffer.from(JSON.stringify({ code, entryFunction, testCases: inputs }), 'utf8').toString('base64');
  return `import base64, json, contextlib, io
_payload = json.loads(base64.b64decode("${payload}").decode("utf-8"))
_scope = {}
_results = []
_capture = io.StringIO()
_fatal = None
with contextlib.redirect_stdout(_capture):
    try:
        exec(compile(_payload['code'], 'main.py', 'exec'), _scope)
        _entry = _scope.get(_payload['entryFunction'])
        if not callable(_entry):
            raise ValueError('Define the requested entry function: ' + _payload['entryFunction'])
        for _case in _payload['testCases']:
            try:
                _input = str(_case.get('input', ''))
                _args = eval('(' + _input + ',)', _scope) if _input.strip() else ()
                _actual = _entry(*_args)
                try:
                    json.dumps(_actual, allow_nan=False)
                except (TypeError, ValueError):
                    _actual = repr(_actual)
                _results.append({'actual': _actual})
            except Exception as _error:
                _results.append({'error': str(_error)[:1000]})
    except Exception as _error:
        _fatal = str(_error)[:1000]
print('${MARKER}' + json.dumps({'results': _results, 'stdout': _capture.getvalue()[:20000], 'error': _fatal}, allow_nan=False))
`;
}

export async function runPythonTests(config, payload, grading) {
  const testCases = payload.testCases;
  const result = await runJudge0Submission(config, { language: 'python', code: pythonTestHarness({ ...payload, testCases }), profile: 'standard' });
  if (result.status !== 'passed') return result;
  const text = result.stdout ?? '';
  const offset = text.lastIndexOf(MARKER);
  let data;
  try { data = JSON.parse(text.slice(offset + MARKER.length)); } catch { /* invalid or truncated output */ }
  if (offset < 0 || !data || data.error || !Array.isArray(data.results) || data.results.length !== testCases.length) {
    return { ...result, status: 'error', stdout: data?.stdout ?? '', stderr: data?.error || 'The Python test runner did not return complete results.', testResults: [] };
  }
  const testResults = testCases.map((test, index) => {
    const row = data.results[index];
    const passed = !row.error && grading.matchesExpected(row.actual, String(test.expected ?? ''));
    return { input: test.hidden ? 'Hidden test' : String(test.input ?? ''), expected: test.hidden ? 'Hidden' : String(test.expected ?? ''), actual: test.hidden ? (passed ? 'Passed' : 'Not passed') : row.error ? String(row.error) : grading.displayValue(row.actual), passed, hidden: test.hidden === true };
  });
  return { ...result, status: testResults.every(row => row.passed) ? 'passed' : 'failed', stdout: data.stdout || '', testResults };
}
