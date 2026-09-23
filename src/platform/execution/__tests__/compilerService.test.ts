import { beforeEach, describe, expect, it } from 'vitest';
import { compilerService } from '../compilerService';

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
  beforeEach(reset);

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
