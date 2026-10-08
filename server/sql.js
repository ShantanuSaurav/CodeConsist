import { spawn } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { compileTsModule } from './build.js';
import { executionLimits } from '../src/platform/execution/limits.mjs';

let enginePath;

export function prepareSqlEngine() {
  enginePath ??= compileTsModule(fileURLToPath(new URL('../src/platform/execution/sql-engine.ts', import.meta.url)), 'sql-engine.mjs');
  return enginePath;
}

export async function runSqlInChild(payload, timeoutMs = executionLimits(payload).sqlMs) {
  const modulePath = await prepareSqlEngine();
  return new Promise(resolve => {
    const child = spawn(process.execPath, [`--max-old-space-size=${executionLimits(payload).sqlProcessHeapMb}`, fileURLToPath(new URL('./runner/sql-runner.mjs', import.meta.url))], { stdio: ['pipe', 'pipe', 'pipe', 'ipc'], windowsHide: true, env: { SystemRoot: process.env.SystemRoot ?? '', PATH: process.env.PATH ?? '' } });
    let output = '';
    let settled = false;
    const finish = result => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      child.kill();
      resolve(result);
    };
    const fail = message => finish({ status: 'error', engine: 'sqlite-wasm', stderr: message, testResults: [] });
    let timer = setTimeout(() => fail('SQLite initialization timed out. Try again when the server is less busy.'), 30000);
    child.on('message', message => {
      if (message?.type !== 'ready' || settled) return;
      clearTimeout(timer);
      timer = setTimeout(() => fail('SQL execution timed out. Reduce the query or dataset.'), timeoutMs);
    });
    child.stdout.on('data', chunk => {
      output += chunk;
      if (output.length > 2_000_000) fail('SQL output limit exceeded.');
    });
    child.stderr.on('data', () => {});
    child.on('error', () => fail('Could not start the SQLite sandbox.'));
    child.stdin.on('error', () => fail('The SQLite sandbox stopped.'));
    child.on('close', () => {
      if (settled) return;
      try { finish(JSON.parse(output)); } catch { fail('The SQLite sandbox stopped without a result.'); }
    });
    child.stdin.end(JSON.stringify({ ...payload, enginePath: pathToFileURL(modulePath).href }));
  });
}
