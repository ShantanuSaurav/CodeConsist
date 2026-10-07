import type { ExecutionResult } from '@/types';
import type { SqlPayload } from './sql-engine';

export function runSql(payload: SqlPayload, onProgress?: (message: string) => void): Promise<ExecutionResult> {
  return new Promise(resolve => {
    let worker: Worker;
    try {
      worker = new Worker(new URL('./sql.worker.ts', import.meta.url), { type: 'module' });
    } catch {
      resolve({ status: 'error', engine: 'none', stderr: 'Could not start the SQLite worker.', testResults: [] });
      return;
    }
    let settled = false;
    let timer: ReturnType<typeof setTimeout>;
    const finish = (result: ExecutionResult) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      worker.terminate();
      resolve(result);
    };
    const arm = (duration: number, message: string) => {
      clearTimeout(timer);
      timer = setTimeout(() => finish({ status: 'error', engine: 'sqlite-wasm', stderr: message, testResults: [] }), duration);
    };
    worker.onmessage = event => {
      if (event.data?.type === 'ready') {
        onProgress?.('Running SQL in an isolated database…');
        arm(6000, 'SQL execution timed out after 6 seconds. Reduce the query or dataset.');
      } else if (event.data?.type === 'result') finish(event.data.result);
    };
    worker.onerror = () => finish({ status: 'error', engine: 'none', stderr: 'The SQLite worker stopped unexpectedly.', testResults: [] });
    onProgress?.('Loading SQLite…');
    arm(30000, 'SQLite could not load within 30 seconds. Check your connection and retry.');
    worker.postMessage(payload);
  });
}
