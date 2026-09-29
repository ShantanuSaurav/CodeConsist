/**
 * Rate limits and code-runner capacity, in memory.
 *
 *   createLimiter()        fixed-window counters per (bucket, key)
 *   rateLimit({...})       Express middleware over one bucket
 *   createExecutionSlots() at most N code runs at once, a short queue, then "busy"
 *
 * Every rule is read live (`rule()` returns `{ limit, windowSeconds }` from
 * the settings store's `access.rateLimit.*`), so an admin's change applies to
 * the next request. Nothing here is persisted: writing a counter to db.json
 * on every request would rewrite the file constantly, and a restart forgetting
 * the counts is acceptable (the admin page says so).
 *
 * Buckets are named `<action>.<scope>`: 'login.ip', 'login.account', ...
 * BUCKET_SETTING maps each to its settings key under `access.rateLimit`.
 */

/** Bucket name -> settings key under `access.rateLimit`. */
export const BUCKET_SETTING = {
  'login.ip': 'loginIp',
  'login.account': 'loginAccount',
  'register.ip': 'registerIp',
  'register.global': 'registerGlobal',
  'execute.account': 'executeAccount',
  'execute.ip': 'executeIp',
  'solve.account': 'solveAccount',
  'write.account': 'writeAccount',
  'passwordChange.account': 'passwordChangeAccount',
  'passwordReset.ip': 'passwordResetIp'
};

export const BUCKETS = Object.keys(BUCKET_SETTING);

/** Thrown by the execution slots when there is no room: `reason` is 'queue-full' or 'timeout'. */
export class BusyError extends Error {
  constructor(reason = 'queue-full') {
    super(reason === 'timeout' ? 'Timed out waiting for a free code-runner slot.' : 'Every code-runner slot is taken and the queue is full.');
    this.name = 'BusyError';
    this.reason = reason;
  }
}

function validRule(rule) {
  const limit = Number(rule?.limit);
  const windowSeconds = Number(rule?.windowSeconds);
  if (!Number.isFinite(limit) || !Number.isFinite(windowSeconds) || limit < 0 || windowSeconds <= 0) return null;
  return { limit: Math.floor(limit), windowSeconds };
}

/**
 * Fixed-window counters. `hit` counts one request and says whether it is
 * within the limit; `peek` says whether one more would be, without counting;
 * `reset` forgets a key (or a whole bucket). Keys past `maxKeys` are evicted
 * oldest first, and expired windows are swept at most once a minute, so an
 * unauthenticated caller inventing keys cannot grow this without bound.
 *
 * @param {{ now?: () => number, maxKeys?: number, sweepMs?: number }} [options]
 */
