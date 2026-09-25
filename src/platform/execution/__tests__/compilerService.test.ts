import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { compilerService, RUNTIME_UNAVAILABLE_LABEL } from '../compilerService';

/** Which build the module thinks it is in. Mutable, so one test file can check both. */
const env = vi.hoisted(() => ({ isDev: false, isProd: true }));
vi.mock('@/config/env', () => ({ ENV: env }));

function setBuild(isDev: boolean): void {
  env.isDev = isDev;
  env.isProd = !isDev;
}

/**
 * Both setters feed the same UI strings, and they arrive from the same health
 * probe, so the thing worth pinning down is what happens when one of them says
 * nothing: a server built before `runtimes` existed still sends `judge0`, and
 * the Playground must not start calling a working Java engine "needs setup"
 * because the newer key was missing.
 */
function reset(): void {
  compilerService.setRemoteCompilerStatus(false, []);
  compilerService.setServerRuntimes({});
}

describe('compilerService runtimes', () => {
  // The labels below are the development wording; production replaces the
  // unavailable ones (see "compilerService messages by build").
  beforeEach(() => {
    reset();
    setBuild(true);
  });

  afterEach(() => setBuild(false));

  it('falls back to the judge0 flag when the server reports no runtimes', () => {
    expect(compilerService.runtimeAvailable('java')).toBe(false);
    expect(compilerService.engineFor('java')).toBe('requires Judge0 configuration');

    compilerService.setRemoteCompilerStatus(true, ['java', 'c', 'cpp', 'go']);

    expect(compilerService.runtimeAvailable('java')).toBe(true);
    expect(compilerService.engineFor('java')).toBe('Judge0 remote compiler');
  });

  it('prefers the label the server sent, which is the only side that knows which Judge0 it is', () => {
    compilerService.setServerRuntimes({
      java: { available: true, engine: 'judge0', label: 'Judge0 (self-hosted)' },
      c: { available: false, engine: 'none', label: 'needs Judge0' }
    });

    expect(compilerService.engineFor('java')).toBe('Judge0 (self-hosted)');
    expect(compilerService.runtimeAvailable('java')).toBe(true);
    expect(compilerService.engineFor('c')).toBe('needs Judge0');
    expect(compilerService.runtimeAvailable('c')).toBe(false);
  });

  it('keeps the client string for an engine that runs in this browser, because it knows the version', () => {
    compilerService.setServerRuntimes({
      python: { available: true, engine: 'browser', label: 'CPython (WebAssembly)' }
    });

    // The server cannot know which Pyodide this build ships.
    expect(compilerService.engineFor('python')).toMatch(/^CPython \d+\.\d+\.\d+ \(WebAssembly\)$/);
    expect(compilerService.runtimeAvailable('python')).toBe(true);
  });

  it('believes the server over the older flag when the two disagree', () => {
    // A stale `judge0.configured: true` with a runtime that says otherwise has
    // to lose: `runtimes` is the per-language answer, the flag is a summary.
    compilerService.setRemoteCompilerStatus(true, ['java', 'go']);
    compilerService.setServerRuntimes({
      go: { available: false, engine: 'none', label: 'needs Judge0' }
    });

    expect(compilerService.runtimeAvailable('go')).toBe(false);
    expect(compilerService.runtimeAvailable('java')).toBe(true);
  });

  it('still treats the always-available languages as available with nothing reported', () => {
    expect(compilerService.runtimeAvailable('javascript')).toBe(true);
    expect(compilerService.runtimeAvailable('python')).toBe(true);
    expect(compilerService.runtimeAvailable('c')).toBe(false);
  });
});

/**
 * A visitor must never be told to run `npm run dev:api` or edit a `.env`
 * file: they cannot, and it reads as a broken site. Those instructions are for
 * whoever runs the app locally, so they appear in a development build only.
 */
describe('compilerService messages by build', () => {
  const DEV_WORDS = /npm run|\.env|Docker/;

  afterEach(() => {
    vi.unstubAllGlobals();
    reset();
    setBuild(false);
  });

  it('names a missing engine plainly in production, whichever side reported it', () => {
    const SETUP_WORDS = /Judge0|configur|setup/i;
    setBuild(false);

    // Nothing reported yet: the client's own fallback.
    expect(compilerService.engineFor('java')).toBe(RUNTIME_UNAVAILABLE_LABEL);
    expect(compilerService.engineFor('cpp')).not.toMatch(SETUP_WORDS);

    // The server's own "needs Judge0" label, as /api/health sends it.
    compilerService.setServerRuntimes({
      c: { available: false, engine: 'none', label: 'needs Judge0' },
      java: { available: true, engine: 'judge0', label: 'Judge0 (self-hosted)' }
    });
    expect(compilerService.engineFor('c')).toBe(RUNTIME_UNAVAILABLE_LABEL);

    // An engine that works keeps its name, and the browser ones are untouched.
    expect(compilerService.engineFor('java')).toBe('Judge0 (self-hosted)');
    expect(compilerService.engineFor('python')).toMatch(/^CPython /);
    expect(compilerService.engineFor('javascript')).toBe('Node sandbox / browser worker');
  });

  it('keeps the setup wording for a missing engine in development', () => {
    setBuild(true);
    compilerService.setServerRuntimes({ c: { available: false, engine: 'none', label: 'needs Judge0' } });

    expect(compilerService.engineFor('c')).toBe('needs Judge0');
    expect(compilerService.engineFor('java')).toBe('requires Judge0 configuration');
  });

  it('says the server is unreachable in plain words in production', async () => {
    setBuild(false);
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('fetch failed')));

    const result = await compilerService.executeCode('class Main {}', 'java');

    expect(result.status).toBe('error');
    expect(result.stderr).toContain('Java');
    expect(result.stderr).not.toMatch(DEV_WORDS);
  });

  it('keeps the start-the-API instruction in development', async () => {
    setBuild(true);
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('fetch failed')));

    const result = await compilerService.executeCode('int main(void) { return 0; }', 'c');

    expect(result.stderr).toContain('npm run dev:api');
  });

  it('shows the runtime-unavailable sentence alone in production and adds the setup hint in development', async () => {
    const body = {
      status: 'error',
      engine: 'none',
      reason: 'runtime-unavailable',
      stderr: "C++ can't run here right now - this server has no compiler for it yet.",
      devHint: 'Run Judge0 in Docker, then put JUDGE0_API_URL in .env and restart the API server.',
      testResults: []
    };
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(body), { status: 501 })));

    setBuild(false);
    const prod = await compilerService.executeCode('int main() {}', 'cpp');
    expect(prod.reason).toBe('runtime-unavailable');
    expect(prod.stderr).toBe(body.stderr);
    expect(prod.devHint).toBeUndefined();
    expect(JSON.stringify(prod)).not.toMatch(DEV_WORDS);

    setBuild(true);
    const dev = await compilerService.executeCode('int main() {}', 'cpp');
    expect(dev.stderr).toContain(body.stderr);
    expect(dev.stderr).toContain('JUDGE0_API_URL');
  });
});
