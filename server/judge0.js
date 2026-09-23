/**
 * Judge0: the only thing that can run Java, C, C++ or Go here.
 *
 * Nothing in this file compiles or executes learner source on this machine.
 * `/api/execute` is unauthenticated and reachable from the public internet
 * through the tunnel, so untrusted code goes to Judge0 - a sandbox built for
 * exactly that - and nowhere else. There is no local-compiler fallback and
 * there must not be one.
 *
 * Why this is not in server/index.js, where the rest of the Judge0 handling
 * used to live: index.js binds a port the moment it is imported, so nothing
 * in it can be asserted against without starting a whole server. That is why
 * server/__tests__/index-guards.test.mjs resorts to reading the source as
 * text. Endpoint classification, the headers that go over the wire and the
 * mapping of a Judge0 result back to a learner-facing one are precisely the
 * parts worth testing for real, so they live here and
 * server/__tests__/execute-judge0.test.mjs points them at a stub.
 *
 * The previous version required an API key before it would believe Judge0
 * was configured. That is right for RapidAPI's hosted judge0-ce, but a
 * self-hosted instance - the free option, one `docker compose up` away on
 * localhost, with no rate limit and no learner code leaving the laptop - has
 * no key at all, so the one path that costs nothing was the one path the
 * configuration could not express. A key is optional now; a URL is not.
 */

import zlib from 'node:zlib';

/**
 * Judge0 CE language ids. Fixed by the service, not by us:
 * https://ce.judge0.com/languages. `javascript` and `python` are deliberately
 * absent - JavaScript runs in the Node child-process sandbox and Python runs
 * in the browser under Pyodide, and neither should ever be sent out.
 */
export const JUDGE0_LANGUAGE_IDS = { java: 62, c: 50, cpp: 54, go: 60 };

/**
 * How much stdin a submission may carry. The point of stdin is the beginner's
 * first Scanner/scanf program, which reads a line or two; 10 KB is far past
 * anything that needs, and the cap keeps an unauthenticated route from being
 * used to push bulk data at the judge.
 */
export const JUDGE0_STDIN_LIMIT = 10_000;

/** Judge0's own default authentication header (judge0.conf: AUTHN_HEADER). */
const AUTHN_HEADER = 'X-Auth-Token';

/** Judge0 answers a `wait=true` submission only once the program has run. */
const SUBMISSION_TIMEOUT_MS = 20_000;

/** Judge0 CE's "Multi-file program": we ship our own `compile` and `run` scripts in a zip. */
const MULTI_FILE_LANGUAGE_ID = 89;

/** Judge0's status id for "Compilation Error". Anything else with compiler text is only warnings. */
const STATUS_COMPILATION_ERROR = 6;

/**
 * Per-language compiler flags. Judge0 CE's g++ 9.2 defaults to C++14, where
 * structured bindings, `if constexpr` and friends are only warnings-then-
 * errors; tutorials today are written against C++17.
 */
const COMPILER_OPTIONS = { cpp: '-std=c++17' };

/**
 * Java on the self-hosted judge.
 *
 * The laptop's Docker kernel has no cgroup v1 memory controller, so judge0.conf
 * turns on per-process limits: memory is an RLIMIT_AS cap on *reserved*
 * address space, not on what a process touches. A stock JVM reserves a heap
 * sized from the machine's RAM, 1 GB of class space and 240 MB of code cache
 * before running a line, so Judge0's plain Java (id 62, `java Main`, no way to
 * pass flags) dies with "Could not reserve enough space" at any sane limit.
 *
 * So Java goes through the multi-file language instead, with explicit, small
 * reservations on both javac and java. Measured on judge0 1.13.1: these flags
 * start reliably at 1,024,000 KB and give programs a 256 MB heap; 768,000 KB
 * is not enough for the JVM's own threads. judge0.conf's MAX_MEMORY_LIMIT must
 * be at least JAVA_MEMORY_LIMIT_KB or Judge0 rejects the submission.
 *
 * Side benefit: the file is named after the learner's public class, so
 * `public class Hello` works - id 62 hard-codes Main.java.
 */
