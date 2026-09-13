/**
 * Code execution.
 *
 * Three real engines, and no pretending:
 *   javascript  -> the local API's Node sandbox, or a Web Worker if it is down
 *   python      -> CPython compiled to WebAssembly (Pyodide), in the browser
 *   everything  -> Judge0, but only when an endpoint is actually configured
 *
 * The previous version faked C and Java by regex-scraping printf/System.out and
 * reporting "compiled successfully". That taught people the wrong thing, so any
 * language without a real engine now returns an honest error instead.
 */
import { ExecutionResult, SupportedLanguage, TestCase, TestResult } from '../types';
import { api } from '../lib/api';
import { displayValue, matchesExpected } from '../lib/grading';

const JUDGE0_URL = import.meta.env.VITE_JUDGE0_API_URL as string | undefined;
const JUDGE0_KEY = import.meta.env.VITE_JUDGE0_API_KEY as string | undefined;
const JUDGE0_HOST = import.meta.env.VITE_JUDGE0_API_HOST as string | undefined;

const JUDGE0_CONFIGURED = Boolean(
  JUDGE0_URL && JUDGE0_KEY && !JUDGE0_URL.includes('your-judge0') && !JUDGE0_KEY.startsWith('your_')
);

const LANGUAGE_IDS: Partial<Record<SupportedLanguage, number>> = {
  javascript: 63,
  typescript: 74,
  python: 71,
  java: 62,
  c: 50,
  cpp: 54,
  go: 60
};

const WORKER_TIMEOUT_MS = 6000;
const PYODIDE_VERSION = '0.26.4';

/* -------------------------------------------------------- browser JS worker */

let workerUnavailable = false;

function runInWorker(
  code: string,
  entryFunction: string | undefined,
  testCases: TestCase[]
): Promise<ExecutionResult> {
  return new Promise((resolve) => {
    let worker: Worker;
    try {
      worker = new Worker(new URL('../lib/sandbox.worker.ts', import.meta.url), { type: 'module' });
    } catch (e: any) {
      workerUnavailable = true;
      resolve({
        status: 'error',
        stderr: `Could not start the browser sandbox: ${e?.message ?? e}`,
        engine: 'none',
        testResults: []
      });
      return;
    }

    const started = performance.now();
    let settled = false;

    const finish = (result: ExecutionResult) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      worker.terminate();
      resolve({
        ...result,
        engine: 'browser-worker',
        time: `${(performance.now() - started).toFixed(0)}ms (browser sandbox)`
      });
    };

    // Terminating the worker is the only way to stop synchronous JavaScript.
    const timer = setTimeout(() => {
      finish({
        status: 'error',
        stderr: `Execution timed out after ${WORKER_TIMEOUT_MS}ms. Check for a loop that never ends.`,
        testResults: []
      });
    }, WORKER_TIMEOUT_MS);

    worker.onmessage = (event: MessageEvent<ExecutionResult>) => finish(event.data);
    worker.onerror = (event) => {
      finish({
        status: 'error',
        stderr: event.message || 'The browser sandbox crashed.',
        testResults: []
      });
    };

    worker.postMessage({ code, entryFunction, testCases });
  });
}

/* ------------------------------------------------------------------ Python */

/**
 * Python runs in a dedicated Worker (src/lib/python.worker.js). Two reasons,
 * both learned the hard way:
 *
 *  - Pyodide's runPython is synchronous. On the main thread an infinite loop
 *    froze the entire tab; the only way to interrupt synchronous code is to
 *    terminate the thread it runs on.
 *  - Each run gets a fresh namespace, so definitions from one challenge cannot
 *    leak into the next and make wrong code pass.
 *
 * The worker is kept alive between runs so the ~10 MB runtime is downloaded
 * once. It is only thrown away when a run has to be killed.
 */
const PYTHON_LOAD_TIMEOUT_MS = 120_000;
const PYTHON_RUN_TIMEOUT_MS = 8_000;

let pythonWorker: Worker | null = null;
let pythonJobId = 0;
let pythonRuntimeReady = false;

function getPythonWorker(): Worker {
  if (!pythonWorker) {
    pythonWorker = new Worker(new URL('../lib/python.worker.js', import.meta.url));
    pythonRuntimeReady = false;
  }
  return pythonWorker;
}

