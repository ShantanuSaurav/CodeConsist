/**
 * The Judge0 path, against a judge that is not Judge0.
 *
 * Every assertion here is about something that used to be unprovable: a
 * keyless endpoint could not be configured at all, the RapidAPI headers went
 * out unconditionally, and there was no stdin. So rather than mocking fetch -
 * which would only prove that the mock was called - these stand up a real HTTP
 * server that speaks Judge0's submission API, point the real code at it, and
 * look at what actually arrived: the headers, the body, the base64.
 *
 * Nothing here talks to a real Judge0, and nothing here compiles or runs any
 * code: the stub answers with canned submission results.
 */
import http from 'node:http';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import {
  JAVA_MEMORY_LIMIT_KB,
  JUDGE0_STDIN_LIMIT,
  buildRuntimes,
  javaEntryPoint,
  judge0Headers,
  resolveJudge0Config,
  runJudge0Submission
} from '../judge0.js';

const b64 = (s) => Buffer.from(s, 'utf8').toString('base64');

/** Every request the stub has seen, so a test can read the wire. */
let received = [];
/** What the stub answers with next: a Judge0 submission result, or a status. */
let reply = null;

let stub;
let stubUrl;

/** A port with nothing on it - for the connection-refused case. */
let deadPort;

beforeAll(async () => {
  stub = http.createServer((req, res) => {
    let body = '';
    req.on('data', (chunk) => (body += chunk));
    req.on('end', () => {
      received.push({
        method: req.method,
        url: req.url,
        headers: req.headers,
        body: body ? JSON.parse(body) : null
      });
      if (reply?.status && reply.status >= 400) {
        res.writeHead(reply.status, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ message: 'nope' }));
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(reply ?? {}));
    });
  });
  await new Promise((resolve) => stub.listen(0, '127.0.0.1', resolve));
  stubUrl = `http://127.0.0.1:${stub.address().port}`;

  // Bind a second socket, learn its port, then let it go: connecting there
  // afterwards is refused immediately, which is exactly what a stopped
  // container looks like.
  const doomed = http.createServer();
  await new Promise((resolve) => doomed.listen(0, '127.0.0.1', resolve));
  deadPort = doomed.address().port;
  await new Promise((resolve) => doomed.close(resolve));
});

afterAll(async () => {
  await new Promise((resolve) => stub.close(resolve));
});

beforeEach(() => {
  received = [];
  reply = null;
});

/** A clean run of `int main(){puts("hi");}`, as Judge0 would report it. */
const ACCEPTED = {
  stdout: b64('hi\n'),
  stderr: null,
  compile_output: null,
  time: '0.012',
  status: { id: 3, description: 'Accepted' }
};

