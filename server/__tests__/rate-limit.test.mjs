/**
 * server/rate-limit.js: fixed-window counters with an injected clock, the
 * Express middleware in each mode, and the code-runner slots. Everything is
 * in memory, so these need no store at all.
 */
import express from 'express';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { BUCKETS, BUCKET_SETTING, BusyError, createExecutionSlots, createLimiter, rateLimit, retryMinutes, sendTooMany } from '../rate-limit.js';

const rule = (limit, windowSeconds = 60) => ({ limit, windowSeconds });

function clock(start = 1_000_000) {
  let t = start;
  return { now: () => t, advance: (ms) => (t += ms) };
}

describe('createLimiter', () => {
  it('counts per window and starts again once the window is over', () => {
    const c = clock();
    const limiter = createLimiter({ now: c.now });
    expect(limiter.hit('login.ip', '1.2.3.4', rule(2)).allowed).toBe(true);
    expect(limiter.hit('login.ip', '1.2.3.4', rule(2))).toMatchObject({ allowed: true, count: 2, remaining: 0 });
    const third = limiter.hit('login.ip', '1.2.3.4', rule(2));
    expect(third).toMatchObject({ allowed: false, count: 3, limit: 2 });
    expect(third.retryAfterSeconds).toBe(60);

    c.advance(30_000);
    expect(limiter.hit('login.ip', '1.2.3.4', rule(2)).retryAfterSeconds).toBe(30);
    c.advance(30_001);
    expect(limiter.hit('login.ip', '1.2.3.4', rule(2))).toMatchObject({ allowed: true, count: 1 });
  });

  it('keeps buckets and keys apart', () => {
    const limiter = createLimiter({ now: clock().now });
    limiter.hit('login.ip', 'a', rule(1));
    expect(limiter.hit('login.ip', 'a', rule(1)).allowed).toBe(false);
    expect(limiter.hit('login.ip', 'b', rule(1)).allowed).toBe(true);
    expect(limiter.hit('register.ip', 'a', rule(1)).allowed).toBe(true);
  });

  it('peek says whether one more would pass, without counting', () => {
    const limiter = createLimiter({ now: clock().now });
    expect(limiter.peek('login.account', 'a@example.com', rule(2))).toMatchObject({ allowed: true, count: 0 });
    limiter.hit('login.account', 'a@example.com', rule(2));
    limiter.hit('login.account', 'a@example.com', rule(2));
    expect(limiter.peek('login.account', 'a@example.com', rule(2)).allowed).toBe(false);
    expect(limiter.peek('login.account', 'a@example.com', rule(2)).count).toBe(2);
  });

  it('reset forgets one key, or a whole bucket', () => {
    const limiter = createLimiter({ now: clock().now });
    limiter.hit('login.account', 'a', rule(1));
    limiter.hit('login.account', 'b', rule(1));
    expect(limiter.reset('login.account', 'a')).toBe(1);
    expect(limiter.hit('login.account', 'a', rule(1)).allowed).toBe(true);
    expect(limiter.hit('login.account', 'b', rule(1)).allowed).toBe(false);
    expect(limiter.reset('login.account')).toBe(2);
    expect(limiter.hit('login.account', 'b', rule(1)).allowed).toBe(true);
  });

  it('applies a changed rule on the next hit - a shorter window ends sooner', () => {
    const c = clock();
    const limiter = createLimiter({ now: c.now });
    limiter.hit('solve.account', 'u1', rule(1, 600));
    expect(limiter.hit('solve.account', 'u1', rule(1, 600)).allowed).toBe(false);
    // The admin raised the limit: the same window, more room.
    expect(limiter.hit('solve.account', 'u1', rule(5, 600)).allowed).toBe(true);
    // ...and shortened the window: it is over already.
    c.advance(61_000);
    expect(limiter.hit('solve.account', 'u1', rule(5, 60))).toMatchObject({ allowed: true, count: 1 });
  });

  it('treats a missing or broken rule as no limit', () => {
    const limiter = createLimiter({ now: clock().now });
    for (const bad of [null, undefined, {}, { limit: 'x', windowSeconds: 60 }, { limit: 1, windowSeconds: 0 }]) {
      expect(limiter.hit('login.ip', 'a', bad).allowed).toBe(true);
    }
  });

  it('evicts the oldest keys past maxKeys, so invented keys cannot grow it without bound', () => {
    const limiter = createLimiter({ now: clock().now, maxKeys: 3 });
    for (const key of ['a', 'b', 'c', 'd']) limiter.hit('login.ip', key, rule(1));
    expect(limiter.stats().trackedKeys).toBe(3);
    // 'a' was the oldest, so it is gone and counts from zero again.
    expect(limiter.hit('login.ip', 'a', rule(1)).allowed).toBe(true);
    expect(limiter.hit('login.ip', 'd', rule(1)).allowed).toBe(false);
  });

  it('sweeps expired windows at most once a minute', () => {
    const c = clock();
    const limiter = createLimiter({ now: c.now });
    limiter.hit('login.ip', 'a', rule(5, 60));
    c.advance(61_000);
    limiter.hit('login.ip', 'b', rule(5, 60));
    expect(limiter.stats().trackedKeys).toBe(1);
  });

  it('reports refusals and the busiest keys per bucket', () => {
    const limiter = createLimiter({ now: clock().now });
    limiter.hit('login.ip', 'a', rule(1));
    limiter.hit('login.ip', 'a', rule(1));
    limiter.hit('login.ip', 'b', rule(1));
    const stats = limiter.stats();
    expect(Object.keys(stats.buckets)).toEqual(expect.arrayContaining(BUCKETS));
    expect(stats.buckets['login.ip']).toMatchObject({ blocked: 1, keys: 2 });
    expect(stats.buckets['login.ip'].lastBlockedAt).toEqual(expect.any(String));
    expect(stats.buckets['login.ip'].top[0]).toMatchObject({ key: 'a', count: 2 });
    expect(stats.buckets['register.ip']).toMatchObject({ blocked: 0, keys: 0, top: [] });
  });

  it('names a settings key for every bucket', () => {
    for (const bucket of BUCKETS) expect(BUCKET_SETTING[bucket], bucket).toMatch(/^[a-z]+[A-Z][a-zA-Z]+$/);
  });
});

