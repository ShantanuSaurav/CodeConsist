/**
 * server/cors-policy.js on a real Express app mounted the way server/index.js
 * mounts it: the CORS headers first, the foreign-origin guard before the
 * routes. The mode and the admin's extra origins are read per request.
 */
import express from 'express';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ALLOWED_HEADERS, createCorsPolicy, toOrigin } from '../cors-policy.js';

let server;
let base;
const state = { mode: 'report', extra: [] };
const policy = createCorsPolicy({
  getMode: () => state.mode,
  getExtraOrigins: () => state.extra,
  env: { APP_ORIGIN: 'https://codeconsist.example', CORS_ORIGINS: 'https://preview.example.com, not a url' }
});

beforeAll(async () => {
  const app = express();
  app.use(policy.corsMiddleware());
  app.use(policy.foreignOriginGuard());
  app.use(express.json());
  app.get('/api/thing', (_req, res) => res.json({ ok: true }));
  app.post('/api/thing', (_req, res) => res.json({ ok: true }));
  app.post('/not-api', (_req, res) => res.json({ ok: true }));
  server = await new Promise((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  base = `http://127.0.0.1:${server.address().port}`;
});

afterAll(async () => {
  await new Promise((resolve) => server.close(resolve));
});

async function send(method, path, origin, extraHeaders = {}) {
  const res = await fetch(base + path, {
    method,
    headers: { ...(origin ? { origin } : {}), ...(method === 'POST' ? { 'content-type': 'application/json' } : {}), ...extraHeaders },
    body: method === 'POST' ? '{}' : undefined
  });
  const text = await res.text();
  return { status: res.status, headers: res.headers, json: text ? JSON.parse(text) : null };
}

describe('the CORS headers', () => {
  it('are sent to an allowed origin and not to anyone else', async () => {
    state.mode = 'report';
    const allowed = await send('GET', '/api/thing', 'https://codeconsist.example');
    expect(allowed.headers.get('access-control-allow-origin')).toBe('https://codeconsist.example');

    const fromEnv = await send('GET', '/api/thing', 'https://preview.example.com');
    expect(fromEnv.headers.get('access-control-allow-origin')).toBe('https://preview.example.com');

    const foreign = await send('GET', '/api/thing', 'https://evil.example');
    expect(foreign.status).toBe(200);
    expect(foreign.headers.get('access-control-allow-origin')).toBeNull();
  });

  it('answer a preflight with the headers the app sends, X-Time-Zone included', async () => {
    const res = await send('OPTIONS', '/api/thing', 'http://localhost:3000', {
      'access-control-request-method': 'POST',
      'access-control-request-headers': 'content-type, x-time-zone'
    });
    expect(res.status).toBe(204);
    expect(res.headers.get('access-control-allow-origin')).toBe('http://localhost:3000');
    expect(res.headers.get('access-control-allow-headers')).toBe(ALLOWED_HEADERS.join(','));
    expect(ALLOWED_HEADERS).toContain('X-Time-Zone');
    expect(res.headers.get('access-control-max-age')).toBe('600');
  });

  it('follow the admin’s extra origins live', async () => {
    state.extra = ['https://partner.example'];
    expect((await send('GET', '/api/thing', 'https://partner.example')).headers.get('access-control-allow-origin')).toBe('https://partner.example');
    state.extra = [];
    expect((await send('GET', '/api/thing', 'https://partner.example')).headers.get('access-control-allow-origin')).toBeNull();
  });

  it('go to every origin in open mode', async () => {
    state.mode = 'open';
    expect((await send('GET', '/api/thing', 'https://anyone.example')).headers.get('access-control-allow-origin')).toBe('https://anyone.example');
    state.mode = 'report';
  });
});

describe('the foreign-origin guard', () => {
  it('lets a request with no Origin through (webhooks, scripts, same-origin GETs)', async () => {
    state.mode = 'enforce';
    expect((await send('POST', '/api/thing', null)).status).toBe(200);
  });

  it('records and lets through a foreign write in report mode', async () => {
    state.mode = 'report';
    const res = await send('POST', '/api/thing', 'https://reporter.example');
    expect(res.status).toBe(200);
    const recent = policy.status().recent.find((r) => r.origin === 'https://reporter.example');
    expect(recent).toMatchObject({ count: 1, method: 'POST', path: '/api/thing', refused: false });
  });

  it('refuses a foreign write in enforce mode, but not a read', async () => {
    state.mode = 'enforce';
    const write = await send('POST', '/api/thing', 'https://evil.example');
    expect(write.status).toBe(403);
    expect(write.json).toEqual({ error: expect.any(String), reason: 'origin-not-allowed' });
    expect((await send('GET', '/api/thing', 'https://evil.example')).status).toBe(200);
    expect(policy.status().recent[0]).toMatchObject({ origin: 'https://evil.example', refused: true });
  });

  it('lets allowed origins, the server’s own host and non-API paths write', async () => {
    state.mode = 'enforce';
    expect((await send('POST', '/api/thing', 'https://codeconsist.example')).status).toBe(200);
    expect((await send('POST', '/api/thing', base)).status).toBe(200);
    expect((await send('POST', '/not-api', 'https://evil.example')).status).toBe(200);
    state.mode = 'report';
  });

  it('keeps at most the last 100 origins', async () => {
    const small = createCorsPolicy({ getMode: () => 'report', env: {} });
    const guard = small.foreignOriginGuard();
    for (let i = 0; i < 120; i++) {
      guard({ headers: { origin: `https://site${i}.example` }, method: 'POST', path: '/api/x' }, {}, () => {});
    }
    const recent = small.status().recent;
    expect(recent).toHaveLength(100);
    expect(recent[0].origin).toBe('https://site119.example');
  });
});

describe('the allow-list', () => {
  it('names where each origin comes from, first source wins, and drops what is not an origin', () => {
    state.extra = ['https://codeconsist.example', 'https://admin-added.example'];
    const allowed = policy.status().allowed;
    expect(allowed).toEqual([
      { origin: 'https://codeconsist.example', source: 'APP_ORIGIN' },
      { origin: 'https://preview.example.com', source: 'env' },
      { origin: 'https://admin-added.example', source: 'admin' },
      { origin: 'http://localhost:3000', source: 'dev' },
      { origin: 'http://127.0.0.1:3000', source: 'dev' }
    ]);
    state.extra = [];
  });

  it('falls back to report for an unknown mode', () => {
    const odd = createCorsPolicy({ getMode: () => 'sometimes', env: {} });
    expect(odd.status().mode).toBe('report');
  });
});

describe('toOrigin', () => {
  it('normalises an exact origin and refuses anything else', () => {
    expect(toOrigin('https://Example.com/')).toBe('https://example.com');
    expect(toOrigin('http://localhost:3000')).toBe('http://localhost:3000');
    for (const bad of ['https://example.com/app', 'https://*.example.com', 'ftp://example.com', 'example.com', 'https://u@example.com', '', null]) {
      expect(toOrigin(bad), String(bad)).toBeNull();
    }
  });
});