describe('resolveJudge0Config', () => {
  it('counts a keyless URL as configured, and calls it self-hosted', () => {
    // The whole point of this change: Judge0 in Docker on localhost has no
    // API key, and the old Boolean(URL && KEY) made the free option
    // unexpressible.
    const config = resolveJudge0Config({ JUDGE0_API_URL: 'http://localhost:2358' });
    expect(config.configured).toBe(true);
    expect(config.mode).toBe('self-hosted');
    expect(config.key).toBe('');
    expect(config.host).toBe('localhost:2358');
  });

  it('counts a URL plus a key as hosted', () => {
    const config = resolveJudge0Config({
      JUDGE0_API_URL: 'https://judge0-ce.p.rapidapi.com',
      JUDGE0_API_KEY: 'abc123'
    });
    expect(config.configured).toBe(true);
    expect(config.mode).toBe('hosted');
  });

  it('still treats a half-filled .env as unconfigured', () => {
    // .env.example ships these. Believing them turns a clear "needs setup"
    // into a DNS failure at the first submission.
    for (const env of [
      { JUDGE0_API_URL: 'https://your-judge0-endpoint.example.com' },
      { JUDGE0_API_URL: 'https://judge0-ce.p.rapidapi.com', JUDGE0_API_KEY: 'your_rapidapi_key' },
      { JUDGE0_API_URL: 'http://localhost:2358', JUDGE0_AUTH_TOKEN: 'your_token_here' }
    ]) {
      const config = resolveJudge0Config(env);
      expect(config.configured, JSON.stringify(env)).toBe(false);
      expect(config.reason).toBe('placeholder');
    }
  });

  it('is unconfigured, not half-configured, when there is no URL', () => {
    expect(resolveJudge0Config({}).reason).toBe('unset');
    expect(resolveJudge0Config({ JUDGE0_API_URL: '   ' }).reason).toBe('unset');
    // A key with no URL is not an endpoint.
    expect(resolveJudge0Config({ JUDGE0_API_KEY: 'abc123' }).configured).toBe(false);
  });

  it('refuses a URL it cannot parse', () => {
    // `localhost:2358` with the scheme left off is the mistake people make,
    // and `new URL` reads it as the "localhost:" protocol rather than a host.
    for (const url of ['localhost:2358', 'not a url', 'ftp://localhost:2358']) {
      const config = resolveJudge0Config({ JUDGE0_API_URL: url });
      expect(config.configured, url).toBe(false);
      expect(config.reason).toBe('bad-url');
    }
  });

  it('strips a trailing slash so the submissions path stays single-slashed', () => {
    expect(resolveJudge0Config({ JUDGE0_API_URL: 'http://localhost:2358/' }).url).toBe('http://localhost:2358');
  });

  it('accepts the legacy VITE_ names', () => {
    // A .env written for the old client-side architecture keeps working -
    // but only the server reads it now.
    const config = resolveJudge0Config({ VITE_JUDGE0_API_URL: 'http://localhost:2358' });
    expect(config.configured).toBe(true);
  });
});

describe('the headers that go over the wire', () => {
  it('sends no RapidAPI headers to a keyless endpoint', () => {
    // An empty X-RapidAPI-Key earns a 401 from a self-hosted instance for no
    // reason at all, which is a miserable thing to debug.
    const headers = judge0Headers(resolveJudge0Config({ JUDGE0_API_URL: 'http://localhost:2358' }));
    expect(headers['X-RapidAPI-Key']).toBeUndefined();
    expect(headers['X-RapidAPI-Host']).toBeUndefined();
    expect(headers.Authorization).toBeUndefined();
  });

  it('sends the RapidAPI pair when there is a key', () => {
    const headers = judge0Headers(
      resolveJudge0Config({ JUDGE0_API_URL: 'https://judge0-ce.p.rapidapi.com', JUDGE0_API_KEY: 'abc123' })
    );
    expect(headers['X-RapidAPI-Key']).toBe('abc123');
    expect(headers['X-RapidAPI-Host']).toBe('judge0-ce.p.rapidapi.com');
  });

  it('sends a self-hosted auth token both ways Judge0 deployments expect it', () => {
    const headers = judge0Headers(
      resolveJudge0Config({ JUDGE0_API_URL: 'http://localhost:2358', JUDGE0_AUTH_TOKEN: 'shared-secret' })
    );
    expect(headers['X-Auth-Token']).toBe('shared-secret');
    expect(headers.Authorization).toBe('Bearer shared-secret');
    expect(headers['X-RapidAPI-Key']).toBeUndefined();
  });
});