describe('rateLimit middleware', () => {
  let server;
  let base;
  const state = { mode: 'enforce', rule: rule(2, 120), limiter: createLimiter(), slowEntered: 0 };

  beforeAll(async () => {
    const app = express();
    app.get(
      '/limited',
      rateLimit({
        limiter: { hit: (...args) => state.limiter.hit(...args) },
        bucket: 'login.ip',
        rule: () => state.rule,
        key: (req) => req.headers['x-key'] ?? null,
        mode: () => state.mode,
        message: (minutes) => `Slow down for ${minutes} min.`
      }),
      (_req, res) => res.json({ ok: true })
    );
    // The shape of POST /api/auth/login: the limit, then a handler that
    // awaits something slow (bcrypt) before it can say "wrong password".
    app.get(
      '/slow',
      rateLimit({
        limiter: { hit: (...args) => state.limiter.hit(...args) },
        bucket: 'login.account',
        rule: () => state.rule,
        key: (req) => req.headers['x-key'] ?? null,
        mode: () => state.mode
      }),
      async (_req, res) => {
        state.slowEntered += 1;
        await new Promise((resolve) => setTimeout(resolve, 50));
        res.status(401).json({ error: 'wrong' });
      }
    );
    server = await new Promise((resolve) => {
      const s = app.listen(0, '127.0.0.1', () => resolve(s));
    });
    base = `http://127.0.0.1:${server.address().port}`;
  });

  afterAll(async () => {
    await new Promise((resolve) => server.close(resolve));
  });

  const get = async (key) => {
    const res = await fetch(`${base}/limited`, { headers: key ? { 'x-key': key } : {} });
    return { status: res.status, headers: res.headers, json: await res.json() };
  };

  it('answers 429 with the friendly sentence, a reason and Retry-After once over the limit', async () => {
    state.limiter = createLimiter();
    state.mode = 'enforce';
    expect((await get('k1')).status).toBe(200);
    expect((await get('k1')).status).toBe(200);
    const refused = await get('k1');
    expect(refused.status).toBe(429);
    expect(refused.json).toEqual({ error: 'Slow down for 2 min.', reason: 'rate-limited', retryAfterSeconds: expect.any(Number) });
    expect(refused.json.retryAfterSeconds).toBeGreaterThan(100);
    expect(refused.headers.get('retry-after')).toBe(String(refused.json.retryAfterSeconds));
  });

  it('never refuses in log mode, and skips everything when off', async () => {
    state.limiter = createLimiter();
    state.mode = 'log';
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    for (let i = 0; i < 4; i++) expect((await get('k2')).status).toBe(200);
    expect(warn).toHaveBeenCalled();
    expect(state.limiter.stats().buckets['login.ip'].blocked).toBe(2);
    warn.mockRestore();

    state.limiter = createLimiter();
    state.mode = 'off';
    for (let i = 0; i < 4; i++) expect((await get('k3')).status).toBe(200);
    expect(state.limiter.stats().trackedKeys).toBe(0);
  });

  it('skips a request with no key (an unknown address fails open)', async () => {
    state.limiter = createLimiter();
    state.mode = 'enforce';
    for (let i = 0; i < 4; i++) expect((await get(null)).status).toBe(200);
  });

  it('counts before the handler awaits, so a parallel burst cannot all get through', async () => {
    // Fifty guesses for one email arrive together. A check that only looked
    // and counted after the slow part let every one of them through; only the
    // first `limit` may ever reach it.
    state.limiter = createLimiter();
    state.mode = 'enforce';
    state.rule = rule(10, 900);
    state.slowEntered = 0;
    const statuses = await Promise.all(
      Array.from({ length: 50 }, () => fetch(`${base}/slow`, { headers: { 'x-key': 'victim@example.com' } }).then((res) => res.status))
    );
    expect(state.slowEntered).toBe(10);
    expect(statuses.filter((s) => s === 401)).toHaveLength(10);
    expect(statuses.filter((s) => s === 429)).toHaveLength(40);
    state.rule = rule(2, 120);
  });

  it('reads the rule per request', async () => {
    state.limiter = createLimiter();
    state.mode = 'enforce';
    state.rule = rule(1, 120);
    expect((await get('k4')).status).toBe(200);
    expect((await get('k4')).status).toBe(429);
    state.rule = rule(10, 120);
    expect((await get('k4')).status).toBe(200);
    state.rule = null;
    expect((await get('k5')).status).toBe(200);
  });
});

