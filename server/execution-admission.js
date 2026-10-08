import { freemem } from 'node:os';
import { BusyError } from './rate-limit.js';

export function createLargeRunAdmission(availableMemory = freemem) {
  let running = false;
  return async function admit(profile, task) {
    if (profile !== 'large') return task();
    if (running || availableMemory() < 768 * 1024 * 1024) throw new BusyError('resource-busy');
    running = true;
    try {
      return await task();
    } finally {
      running = false;
    }
  };
}
