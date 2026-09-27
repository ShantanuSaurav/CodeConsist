/* ==========================================================================
   Calendar days in a learner's own time zone.

   A "day" everywhere in the learning loop is a `yyyy-mm-dd` key in the
   LEARNER's zone, not the server's: a streak, a daily goal and the heatmap
   are human things, and a learner in Auckland finishing a lesson at 23:30
   did it today, whatever the clock says in Kolkata.

   Pure and free of React and DOM APIs so the server bundle
   (src/platform/server-lib.ts) and the browser run the same code. Day
   arithmetic is done on the UTC calendar, so it never depends on the
   process zone or on a daylight-saving jump.
   ========================================================================== */

const DAY_MS = 86_400_000;
const DAY_KEY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const ZONE_RE = /^[A-Za-z0-9_+\-/]+$/;

/**
 * One formatter per zone: constructing Intl formatters is the slow part.
 * Only zones that validated are remembered, and both caches are bounded:
 * Intl reads zone names case-insensitively ("asia/KOLKATA" is valid too), so
 * a caller who controls the `X-Time-Zone` header could otherwise grow them
 * by one spelling per request. Once a cache is full its oldest entry goes.
 */
const ZONE_CACHE_LIMIT = 512;
const formatters = new Map<string, Intl.DateTimeFormat>();
const validZones = new Set<string>();

function evictOldest(cache: { size: number; keys(): Iterator<string>; delete(key: string): boolean }): void {
  if (cache.size < ZONE_CACHE_LIMIT) return;
  const oldest = cache.keys().next();
  if (!oldest.done) cache.delete(oldest.value);
}

/** How many zones the caches hold - they must stay bounded, whatever callers send. */
export function zoneCacheSize(): { validZones: number; formatters: number } {
  return { validZones: validZones.size, formatters: formatters.size };
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

/** The process's own local day - the fallback when no zone is known (today's behaviour). */
function localDayKey(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/**
 * Is this an IANA zone name the runtime accepts? At most 64 characters of
 * `[A-Za-z0-9_+-/]`, and `Intl.DateTimeFormat` must not throw on it.
 * (`Intl.supportedValuesOf` would be simpler, but the TypeScript lib here is
 * ES2020, and it leaves out aliases such as "Asia/Calcutta" that are valid.)
 */
export function isValidTimeZone(zone: unknown): zone is string {
  if (typeof zone !== 'string' || zone.length === 0 || zone.length > 64 || !ZONE_RE.test(zone)) return false;
  if (validZones.has(zone)) return true;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: zone });
  } catch {
    // Never remembered: an invalid name costs one throw, not memory.
    return false;
  }
  evictOldest(validZones);
  validZones.add(zone);
  return true;
}

function formatterFor(zone: string): Intl.DateTimeFormat {
  let formatter = formatters.get(zone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: zone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23'
    });
    evictOldest(formatters);
    formatters.set(zone, formatter);
  }
  return formatter;
}

/** The wall-clock fields of `date` in `zone`. */
function partsIn(zone: string, date: Date): { year: number; month: number; day: number; hour: number; minute: number; second: number } {
  const out = { year: 0, month: 0, day: 0, hour: 0, minute: 0, second: 0 };
  for (const part of formatterFor(zone).formatToParts(date)) {
    if (part.type in out) (out as Record<string, number>)[part.type] = Number(part.value);
  }
  // Some engines print midnight as 24 even with h23.
  if (out.hour === 24) out.hour = 0;
  return out;
}

/**
 * The `yyyy-mm-dd` day `date` falls on in `zone`. A missing or invalid zone
 * falls back to the process's own local day, which is exactly what every
 * day key was before zones existed.
 */
export function dayKeyIn(zone: string | null | undefined, date: Date = new Date()): string {
  const at = Number.isNaN(date.getTime()) ? new Date() : date;
  if (!isValidTimeZone(zone)) return localDayKey(at);
  const p = partsIn(zone, at);
  return `${p.year}-${pad(p.month)}-${pad(p.day)}`;
}