describe('a submission, as the stub receives it', () => {
  it('posts base64 source to the wait=true submissions endpoint', async () => {
    reply = ACCEPTED;
    const config = resolveJudge0Config({ JUDGE0_API_URL: stubUrl });
    await runJudge0Submission(config, { language: 'c', code: 'int main(){}' });

    expect(received).toHaveLength(1);
    const [call] = received;
    expect(call.method).toBe('POST');
    expect(call.url).toBe('/submissions?base64_encoded=true&wait=true');
    expect(call.body.language_id).toBe(50);
    expect(Buffer.from(call.body.source_code, 'base64').toString('utf8')).toBe('int main(){}');
    expect(call.headers['x-rapidapi-key']).toBeUndefined();
  });

  it('carries stdin, base64-encoded', async () => {
    // Without this, the first program anyone writes in Java or C - read a
    // number, print something back - cannot be run at all.
    reply = ACCEPTED;
    const config = resolveJudge0Config({ JUDGE0_API_URL: stubUrl });
    await runJudge0Submission(config, { language: 'java', code: 'class Main{}', stdin: '7\nworld\n' });

    const [call] = received;
    expect(Buffer.from(call.body.stdin, 'base64').toString('utf8')).toBe('7\nworld\n');
  });

  it('omits stdin entirely when there is none', async () => {
    reply = ACCEPTED;
    await runJudge0Submission(resolveJudge0Config({ JUDGE0_API_URL: stubUrl }), { language: 'c', code: 'int main(){}' });
    expect(received[0].body).not.toHaveProperty('stdin');
  });

  it('caps stdin rather than forwarding whatever arrives', async () => {
    reply = ACCEPTED;
    await runJudge0Submission(resolveJudge0Config({ JUDGE0_API_URL: stubUrl }), {
      language: 'c',
      code: 'int main(){}',
      stdin: 'x'.repeat(JUDGE0_STDIN_LIMIT * 2)
    });
    const sent = Buffer.from(received[0].body.stdin, 'base64').toString('utf8');
    expect(sent).toHaveLength(JUDGE0_STDIN_LIMIT);
  });

  it('sends the RapidAPI headers when the endpoint is a hosted one', async () => {
    reply = ACCEPTED;
    const config = resolveJudge0Config({
      JUDGE0_API_URL: stubUrl,
      JUDGE0_API_KEY: 'rapid-key-1',
      JUDGE0_API_HOST: 'judge0-ce.p.rapidapi.com'
    });
    await runJudge0Submission(config, { language: 'cpp', code: 'int main(){}' });

    expect(received[0].headers['x-rapidapi-key']).toBe('rapid-key-1');
    expect(received[0].headers['x-rapidapi-host']).toBe('judge0-ce.p.rapidapi.com');
  });

  it('will not send a language it has no id for', async () => {
    const result = await runJudge0Submission(resolveJudge0Config({ JUDGE0_API_URL: stubUrl }), {
      language: 'rust',
      code: 'fn main(){}'
    });
    expect(result.status).toBe('error');
    expect(received).toHaveLength(0);
  });
});

