/**
 * Local compilers: C (gcc), C++ (g++) and Java (javac + java) on THIS machine.
 *
 * This is the "no cloud yet" engine. The API server runs on the developer's
 * own computer and Vercel reaches it through the tunnel in vercel.json, so
 * whatever toolchains are installed here are what the deployed Playground
 * gets. When usage outgrows one machine, set LOCAL_COMPILERS=off and point
 * JUDGE0_API_URL / JUDGE0_API_KEY at a hosted Judge0 - the route in
 * server/index.js falls through to it with no client changes.
 *
 * What this is NOT: a security boundary. The program runs as the same OS user
 * as the API server. The guards here (sign-in, rate limit, a concurrency cap,
 * wall-clock kill of the whole process tree, output caps, a scratch directory
 * per run, a scrubbed environment) keep honest mistakes - infinite loops,
 * print storms, fork-happy code - from hurting the machine. They do not stop a
 * deliberately hostile program. That needs a container or VM, which is the
 * point at which to move to Judge0.
 *
 * Environment:
 *   LOCAL_COMPILERS=off           disable this engine entirely
 *   LOCAL_COMPILERS_GUESTS=on     let signed-out visitors run code too
 *   GCC_PATH / GXX_PATH           explicit compiler binaries
 *   JAVA_HOME                     JDK to use (javac and java come from its bin/)
 */
