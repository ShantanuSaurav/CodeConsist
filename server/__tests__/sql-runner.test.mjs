import { describe, expect, it } from 'vitest';
import { runSqlInChild } from '../sql.js';

describe('server SQLite isolation', () => {
  it('returns actual SQLite rows, not a client-reported pass', async () => {
    const testCases = [{ input: 'CREATE TABLE items(value); INSERT INTO items VALUES (9);', expected: '[[9]]' }];
    expect(await runSqlInChild({ code: 'SELECT value FROM items;', testCases })).toMatchObject({ status: 'passed' });
    expect(await runSqlInChild({ code: 'SELECT 999;', testCases, passed: true })).toMatchObject({ status: 'failed' });
  });
  it('kills runaway queries and runs subsequent submissions normally', async () => {
    const result = await runSqlInChild({ code: 'WITH RECURSIVE forever(value) AS (SELECT 1 UNION ALL SELECT value + 1 FROM forever) SELECT SUM(value) FROM forever;' }, 1000);
    expect(result.status).toBe('error');
    expect(result.stderr).toContain('timed out');
    expect(await runSqlInChild({ code: 'SELECT 42;' })).toMatchObject({ status: 'passed', stdout: '[[42]]' });
  }, 15000);
  it('cannot read application files or load host extensions', async () => {
    expect(await runSqlInChild({ code: "SELECT readfile('server/data/db.json');" })).toMatchObject({ status: 'error' });
    expect(await runSqlInChild({ code: "ATTACH 'server/data/db.json' AS accounts;" })).toMatchObject({ status: 'error' });
  });
});
