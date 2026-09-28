/**
 * Code execution.
 *
 * Three real engines, and no pretending:
 *   javascript  -> the local API's Node sandbox, or a Web Worker if it is down
 *   python      -> CPython compiled to WebAssembly (Pyodide), in the browser
 *   everything  -> Judge0, proxied through the local API server, but only
 *                  when an endpoint is actually configured there
 *
 * The previous version faked C and Java by regex-scraping printf/System.out and
 * reporting "compiled successfully". That taught people the wrong thing, so any
 * language without a real engine now returns an honest error instead.
 *
 * Judge0 credentials live ONLY on the server (see server/index.js). An earlier
 * version called Judge0 directly from the browser with VITE_JUDGE0_API_KEY,
 * which Vite bakes into the shipped JS bundle - anyone could open devtools and
 * read the key out of it. Every language other than JavaScript/Python now goes
 * through POST /api/execute, same as JavaScript already did; the key never
 * reaches the client. `setRemoteCompilerStatus` lets the session tell this
 * module whether the server actually has Judge0 configured (from the
 * non-secret flag in /api/health), purely so the UI can label the engine and
 * warn ahead of time, without ever seeing the credentials.
 * `setServerRuntimes` is the same idea with one more bit of detail per
 * language - engine and a human label - which is what lets the UI distinguish
 * a self-hosted Judge0 from a hosted one. Still no credentials: a label is a
 * name and a version, never a URL or a host.
 */
import { ExecutionResult, SupportedLanguage, TestCase, TestResult } from '@/types';
import { ENV } from '@/config/env';
import { api, ApiError, OfflineError, RuntimeInfo } from '../api-client/api';
import { displayValue, matchesExpected } from '../grading-engine/grading';
import { getCopy } from '../settings/store';

/** Names for the languages the server compiles, for the sentences a learner reads. */
const SERVER_LANGUAGE_NAMES: Partial<Record<SupportedLanguage, string>> = {
  java: 'Java',
  c: 'C',
  cpp: 'C++',
  go: 'Go'
};

/**
 * What a run says when the server that compiles this language cannot be
 * reached. A visitor gets plain words; a development build keeps the
 * instruction for whoever is running the app locally.
 */
function serverUnreachableMessage(language: SupportedLanguage): string {
  if (ENV.isDev) {
    return (
      `Could not reach the local API server to run ${language}. Start it with ` +
      '`npm run dev:api` (or `npm run dev`, which starts both).'
    );
  }
  const name = SERVER_LANGUAGE_NAMES[language] ?? language;
  // The admin-editable sentence (`copy.offline.playgroundCompiled`); the
  // built-in words only if the copy is missing.
  return (
    getCopy('copy.offline.playgroundCompiled', { language: name }) ||
    `${name} runs on the CodeConsist server, which is not reachable right now. Please try again in a little ` +
      'while - JavaScript and Python still run in your browser.'
  );
}

/**
 * The server refused the run without running it: too many runs in a row
 * (429, `limits.tooMany`) or every code-runner slot busy (503 `busy`,
 * `limits.busy`). Both come back as an ordinary failed run carrying the
 * server's own sentence, so the Playground and the practice modal show them
 * like any other error. Null for anything else.
 */
function refusedRun(error: unknown): ExecutionResult | null {
  if (!(error instanceof ApiError)) return null;
  if (error.status === 429 || error.reason === 'rate-limited') {
    return {
      status: 'error',
      engine: 'none',
      reason: 'rate-limited',
      stderr: error.message || getCopy('copy.limits.tooMany', { minutes: Math.max(1, Math.ceil((error.retryAfterSeconds ?? 60) / 60)) }),
      testResults: []
    };
  }
  if (error.reason === 'busy') {
    // The server's sentence is already its (admin-edited) copy.
    const said = (error.payload as { stderr?: unknown } | undefined)?.stderr;
    return {
      status: 'error',
      engine: 'none',
      reason: 'busy',
      stderr: (typeof said === 'string' && said) || getCopy('copy.limits.busy') || error.message,
      testResults: []
    };
  }
  return null;
}