import { spawn, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const IS_WINDOWS = process.platform === 'win32';
const EXE = IS_WINDOWS ? '.exe' : '';

const COMPILE_TIMEOUT_MS = 20_000;
const RUN_TIMEOUT_MS = 6_000;
const MAX_OUTPUT_BYTES = 64 * 1024;
const MAX_STDIN_BYTES = 64 * 1024;
/** Runs allowed at once; the rest wait their turn (up to MAX_QUEUE). */
const MAX_CONCURRENT = 2;
const MAX_QUEUE = 12;

export const LOCAL_COMPILERS_ENABLED = !/^(off|false|0|no)$/i.test(process.env.LOCAL_COMPILERS ?? '');
export const LOCAL_COMPILERS_GUESTS = /^(on|true|1|yes)$/i.test(process.env.LOCAL_COMPILERS_GUESTS ?? '');

/* -------------------------------------------------------------- detection */

/** First existing file named `name` on PATH, or null. */
function findOnPath(name) {
  const dirs = (process.env.PATH || '').split(path.delimiter).filter(Boolean);
  for (const dir of dirs) {
    const candidate = path.join(dir, name + EXE);
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

/** Runs `bin args` and returns its combined output, or null if it failed. */
function probe(bin, args) {
  try {
    const r = spawnSync(bin, args, { encoding: 'utf8', timeout: 10_000, windowsHide: true });
    if (r.error || r.status !== 0) return null;
    return `${r.stdout || ''}${r.stderr || ''}`.trim();
  } catch {
    return null;
  }
}

function detectGcc(envVar, name) {
  const bin = process.env[envVar] || findOnPath(name);
  if (!bin) return null;
  const out = probe(bin, ['--version']);
  if (!out) return null;
  const version = out.split('\n')[0].match(/(\d+\.\d+\.\d+)/)?.[1] ?? 'unknown';
  return { bin, version, label: `${name} ${version}` };
}

/** The newest C++ standard this g++ accepts. GCC 6 knows c++17 as an alias of c++1z. */
function pickCppStandard(gxx) {
  for (const std of ['c++17', 'c++14', 'c++11']) {
    const r = spawnSync(gxx, [`-std=${std}`, '-x', 'c++', '-fsyntax-only', '-'], {
      input: 'int main(){}',
      timeout: 10_000,
      windowsHide: true
    });
    if (!r.error && r.status === 0) return std;
  }
  return null;
}

function detectJava() {
  // javac and java MUST come from the same JDK: a newer javac writes class
  // files an older `java` refuses to load (UnsupportedClassVersionError). On
  // this kind of machine PATH commonly has an old JRE's java ahead of the JDK.
  const home = process.env.JAVA_HOME;
  const javac = home && existsSync(path.join(home, 'bin', 'javac' + EXE)) ? path.join(home, 'bin', 'javac' + EXE) : findOnPath('javac');
  if (!javac) return null;
  const java = path.join(path.dirname(javac), 'java' + EXE);
  if (!existsSync(java)) return null;
  const out = probe(javac, ['-version']);
  if (!out) return null;
  const version = out.match(/(\d+(?:\.\d+)*)/)?.[1] ?? 'unknown';
  return { javac, java, version, label: `OpenJDK ${version}` };
}

function detectToolchains() {
  if (!LOCAL_COMPILERS_ENABLED) return {};
  const found = {};
  const gcc = detectGcc('GCC_PATH', 'gcc');
  if (gcc) found.c = gcc;
  const gxx = detectGcc('GXX_PATH', 'g++');
  if (gxx) {
    const std = pickCppStandard(gxx.bin);
    if (std) found.cpp = { ...gxx, std };
  }
  const java = detectJava();
  if (java) found.java = java;
  return found;
}

const TOOLCHAINS = detectToolchains();

/** Languages this machine can compile and run, for /api/health. */
export function localLanguages() {
  return Object.keys(TOOLCHAINS);
}

/** Human labels ("gcc 6.3.0", ...) keyed by language, for /api/health. */
export function localToolchainLabels() {
  return Object.fromEntries(Object.entries(TOOLCHAINS).map(([lang, t]) => [lang, t.label]));
}

export function canRunLocally(language) {
  return Boolean(TOOLCHAINS[language]);
}

/* ------------------------------------------------------------ concurrency */

let active = 0;
const waiting = [];

function acquireSlot() {
  if (active < MAX_CONCURRENT) {
    active++;
    return Promise.resolve(true);
  }
  if (waiting.length >= MAX_QUEUE) return Promise.resolve(false);
  return new Promise((resolve) => waiting.push(resolve));
}

function releaseSlot() {
  const next = waiting.shift();
  if (next) next(true);
  else active--;
}

/* ------------------------------------------------------------ processes */

/** Kill a process and everything it started. `child.kill` alone leaves grandchildren on Windows. */
function killTree(child) {
  if (!child.pid) return;
  if (IS_WINDOWS) {
    spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' }).on('error', () => {});
  } else {
    child.kill('SIGKILL');
  }
}

/** Environment for compilers and programs: enough to work, none of the server's secrets. */
function scrubbedEnv(workDir, extraPath = []) {
  const keep = IS_WINDOWS ? ['SystemRoot', 'windir', 'COMSPEC', 'PATHEXT', 'NUMBER_OF_PROCESSORS', 'PROCESSOR_ARCHITECTURE'] : ['LANG'];
  const env = {};
  for (const key of keep) if (process.env[key]) env[key] = process.env[key];
  const systemDirs = IS_WINDOWS ? [path.join(process.env.SystemRoot || 'C:\\Windows', 'System32')] : ['/usr/bin', '/bin'];
  env.PATH = [...extraPath, ...systemDirs].join(path.delimiter);
  env.TEMP = env.TMP = env.TMPDIR = workDir;
  env.HOME = env.USERPROFILE = workDir;
  return env;
}

/**
 * Run one process to completion. Never rejects: every outcome, including a
 * missing binary, comes back as data.
 */
function runProcess(bin, args, { cwd, env, stdin = '', timeoutMs }) {
  return new Promise((resolve) => {
    const started = process.hrtime.bigint();
    let child;
    try {
      child = spawn(bin, args, { cwd, env, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
    } catch (e) {
      resolve({ code: null, stdout: '', stderr: String(e?.message ?? e), timedOut: false, truncated: false, ms: 0, spawnError: true });
      return;
    }

    const out = [];
    const err = [];
    let outBytes = 0;
    let errBytes = 0;
    let truncated = false;
    let timedOut = false;
    let settled = false;

    const collect = (chunks, chunk, which) => {
      const size = which === 'out' ? outBytes : errBytes;
      if (size >= MAX_OUTPUT_BYTES) {
        if (!truncated) {
          truncated = true;
          killTree(child);
        }
        return;
      }
      const room = MAX_OUTPUT_BYTES - size;
      const piece = chunk.length > room ? chunk.subarray(0, room) : chunk;
      chunks.push(piece);
      if (which === 'out') outBytes += piece.length;
      else errBytes += piece.length;
    };

    child.stdout.on('data', (c) => collect(out, c, 'out'));
    child.stderr.on('data', (c) => collect(err, c, 'err'));
    // A program that exits without reading stdin makes the write fail with EPIPE; that is fine.
    child.stdin.on('error', () => {});

    const timer = setTimeout(() => {
      timedOut = true;
      killTree(child);
    }, timeoutMs);

    const done = (code, spawnError = false, message = '') => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({
        code,
        stdout: Buffer.concat(out).toString('utf8'),
        stderr: message || Buffer.concat(err).toString('utf8'),
        timedOut,
        truncated,
        spawnError,
        ms: Number(process.hrtime.bigint() - started) / 1e6
      });
    };

    child.on('error', (e) => done(null, true, e.message));
    child.on('close', (code) => done(code));

    child.stdin.end(stdin);
  });
}

/* --------------------------------------------------------------- helpers */

/** Windows reports crashes as NTSTATUS exit codes; say what they mean. */
function describeExit(code) {
  const known = {
    3221225477: 'Segmentation fault (access violation) - reading or writing memory the program does not own.',
    3221225725: 'Stack overflow - usually recursion that never reaches its base case.',
    3221225620: 'Integer division by zero.',
    3221225501: 'Illegal instruction.',
    139: 'Segmentation fault.',
    136: 'Floating point exception (often division by zero).',
    134: 'Aborted.'
  };
  return known[code] ?? `Process exited with code ${code}.`;
}

/** Keep compiler messages readable: drop the scratch directory from paths. */
function tidy(text, workDir) {
  return text.split(workDir + path.sep).join('').split(workDir).join('').trim();
}

/**
 * The class `java` should launch: the public class if there is one (javac
 * insists the file is named after it), otherwise the class that declares main.
 */
function javaEntry(code) {
  const pkg = code.match(/^\s*package\s+([\w.]+)\s*;/m)?.[1];
  const publicClass = code.match(/public\s+(?:(?:final|abstract|strictfp)\s+)*class\s+(\w+)/)?.[1];
  let mainClass = publicClass;
  if (!mainClass) {
    const mainAt = code.search(/static\s+void\s+main\s*\(/);
    const classes = [...code.matchAll(/\bclass\s+(\w+)/g)];
    const before = classes.filter((m) => mainAt < 0 || m.index < mainAt);
    mainClass = (before.at(-1) ?? classes[0])?.[1] ?? 'Main';
  }
  return { fileName: `${publicClass ?? mainClass}.java`, className: pkg ? `${pkg}.${mainClass}` : mainClass };
}

/* ------------------------------------------------------------------ run */

const ENGINE = { c: 'local-gcc', cpp: 'local-g++', java: 'local-jdk' };

/**
 * Compile and run one program. Resolves to the same ExecutionResult shape the
 * other engines use: { status, stdout, stderr, engine, time, testResults }.
 */
export async function runNative({ language, code, stdin = '' }) {
  const tool = TOOLCHAINS[language];
  const engine = ENGINE[language] ?? 'none';
  if (!tool) {
    return { status: 'error', engine: 'none', stderr: `No local ${language} compiler was found on the server.`, testResults: [] };
  }
  if (Buffer.byteLength(stdin) > MAX_STDIN_BYTES) {
    return { status: 'error', engine, stderr: 'Program input is too large (64 KB max).', testResults: [] };
  }

  if (!(await acquireSlot())) {
    return { status: 'error', engine, stderr: 'The compiler is busy right now. Try again in a few seconds.', testResults: [] };
  }

  let workDir;
  try {
    workDir = await mkdtemp(path.join(os.tmpdir(), 'devlingo-run-'));
    const toolDir = path.dirname(tool.bin ?? tool.javac);
    const env = scrubbedEnv(workDir, [toolDir]);

    /* --------------------------------------------------------- compile */
    let compile;
    let runBin;
    let runArgs;

    if (language === 'java') {
      const { fileName, className } = javaEntry(code);
      await writeFile(path.join(workDir, fileName), code, 'utf8');
      compile = await runProcess(tool.javac, ['-encoding', 'UTF-8', '-nowarn', '-d', 'classes', fileName], {
        cwd: workDir,
        env,
        timeoutMs: COMPILE_TIMEOUT_MS
      });
      runBin = tool.java;
      runArgs = [
        '-Xmx256m',
        '-Xss16m',
        '-XX:+UseSerialGC',
        '-XX:TieredStopAtLevel=1',
        '-Xshare:auto',
        '-Dfile.encoding=UTF-8',
        '-cp',
        'classes',
        className
      ];
    } else {
      const source = language === 'c' ? 'main.c' : 'main.cpp';
      const std = language === 'c' ? '-std=c11' : `-std=${tool.std}`;
      await writeFile(path.join(workDir, source), code, 'utf8');
      // -static: the program must not depend on the compiler's DLLs being on PATH.
      const libs = language === 'c' ? ['-lm'] : [];
      compile = await runProcess(tool.bin, [std, '-O2', '-static', '-pipe', source, '-o', 'main' + EXE, ...libs], {
        cwd: workDir,
        env,
        timeoutMs: COMPILE_TIMEOUT_MS
      });
      runBin = path.join(workDir, 'main' + EXE);
      runArgs = [];
    }

    if (compile.spawnError) {
      return { status: 'error', engine, stderr: `Could not start the compiler: ${compile.stderr}`, testResults: [] };
    }
    if (compile.timedOut) {
      return { status: 'error', engine, stderr: `Compilation took longer than ${COMPILE_TIMEOUT_MS / 1000}s and was stopped.`, testResults: [] };
    }
    if (compile.code !== 0) {
      return {
        status: 'error',
        engine,
        stderr: `Compilation failed:\n\n${tidy(compile.stderr || compile.stdout, workDir)}`,
        time: `${compile.ms.toFixed(0)}ms compile (${tool.label})`,
        testResults: []
      };
    }

    /* ------------------------------------------------------------- run */
    const run = await runProcess(runBin, runArgs, { cwd: workDir, env, stdin, timeoutMs: RUN_TIMEOUT_MS });
    const time = `${run.ms.toFixed(0)}ms run · ${compile.ms.toFixed(0)}ms compile (${tool.label})`;
    const stdout = run.stdout.replace(/\s+$/, '');
    const stderr = tidy(run.stderr, workDir);

    if (run.spawnError) {
      return { status: 'error', engine, stderr: `Could not start the program: ${run.stderr}`, time, testResults: [] };
    }
    if (run.timedOut) {
      return {
        status: 'error',
        engine,
        stdout: stdout || undefined,
        stderr:
          `Your program ran for over ${RUN_TIMEOUT_MS / 1000}s and was stopped. ` +
          'Check for a loop that never ends, or a read from input that you did not provide.',
        time,
        testResults: []
      };
    }
    if (run.truncated) {
      return {
        status: 'error',
        engine,
        stdout,
        stderr: `Output passed ${MAX_OUTPUT_BYTES / 1024} KB and the program was stopped.`,
        time,
        testResults: []
      };
    }
    if (run.code !== 0) {
      return {
        status: 'error',
        engine,
        stdout: stdout || undefined,
        stderr: [stderr, describeExit(run.code)].filter(Boolean).join('\n\n'),
        time,
        testResults: []
      };
    }
    // A clean exit with stderr output (e.g. fprintf(stderr, ...)) still succeeded.
    return {
      status: 'passed',
      engine,
      stdout: [stdout, stderr].filter(Boolean).join('\n') || 'Program finished with no output.',
      time,
      testResults: []
    };
  } catch (e) {
    return { status: 'error', engine, stderr: `The local runner failed: ${e?.message ?? e}`, testResults: [] };
  } finally {
    releaseSlot();
    // Windows can hold the .exe open for a moment after the process dies.
    if (workDir) rm(workDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }).catch(() => {});
  }
}
