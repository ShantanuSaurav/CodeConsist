import express from 'express';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import * as model from '../../src/platform/playground/model.ts';

const disk = vi.hoisted(() => ({ fail: false, writes: [] }));
vi.mock('node:fs/promises', () => ({
  readFile: async () => JSON.stringify({ version: 7, users: [], progress: {} }),
  writeFile: async (_path, value) => { if (disk.fail) throw new Error('Disk full'); disk.writes.push(value); },
  rename: async () => {}, mkdir: async () => {}
}));
import * as store from '../db.js';
import { createPlaygroundRouter } from '../playground-routes.js';
let server;
let base;
beforeAll(async () => {
  await store.load();
  const app = express();
  app.use(express.json({ limit: '256kb' }));
  app.use((req, _res, next) => { req.user = store.findUserById(req.headers['x-user']); next(); });
  app.use('/api', createPlaygroundRouter({
    requireAuth: (req, res, next) => req.user ? next() : res.sendStatus(401),
    writeLimit: (_req, _res, next) => next(), learningDeps: { lib: model }
  }));
  app.use((error, _req, res, _next) => res.status(500).json({ error: error.message }));
  server = await new Promise((resolve) => { const listening = app.listen(0, '127.0.0.1', () => resolve(listening)); });
  base = `http://127.0.0.1:${server.address().port}/api/playground/snippets`;
});
afterAll(async () => { await new Promise((resolve) => server.close(resolve)); });
beforeEach(() => {
  disk.fail = false;
  store.db().users = ['one', 'two'].map((id) => ({ id, email: `${id}@example.test`, username: id, identities: {} }));
  store.db().playgroundSnippets = {};
});
const program = { language: 'javascript', code: 'console.log(1)', stdin: '' };
async function call(method, path = '', body, user = 'one') {
  const response = await fetch(base + path, { method, headers: { 'content-type': 'application/json', ...(user ? { 'x-user': user } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await response.text();
  return { status: response.status, headers: response.headers, data: text.startsWith('{') ? JSON.parse(text) : text };
}
const save = (id = 'snippet-0001', source = program, user = 'one') => call('PUT', `/${id}`, { title: 'Example', program: source, userId: 'two' }, user);

describe('account playground library', () => {
  it('migrates version 7 additively and is idempotent', () => {
    const previous = { version: 7, progress: { one: { xp: 40 } }, drafts: { one: { lesson: { code: 'work' } } } };
    const next = store.migrateState(previous);
    expect(next.version).toBe(8);
    expect(next.playgroundSnippets).toEqual({});
    expect(next.progress).toEqual(previous.progress);
    expect(next.drafts).toEqual(previous.drafts);
    expect(store.migrateState(next)).toEqual(next);
    expect(store.migrateState({ playgroundSnippets: null }).playgroundSnippets).toEqual({});
  });
  it('requires authentication for every operation', async () => {
    for (const [method, path] of [['GET', '?language=javascript'], ['PUT', '/snippet-0001'], ['PATCH', '/snippet-0001'], ['DELETE', '/snippet-0001']]) {
      expect((await call(method, path, undefined, null)).status).toBe(401);
    }
  });
  it('saves durably, filters languages, renames without changing code and deletes', async () => {
    const result = await save();
    expect(result.status).toBe(201);
    expect(JSON.parse(disk.writes.at(-1)).playgroundSnippets.one['snippet-0001'].program).toEqual(program);
    await save('snippet-0002', { language: 'sql', code: 'SELECT 1;', stdin: '' });
    const list = await call('GET', '?language=javascript');
    expect(list.headers.get('cache-control')).toBe('private, no-store');
    expect(list.data.snippets).toHaveLength(1);
    expect((await call('PATCH', '/snippet-0001', { title: 'Renamed', program: {} })).data.snippet).toMatchObject({ title: 'Renamed', program });
    expect((await call('DELETE', '/snippet-0001')).status).toBe(200);
    expect((await call('GET', '?language=javascript')).data.snippets).toEqual([]);
    expect((await call('GET', '?language=sql')).data.snippets).toHaveLength(1);
  });
  it('isolates accounts and ignores submitted ownership', async () => {
    await save();
    expect((await call('GET', '?language=javascript', undefined, 'two')).data.snippets).toEqual([]);
    expect((await call('PATCH', '/snippet-0001', { title: 'Hijack' }, 'two')).status).toBe(404);
    await call('DELETE', '/snippet-0001', undefined, 'two');
    expect((await call('GET', '?language=javascript')).data.snippets).toHaveLength(1);
  });
  it('retries idempotently but refuses a code overwrite', async () => {
    await save();
    expect((await save()).status).toBe(200);
    expect((await save('snippet-0001', { ...program, code: 'different' })).status).toBe(409);
    expect((await call('GET', '?language=javascript')).data.snippets).toHaveLength(1);
  });
  it('stores a complete web project separately from JavaScript', async () => {
    const web = { language: 'web', files: { html: '<h1>Hi</h1>', css: 'h1{color:red}', js: 'console.log(1)' } };
    await save('snippet-web1', web);
    expect((await call('GET', '?language=web')).data.snippets[0].program).toEqual(web);
    expect((await call('GET', '?language=javascript')).data.snippets).toEqual([]);
  });
  it.each(['__proto__', 'constructor', '../escape'])('rejects unsafe ids: %s', async (id) => {
    expect((await save(id)).status).not.toBe(201);
    expect(Object.keys(store.db().playgroundSnippets)).toHaveLength(0);
  });
  it('rejects invalid languages, names and oversized code', async () => {
    expect((await call('GET')).status).toBe(400);
    expect((await call('GET', '?language=html')).status).toBe(400);
    expect((await call('PUT', '/snippet-0001', { title: ' ', program })).status).toBe(400);
    expect((await save('snippet-0001', { ...program, code: 'x'.repeat(100001) })).status).toBe(400);
  });
  it('does not silently evict permanent saves when full', async () => {
    const bucket = {};
    for (let index = 0; index < 100; index++) bucket[`snippet-${index}`] = { id: `snippet-${index}`, program, title: 'Code', updatedAt: '' };
    store.db().playgroundSnippets.one = bucket;
    expect((await save()).status).toBe(409);
    expect(Object.keys(bucket)).toHaveLength(100);
  });
  it('enforces total storage in UTF-8 bytes', async () => {
    store.db().playgroundSnippets.one = { existing: { program: { ...program, code: '漢'.repeat(670000) } } };
    expect((await save()).status).toBe(409);
  });
  it('reports a failed disk write and permits a safe retry', async () => {
    const logging = vi.spyOn(console, 'error').mockImplementation(() => {});
    disk.fail = true;
    expect((await save()).status).toBe(500);
    disk.fail = false;
    expect((await save()).status).toBe(200);
    expect(JSON.parse(disk.writes.at(-1)).playgroundSnippets.one['snippet-0001'].program).toEqual(program);
    logging.mockRestore();
  });
  it('account deletion removes saved playground code', async () => {
    await save();
    store.deleteUser('one');
    expect(store.db().playgroundSnippets.one).toBeUndefined();
  });
});