/**
 * Was this "failed run" one the server refused without running (see
 * refusedRun)? Nothing of the learner's was tested, so it is not their try:
 * it must not cost the retry penalty on XP, count towards "Show me the
 * solution", or be kept as a miss. A missing engine ('runtime-unavailable')
 * is not a refusal - that is how this server is set up, not a moment's load.
 */
export function isRefusedRun(result: Pick<ExecutionResult, 'engine' | 'reason'> | null | undefined): boolean {
  return result?.engine === 'none' && (result.reason === 'rate-limited' || result.reason === 'busy');
}

/**
 * What a production build calls a language with no engine, wherever it names
 * one: the engine line (`engineFor`) and the Playground's language picker.
 * Development builds keep the setup wording ("needs Judge0", "needs setup").
 */
export const RUNTIME_UNAVAILABLE_LABEL = 'not available here';

/**
 * A server answer can carry a `devHint` (the Judge0 setup steps behind a
 * `runtime-unavailable`). It is appended to the message in development and
 * dropped everywhere else - `stderr` alone is the friendly sentence.
 */
function withDevHint(result: ExecutionResult): ExecutionResult {
  if (!result?.devHint) return result;
  const { devHint, ...rest } = result;
  if (!ENV.isDev) return rest;
  return { ...rest, stderr: [rest.stderr, devHint].filter(Boolean).join('\n\n') };
}

let remoteCompilerConfigured = false;
let remoteCompilerLanguages: SupportedLanguage[] = [];

/** Called once the app knows the server's answer (from /api/health). */
function setRemoteCompilerStatus(configured: boolean, languages: string[] = []): void {
  remoteCompilerConfigured = configured;
  remoteCompilerLanguages = languages as SupportedLanguage[];
}

/**
 * The same answer, one level more detailed.
 *
 * `setRemoteCompilerStatus` can only say "Judge0: yes or no", which was enough
 * while a key was the only way to have one. It is not enough now that Judge0
 * can be self-hosted in Docker: "needs setup" and "Judge0 (self-hosted)" are
 * different sentences to a learner, and only the server can tell them apart.
 * Both setters are kept because both are called - this one when the server is
 * new enough to report `runtimes`, the other always.
 */
let serverRuntimes: Record<string, RuntimeInfo> = {};

function setServerRuntimes(runtimes: Record<string, RuntimeInfo> = {}): void {
  serverRuntimes = runtimes ?? {};
}

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
      worker = new Worker(new URL('./sandbox.worker', import.meta.url), { type: 'module' });
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
    pythonWorker = new Worker(new URL('./python.worker.js', import.meta.url));
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

/* ----------------------------------------------------------- browser HTML/DOM */