describe('sendTooMany / retryMinutes', () => {
  it('rounds the wait up to whole minutes, never below one', () => {
    expect(retryMinutes(0)).toBe(1);
    expect(retryMinutes(59)).toBe(1);
    expect(retryMinutes(61)).toBe(2);
    expect(retryMinutes(900)).toBe(15);
  });

  it('uses the default sentence when none is given', () => {
    const res = { headers: {}, set(k, v) { this.headers[k] = v; }, status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } };
    sendTooMany(res, 125);
    expect(res.code).toBe(429);
    expect(res.headers['Retry-After']).toBe('125');
    expect(res.body).toEqual({ error: 'Too many attempts - try again in 3 minutes.', reason: 'rate-limited', retryAfterSeconds: 125 });
  });
});

describe('createExecutionSlots', () => {
  const deferred = () => {
    let resolve;
    const promise = new Promise((r) => (resolve = r));
    return { promise, resolve };
  };

  it('runs at most maxConcurrent at once and queues the rest in order', async () => {
    const slots = createExecutionSlots({ config: () => ({ maxConcurrent: 2, maxQueued: 5, queueWaitMs: 5000 }) });
    const gates = [deferred(), deferred(), deferred()];
    const order = [];
    const runs = gates.map((gate, i) =>
      slots.run(async () => {
        order.push(`start ${i}`);
        await gate.promise;
        return i;
      })
    );
    await Promise.resolve();
    await Promise.resolve();
    expect(order).toEqual(['start 0', 'start 1']);
    expect(slots.stats()).toMatchObject({ running: 2, queued: 1 });
    gates[0].resolve();
    await runs[0];
    await vi.waitFor(() => expect(order).toEqual(['start 0', 'start 1', 'start 2']));
    gates[1].resolve();
    gates[2].resolve();
    expect(await Promise.all(runs)).toEqual([0, 1, 2]);
    expect(slots.stats()).toMatchObject({ running: 0, queued: 0, completed: 3 });
  });

  it('throws BusyError when the queue is full', async () => {
    const slots = createExecutionSlots({ config: () => ({ maxConcurrent: 1, maxQueued: 1, queueWaitMs: 5000 }) });
    const gate = deferred();
    const first = slots.run(() => gate.promise);
    const second = slots.run(async () => 'second');
    const third = slots.run(async () => 'third');
    await expect(third).rejects.toBeInstanceOf(BusyError);
    await expect(third).rejects.toMatchObject({ reason: 'queue-full' });
    gate.resolve('first');
    expect(await first).toBe('first');
    expect(await second).toBe('second');
    expect(slots.stats().queueFull).toBe(1);
  });

  it('throws BusyError when the wait for a slot runs out', async () => {
    vi.useFakeTimers();
    try {
      const slots = createExecutionSlots({ config: () => ({ maxConcurrent: 1, maxQueued: 5, queueWaitMs: 1000 }) });
      const gate = deferred();
      const first = slots.run(() => gate.promise);
      const waiting = slots.run(async () => 'never');
      const caught = waiting.catch((err) => err);
      await vi.advanceTimersByTimeAsync(1001);
      const err = await caught;
      expect(err).toBeInstanceOf(BusyError);
      expect(err.reason).toBe('timeout');
      expect(slots.stats()).toMatchObject({ queued: 0, timedOut: 1 });
      gate.resolve();
      await first;
    } finally {
      vi.useRealTimers();
    }
  });

  it('frees the slot when the run throws', async () => {
    const slots = createExecutionSlots({ config: () => ({ maxConcurrent: 1, maxQueued: 0, queueWaitMs: 0 }) });
    await expect(slots.run(async () => { throw new Error('boom'); })).rejects.toThrow('boom');
    expect(await slots.run(async () => 'next')).toBe('next');
  });

  it('reads its numbers live and ignores nonsense', async () => {
    let config = { maxConcurrent: 1, maxQueued: 0, queueWaitMs: 0 };
    const slots = createExecutionSlots({ config: () => config });
    const gate = deferred();
    const first = slots.run(() => gate.promise);
    await expect(slots.run(async () => 1)).rejects.toBeInstanceOf(BusyError);
    config = { maxConcurrent: 2, maxQueued: 0, queueWaitMs: 0 };
    expect(await slots.run(async () => 2)).toBe(2);
    gate.resolve();
    await first;
    config = { maxConcurrent: 'lots', maxQueued: -1 };
    expect(slots.stats()).toMatchObject({ maxConcurrent: 4, maxQueued: 20, queueWaitMs: 10_000 });
  });
});
