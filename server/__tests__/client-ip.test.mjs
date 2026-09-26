/**
 * server/client-ip.js on a real Express app with `trust proxy` set the way
 * server/index.js sets it: the hop count read per request.
 *
 * The production chain is browser -> Vercel -> ngrok -> this server on
 * loopback, so a request arrives on 127.0.0.1 with
 * `X-Forwarded-For: client, vercelEgress`.
 */
import express from 'express';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { clientIp, ipDiagnostics, isLoopbackOrPrivate, trustProxyFn } from '../client-ip.js';

let server;
let base;
let hops = 0;

beforeAll(async () => {
  const app = express();
  app.set('trust proxy', trustProxyFn(() => hops));
  app.get('/ip', (req, res) => res.json({ ip: clientIp(req), diagnostics: ipDiagnostics(req, hops) }));
  server = await new Promise((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  base = `http://127.0.0.1:${server.address().port}`;
});

afterAll(async () => {
  await new Promise((resolve) => server.close(resolve));
});

async function ipWith(forwardedFor) {
  const res = await fetch(`${base}/ip`, { headers: forwardedFor ? { 'x-forwarded-for': forwardedFor } : {} });
  return res.json();
}

describe('clientIp behind the Vercel -> tunnel chain', () => {
  const CHAIN = '203.0.113.9, 76.76.21.21';

  it('is unknown with 0 trusted hops: loopback plus a forwarded header means an untrusted proxy', async () => {
    hops = 0;
    const out = await ipWith(CHAIN);
    expect(out.ip).toBeNull();
    expect(out.diagnostics).toMatchObject({ derived: null, trustworthy: false, forwardedFor: ['203.0.113.9', '76.76.21.21'] });
    expect(out.diagnostics.notes.join(' ')).toContain('Raise the trusted hops');
  });

  it('is the Vercel egress with 1 hop', async () => {
    hops = 1;
    expect((await ipWith(CHAIN)).ip).toBe('76.76.21.21');
  });

  it('is the client with 2 hops', async () => {
    hops = 2;
    const out = await ipWith(CHAIN);
    expect(out.ip).toBe('203.0.113.9');
    expect(out.diagnostics).toMatchObject({ hops: 2, derived: '203.0.113.9', trustworthy: true });
  });

  it('warns when more hops are trusted than there are proxies (the address could be typed)', async () => {
    hops = 3;
    const out = await ipWith(CHAIN);
    expect(out.diagnostics.trustworthy).toBe(false);
    expect(out.diagnostics.notes.join(' ')).toContain('Lower the trusted hops');
  });

  it('is the socket address when there is no forwarded header', async () => {
    for (const h of [0, 2]) {
      hops = h;
      const out = await ipWith(null);
      expect(out.ip).toBe('127.0.0.1');
      expect(out.diagnostics.forwardedFor).toEqual([]);
    }
  });

  it('applies a changed hop count to the very next request', async () => {
    hops = 2;
    expect((await ipWith(CHAIN)).ip).toBe('203.0.113.9');
    hops = 1;
    expect((await ipWith(CHAIN)).ip).toBe('76.76.21.21');
  });
});

describe('isLoopbackOrPrivate', () => {
  it('knows loopback, private and link-local ranges, IPv4-mapped too', () => {
    for (const ip of ['127.0.0.1', '::1', '10.1.2.3', '172.16.0.1', '172.31.255.255', '192.168.1.1', '169.254.1.1', '::ffff:127.0.0.1', 'fd00::1', 'fe80::1']) {
      expect(isLoopbackOrPrivate(ip), ip).toBe(true);
    }
    for (const ip of ['203.0.113.9', '172.32.0.1', '8.8.8.8', '2001:db8::1', '', null, undefined]) {
      expect(isLoopbackOrPrivate(ip), String(ip)).toBe(false);
    }
  });
});

describe('clientIp on a bare request', () => {
  it('strips the IPv4-mapped prefix and never throws on odd input', () => {
    expect(clientIp({ ip: '::ffff:203.0.113.9', headers: {} })).toBe('203.0.113.9');
    expect(clientIp({ headers: {}, socket: { remoteAddress: '198.51.100.7' } })).toBe('198.51.100.7');
    expect(clientIp({})).toBeNull();
    expect(clientIp(null)).toBeNull();
  });

  it('treats a getter that throws or returns nonsense as zero hops', () => {
    expect(trustProxyFn(() => {
      throw new Error('settings not ready');
    })('127.0.0.1', 0)).toBe(false);
    expect(trustProxyFn(() => 'two')('127.0.0.1', 0)).toBe(false);
    expect(trustProxyFn(() => 2)('127.0.0.1', 1)).toBe(true);
    expect(trustProxyFn(() => 2)('127.0.0.1', 2)).toBe(false);
  });
});