function killPythonWorker(): void {
  pythonWorker?.terminate();
  pythonWorker = null;
  pythonRuntimeReady = false;
}

/** Is Python ready without a download? Lets the UI warn before a long wait. */
export function isPythonReady(): boolean {
  return pythonRuntimeReady;
}

function runPython(
  code: string,
  entryFunction: string | undefined,
  testCases: TestCase[],
  onProgress?: (message: string) => void
): Promise<ExecutionResult> {
  return new Promise((resolve) => {
    const worker = getPythonWorker();
    const id = ++pythonJobId;
    const started = performance.now();
    let settled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const elapsed = () => `${(performance.now() - started).toFixed(0)}ms (CPython ${PYODIDE_VERSION} Wasm)`;

    const finish = (result: ExecutionResult, kill = false) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      worker.removeEventListener('message', onMessage);
      worker.removeEventListener('error', onError);
      if (kill) killPythonWorker();
      resolve({ engine: 'pyodide', time: elapsed(), ...result });
    };

    const arm = (ms: number, message: string) => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => finish({ status: 'error', stderr: message, testResults: [] }, true), ms);
    };

    const onMessage = (event: MessageEvent<any>) => {
      const msg = event.data;
      if (!msg || msg.id !== id) return;

      if (msg.type === 'progress') {
        onProgress?.(msg.message);
        return;
      }
      if (msg.type === 'ready') {
        pythonRuntimeReady = true;
        // The runtime is up; from here on a hang is the submission's fault.
        arm(
          PYTHON_RUN_TIMEOUT_MS,
          `Your code ran for over ${PYTHON_RUN_TIMEOUT_MS / 1000}s without finishing. That usually means a loop whose condition never becomes false.`
        );
        return;
      }
      if (msg.type !== 'result') return;

      if (msg.status !== 'ran') {
        finish({ status: msg.status, stdout: msg.stdout, stderr: msg.stderr, testResults: [] });
        return;
      }

      // Grade here, on the main thread, with the shared rules.
      const testResults: TestResult[] = [];
      let allPassed = true;
      for (const r of msg.testResults as any[]) {
        if (r.error !== undefined) {
          allPassed = false;
          testResults.push({ input: r.input, expected: r.expected, actual: r.error, passed: false, logs: r.logs });
          continue;
        }
        let actual: unknown;
        try {
          actual = JSON.parse(r.json);
        } catch {
          actual = r.json;
        }
        const passed = matchesExpected(actual, r.expected);
        if (!passed) allPassed = false;
        testResults.push({
          input: r.input,
          expected: r.expected,
          actual: displayValue(actual),
          passed,
          logs: r.logs,
          timeMs: r.timeMs
        });
      }

      finish({
        status: allPassed ? 'passed' : 'failed',
        stdout: msg.stdout,
        stderr: msg.stderr,
        testResults
      });
    };

    const onError = (event: ErrorEvent) => {
      finish({ status: 'error', stderr: event.message || 'The Python worker crashed.', testResults: [] }, true);
    };

    worker.addEventListener('message', onMessage);
    worker.addEventListener('error', onError);

    // Until the runtime reports ready, the only thing that can be slow is the
    // download, so the budget is generous.
    arm(
      pythonRuntimeReady ? PYTHON_RUN_TIMEOUT_MS : PYTHON_LOAD_TIMEOUT_MS,
      pythonRuntimeReady
        ? `Your code ran for over ${PYTHON_RUN_TIMEOUT_MS / 1000}s without finishing.`
        : 'The Python runtime took too long to download. Check your connection and try again.'
    );

    worker.postMessage({ id, code, entryFunction, testCases });
  });
}

/* ------------------------------------------------------------------ Judge0 */

function encodeBase64(str: string): string {
  const bytes = new TextEncoder().encode(str);
  let bin = '';
  bytes.forEach((b) => (bin += String.fromCharCode(b)));
  return btoa(bin);
}

function decodeBase64(b64?: string | null): string {
  if (!b64) return '';
  try {
    const bin = atob(b64);
    const bytes = Uint8Array.from(bin, (ch) => ch.charCodeAt(0));
    return new TextDecoder().decode(bytes);
  } catch {
    return '';
  }
}

