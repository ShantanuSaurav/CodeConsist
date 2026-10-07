import initSqlJs from 'sql.js';
import wasmUrl from 'sql.js/dist/sql-wasm.wasm?url';
import { executeSql, type SqlPayload } from './sql-engine';

self.onmessage = async (event: MessageEvent<SqlPayload>) => {
  try {
    const runtime = await initSqlJs({ locateFile: () => wasmUrl });
    self.postMessage({ type: 'ready' });
    self.postMessage({ type: 'result', result: executeSql(runtime, event.data) });
  } catch (error) {
    self.postMessage({ type: 'result', result: { status: 'error', engine: 'none', stderr: error instanceof Error ? error.message : 'Could not load SQLite.', testResults: [] } });
  }
};
