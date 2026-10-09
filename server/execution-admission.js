import { availableParallelism, freemem } from 'node:os';
import { BusyError } from './rate-limit.js';

export const LARGE_RUN_POLICY = Object.freeze({
  maxConcurrent: 2,
  maxQueued: 8,
  queueWaitMs: 30000,
  pollMs: 250,
  reserveBytes: 768 * 1024 * 1024,
  jobBytes: 1024 * 1024 * 1024
});

export function createLargeRunAdmission(availableMemory = freemem, options = {}) {
  const defaults = { ...LARGE_RUN_POLICY, ...options };
  let running = 0;
  const queue = [];
  let pollTimer;

  function limits() {
    const configured = options.config?.() ?? {};
    const bounded = (value, fallback, minimum, maximum) => Number.isInteger(value) && value >= minimum && value <= maximum ? value : fallback;
    return {
      ...defaults,
      maxConcurrent: bounded(configured.maxConcurrent, defaults.maxConcurrent, 1, 64),
      maxQueued: bounded(configured.maxQueued, defaults.maxQueued, 0, 200),
      queueWaitMs: bounded(configured.queueWaitMs, defaults.queueWaitMs, 0, 30000),
      reserveBytes: bounded(configured.reserveMb, defaults.reserveBytes / 1024 ** 2, 512, 65536) * 1024 ** 2,
      jobBytes: bounded(configured.jobMb, defaults.jobBytes / 1024 ** 2, 1024, 65536) * 1024 ** 2,
      runnerCapacity: bounded(configured.runnerCapacity, 64, 1, 64)
    };
  }

  function capacity() {
    const policy = limits();
    const cpuCapacity = Math.max(1, (options.cpuCapacity ?? availableParallelism)());
    let freeBytes = 0;
    try {
      const free = availableMemory();
      if (Number.isFinite(free)) freeBytes = Math.max(0, free);
    } catch {}
    const memoryCapacity = Math.max(0, Math.floor((freeBytes - policy.reserveBytes) / policy.jobBytes));
    const effectiveCapacity = Math.min(policy.maxConcurrent, policy.runnerCapacity, cpuCapacity, memoryCapacity);
    return { policy, cpuCapacity, freeBytes, memoryCapacity, effectiveCapacity };
  }

  function canStart() {
    return running < capacity().effectiveCapacity;
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
    waiter.reject(busy(reason, waiter.policy));
    pump();
  }

  function pump() {
    clearTimeout(pollTimer);
    pollTimer = undefined;
    while (queue.length && canStart()) {
      const waiter = queue.shift();
      clean(waiter);
      if (Date.now() > waiter.deadline) {
        waiter.reject(busy('large-queue-timeout', waiter.policy));
        continue;
      }
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
      pollTimer = setTimeout(pump, defaults.pollMs);
      pollTimer.unref?.();
    }
  }

  async function admit(profile, task, { signal } = {}) {
    if (signal?.aborted) throw new BusyError('client-disconnected');
    if (profile !== 'large') return task();
    pump();
    const policy = limits();
    if (queue.length >= policy.maxQueued && !canStart()) throw busy('large-queue-full', policy);
    return new Promise((resolve, reject) => {
      const waiter = { task, resolve, reject, signal, policy, deadline: Date.now() + policy.queueWaitMs, timer: undefined, cancel: undefined };
      waiter.cancel = () => remove(waiter, 'client-disconnected');
      waiter.timer = setTimeout(() => remove(waiter, 'large-queue-timeout'), policy.queueWaitMs);
      signal?.addEventListener('abort', waiter.cancel, { once: true });
      queue.push(waiter);
      pump();
    });
  }

  admit.stats = () => {
    const { policy, ...current } = capacity();
    return { running, queued: queue.length, maxConcurrent: policy.maxConcurrent, maxQueued: policy.maxQueued, queueWaitMs: policy.queueWaitMs, ...current, runnerCapacity: policy.runnerCapacity, reserveBytes: policy.reserveBytes, jobBytes: policy.jobBytes };
  };
  return admit;
}

function busy(reason, policy) {
  const error = new BusyError(reason);
  error.queuePolicy = policy;
  return error;
}

export function largeRunBusyMessage(error) {
  const policy = error?.queuePolicy ?? LARGE_RUN_POLICY;
  if (error?.reason === 'large-queue-full') return `The large-program queue is full (${policy.maxQueued} waiting). Please try again shortly. No code ran.`;
  if (error?.reason === 'large-queue-timeout') return `Your program waited ${policy.queueWaitMs / 1000} seconds for server memory or a free runner. No code ran. Please try again later.`;
  return null;
}