describe('what comes back', () => {
  const config = () => resolveJudge0Config({ JUDGE0_API_URL: stubUrl });

  it('maps a clean run to passed, with the output and a time', async () => {
    reply = ACCEPTED;
    const result = await runJudge0Submission(config(), { language: 'c', code: 'int main(){}' });
    expect(result).toMatchObject({ status: 'passed', engine: 'judge0', stdout: 'hi' });
    expect(result.time).toBe('12ms (Judge0)');
  });

  it('says so when a program prints nothing', async () => {
    reply = { ...ACCEPTED, stdout: null };
    const result = await runJudge0Submission(config(), { language: 'c', code: 'int main(){}' });
    expect(result.status).toBe('passed');
    expect(result.stdout).toBe('Program finished with no output.');
  });

  it('maps a compile error to error, with the compiler text intact', async () => {
    // The compiler's own words, line number and all, are the most useful
    // thing a compiled-language learner gets. Summarising them loses the
    // only part that says where to look.
    const text = "main.c: In function 'main':\nmain.c:2:12: error: expected ';' before '}' token\n";
    reply = { stdout: null, stderr: null, compile_output: b64(text), time: null, status: { id: 6, description: 'Compilation Error' } };

    const result = await runJudge0Submission(config(), { language: 'c', code: 'int main(){return 0}' });
    expect(result.status).toBe('error');
    expect(result.engine).toBe('judge0');
    expect(result.stderr).toContain("error: expected ';' before '}' token");
    expect(result.stderr).toContain('main.c:2:12');
  });

  it('maps a runtime error to error and keeps whatever was printed first', async () => {
    reply = {
      stdout: b64('starting\n'),
      stderr: b64('Exception in thread "main" java.lang.ArithmeticException: / by zero\n'),
      compile_output: null,
      time: '0.089',
      status: { id: 11, description: 'Runtime Error (NZEC)' }
    };
    const result = await runJudge0Submission(config(), { language: 'java', code: 'class Main{}' });
    expect(result.status).toBe('error');
    expect(result.stderr).toContain('ArithmeticException');
    expect(result.stdout).toBe('starting');
  });

  it('falls back to the status description when a failure is silent', async () => {
    reply = { stdout: null, stderr: null, compile_output: null, time: '5.001', status: { id: 5, description: 'Time Limit Exceeded' } };
    const result = await runJudge0Submission(config(), { language: 'c', code: 'int main(){for(;;);}' });
    expect(result.status).toBe('error');
    expect(result.stderr).toBe('Time Limit Exceeded');
  });

  it('treats compiler warnings on a successful build as a pass, and keeps the output', async () => {
    // Judge0 fills compile_output with warnings even when the build worked.
    // Only status 6 is a failed compile; anything else must show the program's output.
    reply = { ...ACCEPTED, compile_output: b64("main.c:1:5: warning: unused variable 'x'\n") };
    const result = await runJudge0Submission(config(), { language: 'c', code: 'int main(){int x; puts("hi");}' });
    expect(result).toMatchObject({ status: 'passed', stdout: 'hi' });
  });
});

/** The files inside a stored (uncompressed) zip, by name. */
function readStoredZip(base64) {
  const buf = Buffer.from(base64, 'base64');
  const files = {};
  let at = 0;
  while (buf.readUInt32LE(at) === 0x04034b50) {
    const size = buf.readUInt32LE(at + 18);
    const nameLength = buf.readUInt16LE(at + 26);
    const name = buf.subarray(at + 30, at + 30 + nameLength).toString('utf8');
    const start = at + 30 + nameLength;
    files[name] = buf.subarray(start, start + size).toString('utf8');
    at = start + size;
  }
  return files;
}

describe('per-language submissions', () => {
  it('compiles C++ as C++17', async () => {
    reply = ACCEPTED;
    await runJudge0Submission(resolveJudge0Config({ JUDGE0_API_URL: stubUrl }), { language: 'cpp', code: 'int main(){}' });
    expect(received[0].body).toMatchObject({ language_id: 54, compiler_options: '-std=c++17' });
  });

  it('sends self-hosted Java as a multi-file program with small JVM reservations', async () => {
    // Per-process memory limits cap reserved address space, and a stock JVM
    // reserves over a gigabyte before running anything - see judge0.js.
    reply = ACCEPTED;
    const code = 'public class Hello { public static void main(String[] a){ System.out.println("hi"); } }';
    await runJudge0Submission(resolveJudge0Config({ JUDGE0_API_URL: stubUrl }), { language: 'java', code, stdin: 'x' });

    const { body } = received[0];
    expect(body.language_id).toBe(89);
    expect(body.memory_limit).toBe(JAVA_MEMORY_LIMIT_KB);
    expect(body).not.toHaveProperty('source_code');
    expect(Buffer.from(body.stdin, 'base64').toString('utf8')).toBe('x');

    const files = readStoredZip(body.additional_files);
    expect(files['Hello.java']).toBe(code);
    expect(files.compile).toContain('javac -J-Xmx256m');
    expect(files.compile).toContain("'Hello.java'");
    expect(files.run).toMatch(/java -Xmx256m .* -cp \. 'Hello'\n$/);
  });

  it('leaves hosted Java on the stock language, which has cgroups and no reservation problem', async () => {
    reply = ACCEPTED;
    const config = resolveJudge0Config({ JUDGE0_API_URL: stubUrl, JUDGE0_API_KEY: 'k' });
    await runJudge0Submission(config, { language: 'java', code: 'public class Main {}' });
    expect(received[0].body.language_id).toBe(62);
    expect(received[0].body).not.toHaveProperty('memory_limit');
  });
});