function runHtmlInBrowser(
  code: string,
  entryFunction: string | undefined,
  testCases: TestCase[]
): Promise<ExecutionResult> {
  return new Promise((resolve) => {
    if (typeof document === 'undefined') {
      resolve({
        status: 'error',
        stderr: 'DOM execution requires a browser document environment.',
        engine: 'none',
        testResults: []
      });
      return;
    }

    const started = performance.now();
    const iframe = document.createElement('iframe');
    iframe.style.position = 'fixed';
    iframe.style.top = '-9999px';
    iframe.style.left = '-9999px';
    iframe.style.width = '800px';
    iframe.style.height = '600px';
    iframe.style.visibility = 'hidden';
    iframe.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-modals allow-forms');

    let settled = false;
    const cleanup = () => {
      if (iframe.parentNode) {
        iframe.parentNode.removeChild(iframe);
      }
    };

    const finish = (result: ExecutionResult) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      cleanup();
      resolve({
        ...result,
        engine: 'browser-dom',
        time: `${(performance.now() - started).toFixed(0)}ms (DOM sandbox)`
      });
    };

    const timer = setTimeout(() => {
      finish({
        status: 'error',
        stderr: 'Execution timed out after 5000ms.',
        testResults: []
      });
    }, 5000);

    const scriptPrefix = `
      <script>
        window.__logs = [];
        const _log = console.log;
        const _err = console.error;
        console.log = (...args) => {
          window.__logs.push(args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' '));
          _log(...args);
        };
        console.error = (...args) => {
          window.__logs.push('error: ' + args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' '));
          _err(...args);
        };
      </script>
    `;

    const isFullDoc = /<!DOCTYPE/i.test(code) || /<html/i.test(code);
    let fullHtml: string;
    if (isFullDoc) {
      if (code.includes('<head>')) {
        fullHtml = code.replace('<head>', `<head><meta charset="utf-8">${scriptPrefix}`);
      } else {
        fullHtml = `${scriptPrefix}${code}`;
      }
    } else {
      fullHtml = `<!DOCTYPE html><html><head><meta charset="utf-8">${scriptPrefix}</head><body>${code}</body></html>`;
    }

    iframe.onload = () => {
      try {
        const win = iframe.contentWindow as any;
        if (!win) {
          finish({ status: 'error', stderr: 'Could not access DOM sandbox window.', testResults: [] });
          return;
        }
        const doc = iframe.contentDocument || win.document;
        if (!doc) {
          finish({ status: 'error', stderr: 'Could not access DOM sandbox document.', testResults: [] });
          return;
        }

        const logs = (win.__logs as string[] | undefined)?.join('\n') ?? '';

        if (!testCases.length) {
          finish({ status: 'passed', stdout: logs, testResults: [] });
          return;
        }

        const testResults: TestResult[] = [];
        let allPassed = true;

        for (const tc of testCases) {
          const caseStart = performance.now();
          try {
            let actual: unknown;
            if (entryFunction && typeof win[entryFunction] === 'function') {
              const args = win.eval(`[${tc.input}]`);
              actual = win[entryFunction](...args);
            } else {
              actual = win.eval(tc.input);
            }

            const passed = matchesExpected(actual, tc.expected);
            if (!passed) allPassed = false;
            testResults.push({
              input: tc.input,
              expected: tc.expected,
              actual: displayValue(actual),
              passed,
              logs,
              timeMs: Math.round((performance.now() - caseStart) * 100) / 100
            });
          } catch (err: any) {
            allPassed = false;
            testResults.push({
              input: tc.input,
              expected: tc.expected,
              actual: `${err?.name ?? 'Error'}: ${err?.message ?? String(err)}`,
              passed: false,
              logs
            });
          }
        }

        finish({
          status: allPassed ? 'passed' : 'failed',
          stdout: logs,
          testResults
        });
      } catch (e: any) {
        finish({
          status: 'error',
          stderr: e?.message ?? String(e),
          testResults: []
        });
      }
    };

    document.body.appendChild(iframe);
    iframe.srcdoc = fullHtml;
  });
}

/* ---------------------------------------------------- Judge0 (server-side) */
// Judge0 requests themselves are made by the server (server/index.js), which
// is the only place the API key ever lives. The client just calls
// POST /api/execute for every language, same as it already did for
// JavaScript, and renders whatever honest result comes back.

/* -------------------------------------------------------------------- entry */

export interface ExecuteOptions {
  entryFunction?: string;
  testCases?: TestCase[];
  onProgress?: (message: string) => void;
  /** Skip the API round-trip (used by the offline path and by tests). */
  preferLocal?: boolean;
  /**
   * Standard input for the program, for the languages that read it. Ignored
   * for everything the browser runs - a Pyodide or Worker run has no stdin to
   * feed - and capped again on the server.
   */
  stdin?: string;
}

