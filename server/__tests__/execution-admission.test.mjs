import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createLargeRunAdmission, largeRunBusyMessage, LARGE_RUN_POLICY } from '../execution-admission.js';

const gib = 1024 ** 3;
const deferred = () => {
  let resolve;
  let reject;
  const promise = new Promise((accept, refuse) => { resolve = accept; reject = refuse; });
  return { promise, resolve, reject };
};

describe('memory-aware large-run scheduler', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); });

  it('keeps finite production limits and leaves standard admission alone', async () => {
    expect(LARGE_RUN_POLICY).toMatchObject({ maxQueued: 8, queueWaitMs: 30000, jobBytes: gib });
    expect(LARGE_RUN_POLICY.maxConcurrent).toBeLessThanOrEqual(2);
    const admit = createLargeRunAdmission(() => 0);
    expect(await admit('standard', async () => 42)).toBe(42);
    expect(admit.stats()).toMatchObject({ running: 0, queued: 0 });
  });

  it('runs two jobs concurrently with sufficient memory, and never a third', async () => {
    const admit = createLargeRunAdmission(() => 8 * gib, { maxConcurrent: 2 });
    const first = deferred();
    const second = deferred();
    const started = [];
    const results = [admit('large', () => { started.push(1); return first.promise; }), admit('large', () => { started.push(2); return second.promise; }), admit('large', () => { started.push(3); return 3; })];
    await vi.advanceTimersByTimeAsync(0);
    expect(started).toEqual([1, 2]);
    expect(admit.stats()).toMatchObject({ running: 2, queued: 1 });
    first.resolve(1);
    await vi.advanceTimersByTimeAsync(0);
    expect(started).toEqual([1, 2, 3]);
    second.resolve(2);
    expect(await Promise.all(results)).toEqual([1, 2, 3]);
    await vi.advanceTimersByTimeAsync(0);
    expect(admit.stats()).toMatchObject({ running: 0, queued: 0 });
  });

  it('reserves memory before actual allocations and preserves FIFO order at lower capacity', async () => {
    const admit = createLargeRunAdmission(() => 2 * gib, { maxConcurrent: 2 });
    const first = deferred();
    const order = [];
    const results = [admit('large', () => { order.push(1); return first.promise; }), admit('large', () => { order.push(2); return 2; }), admit('large', () => { order.push(3); return 3; })];
    await vi.advanceTimersByTimeAsync(0);
    expect(order).toEqual([1]);
    expect(admit.stats()).toMatchObject({ running: 1, queued: 2 });
    first.resolve(1);
    expect(await Promise.all(results)).toEqual([1, 2, 3]);
    expect(order).toEqual([1, 2, 3]);
  });

  it('automatically resumes queued work when memory returns without another request', async () => {
    let memory = 0;
    const admit = createLargeRunAdmission(() => memory);
    const task = vi.fn(() => 42);
    const result = admit('large', task);
    await vi.advanceTimersByTimeAsync(500);
    expect(task).not.toHaveBeenCalled();
    memory = 2 * gib;
    await vi.advanceTimersByTimeAsync(250);
    expect(await result).toBe(42);
    expect(task).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('expires queued work without ever executing it', async () => {
    const admit = createLargeRunAdmission(() => 0);
    const task = vi.fn();
    const result = admit('large', task).catch(error => error);
    await vi.advanceTimersByTimeAsync(30001);
    expect((await result).reason).toBe('large-queue-timeout');
    expect(task).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('bounds queue length and removes disconnected requests and timers', async () => {
    const admit = createLargeRunAdmission(() => 0);
    const controller = new AbortController();
    const task = vi.fn();
    const queued = Array.from({ length: 8 }, () => admit('large', task, { signal: controller.signal }).catch(error => error));
    await expect(admit('large', task)).rejects.toMatchObject({ reason: 'large-queue-full' });
    expect(admit.stats().queued).toBe(8);
    controller.abort();
    expect((await Promise.all(queued)).every(error => error.reason === 'client-disconnected')).toBe(true);
    expect(task).not.toHaveBeenCalled();
    expect(admit.stats().queued).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('rejects an already disconnected request before reserving memory', async () => {
    const controller = new AbortController();
    controller.abort();
    const task = vi.fn();
    const admit = createLargeRunAdmission(() => 8 * gib);
    await expect(admit('large', task, { signal: controller.signal })).rejects.toMatchObject({ reason: 'client-disconnected' });
    expect(task).not.toHaveBeenCalled();
    expect(admit.stats().running).toBe(0);
  });

  it('releases reservations for synchronous throws and rejected tasks', async () => {
    const admit = createLargeRunAdmission(() => 2 * gib);
    const first = admit('large', () => { throw new Error('sync'); }).catch(error => error.message);
    const second = admit('large', () => Promise.reject(new Error('async'))).catch(error => error.message);
    const third = admit('large', () => 42);
    expect(await Promise.all([first, second, third])).toEqual(['sync', 'async', 42]);
    await vi.advanceTimersByTimeAsync(0);
    expect(admit.stats()).toMatchObject({ running: 0, queued: 0 });
  });

  it('keeps an active reservation after disconnect until the actual task finishes', async () => {
    const controller = new AbortController();
    const active = deferred();
    const admit = createLargeRunAdmission(() => 8 * gib, { maxConcurrent: 1 });
    const result = admit('large', () => active.promise, { signal: controller.signal });
    await vi.advanceTimersByTimeAsync(0);
    controller.abort();
    expect(admit.stats().running).toBe(1);
    active.resolve(42);
    expect(await result).toBe(42);
    await vi.advanceTimersByTimeAsync(0);
    expect(admit.stats().running).toBe(0);
  });

  it('fails closed if the memory reading is unavailable or invalid', async () => {
    for (const memory of [() => NaN, () => Infinity, () => { throw new Error('unavailable'); }]) {
      const admit = createLargeRunAdmission(memory);
      const controller = new AbortController();
      const task = vi.fn();
      const result = admit('large', task, { signal: controller.signal }).catch(error => error);
      expect(task).not.toHaveBeenCalled();
      controller.abort();
      expect((await result).reason).toBe('client-disconnected');
    }
  });

  it('distinguishes full queues from expired memory/capacity waits', () => {
    expect(largeRunBusyMessage({ reason: 'large-queue-full' })).toContain('8 waiting');
    expect(largeRunBusyMessage({ reason: 'large-queue-timeout' })).toContain('waited 30 seconds');
    expect(largeRunBusyMessage({ reason: 'timeout' })).toBeNull();
  });

  it('scales beyond two after an admin edit without restarting', async () => {
    let config = { maxConcurrent: 2, runnerCapacity: 8 };
    const admit = createLargeRunAdmission(() => 32 * gib, { config: () => config, cpuCapacity: () => 8 });
    const gate = deferred();
    const task = vi.fn(() => gate.promise);
    const runs = Array.from({ length: 5 }, () => admit('large', task));
    await vi.advanceTimersByTimeAsync(0);
    expect(task).toHaveBeenCalledTimes(2);
    config = { maxConcurrent: 5, runnerCapacity: 8 };
    await vi.advanceTimersByTimeAsync(250);
    expect(task).toHaveBeenCalledTimes(5);
    expect(admit.stats()).toMatchObject({ running: 5, effectiveCapacity: 5 });
    gate.resolve();
    await Promise.all(runs);
  });

  it('never exceeds CPU or actual global runner ceilings', () => {
    let config = { maxConcurrent: 16, runnerCapacity: 3 };
    const admit = createLargeRunAdmission(() => 64 * gib, { config: () => config, cpuCapacity: () => 6 });
    expect(admit.stats().effectiveCapacity).toBe(3);
    config = { maxConcurrent: 16, runnerCapacity: 16 };
    expect(admit.stats().effectiveCapacity).toBe(6);
  });

  it('drains instead of killing admitted work after the admin lowers capacity', async () => {
    let config = { maxConcurrent: 3 };
    const admit = createLargeRunAdmission(() => 32 * gib, { config: () => config, cpuCapacity: () => 8 });
    const gate = deferred();
    const running = Array.from({ length: 3 }, () => admit('large', () => gate.promise));
    await vi.advanceTimersByTimeAsync(0);
    config = { maxConcurrent: 1 };
    const task = vi.fn(() => 42);
    const waiting = admit('large', task);
    await vi.advanceTimersByTimeAsync(250);
    expect(task).not.toHaveBeenCalled();
    expect(admit.stats().running).toBe(3);
    gate.resolve();
    await Promise.all(running);
    expect(await waiting).toBe(42);
  });

  it('uses configured deadlines and reports the wait actually assigned', async () => {
    let config = { queueWaitMs: 1200, maxQueued: 1 };
    const admit = createLargeRunAdmission(() => 0, { config: () => config });
    const result = admit('large', vi.fn()).catch(error => error);
    const full = await admit('large', vi.fn()).catch(error => error);
    expect(largeRunBusyMessage(full)).toContain('1 waiting');
    config = { queueWaitMs: 3000, maxQueued: 2 };
    await vi.advanceTimersByTimeAsync(1201);
    expect(largeRunBusyMessage(await result)).toContain('1.2 seconds');
  });
});