const JAVA_HOME = '/usr/local/openjdk13';
const JVM_FLAGS = [
  '-Xmx256m',
  '-Xss8m',
  '-XX:ReservedCodeCacheSize=48m',
  '-XX:CompressedClassSpaceSize=48m',
  '-XX:MaxMetaspaceSize=128m',
  '-XX:+UseSerialGC',
  '-XX:TieredStopAtLevel=1',
  '-Xshare:off'
];
export const JAVA_MEMORY_LIMIT_KB = 1_024_000;

/**
 * The values .env.example ships with. Someone who uncomments the block but
 * does not fill it in has NOT configured Judge0, and saying otherwise turns a
 * clear "needs setup" into a mystifying DNS failure at run time. Both spellings
 * are matched because the example file has used a dash in one place and an
 * underscore in another.
 */
const PLACEHOLDER = /^your[-_]|your[-_]judge0/i;

function clean(...candidates) {
  for (const candidate of candidates) {
    const value = typeof candidate === 'string' ? candidate.trim() : '';
    if (value) return value;
  }
  return '';
}

/**
 * Work out what - if anything - we are pointed at.
 *
 *   self-hosted  a URL and no key: Judge0 running in Docker, typically
 *                http://localhost:2358, optionally behind JUDGE0_AUTH_TOKEN.
 *   hosted       a URL and a key: RapidAPI's judge0-ce, which wants the
 *                X-RapidAPI-* pair.
 *   none         nothing usable. `reason` says which kind of nothing, so the
 *                startup log can tell "unset" from "you typed a URL wrong".
 *
 * `JUDGE0_API_URL` / `JUDGE0_API_KEY` / `JUDGE0_API_HOST` are the current
 * names; the `VITE_JUDGE0_*` names are still accepted so a .env written for
 * the old client-side architecture keeps working - but only the server reads
 * either set.
 */
export function resolveJudge0Config(env = process.env) {
  const rawUrl = clean(env.JUDGE0_API_URL, env.VITE_JUDGE0_API_URL);
  const key = clean(env.JUDGE0_API_KEY, env.VITE_JUDGE0_API_KEY);
  const authToken = clean(env.JUDGE0_AUTH_TOKEN);
  const apiHost = clean(env.JUDGE0_API_HOST, env.VITE_JUDGE0_API_HOST) || 'judge0-ce.p.rapidapi.com';

  const unconfigured = (reason) => ({
    configured: false,
    mode: 'none',
    reason,
    url: '',
    host: '',
    key: '',
    authToken: '',
    apiHost
  });

  if (!rawUrl) return unconfigured('unset');
  // A half-filled .env reads as unconfigured, whichever half is still the
  // example value.
  if (PLACEHOLDER.test(rawUrl) || (key && PLACEHOLDER.test(key)) || (authToken && PLACEHOLDER.test(authToken))) {
    return unconfigured('placeholder');
  }

  // Refuse to call something unparseable configured: `localhost:2358` with no
  // scheme throws here, and reporting it as ready produces a failure at the
  // first submission instead of at boot, where it belongs.
  let parsed;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return unconfigured('bad-url');
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return unconfigured('bad-url');

  return {
    configured: true,
    // A key means RapidAPI-style hosting. An auth token does not: self-hosted
    // Judge0 has its own AUTHN_TOKEN and is still self-hosted.
    mode: key ? 'hosted' : 'self-hosted',
    reason: 'ok',
    // Trailing slashes off, so `${url}/submissions` cannot become `//submissions`
    // - some reverse proxies in front of self-hosted instances 404 on that.
    url: rawUrl.replace(/\/+$/, ''),
    // Host and port only. This is the one part of the endpoint that may appear
    // in a message shown to a learner: never the path, never the userinfo,
    // never the key.
    host: parsed.host,
    key,
    authToken,
    apiHost
  };
}

/**
 * The headers for one submission. Sending `X-RapidAPI-Key: ` (empty) to a
 * self-hosted instance earns a confusing 401 for no reason, so the RapidAPI
 * pair goes out only when there is a key to put in it.
 */
export function judge0Headers(config) {
  const headers = { 'Content-Type': 'application/json' };
  if (config.key) {
    headers['X-RapidAPI-Key'] = config.key;
    headers['X-RapidAPI-Host'] = config.apiHost;
  }
  if (config.authToken) {
    // Judge0's own scheme first; a reverse proxy in front of a self-hosted
    // instance usually wants the bearer form instead, and sending both costs
    // nothing.
    headers[AUTHN_HEADER] = config.authToken;
    headers.Authorization = `Bearer ${config.authToken}`;
  }
  return headers;
}