export const compilerService = {
  setRemoteCompilerStatus,
  setServerRuntimes,

  /** Which engine will handle a language, for display in the UI. */
  engineFor(language: SupportedLanguage): string {
    // A visitor can do nothing about a missing engine, so a production build
    // only says that it is missing: "needs Judge0" and "requires Judge0
    // configuration" are instructions for whoever runs the app, and read as a
    // broken site to anyone else. Decided by runtimeAvailable, so this line and
    // the Playground's availability hint cannot disagree about a language.
    if (!ENV.isDev && !this.runtimeAvailable(language)) return RUNTIME_UNAVAILABLE_LABEL;

    // The server's own label wins for anything the server runs: it is the only
    // side that knows whether its Judge0 is self-hosted, hosted or absent, and
    // guessing "requires Judge0 configuration" at somebody with Docker already
    // running would be the client making it up. A runtime the server reports
    // as 'browser' is one we ship ourselves, so our string wins there - it
    // carries the exact version, which the server has no way to know.
    const reported = serverRuntimes[language];
    if (reported?.label && reported.engine !== 'browser') return reported.label;

    if (language === 'javascript' || language === 'typescript') return 'Node sandbox / browser worker';
    if (language === 'python') return `CPython ${PYODIDE_VERSION} (WebAssembly)`;
    if (language === 'html') return 'Browser DOM sandbox';
    if (!LANGUAGE_IDS[language]) return 'no runtime configured';
    if (remoteCompilerConfigured && remoteCompilerLanguages.includes(language)) return 'Judge0 remote compiler';
    return 'requires Judge0 configuration';
  },

  /**
   * Can this language actually run right now?
   *
   * Straight from the server when it said, because the server is the only one
   * who knows. When it did not - an older build, or nothing reachable yet -
   * fall back to what we already worked out from the `judge0` flag, so this
   * never gets *less* accurate than `remoteCompilerReady` was on its own.
   */
  runtimeAvailable(language: SupportedLanguage): boolean {
    const reported = serverRuntimes[language];
    if (reported) return reported.available;
    return this.runsLocally(language) || this.remoteCompilerReady(language);
  },

  /** Languages that always work, with nothing to configure. */
  runsLocally(language: SupportedLanguage): boolean {
    return language === 'javascript' || language === 'typescript' || language === 'python' || language === 'html';
  },

  canRun(language: SupportedLanguage): boolean {
    if (this.runsLocally(language)) return true;
    // We can always ASK the server to run it - it answers honestly (a plain
    // 501 with a clear message) when it has no Judge0 endpoint configured.
    // `remoteCompilerConfigured` is used to warn ahead of time in the UI, not
    // to block the attempt, since the server is the actual source of truth.
    return Boolean(LANGUAGE_IDS[language]);
  },

  /** True once /api/health has told us the server has Judge0 wired up for this language. */
  remoteCompilerReady(language: SupportedLanguage): boolean {
    return remoteCompilerConfigured && remoteCompilerLanguages.includes(language);
  },

  async executeCode(
    code: string,
    language: SupportedLanguage = 'javascript',
    options: ExecuteOptions = {}
  ): Promise<ExecutionResult> {
    const { entryFunction, testCases = [], onProgress, preferLocal = false, stdin } = options;

    if (!code.trim()) {
      return { status: 'error', stderr: 'There is no code to run yet.', engine: 'none', testResults: [] };
    }

    if (language === 'html') {
      return runHtmlInBrowser(code, entryFunction, testCases);
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
          // Server down - or it refused the run (a 429, or every slot busy):
          // JavaScript has an engine right here, so the browser sandbox runs
          // it instead of showing an error.
        }
      }
      return runInWorker(code, entryFunction, testCases);
    }

    if (!LANGUAGE_IDS[language]) {
      return { status: 'error', engine: 'none', stderr: `${language} is not supported yet.`, testResults: [] };
    }

    // Everything else (Java, C, C++, Go, ...) is proxied through the server,
    // which is the only place a Judge0 API key is ever read. An unconfigured
    // server fails the SAME honest way whether the request came from the
    // Playground or a lesson - one message to maintain.
    try {
      // stdin only goes on this path: it is the Judge0 languages that read it,
      // and sending it to a Node-VM run that has no stdin would be noise.
      return withDevHint(await api.execute({ language, code, entryFunction, testCases, stdin }));
    } catch (e: unknown) {
      // Refused without running - too many runs (429) or no free slot (503
      // busy): a failed run with the server's own sentence.
      const refused = refusedRun(e);
      if (refused) return refused;
      // Unreachable is said in this module's own words, in the language's
      // terms; any other failure (a 413, a 5xx) already carries the server's.
      const unreachable = e instanceof OfflineError || !(e instanceof Error) || !e.message;
      return {
        status: 'error',
        engine: 'none',
        stderr: unreachable ? serverUnreachableMessage(language) : (e as Error).message,
        testResults: []
      };
    }
  }
};