describe('javaEntryPoint', () => {
  it('names the file after the public class and launches it', () => {
    expect(javaEntryPoint('public class Hello { public static void main(String[] a){} }')).toEqual({
      fileName: 'Hello.java',
      className: 'Hello'
    });
  });

  it('is not fooled by class names in comments or strings', () => {
    const code = '// public class Wrong {\npublic class Right {\n  String s = "class Nope { static void main(";\n  public static void main(String[] a){}\n}';
    expect(javaEntryPoint(code)).toEqual({ fileName: 'Right.java', className: 'Right' });
  });

  it('launches whichever class declares main when there is no public class', () => {
    const code = 'class Helper { static int f(){ return 1; } }\nclass Prog { public static void main(String[] a){} }';
    expect(javaEntryPoint(code)).toEqual({ fileName: 'Prog.java', className: 'Prog' });
  });

  it('prefers the public class when more than one declares main', () => {
    const code = 'class A { public static void main(String[] a){} }\npublic class B { public static void main(String[] a){} }';
    expect(javaEntryPoint(code)).toEqual({ fileName: 'B.java', className: 'B' });
  });

  it('uses the binary name for a main in a nested class, and honours the package', () => {
    const code = 'package demo.app;\npublic class Outer { static class Inner { public static void main(String[] a){} } }';
    expect(javaEntryPoint(code)).toEqual({ fileName: 'Outer.java', className: 'demo.app.Outer$Inner' });
  });

  it("falls back to Main, so a program without main fails with Java's own message", () => {
    expect(javaEntryPoint('class Util {}')).toEqual({ fileName: 'Main.java', className: 'Main' });
  });
});

describe('failures that will actually happen', () => {
  it('names the host and the container when nothing answers, and leaks nothing else', async () => {
    // A stopped Docker stack is the single likeliest failure once this is
    // set up, and "fetch failed" tells nobody anything.
    const config = resolveJudge0Config({
      JUDGE0_API_URL: `http://127.0.0.1:${deadPort}/private-base-path`,
      JUDGE0_API_KEY: 'super-secret-key'
    });
    const result = await runJudge0Submission(config, { language: 'java', code: 'class Main{}' });

    expect(result.status).toBe('error');
    expect(result.stderr).toContain(`127.0.0.1:${deadPort}`);
    expect(result.stderr).toContain('is the container running?');
    // The host is fair game. The key, the path and the whole URL are not.
    expect(result.stderr).not.toContain('super-secret-key');
    expect(result.stderr).not.toContain('private-base-path');
    expect(result.stderr).not.toContain(config.url);
  });

  it('says the key was rejected when a hosted endpoint answers 401', async () => {
    reply = { status: 401 };
    const config = resolveJudge0Config({ JUDGE0_API_URL: stubUrl, JUDGE0_API_KEY: 'stale-key' });
    const result = await runJudge0Submission(config, { language: 'java', code: 'class Main{}' });

    expect(result.status).toBe('error');
    expect(result.stderr).toContain('rejected the API key (401)');
    expect(result.stderr).not.toContain('stale-key');
  });

  it('points at the shared secret when a self-hosted endpoint answers 403', async () => {
    reply = { status: 403 };
    const config = resolveJudge0Config({ JUDGE0_API_URL: stubUrl, JUDGE0_AUTH_TOKEN: 'shared-secret' });
    const result = await runJudge0Submission(config, { language: 'c', code: 'int main(){}' });

    expect(result.stderr).toContain('JUDGE0_AUTH_TOKEN');
    expect(result.stderr).not.toContain('shared-secret');
  });

  it('explains a 401 from an endpoint we sent no credentials to', async () => {
    reply = { status: 401 };
    const result = await runJudge0Submission(resolveJudge0Config({ JUDGE0_API_URL: stubUrl }), {
      language: 'c',
      code: 'int main(){}'
    });
    expect(result.stderr).toContain('neither JUDGE0_API_KEY nor JUDGE0_AUTH_TOKEN is set');
  });

  it('names the rate limit as a hosted-tier problem, with the fix', async () => {
    reply = { status: 429 };
    const config = resolveJudge0Config({ JUDGE0_API_URL: stubUrl, JUDGE0_API_KEY: 'rapid-key-1' });
    const result = await runJudge0Submission(config, { language: 'c', code: 'int main(){}' });
    expect(result.stderr).toContain('429');
    expect(result.stderr).toContain('self-hosted');
  });

  it('refuses to pretend an unconfigured server can compile', async () => {
    const result = await runJudge0Submission(resolveJudge0Config({}), { language: 'java', code: 'class Main{}' });
    expect(result.status).toBe('error');
    expect(result.engine).toBe('none');
    // Free option first: the hosted key used to be the only route documented,
    // and it is the one that costs a signup and a rate limit.
    expect(result.stderr).toContain('docs/RUNNING-JAVA-C-CPP.md');
    expect(result.stderr.indexOf('Docker')).toBeLessThan(result.stderr.indexOf('RapidAPI'));
  });
});