async function runJudge0(code: string, language: SupportedLanguage): Promise<ExecutionResult> {
  const languageId = LANGUAGE_IDS[language];
  if (!languageId) {
    return {
      status: 'error',
      stderr: `${language} is not supported by the configured compiler.`,
      engine: 'none',
      testResults: []
    };
  }

  const started = performance.now();
  const response = await fetch(`${JUDGE0_URL}/submissions?base64_encoded=true&wait=true`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-RapidAPI-Key': JUDGE0_KEY as string,
      'X-RapidAPI-Host': JUDGE0_HOST || 'judge0-ce.p.rapidapi.com'
    },
    body: JSON.stringify({ source_code: encodeBase64(code), language_id: languageId })
  });

  if (!response.ok) {
    throw new Error(`the compiler service replied ${response.status}`);
  }

  const data = await response.json();
  const compileOutput = decodeBase64(data.compile_output);
  const stderr = decodeBase64(data.stderr);
  const stdout = decodeBase64(data.stdout);
  const time = data.time
    ? `${(parseFloat(data.time) * 1000).toFixed(0)}ms (Judge0)`
    : `${(performance.now() - started).toFixed(0)}ms (Judge0)`;

  if (compileOutput.trim()) {
    return { status: 'error', stderr: compileOutput.trim(), engine: 'judge0', time, testResults: [] };
  }
  if (stderr.trim() || (data.status?.id && data.status.id > 3)) {
    return {
      status: 'error',
      stderr: stderr.trim() || data.status?.description || 'Runtime error',
      stdout: stdout.trim() || undefined,
      engine: 'judge0',
      time,
      testResults: []
    };
  }
  return {
    status: 'passed',
    stdout: stdout.trim() || 'Program finished with no output.',
    engine: 'judge0',
    time,
    testResults: []
  };
}

/* -------------------------------------------------------------------- entry */

export interface ExecuteOptions {
  entryFunction?: string;
  testCases?: TestCase[];
  onProgress?: (message: string) => void;
  /** Skip the API round-trip (used by the offline path and by tests). */
  preferLocal?: boolean;
}

export const compilerService = {
  /** Which engine will handle a language, for display in the UI. */
  engineFor(language: SupportedLanguage): string {
    if (language === 'javascript' || language === 'typescript') return 'Node sandbox / browser worker';
    if (language === 'python') return `CPython ${PYODIDE_VERSION} (WebAssembly)`;
    if (JUDGE0_CONFIGURED) return 'Judge0 remote compiler';
    return 'no runtime configured';
  },

  canRun(language: SupportedLanguage): boolean {
    if (language === 'javascript' || language === 'typescript' || language === 'python') return true;
    return JUDGE0_CONFIGURED && Boolean(LANGUAGE_IDS[language]);
  },

  async executeCode(
    code: string,
    language: SupportedLanguage = 'javascript',
    options: ExecuteOptions = {}
  ): Promise<ExecutionResult> {
    const { entryFunction, testCases = [], onProgress, preferLocal = false } = options;

    if (!code.trim()) {
      return { status: 'error', stderr: 'There is no code to run yet.', engine: 'none', testResults: [] };
    }

    if (language === 'python') {
      return runPython(code, entryFunction, testCases, onProgress);
    }

    if (language === 'javascript' || language === 'typescript') {
      // Prefer the server: it is a real process with a hard kill, and it is the
      // same engine the content validator uses. `workerUnavailable` must not
      // gate this branch - if the browser sandbox is broken, the server is the
      // only thing left, so we should try it harder, not skip it.
      if (!preferLocal || workerUnavailable) {
        try {
          const result = await api.execute({ language, code, entryFunction, testCases });
          if (result && result.engine !== 'none') return result;
        } catch {
          /* server down - fall through to the browser sandbox */
        }
      }
      return runInWorker(code, entryFunction, testCases);
    }

    if (JUDGE0_CONFIGURED) {
      try {
        return await runJudge0(code, language);
      } catch (e: any) {
        return {
          status: 'error',
          stderr: `Could not reach the remote compiler: ${e?.message ?? e}`,
          engine: 'none',
          testResults: []
        };
      }
    }

    return {
      status: 'error',
      engine: 'none',
      stderr:
        `There is no ${language} runtime available.\n\n` +
        `JavaScript and Python run locally with no setup. To run ${language}, set ` +
        `VITE_JUDGE0_API_URL and VITE_JUDGE0_API_KEY in .env and restart the dev server.`,
      testResults: []
    };
  }
};
