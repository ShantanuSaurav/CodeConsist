import initSqlJs from 'sql.js';

let input = '';
for await (const chunk of process.stdin) {
  input += chunk;
  if (input.length > 3_000_000) process.exit(1);
}
try {
  const payload = JSON.parse(input);
  const { executeSql } = await import(payload.enginePath);
  const runtime = await initSqlJs();
  process.send?.({ type: 'ready' });
  process.stdout.write(JSON.stringify(executeSql(runtime, payload)));
} catch {
  process.stdout.write(JSON.stringify({ status: 'error', engine: 'none', stderr: 'Could not initialize SQLite.', testResults: [] }));
}
process.disconnect?.();