/**
 * What the Playground shows on its engine line, and what the client uses to
 * decide whether a language is worth offering.
 *
 * `available` mirrors "something is configured that can run this", not "the
 * container answered a moment ago": /api/health is synchronous and polled, and
 * making it probe Docker on every call would trade a fast honest answer for a
 * slow one that is stale anyway. A configured-but-stopped container is caught
 * where it actually matters - the submission fails with "did you start the
 * container?" rather than a stack trace. The label never contains a URL, a
 * host or a key; it is a name, and its one job is to say whether this is the
 * free local judge or the rate-limited hosted one.
 */
export function buildRuntimes(config) {
  const compiled = config?.configured
    ? { available: true, engine: 'judge0', label: config.mode === 'hosted' ? 'Judge0 (hosted)' : 'Judge0 (self-hosted)' }
    : { available: false, engine: 'none', label: 'needs Judge0' };

  const runtimes = {
    javascript: { available: true, engine: 'node', label: 'Node sandbox' },
    python: { available: true, engine: 'browser', label: 'CPython (WebAssembly)' }
  };
  for (const language of Object.keys(JUDGE0_LANGUAGE_IDS)) {
    runtimes[language] = { ...compiled };
  }
  return runtimes;
}

/**
 * What to tell someone whose language has no engine. Leads with the free
 * option deliberately: the hosted key used to be the only documented route,
 * and it is the worse one - it costs a signup, it is rate limited, and it
 * means posting learners' code to a third party.
 */
export function judge0SetupHint(language) {
  return (
    `Running ${language} needs a Judge0 engine and none is configured. JavaScript and Python already ` +
    'work with no setup. The free way to get the rest is to run Judge0 in Docker on this machine - no ' +
    'account, no key, no rate limit, and code never leaves the laptop: docs/RUNNING-JAVA-C-CPP.md has ' +
    'the exact steps. Then put JUDGE0_API_URL=http://localhost:2358 in .env at the project root and ' +
    'restart the API server. A hosted endpoint works too: set JUDGE0_API_URL and JUDGE0_API_KEY ' +
    '(RapidAPI judge0-ce) in the same file.'
  );
}

/* ------------------------------------------------------------------ Java */

/**
 * The source with comments, string/char literals and text blocks blanked out
 * (same length, newlines kept), so a `class` inside a comment or a string can
 * never be mistaken for a declaration.
 */
function stripJavaNoise(code) {
  let out = '';
  let i = 0;
  const blank = (s) => s.replace(/[^\n]/g, ' ');
  while (i < code.length) {
    const rest = code.slice(i);
    let m;
    if ((m = rest.match(/^\/\/[^\n]*/)) || (m = rest.match(/^\/\*[\s\S]*?(\*\/|$)/)) || (m = rest.match(/^"""[\s\S]*?("""|$)/)) ||
        (m = rest.match(/^"(?:\\.|[^"\\\n])*"?/)) || (m = rest.match(/^'(?:\\.|[^'\\\n])*'?/))) {
      out += blank(m[0]);
      i += m[0].length;
    } else {
      out += code[i];
      i += 1;
    }
  }
  return out;
}

/**
 * Where javac wants the source (`Hello.java` for `public class Hello`) and
 * which class `java` should launch: the type that declares `main`, preferring
 * the public top-level class when several do. Nested types get their binary
 * name (`Outer$Inner`); a `package` line is honoured.
 */