export function createLimiter({ now = Date.now, maxKeys = 50_000, sweepMs = 60_000 } = {}) {
  /** `${bucket}\n${key}` -> { bucket, key, count, startedAt, resetAt } - Map order is insertion order, oldest first. */
  const windows = new Map();
  /** bucket -> { blocked, lastBlockedAt } */
  const blockedBy = new Map();
  let lastSweep = now();

  const idOf = (bucket, key) => `${bucket}\n${key}`;

  function sweep(t) {
    if (t - lastSweep >= sweepMs) {
      lastSweep = t;
      for (const [id, entry] of windows) if (entry.resetAt <= t) windows.delete(id);
    }
  }

  /** Past `maxKeys` the oldest windows go first (a Map iterates in insertion order). */
  function evict() {
    while (windows.size > maxKeys) windows.delete(windows.keys().next().value);
  }

  /** The live window for a key, or null. A window whose rule got shorter ends sooner. */
  function current(bucket, key, rule, t) {
    const id = idOf(bucket, key);
    const entry = windows.get(id);
    if (!entry) return null;
    const resetAt = Math.min(entry.resetAt, entry.startedAt + rule.windowSeconds * 1000);
    if (resetAt <= t) {
      windows.delete(id);
      return null;
    }
    entry.resetAt = resetAt;
    return entry;
  }

  function verdict(entry, rule, t, allowed) {
    const count = entry?.count ?? 0;
    const retryAfterSeconds = entry ? Math.max(1, Math.ceil((entry.resetAt - t) / 1000)) : 0;
    return { allowed, count, limit: rule.limit, remaining: Math.max(0, rule.limit - count), retryAfterSeconds };
  }

  /** Record that a request in `bucket` was refused (or, in log mode, would have been). */
  function noteBlocked(bucket) {
    const stats = blockedBy.get(bucket) ?? { blocked: 0, lastBlockedAt: null };
    stats.blocked += 1;
    stats.lastBlockedAt = new Date(now()).toISOString();
    blockedBy.set(bucket, stats);
  }

  return {
    /** Count one request. `allowed` is false once the count passes the limit; every refusal is tallied. */
    hit(bucket, key, rawRule) {
      const rule = validRule(rawRule);
      const t = now();
      if (!rule) return { allowed: true, count: 0, limit: Infinity, remaining: Infinity, retryAfterSeconds: 0 };
      sweep(t);
      let entry = current(bucket, key, rule, t);
      if (!entry) {
        entry = { bucket, key, count: 0, startedAt: t, resetAt: t + rule.windowSeconds * 1000 };
        windows.set(idOf(bucket, key), entry);
        evict();
      }
      entry.count += 1;
      const allowed = entry.count <= rule.limit;
      if (!allowed) noteBlocked(bucket);
      return verdict(entry, rule, t, allowed);
    },

    /** Would one more request be within the limit? Counts nothing. */
    peek(bucket, key, rawRule) {
      const rule = validRule(rawRule);
      const t = now();
      if (!rule) return { allowed: true, count: 0, limit: Infinity, remaining: Infinity, retryAfterSeconds: 0 };
      const entry = current(bucket, key, rule, t);
      return verdict(entry, rule, t, (entry?.count ?? 0) < rule.limit);
    },

    /** Forget one key's count, or every key in the bucket. Returns how many were cleared. */
    reset(bucket, key) {
      if (key !== undefined && key !== null) return windows.delete(idOf(bucket, String(key))) ? 1 : 0;
      let cleared = 0;
      for (const [id, entry] of windows) {
        if (entry.bucket !== bucket) continue;
        windows.delete(id);
        cleared += 1;
      }
      return cleared;
    },

    noteBlocked,

    /**
     * Per bucket: refusals since boot, when the last one was, and the
     * busiest keys in their current window - for the admin's status card.
     */
    stats({ top = 5 } = {}) {
      const t = now();
      const buckets = {};
      for (const bucket of new Set([...BUCKETS, ...blockedBy.keys(), ...[...windows.values()].map((e) => e.bucket)])) {
        const live = [...windows.values()].filter((e) => e.bucket === bucket && e.resetAt > t);
        buckets[bucket] = {
          blocked: blockedBy.get(bucket)?.blocked ?? 0,
          lastBlockedAt: blockedBy.get(bucket)?.lastBlockedAt ?? null,
          keys: live.length,
          top: live
            .sort((a, b) => b.count - a.count)
            .slice(0, top)
            .map((e) => ({ key: e.key, count: e.count, resetsInSeconds: Math.max(1, Math.ceil((e.resetAt - t) / 1000)) }))
        };
      }
      return { buckets, trackedKeys: windows.size, maxKeys };
    }
  };
}

/** Whole minutes until a retry, for the learner-facing sentence ("try again in 3 minutes"). */
export function retryMinutes(retryAfterSeconds) {
  return Math.max(1, Math.ceil(Number(retryAfterSeconds || 0) / 60));
}

/**
 * Answer 429 the one way every limited route does: the friendly sentence
 * (`message(minutes)`, the admin-editable `copy.limits.tooMany`), a machine
 * reason, the wait in seconds, and a `Retry-After` header.
 */
export function sendTooMany(res, retryAfterSeconds, message = (minutes) => `Too many attempts - wait ${minutes} min and try again.`) {
  const seconds = Math.max(1, Math.ceil(Number(retryAfterSeconds) || 1));
  res.set('Retry-After', String(seconds));
  return res.status(429).json({ error: message(retryMinutes(seconds)), reason: 'rate-limited', retryAfterSeconds: seconds });
}

/**
 * One count against a bucket, called by hand rather than as middleware (the
 * merge charges each guest claim it runs code for as a solve). Returns
 * `(req) => verdict`, where `allowed` is true whenever the request may go on:
 * the mode is 'off', there is no rule or key (fails open), or the mode only logs.
 *
 *   key(req)  -> the thing counted (an account id, an address, 'all'); a
 *                null or empty key skips the check - it fails open, so an
 *                unknown address never lumps everyone into one bucket
 *   rule()    -> `{ limit, windowSeconds }`, read per request; null skips
 *   mode()    -> 'off' skips, 'log' counts and logs only, 'enforce' refuses
 */
