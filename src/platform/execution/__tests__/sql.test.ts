import { beforeAll, describe, expect, it } from 'vitest';
import initSqlJs, { type SqlJsStatic } from 'sql.js';
import { executeSql } from '../sql-engine';

let runtime: SqlJsStatic;
beforeAll(async () => { runtime = await initSqlJs(); });

describe('SQLite sandbox', () => {
  it('runs real DDL, writes, joins and multiple result sets', () => {
    const result = executeSql(runtime, { code: "CREATE TABLE names (id INTEGER PRIMARY KEY, name TEXT); INSERT INTO names VALUES(1,'Ada'),(2,NULL); SELECT name FROM names ORDER BY id; SELECT COUNT(*) AS total FROM names;" });
    expect(result.status).toBe('passed');
    expect(result.sqlResults).toEqual([{ columns: ['name'], values: [['Ada'], [null]] }, { columns: ['total'], values: [[2]] }]);
  });

  it('retains empty result columns', () => {
    expect(executeSql(runtime, { code: 'SELECT 1 AS number WHERE 0;' }).sqlResults).toEqual([{ columns: ['number'], values: [] }]);
  });

  it('recreates databases between runs and between test cases', () => {
    executeSql(runtime, { code: 'CREATE TABLE private_data (id);' });
    expect(executeSql(runtime, { code: 'SELECT * FROM private_data;' }).status).toBe('error');
    expect(executeSql(runtime, { code: 'UPDATE items SET value=value+1; SELECT value FROM items;', testCases: [
      { input: 'CREATE TABLE items(value); INSERT INTO items VALUES (4);', expected: '[[5]]' },
      { input: 'CREATE TABLE items(value); INSERT INTO items VALUES (10);', expected: '[[11]]' }
    ] }).status).toBe('passed');
  });

  it('compares ordered rows, duplicate multiplicity, NULL and types exactly', () => {
    const input = "CREATE TABLE items (value); INSERT INTO items VALUES (1),(1),(NULL),('2');";
    expect(executeSql(runtime, { code: 'SELECT value FROM items ORDER BY rowid;', testCases: [{ input, expected: '[[1],[1],[null],["2"]]' }] }).status).toBe('passed');
    for (const code of ['SELECT DISTINCT value FROM items;', 'SELECT value FROM items ORDER BY rowid DESC;', 'SELECT COALESCE(value,0) FROM items;', 'SELECT CAST(value AS INTEGER) FROM items;']) {
      expect(executeSql(runtime, { code, testCases: [{ input, expected: '[[1],[1],[null],["2"]]' }] }).status).toBe('failed');
    }
  });

  it.each(['ATTACH DATABASE \'secret.db\' AS stolen;', 'DETACH stolen;', 'PRAGMA hard_heap_limit=0;', 'VACUUM INTO \'file.db\';', "SELECT load_extension('library');", "SELECT readfile('server/data/db.json');", "SELECT writefile('file','data');", "SELECT \"load_extension\"('library');"] )('rejects host access or configuration: %s', code => {
    expect(executeSql(runtime, { code }).status).toBe('error');
  });

  it('does not confuse literals or comments with forbidden operations', () => {
    expect(executeSql(runtime, { code: "SELECT 'ATTACH PRAGMA' AS text; -- VACUUM\n/* DETACH */" }).status).toBe('passed');
  });

  it('limits output, statements, source size and SQLite allocations', () => {
    for (const code of ['WITH RECURSIVE numbers(value) AS (SELECT 1 UNION ALL SELECT value+1 FROM numbers WHERE value < 1001) SELECT * FROM numbers;', 'SELECT 1;'.repeat(101), ' '.repeat(100001), 'SELECT zeroblob(100000000);']) {
      expect(executeSql(runtime, { code }).status).toBe('error');
    }
  });

  it('requires one result set and well-formed expected rows in graded runs', () => {
    const testCases = [{ input: 'CREATE TABLE items(id);', expected: '[[1]]' }];
    for (const code of ['INSERT INTO items VALUES(1);', 'SELECT 1; SELECT 1;']) expect(executeSql(runtime, { code, testCases }).status).toBe('failed');
    expect(executeSql(runtime, { code: 'SELECT 1;', testCases: [{ input: '', expected: '1' }] }).status).toBe('failed');
  });

  it('enforces declared foreign keys and unique constraints', () => {
    expect(executeSql(runtime, { code: 'CREATE TABLE parents(id INTEGER PRIMARY KEY); CREATE TABLE children(parent_id REFERENCES parents(id)); INSERT INTO children VALUES (99);' }).status).toBe('error');
    expect(executeSql(runtime, { code: 'CREATE TABLE names(name TEXT UNIQUE); INSERT INTO names VALUES (\'Ada\'),(\'Ada\');' }).status).toBe('error');
  });
});