describe('the runtimes block of /api/health', () => {
  it('reports every language, and never an endpoint', () => {
    const runtimes = buildRuntimes(resolveJudge0Config({ JUDGE0_API_URL: 'http://localhost:2358' }));

    expect(Object.keys(runtimes)).toEqual(['javascript', 'python', 'java', 'c', 'cpp', 'go']);
    expect(runtimes.javascript).toEqual({ available: true, engine: 'node', label: 'Node sandbox' });
    expect(runtimes.python).toEqual({ available: true, engine: 'browser', label: 'CPython (WebAssembly)' });
    expect(runtimes.java).toEqual({ available: true, engine: 'judge0', label: 'Judge0 (self-hosted)' });
    expect(runtimes.go).toEqual({ available: true, engine: 'judge0', label: 'Judge0 (self-hosted)' });

    // A label is a name and a version. A URL, a host or a key in here would
    // be handed straight to the browser by /api/health.
    const labels = JSON.stringify(runtimes);
    expect(labels).not.toMatch(/https?:|localhost|2358/);
  });

  it('distinguishes a hosted judge from a self-hosted one', () => {
    // One is free, private and unmetered; the other is none of those. That is
    // worth a word on the Playground's engine line.
    const runtimes = buildRuntimes(
      resolveJudge0Config({ JUDGE0_API_URL: 'https://judge0-ce.p.rapidapi.com', JUDGE0_API_KEY: 'abc123' })
    );
    expect(runtimes.java).toEqual({ available: true, engine: 'judge0', label: 'Judge0 (hosted)' });
  });

  it('keeps JavaScript and Python available on a server with no Judge0 at all', () => {
    const runtimes = buildRuntimes(resolveJudge0Config({}));

    expect(runtimes.javascript.available).toBe(true);
    expect(runtimes.python.available).toBe(true);
    for (const language of ['java', 'c', 'cpp', 'go']) {
      expect(runtimes[language], language).toEqual({ available: false, engine: 'none', label: 'needs Judge0' });
    }
  });

  it('reports a placeholder .env as unavailable, not as a working judge', () => {
    const runtimes = buildRuntimes(resolveJudge0Config({ JUDGE0_API_URL: 'https://your-judge0.example.com' }));
    expect(runtimes.c.available).toBe(false);
  });

  it('gives each language its own object, so a client cannot mutate the rest', () => {
    const runtimes = buildRuntimes(resolveJudge0Config({ JUDGE0_API_URL: 'http://localhost:2358' }));
    expect(runtimes.java).not.toBe(runtimes.c);
  });
});