/** Is this a real `yyyy-mm-dd` calendar day (not 2026-02-30)? */
export function isDayKey(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const m = DAY_KEY_RE.exec(value);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const date = new Date(Date.UTC(y, mo - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === mo - 1 && date.getUTCDate() === d;
}

function utcMs(key: string): number {
  const m = DAY_KEY_RE.exec(key);
  if (!m) return NaN;
  return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

function keyFromUtc(ms: number): string {
  const d = new Date(ms);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

/** `key` moved by `n` calendar days (negative goes back). */
export function addDays(key: string, n: number): string {
  const base = utcMs(key);
  if (Number.isNaN(base)) return key;
  return keyFromUtc(base + Math.round(n) * DAY_MS);
}

/** Whole calendar days from `a` to `b` (positive when `b` is later). */
export function daysBetween(a: string, b: string): number {
  const from = utcMs(a);
  const to = utcMs(b);
  if (Number.isNaN(from) || Number.isNaN(to)) return NaN;
  return Math.round((to - from) / DAY_MS);
}

/** 0 = Sunday … 6 = Saturday, for a day key. */
export function weekdayOf(key: string): number {
  const ms = utcMs(key);
  return Number.isNaN(ms) ? 0 : new Date(ms).getUTCDay();
}

/** The first day of the week `day` is in; `weekStartsOn` 1 = Monday, 0 = Sunday. */
export function weekStartFor(day: string, weekStartsOn: 0 | 1 = 1): string {
  const offset = (weekdayOf(day) - weekStartsOn + 7) % 7;
  return addDays(day, -offset);
}

/**
 * Milliseconds until the next local midnight in `zone` (at least one
 * second), for the timer that rolls "today" over. On a daylight-saving day
 * this can be an hour off; the timer re-arms itself from the new day, so
 * the error never accumulates.
 */
export function msUntilLocalMidnight(now: Date = new Date(), zone?: string | null): number {
  let hour: number;
  let minute: number;
  let second: number;
  if (isValidTimeZone(zone)) {
    ({ hour, minute, second } = partsIn(zone, now));
  } else {
    hour = now.getHours();
    minute = now.getMinutes();
    second = now.getSeconds();
  }
  const elapsed = ((hour * 60 + minute) * 60 + second) * 1000 + now.getMilliseconds();
  return Math.max(1000, DAY_MS - elapsed);
}

/**
 * The local hour (0-23) of `now` in `zone` - the process's own when the zone
 * is missing or invalid. For "not before 18:00" rules such as the at-risk
 * reminder.
 */
export function localHourIn(zone: string | null | undefined, now: Date = new Date()): number {
  const at = Number.isNaN(now.getTime()) ? new Date() : now;
  return isValidTimeZone(zone) ? partsIn(zone, at).hour : at.getHours();
}

/**
 * The browser's (or process's) own zone name, or null when the runtime will
 * not say or says something unusable. Never throws: a broken Intl must never
 * break a request.
 */
export function browserTimeZone(): string | null {
  try {
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return isValidTimeZone(zone) ? zone : null;
  } catch {
    return null;
  }
}

/**
 * The latest day it can be anywhere on Earth right now (UTC+14). A stored day
 * later than this came from a bad clock or a forged request and must never
 * become a learner's "today" - the day only moves forward, so it would stick.
 */
export function latestPossibleDay(now: Date = new Date()): string {
  return dayKeyIn('Pacific/Kiritimati', now);
}

/**
 * A learner's current day: the local day in `zone`, but never before a day
 * already recorded for them (`known`: their last active day, the last day of
 * their activity log) - so flipping zones back and forth cannot replay a
 * day - and never after the latest day it can be anywhere on Earth, so one
 * forged or wrong-clock date cannot stick. The server (server/activity.js
 * `todayFor`) and the browser (SessionProvider's `todayKey`) both count
 * "today" with this, so a streak is judged against the same day on both.
 */
export function learnerDay(zone: string | null | undefined, known: readonly unknown[] = [], now: Date = new Date()): string {
  const ceiling = latestPossibleDay(now);
  let day = dayKeyIn(zone, now);
  for (const candidate of known) {
    if (isDayKey(candidate) && candidate > day && candidate <= ceiling) day = candidate;
  }
  return day;
}

/**
 * A day key as people read it: "Thu 24 Sep" (the viewer's language), or the
 * key itself when it is not one. The calendar day, whatever the viewer's own
 * zone - a learner's day is already in their zone.
 */
export function formatDayLabel(day: string, options: { year?: boolean } = {}): string {
  if (!isDayKey(day)) return String(day ?? '');
  try {
    return new Date(`${day}T12:00:00.000Z`).toLocaleDateString(undefined, {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      ...(options.year ? { year: 'numeric' } : {}),
      timeZone: 'UTC'
    });
  } catch {
    return day;
  }
}
