import { availableParallelism, freemem } from 'node:os';
import { BusyError } from './rate-limit.js';

export const LARGE_RUN_POLICY = Object.freeze({
  maxConcurrent: Math.min(2, availableParallelism()),
  maxQueued: 8,
  queueWaitMs: 30000,
  pollMs: 250,
  reserveBytes: 768 * 1024 * 1024,
  jobBytes: 1024 * 1024 * 1024
});

export function createLargeRunAdmission(availableMemory = freemem, options = {}) {
  const policy = { ...LARGE_RUN_POLICY, ...options };
  let running = 0;
  const queue = [];
  let pollTimer;

  function canStart() {
    if (running >= policy.maxConcurrent) return false;
    try {
      const free = availableMemory();
      return Number.isFinite(free) && free >= policy.reserveBytes + (running + 1) * policy.jobBytes;
    } catch {
      return false;
    }
  }

  function clean(waiter) {
    clearTimeout(waiter.timer);
    waiter.signal?.removeEventListener('abort', waiter.cancel);
  }

  function remove(waiter, reason) {
    const index = queue.indexOf(waiter);
    if (index < 0) return;
    queue.splice(index, 1);
    clean(waiter);
    waiter.reject(new BusyError(reason));
    pump();
  }

  function pump() {
    clearTimeout(pollTimer);
    pollTimer = undefined;
    while (queue.length && canStart()) {
      const waiter = queue.shift();
      clean(waiter);
      running += 1;
      Promise.resolve().then(() => {
        if (waiter.signal?.aborted) throw new BusyError('client-disconnected');
        return waiter.task();
      }).then(waiter.resolve, waiter.reject).finally(() => {
        running -= 1;
        pump();
      });
    }
    if (queue.length) {
      pollTimer = setTimeout(pump, policy.pollMs);
      pollTimer.unref?.();
    }
  }

  async function admit(profile, task, { signal } = {}) {
    if (signal?.aborted) throw new BusyError('client-disconnected');
    if (profile !== 'large') return task();
    pump();
    if (queue.length >= policy.maxQueued && !canStart()) throw new BusyError('large-queue-full');
    return new Promise((resolve, reject) => {
      const waiter = { task, resolve, reject, signal, timer: undefined, cancel: undefined };
      waiter.cancel = () => remove(waiter, 'client-disconnected');
      waiter.timer = setTimeout(() => remove(waiter, 'large-queue-timeout'), policy.queueWaitMs);
      signal?.addEventListener('abort', waiter.cancel, { once: true });
      queue.push(waiter);
      pump();
    });
  }

  admit.stats = () => ({ running, queued: queue.length, maxConcurrent: policy.maxConcurrent, maxQueued: policy.maxQueued, queueWaitMs: policy.queueWaitMs });
  return admit;
}

export function largeRunBusyMessage(error) {
  if (error?.reason === 'large-queue-full') return `The large-program queue is full (${LARGE_RUN_POLICY.maxQueued} waiting). Please try again shortly. No code ran.`;
  if (error?.reason === 'large-queue-timeout') return `Your program waited ${LARGE_RUN_POLICY.queueWaitMs / 1000} seconds for server memory or a free runner. No code ran. Please try again later.`;
  return null;
}