export function javaEntryPoint(code) {
  const src = stripJavaNoise(String(code ?? ''));
  const pkg = src.match(/^\s*package\s+([\w.]+)\s*;/m)?.[1];

  // Walk declarations and braces together so every `main` knows its enclosing type.
  const token = /\b(?:(public)\s+)?(?:(?:abstract|final|static|strictfp|sealed|non-sealed)\s+)*(?:class|interface|enum|record)\s+([A-Za-z_$][\w$]*)|\bstatic\b[^;{}()]*?\bvoid\s+main\s*\(|[{}]/g;
  const stack = [];
  let depth = 0;
  let pending = null;
  let publicTopLevel = null;
  const mains = [];
  let m;
  while ((m = token.exec(src))) {
    if (m[0] === '{') {
      depth += 1;
      if (pending) {
        stack.push({ ...pending, depth });
        pending = null;
      }
    } else if (m[0] === '}') {
      if (stack.length && stack[stack.length - 1].depth === depth) stack.pop();
      depth = Math.max(0, depth - 1);
    } else if (m[2]) {
      const outer = stack.length ? stack[stack.length - 1] : null;
      const binary = outer ? `${outer.binary}$${m[2]}` : m[2];
      pending = { name: m[2], binary, topLevel: !outer, isPublic: Boolean(m[1]) };
      if (!outer && m[1] && !publicTopLevel) publicTopLevel = m[2];
    } else if (stack.length) {
      mains.push(stack[stack.length - 1]);
    }
  }

  const chosen = mains.find((t) => t.topLevel && t.name === publicTopLevel) ?? mains.find((t) => t.topLevel) ?? mains[0];
  const className = chosen?.binary ?? publicTopLevel ?? 'Main';
  return {
    fileName: `${publicTopLevel ?? className.split('$')[0]}.java`,
    className: pkg ? `${pkg}.${className}` : className
  };
}

/** A zip with every entry stored uncompressed - all Judge0's unzip needs, and no dependency. */
export function storedZip(files) {
  const parts = [];
  const central = [];
  let offset = 0;
  for (const [name, text] of Object.entries(files)) {
    const data = Buffer.from(text, 'utf8');
    const fileName = Buffer.from(name, 'utf8');
    const crc = zlib.crc32(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(fileName.length, 26);
    const entry = Buffer.alloc(46);
    entry.writeUInt32LE(0x02014b50, 0);
    entry.writeUInt16LE(20, 4);
    entry.writeUInt16LE(20, 6);
    entry.writeUInt32LE(crc, 16);
    entry.writeUInt32LE(data.length, 20);
    entry.writeUInt32LE(data.length, 24);
    entry.writeUInt16LE(fileName.length, 28);
    entry.writeUInt32LE(offset, 42);
    parts.push(local, fileName, data);
    central.push(entry, fileName);
    offset += local.length + fileName.length + data.length;
  }
  const directory = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(central.length / 2, 8);
  end.writeUInt16LE(central.length / 2, 10);
  end.writeUInt32LE(directory.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...parts, directory, end]);
}

/** Single-quote for bash, so a file or class name can never become shell syntax. */
const shellQuote = (s) => `'${String(s).replace(/'/g, `'\\''`)}'`;

/**
 * The submission body for one run. Everything except self-hosted Java is a
 * plain single-file submission; see JAVA_MEMORY_LIMIT_KB for why that one is not.
 */
export function buildSubmissionBody(config, { language, code, stdin = '' }) {
  const encode = (str) => Buffer.from(str, 'utf8').toString('base64');
  let body;

  if (language === 'java' && config?.mode === 'self-hosted') {
    const { fileName, className } = javaEntryPoint(code);
    const javacFlags = JVM_FLAGS.map((flag) => `-J${flag}`).join(' ');
    const zip = storedZip({
      [fileName]: code,
      compile: `${JAVA_HOME}/bin/javac ${javacFlags} -encoding UTF-8 -nowarn -d . ${shellQuote(fileName)}\n`,
      run: `${JAVA_HOME}/bin/java ${JVM_FLAGS.join(' ')} -Dfile.encoding=UTF-8 -cp . ${shellQuote(className)}\n`
    });
    body = { language_id: MULTI_FILE_LANGUAGE_ID, additional_files: zip.toString('base64'), memory_limit: JAVA_MEMORY_LIMIT_KB };
  } else {
    body = { source_code: encode(code), language_id: JUDGE0_LANGUAGE_IDS[language] };
    if (COMPILER_OPTIONS[language]) body.compiler_options = COMPILER_OPTIONS[language];
  }

  const input = typeof stdin === 'string' ? stdin.slice(0, JUDGE0_STDIN_LIMIT) : '';
  if (input) body.stdin = encode(input);
  return body;
}

/** A failed submission, in the shape /api/execute always returns. */
function failure(stderr, extra = {}) {
  return { status: 'error', engine: 'judge0', stderr, testResults: [], ...extra };
}

/**
 * Run one submission and map the answer back.
 *
 * `stdin` is threaded through because without it Java and C are close to
 * useless for a beginner: the first program anyone writes in either reads a
 * number with Scanner or scanf, and a judge with no stdin just hangs or reads
 * EOF. It is base64 like the source, because the request already asks for
 * base64_encoded=true.
 */
export async function runJudge0Submission(config, { language, code, stdin = '' } = {}) {
  const languageId = JUDGE0_LANGUAGE_IDS[language];
  if (!languageId) {
    return { status: 'error', engine: 'none', stderr: `${language} is not supported by the configured compiler.`, testResults: [] };
  }
  if (!config?.configured) {
    return { status: 'error', engine: 'none', stderr: judge0SetupHint(language), testResults: [] };
  }

  const decode = (b64) => (b64 ? Buffer.from(b64, 'base64').toString('utf8') : '');

  const body = buildSubmissionBody(config, { language, code, stdin });

  const started = process.hrtime.bigint();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), SUBMISSION_TIMEOUT_MS);

  let response;
  try {
    response = await fetch(`${config.url}/submissions?base64_encoded=true&wait=true`, {
      method: 'POST',
      headers: judge0Headers(config),
      body: JSON.stringify(body),
      signal: controller.signal
    });
  } catch (e) {
    // The two ways this realistically fails, said in a way that names the fix.
    // Only the host goes into the message: the full URL can carry a path or
    // userinfo, and the key must never appear in something a learner sees.
    if (e?.name === 'AbortError') {
      return failure(
        `Judge0 at ${config.host} did not answer within ${SUBMISSION_TIMEOUT_MS / 1000}s. The submission may ` +
          'still be queued - try again, and check the judge is not overloaded.'
      );
    }
    return failure(
      `Judge0 is configured at ${config.host} but did not answer - is the container running? ` +
        'Start it with the compose file in ops/judge0 (docs/RUNNING-JAVA-C-CPP.md), then try again.'
    );
  } finally {
    clearTimeout(timer);
  }

  if (response.status === 401 || response.status === 403) {
    if (config.key) {
      return failure(
        `Judge0 at ${config.host} rejected the API key (${response.status}). Check JUDGE0_API_KEY and ` +
          'JUDGE0_API_HOST in .env, and that the RapidAPI subscription is still active.'
      );
    }
    if (config.authToken) {
      return failure(`Judge0 at ${config.host} rejected JUDGE0_AUTH_TOKEN (${response.status}). It must match AUTHN_TOKEN in judge0.conf.`);
    }
    return failure(
      `Judge0 at ${config.host} wants authentication (${response.status}) but neither JUDGE0_API_KEY nor ` +
        'JUDGE0_AUTH_TOKEN is set.'
    );
  }
  if (response.status === 429) {
    return failure(
      `Judge0 at ${config.host} is rate limiting this server (429). A hosted free tier runs out; a ` +
        'self-hosted instance does not - see docs/RUNNING-JAVA-C-CPP.md.'
    );
  }
  if (!response.ok) {
    return failure(`Judge0 at ${config.host} replied ${response.status}.`);
  }

  let data;
  try {
    data = await response.json();
  } catch {
    return failure(`Judge0 at ${config.host} replied with something that was not JSON.`);
  }

  const compileOutput = decode(data.compile_output).trim();
  const stderrText = decode(data.stderr).trim();
  const stdout = decode(data.stdout).trim();
  const elapsedMs = Number(process.hrtime.bigint() - started) / 1e6;
  const time = data.time ? `${(parseFloat(data.time) * 1000).toFixed(0)}ms (Judge0)` : `${elapsedMs.toFixed(0)}ms (Judge0)`;

  // The compiler's own text, verbatim. "error: expected ';' before '}'" with a
  // line number is the single most useful thing a compiled-language learner
  // can be handed, and summarising it would throw that away. Only status 6 is
  // a failed compile: Judge0 also fills compile_output with warnings from a
  // build that succeeded, and treating those as errors threw away the
  // program's real output.
  if (data.status?.id === STATUS_COMPILATION_ERROR) {
    return failure(compileOutput || 'Compilation failed.', { time });
  }

  if (stderrText || (data.status?.id && data.status.id > 3)) {
    return failure(stderrText || data.status?.description || 'Runtime error', {
      stdout: stdout || undefined,
      time
    });
  }
  return { status: 'passed', engine: 'judge0', stdout: stdout || 'Program finished with no output.', time, testResults: [] };
}