export function limitCheck({ limiter, bucket, rule, key, mode = () => 'enforce' }) {
  const open = { allowed: true, retryAfterSeconds: 0 };
  return (req) => {
    let currentMode;
    let currentRule;
    let currentKey;
    try {
      currentMode = mode();
      if (currentMode === 'off') return open;
      currentRule = rule();
      currentKey = key(req);
    } catch {
      return open;
    }
    if (!currentRule || currentKey === null || currentKey === undefined || currentKey === '') return open;
    const result = limiter.hit(bucket, String(currentKey), currentRule);
    if (result.allowed) return result;
    if (currentMode !== 'enforce') {
      console.warn(`[rate-limit] would refuse ${bucket} (${result.count}/${result.limit}) - logging only`);
      return { ...result, allowed: true };
    }
    return result;
  };
}

/**
 * Express middleware over one bucket: `limitCheck`'s arguments, plus
 * `message(minutes)`, the 429 sentence.
 */
export function rateLimit({ limiter, bucket, rule, key, mode = () => 'enforce', message }) {
  const check = limitCheck({ limiter, bucket, rule, key, mode });
  return (req, res, next) => {
    const result = check(req);
    if (result.allowed) return next();
    return sendTooMany(res, result.retryAfterSeconds, message);
  };
}

/**
 * At most `maxConcurrent` code runs at once; up to `maxQueued` more wait for
 * a slot for at most `queueWaitMs`; anything past that gets BusyError. Read
 * from `config()` on every call, so the admin's numbers apply at once.
 *
 * A slot is handed straight from a finishing run to the next waiter, so a
 * new arrival can never jump the queue in between.
 *
 * @param {{ config?: () => { maxConcurrent: number, maxQueued: number, queueWaitMs: number }, now?: () => number }} [options]
 */
export function createExecutionSlots({ config = () => ({ maxConcurrent: 4, maxQueued: 20, queueWaitMs: 10_000 }), now = Date.now } = {}) {
  let running = 0;
  const queue = [];
  const counters = { completed: 0, queueFull: 0, timedOut: 0, peakQueued: 0, lastBusyAt: null };

  function limits() {
    let c;
    try {
      c = config() ?? {};
    } catch {
      c = {};
    }
    const int = (value, fallback, min) => (Number.isInteger(value) && value >= min ? value : fallback);
    return { maxConcurrent: int(c.maxConcurrent, 4, 1), maxQueued: int(c.maxQueued, 20, 0), queueWaitMs: int(c.queueWaitMs, 10_000, 0) };
  }

  function busy(reason) {
    counters[reason === 'timeout' ? 'timedOut' : 'queueFull'] += 1;
    counters.lastBusyAt = new Date(now()).toISOString();
    return new BusyError(reason);
  }

  function pump() {
    const { maxConcurrent } = limits();
    while (queue.length > 0 && running < maxConcurrent) {
      const waiter = queue.shift();
      clearTimeout(waiter.timer);
      running += 1;
      waiter.resolve();
    }
  }

  /** Resolves once a slot is held (running already counts it). */
  function acquire() {
    const { maxConcurrent, maxQueued, queueWaitMs } = limits();
    if (running < maxConcurrent && queue.length === 0) {
      running += 1;
      return Promise.resolve();
    }
    if (queue.length >= maxQueued) return Promise.reject(busy('queue-full'));
    return new Promise((resolve, reject) => {
      const waiter = { resolve, reject, timer: null };
      waiter.timer = setTimeout(() => {
        const at = queue.indexOf(waiter);
        if (at !== -1) queue.splice(at, 1);
        reject(busy('timeout'));
      }, queueWaitMs);
      queue.push(waiter);
      counters.peakQueued = Math.max(counters.peakQueued, queue.length);
    });
  }

  return {
    /** Run `fn` in a slot. Rejects with BusyError when there is no room. */
    async run(fn) {
      await acquire();
      try {
        return await fn();
      } finally {
        running -= 1;
        counters.completed += 1;
        pump();
      }
    },

    stats() {
      return { running, queued: queue.length, ...limits(), ...counters };
    }
  };
}
