import type { Database, SqlJsStatic } from 'sql.js';
import type { ExecutionResult, SqlResultSet, TestCase, TestResult } from '@/types';
import { executionLimits, type ExecutionProfile } from './limits.mjs';

export interface SqlPayload {
  profile?: ExecutionProfile;
  code: string;
  testCases?: TestCase[];
}

const MAX_ROWS = 1000;
const MAX_OUTPUT = 200_000;
const MAX_SQL = 100_000;

function validateSql(sql: string): void {
  if (typeof sql !== 'string' || sql.length > MAX_SQL || sql.includes('\0')) {
    throw new Error('SQL must be text under 100,000 characters without NUL bytes.');
  }
  const tokens = sql.replace(/'(?:''|[^'])*'|"(?:""|[^"])*"|`(?:``|[^`])*`|\[[^\]]*\]|--[^\n]*|\/\*[\s\S]*?\*\//g, ' ');
  if (/\b(?:ATTACH|DETACH|PRAGMA|VACUUM|load_extension|readfile|writefile)\b/i.test(tokens)) {
    throw new Error('File access, extensions and database configuration are disabled in this SQL sandbox.');
  }
}

function query(database: Database, sql: string): SqlResultSet[] {
  validateSql(sql);
  const results: SqlResultSet[] = [];
  let statements = 0;
  let rows = 0;
  let size = 0;
  for (const statement of database.iterateStatements(sql)) {
    try {
      if (++statements > 100) throw new Error('Use at most 100 SQL statements per run.');
      const columns = statement.getColumnNames();
      const values: SqlResultSet['values'] = [];
      while (statement.step()) {
        const row = statement.get().map(value => value instanceof Uint8Array ? Array.from(value).map(byte => byte.toString(16).padStart(2, '0')).join('') : value);
        size += JSON.stringify(row).length;
        if (++rows > MAX_ROWS || size > MAX_OUTPUT) throw new Error('Result limit exceeded. Use LIMIT or select fewer columns (1,000 rows / 200 KB maximum).');
        values.push(row);
      }
      if (columns.length) results.push({ columns, values });
    } finally {
      statement.free();
    }
  }
  return results;
}

function withDatabase<Value>(runtime: SqlJsStatic, action: (database: Database) => Value, payload: SqlPayload): Value {
  const database = new runtime.Database();
  const limits = executionLimits(payload);
  try {
    database.run(`PRAGMA hard_heap_limit=${limits.sqlHeapBytes}; PRAGMA max_page_count=${limits.sqlPages}; PRAGMA foreign_keys=ON; PRAGMA trusted_schema=OFF;`);
    return action(database);
  } finally {
    database.close();
  }
}

export function executeSql(runtime: SqlJsStatic, payload: SqlPayload): ExecutionResult {
  const started = performance.now();
  const testResults: TestResult[] = [];
  try {
    validateSql(payload.code);
    if (!payload.code.trim()) throw new Error('There is no SQL to run yet.');
    if (payload.testCases !== undefined && (!Array.isArray(payload.testCases) || payload.testCases.length > 25)) throw new Error('Use at most 25 SQL test datasets.');
    if (payload.testCases?.length) {
      for (const testCase of payload.testCases) {
        let actual = '';
        let passed = false;
        try {
          const expected: unknown = JSON.parse(testCase.expected);
          if (!Array.isArray(expected) || !expected.every(Array.isArray)) throw new Error('Expected SQL output must be a JSON array of rows.');
          const result = withDatabase(runtime, database => {
            query(database, testCase.input);
            return query(database, payload.code);
          }, payload);
          if (result.length !== 1) throw new Error('Return exactly one result set for each exercise.');
          actual = JSON.stringify(result[0].values);
          passed = actual === JSON.stringify(expected);
        } catch (error) {
          actual = error instanceof Error ? error.message : 'SQL execution failed.';
        }
        testResults.push({ input: testCase.input, expected: testCase.expected, actual, passed });
      }
      return { status: testResults.every(result => result.passed) ? 'passed' : 'failed', engine: 'sqlite-wasm', testResults, time: `${Math.round(performance.now() - started)}ms (SQLite)` };
    }
    const sqlResults = withDatabase(runtime, database => query(database, payload.code), payload);
    return {
      status: 'passed', engine: 'sqlite-wasm', sqlResults, testResults,
      stdout: sqlResults.length ? sqlResults.map(result => JSON.stringify(result.values)).join('\n') : 'SQL completed. No rows returned.',
      time: `${Math.round(performance.now() - started)}ms (SQLite)`
    };
  } catch (error) {
    return { status: 'error', engine: 'sqlite-wasm', stderr: error instanceof Error ? error.message : 'SQL execution failed.', testResults };
  }
}
