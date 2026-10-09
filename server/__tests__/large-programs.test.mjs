import { describe, expect, it, vi } from 'vitest';
import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import vm from 'node:vm';
import { executionLimits, executionProfile } from '../../src/platform/execution/limits.mjs';
import { createLargeRunAdmission } from '../execution-admission.js';
import { buildSubmissionBody, resolveJudge0Config } from '../judge0.js';
import { runSqlInChild } from '../sql.js';
import { compileTsModule } from '../build.js';

describe('bounded large-program policy', () => {
  it('requires an explicit profile and never raises challenge budgets', () => {
    expect(executionProfile()).toBe('standard');
    expect(executionProfile({ profile: 'unlimited' })).toBe('standard');
    expect(executionLimits({ profile: 'large', testCases: [{}] }).jsSetupMs).toBe(3000);
    expect(executionLimits({ profile: 'large', entryFunction: 'solve' }).pythonMs).toBe(8000);
    expect(executionLimits({ profile: 'large', jsHeapMb: 999999 })).toMatchObject({ jsHeapMb: 512, judgeWallSeconds: 15 });
    expect(Object.isFrozen(executionLimits({ profile: 'large' }))).toBe(true);
  });

  it.each(['c', 'cpp', 'go'])('sends fixed larger compiler limits for %s', language => {
    const config = resolveJudge0Config({ JUDGE0_API_URL: 'http://localhost:2358' });
    const standard = buildSubmissionBody(config, { language, code: 'program' });
    expect(standard.memory_limit).toBeUndefined();
    const large = buildSubmissionBody(config, { language, code: 'program', profile: 'large', stdin: '42' });
    expect(large).toMatchObject({ memory_limit: 524288, cpu_time_limit: 10, wall_time_limit: 15 });
    expect(Buffer.from(large.stdin, 'base64').toString()).toBe('42');
    if (language !== 'go') expect(large.compiler_options).toContain('-O2');
    if (language === 'cpp') expect(large.compiler_options).toContain('-std=c++17');
  });

  it('raises the self-hosted Java heap without enlarging javac or the address-space cap', () => {
    const body = buildSubmissionBody({ mode: 'self-hosted' }, { language: 'java', code: 'public class Main {}', profile: 'large' });
    const zip = Buffer.from(body.additional_files, 'base64').toString();
    expect(zip).toContain('-Xmx512m');
    expect(zip).toContain('-J-Xmx256m');
    expect(body.memory_limit).toBe(1024000);
  });

  it('times out waiting for memory without starting code and preserves standard admission', async () => {
    const admit = createLargeRunAdmission(() => 500 * 1024 * 1024, { queueWaitMs: 10 });
    const task = vi.fn(async () => 42);
    await expect(admit('large', task)).rejects.toThrow();
    expect(task).not.toHaveBeenCalled();
    await expect(admit('standard', task)).resolves.toBe(42);
  });

  it('queues behind a single configured slot and releases reservations after success or failure', async () => {
    const admit = createLargeRunAdmission(() => 4 * 2 ** 30, { maxConcurrent: 1 });
    let release;
    const first = admit('large', () => new Promise(resolve => { release = resolve; }));
    const second = admit('large', async () => 2);
    await Promise.resolve();
    expect(admit.stats().queued).toBe(1);
    release(1);
    await expect(first).resolves.toBe(1);
    await expect(second).resolves.toBe(2);
    await expect(admit('large', async () => { throw new Error('failed'); })).rejects.toThrow('failed');
    await expect(admit('large', async () => 3)).resolves.toBe(3);
  });

  it('runs a 20 MiB SQLite database beyond the standard page cap, in a fresh process', async () => {
    const code = 'CREATE TABLE chunks(value BLOB); INSERT INTO chunks VALUES(zeroblob(10485760)); INSERT INTO chunks VALUES(zeroblob(10485760)); SELECT SUM(length(value)) FROM chunks;';
    expect((await runSqlInChild({ code })).status).toBe('error');
    expect(await runSqlInChild({ code, profile: 'large' })).toMatchObject({ status: 'passed', stdout: '[[20971520]]' });
    expect((await runSqlInChild({ code: 'SELECT * FROM chunks;', profile: 'large' })).status).toBe('error');
  }, 20000);

  it('keeps SQL output limits and file isolation in large mode', async () => {
    const result = await runSqlInChild({ profile: 'large', code: 'WITH RECURSIVE series(value) AS (SELECT 1 UNION ALL SELECT value + 1 FROM series WHERE value < 1001) SELECT value FROM series;' });
    expect(result).toMatchObject({ status: 'error' });
    expect(result.stderr).toContain('Result limit');
    expect((await runSqlInChild({ profile: 'large', code: "ATTACH 'server/data/db.json' AS accounts;" })).status).toBe('error');
  });

  it('runs JavaScript longer than the standard VM deadline without changing challenge timing', async () => {
    const gradingPath = pathToFileURL(await compileTsModule(fileURLToPath(new URL('../../src/platform/grading-engine/grading.ts', import.meta.url)), 'large-program-grading.mjs')).href;
    const run = payload => new Promise((resolve, reject) => {
      const child = spawn(process.execPath, ['--max-old-space-size=128', fileURLToPath(new URL('../runner/js-runner.mjs', import.meta.url))], { windowsHide: true });
      let output = '';
      const timer = setTimeout(() => { child.kill(); reject(new Error('Test runner deadline')); }, 12000);
      child.stdout.on('data', data => { output += data; });
      child.on('error', reject);
      child.on('close', () => { clearTimeout(timer); try { resolve(JSON.parse(output)); } catch (error) { reject(error); } });
      child.stdin.end(JSON.stringify({ ...payload, gradingPath }));
    });
    const code = 'const started = Date.now(); while (Date.now() - started < 3200) {} console.log(42);';
    expect(await run({ code })).toMatchObject({ status: 'error' });
    expect(await run({ code, profile: 'large' })).toMatchObject({ status: 'passed', stdout: '42' });
    expect(await run({ code, profile: 'large', entryFunction: 'solve' })).toMatchObject({ status: 'error' });
    expect(await run({ profile: 'large', code: 'console.log(typeof process, typeof require);' })).toMatchObject({ status: 'passed', stdout: 'undefined undefined' });
  }, 20000);
});

describe('Python worker resource cleanup', () => {
  it.each([false, true])('destroys namespaces on normal and error returns (%s)', async fails => {
    const source = await readFile(new URL('../../src/platform/execution/python.worker.js', import.meta.url), 'utf8');
    const context = vm.createContext({ self: {} });
    vm.runInContext(source, context);
    const destroy = vi.fn();
    let stdout;
    const runtime = {
      setStdout: options => { stdout = options.batched; }, setStderr: () => {},
      globals: { get: () => () => ({ destroy }) },
      runPython: () => { for (let count = 0; count < 20000; count++) stdout('bounded output'); if (fails) throw new Error('bad code'); }
    };
    const result = context.run(runtime, { code: '', testCases: [] });
    expect(destroy).toHaveBeenCalledOnce();
    expect(result.status).toBe(fails ? 'error' : 'passed');
    expect(result.stdout.length).toBeLessThan(8100);
    expect(result.stdout).toContain('output truncated');
  });
});
