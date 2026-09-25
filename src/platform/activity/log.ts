/* ==========================================================================
   The daily activity log and the failed-attempt store - one structure.

   Per day (in the learner's own time zone): XP actually awarded, first-time
   lessons and tests, re-solves, and mistakes. Per challenge: a summary of
   the learner's misses. Plus a capped log of recent misses.

   Pure and free of React, shared by the browser (a guest's log, and the
   optimistic copy of a signed-in learner's) and the server (the account's
   authoritative log, src/platform/server-lib.ts). Every function returns a
   new log and never mutates its input. Maps are written with defineProperty
   so a challenge id of '__proto__' is an ordinary key.
   ========================================================================== */
import type { ActivityContext, ActivityLog, ChallengeAttempt, DayRecord, MissAnswer, MissEntry, MissSummary } from '@/types';
import { addDays, dayKeyIn, daysBetween, isDayKey, weekStartFor } from '../time/days';
import { DEFAULT_XP_RULES, xpForSolve } from '../xp-leveling/leveling';
import type { XpRules } from '../xp-leveling/leveling';
import type { HeatCell } from '../xp-leveling/insights';

export const ACTIVITY_CONTEXTS: readonly ActivityContext[] = ['lesson', 'test', 'review', 'library', 'assessment'];

/** How many wrong-answer keys a miss summary keeps (the most frequent). */
const KEYS_KEPT = 5;
/** No counter believes more than this - a merged guest log is only so trusted. */
const MAX_COUNT = 1_000_000;

/** The retention limits the reducer applies (from `settings.retention`). */
export interface ActivityRules {
  /** Days older than this (counted back from today) are dropped. */
  keepDays: number;
  /** The miss log keeps at most this many entries, newest last. */
  missLogCap: number;
}

export const DEFAULT_ACTIVITY_RULES: ActivityRules = { keepDays: 400, missLogCap: 300 };

/** The reducer's limits from `settings.retention` (or its defaults). */
export function activityRulesFrom(retention?: { activityDaysKept?: number; missLogPerUser?: number } | null): ActivityRules {
  return {
    keepDays: Number(retention?.activityDaysKept) || DEFAULT_ACTIVITY_RULES.keepDays,
    missLogCap: Number.isFinite(Number(retention?.missLogPerUser)) ? Math.max(0, Number(retention?.missLogPerUser)) : DEFAULT_ACTIVITY_RULES.missLogCap
  };
}

/* ------------------------------------------------------------------ helpers */

function hasOwn(map: object, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(map, key);
}

function define<T>(map: Record<string, T>, key: string, value: T): void {
  Object.defineProperty(map, key, { value, writable: true, enumerable: true, configurable: true });
}

function plainObject(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function copyMap<T>(map: Record<string, T>): Record<string, T> {
  const out: Record<string, T> = {};
  for (const key of Object.keys(map)) define(out, key, map[key]);
  return out;
}

function count(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.min(MAX_COUNT, Math.floor(n)) : 0;
}

function isoOrNull(value: unknown): string | null {
  if (typeof value !== 'string' || !value) return null;
  return Number.isNaN(Date.parse(value)) ? null : value;
}

function minIso(a: string | null, b: string | null): string | null {
  if (!a) return b;
  if (!b) return a;
  return Date.parse(a) <= Date.parse(b) ? a : b;
}

function maxIso(a: string | null, b: string | null): string | null {
  if (!a) return b;
  if (!b) return a;
  return Date.parse(a) >= Date.parse(b) ? a : b;
}

function maxDay(a: string | null | undefined, b: string | null | undefined): string | null {
  const x = isDayKey(a) ? a : null;
  const y = isDayKey(b) ? b : null;
  if (!x) return y;
  if (!y) return x;
  return x >= y ? x : y;
}

/* ------------------------------------------------------------- normalizing */

export function emptyActivityLog(): ActivityLog {
  return { v: 1, lastDay: null, backfilledAt: null, days: {}, misses: {}, missLog: [] };
}

export function emptyDay(source: DayRecord['source'] = 'live'): DayRecord {
  return { xp: 0, lessons: 0, tests: 0, reSolves: 0, mistakes: 0, firstAt: null, lastAt: null, source };
}

/** A day row with every counter present (0 when missing or nonsense). */
export function normalizeDay(raw: unknown): DayRecord {
  const src = plainObject(raw);
  const source = src.source === 'backfill' || src.source === 'merge' ? src.source : 'live';
  return {
    xp: count(src.xp),
    lessons: count(src.lessons),
    tests: count(src.tests),
    reSolves: count(src.reSolves),
    mistakes: count(src.mistakes),
    firstAt: isoOrNull(src.firstAt),
    lastAt: isoOrNull(src.lastAt),
    source
  };
}

function normalizeAnswerShape(raw: unknown): MissAnswer | null {
  const a = plainObject(raw);
  const ints = (list: unknown) => Array.isArray(list) && list.every((i) => Number.isInteger(i) && i >= 0);
  switch (a.kind) {
    case 'choice':
      return Number.isInteger(a.index) && (a.index as number) >= 0 ? { kind: 'choice', index: a.index as number } : null;
    case 'multi':
      return ints(a.indices) ? { kind: 'multi', indices: [...(a.indices as number[])] } : null;
    case 'blanks':
      return Array.isArray(a.values) && a.values.every((v) => typeof v === 'string')
        ? { kind: 'blanks', values: (a.values as string[]).map((v) => v.slice(0, 1000)) }
        : null;
    case 'order':
      return ints(a.lines) ? { kind: 'order', lines: [...(a.lines as number[])] } : null;
    case 'code':
      return Number.isInteger(a.passed) && Number.isInteger(a.total) ? { kind: 'code', passed: a.passed as number, total: a.total as number } : null;
    default:
      return null;
  }
}

function topKeys(keys: Record<string, number>): Record<string, number> {
  const out: Record<string, number> = {};
  Object.keys(keys)
    .filter((key) => key.length <= 80 && count(keys[key]) > 0)
    .sort((a, b) => keys[b] - keys[a] || (a < b ? -1 : 1))
    .slice(0, KEYS_KEPT)
    .forEach((key) => define(out, key, count(keys[key])));
  return out;
}

/** A miss summary with every field present, or null when it is not one. */
export function normalizeMissSummary(raw: unknown): MissSummary | null {
  const src = plainObject(raw);
  const firstAt = isoOrNull(src.firstAt);
  const lastAt = isoOrNull(src.lastAt);
  const total = count(src.count);
  if (!firstAt || !lastAt || total === 0) return null;
  const lastDay = isDayKey(src.lastDay) ? src.lastDay : lastAt.slice(0, 10);
  const keysIn = plainObject(src.keys);
  const keys: Record<string, number> = {};
  for (const key of Object.keys(keysIn)) define(keys, key, count(keysIn[key]));
  const summary: MissSummary = {
    count: total,
    firstAt,
    lastAt,
    lastDay: isDayKey(lastDay) ? lastDay : lastAt.slice(0, 10),
    lastDayCount: Math.min(total, Math.max(1, count(src.lastDayCount))),
    open: src.open !== false,
    revealed: Math.min(total, count(src.revealed)),
    keys: topKeys(keys),
    lastAnswer: normalizeAnswerShape(src.lastAnswer)
  };
  if (src.codeOnly === true) summary.codeOnly = true;
  return summary;
}

/** A miss-log entry, or null when it is not one. */
export function normalizeMissEntry(raw: unknown): MissEntry | null {
  const src = plainObject(raw);
  const challengeId = typeof src.challengeId === 'string' ? src.challengeId : '';
  const at = isoOrNull(src.at);
  if (!challengeId || challengeId.length > 200 || !at || !isDayKey(src.day)) return null;
  const entry: MissEntry = {
    challengeId,
    at,
    day: src.day,
    context: ACTIVITY_CONTEXTS.includes(src.context as ActivityContext) ? (src.context as ActivityContext) : 'lesson',
    answer: normalizeAnswerShape(src.answer),
    final: src.final === true
  };
  if (src.synced === false) entry.synced = false;
  return entry;
}

function byTime(a: MissEntry, b: MissEntry): number {
  return Date.parse(a.at) - Date.parse(b.at);
}

/** Any stored or received log, made safe to work on. */
export function normalizeActivityLog(raw: unknown): ActivityLog {
  const src = plainObject(raw);
  const log = emptyActivityLog();
  const days = plainObject(src.days);
  for (const key of Object.keys(days)) if (isDayKey(key)) define(log.days, key, normalizeDay(days[key]));
  const misses = plainObject(src.misses);
  for (const key of Object.keys(misses)) {
    const summary = key ? normalizeMissSummary(misses[key]) : null;
    if (summary) define(log.misses, key, summary);
  }
  log.missLog = (Array.isArray(src.missLog) ? src.missLog : [])
    .map(normalizeMissEntry)
    .filter((e): e is MissEntry => e !== null)
    .sort(byTime);
  log.lastDay = isDayKey(src.lastDay) ? src.lastDay : null;
  log.backfilledAt = isoOrNull(src.backfilledAt);
  if (typeof src.ownerId === 'string' && src.ownerId) log.ownerId = src.ownerId;
  return log;
}

function cloneLog(log: ActivityLog): ActivityLog {
  return { ...log, days: copyMap(log.days), misses: copyMap(log.misses), missLog: [...log.missLog] };
}

/** The row for one day (zeros when there is none), with its key. */
export function dayRow(log: Pick<ActivityLog, 'days'> | null | undefined, day: string): DayRecord & { day: string } {
  const raw = log?.days && hasOwn(log.days, day) ? log.days[day] : null;
  return { day, ...normalizeDay(raw ?? {}) };
}

/* ------------------------------------------------------------------ events */

export type ActivityEvent =
  | {
      type: 'solve';
      challengeId: string;
      /** A stage test (counts in `tests`, not `lessons`). */
      isTest: boolean;
      /** Not solved before - a re-solve counts in `reSolves` and pays nothing. */
      firstSolve: boolean;
      /** XP the solve actually paid. */
      awardedXp: number;
    }
  | {
      type: 'miss';
      challengeId: string;
      context: ActivityContext;
      answer: MissAnswer | null;
      /** The answer was shown after this miss. */
      final?: boolean;
      /** Wrong-answer keys (grading-engine/misses.ts `wrongAnswerKeys`). */
      keys?: string[];
      /** A signed-in learner's miss the server has not taken yet. */
      synced?: false;
    };

export interface EventContext {
  /** The learner's day the event lands on. */
  day: string;
  /** ISO time of the event. */
  at: string;
  rules?: ActivityRules;
}

function touch(row: DayRecord, at: string): void {
  row.firstAt = minIso(row.firstAt, at);
  row.lastAt = maxIso(row.lastAt, at);
}

/** Apply one event to a log. Returns the new log; the input is untouched. */
export function applyActivityEvent(log: ActivityLog, event: ActivityEvent, ctx: EventContext): ActivityLog {
  if (!isDayKey(ctx.day)) return log;
  const rules = ctx.rules ?? DEFAULT_ACTIVITY_RULES;
  const next = cloneLog(normalizeActivityLog(log));
  if (log.ownerId) next.ownerId = log.ownerId;
  const row: DayRecord = { ...normalizeDay(hasOwn(next.days, ctx.day) ? next.days[ctx.day] : {}), source: 'live' };
  touch(row, ctx.at);

  if (event.type === 'solve') {
    if (!event.firstSolve) row.reSolves += 1;
    else if (event.isTest) row.tests += 1;
    else row.lessons += 1;
    row.xp += count(event.awardedXp);
  } else if (event.type === 'miss') {
    row.mistakes += 1;
    const previous = hasOwn(next.misses, event.challengeId) ? next.misses[event.challengeId] : null;
    define(next.misses, event.challengeId, addMiss(previous, event, ctx));
    const entry: MissEntry = {
      challengeId: event.challengeId,
      at: ctx.at,
      day: ctx.day,
      context: event.context,
      answer: event.answer,
      final: event.final === true
    };
    if (event.synced === false) entry.synced = false;
    next.missLog = capLog([...next.missLog, entry].sort(byTime), rules.missLogCap);
  }

  define(next.days, ctx.day, row);
  next.lastDay = maxDay(next.lastDay, ctx.day);
  return pruneDays(next, rules.keepDays, next.lastDay ?? ctx.day);
}

function addMiss(previous: MissSummary | null, event: Extract<ActivityEvent, { type: 'miss' }>, ctx: EventContext): MissSummary {
  const s: MissSummary = previous
    ? { ...previous, keys: { ...previous.keys } }
    : { count: 0, firstAt: ctx.at, lastAt: ctx.at, lastDay: ctx.day, lastDayCount: 0, open: true, revealed: 0, keys: {}, lastAnswer: null };
  const isLatest = !previous || Date.parse(ctx.at) >= Date.parse(previous.lastAt);
  s.count = Math.min(MAX_COUNT, s.count + 1);
  s.firstAt = minIso(s.firstAt, ctx.at) ?? ctx.at;
  s.lastAt = maxIso(s.lastAt, ctx.at) ?? ctx.at;
  if (s.lastDay === ctx.day) s.lastDayCount += 1;
  else if (ctx.day > s.lastDay) {
    s.lastDay = ctx.day;
    s.lastDayCount = 1;
  }
  s.open = true;
  if (event.final) s.revealed += 1;
  const keys = { ...s.keys };
  for (const key of event.keys ?? []) define(keys, key, (hasOwn(keys, key) ? keys[key] : 0) + 1);
  s.keys = topKeys(keys);
  if (isLatest) s.lastAnswer = event.answer;
  const codeOnly = event.answer?.kind === 'code' && (!previous || previous.codeOnly === true);
  if (codeOnly) s.codeOnly = true;
  else delete s.codeOnly;
  return s;
}

function capLog(entries: MissEntry[], cap: number): MissEntry[] {
  const keep = Math.max(0, Math.floor(cap));
  return keep === 0 ? [] : entries.slice(-keep);
}

/** Misses recorded for one challenge on one day, as the per-item cap counts them. */
export function missesOn(log: ActivityLog, challengeId: string, day: string): number {
  const summary = hasOwn(log.misses, challengeId) ? log.misses[challengeId] : null;
  if (summary && summary.lastDay === day) return summary.lastDayCount;
  return log.missLog.filter((e) => e.challengeId === challengeId && e.day === day).length;
}

/** Would one more miss for this challenge on this day stay inside the daily caps? */
export function missAllowed(log: ActivityLog, challengeId: string, day: string, caps: { perDay: number; perItemPerDay: number }): boolean {
  const row = hasOwn(log.days, day) ? normalizeDay(log.days[day]) : emptyDay();
  return row.mistakes < caps.perDay && missesOn(log, challengeId, day) < caps.perItemPerDay;
}

/** Drop days more than `keepDays` before `today`. */
export function pruneDays(log: ActivityLog, keepDays: number, today: string): ActivityLog {
  if (!isDayKey(today) || !(keepDays > 0)) return log;
  const stale = Object.keys(log.days).filter((day) => daysBetween(day, today) >= keepDays);
  if (stale.length === 0) return log;
  const days = copyMap(log.days);
  for (const day of stale) delete days[day];
  return { ...log, days };
}

/* ------------------------------------------------------------------- merge */

/** A first solve being carried into an account by a merge, already priced by the server. */
export interface SolveCredit {
  challengeId: string;
  day: string;
  at: string;
  isTest: boolean;
  awardedXp: number;
}

export interface MergeContext {
  /** The account's day now; nothing after it is taken. */
  today: string;
  rules?: ActivityRules;
  /**
   * First solves the merge is paying for, each exactly once. They are the
   * ONLY source of merged XP, lessons and tests - a received day's own XP is
   * never read. The caller must pass each at most once (the server derives
   * them from challenge ids the account had not solved).
   */
  credits?: SolveCredit[];
  /**
   * Validates (and may rewrite) a received miss-log entry; null drops it. The
   * server re-grades the answer here and works the entry's day out again
   * from its time, in the account's zone.
   */
  acceptEntry?: (entry: MissEntry) => MissEntry | null;
  /**
   * Validates (and may rewrite) a received miss summary; null drops it. The
   * server checks the challenge exists, keeps only real wrong-answer keys and
   * re-grades the last answer here (grading-engine/misses.ts `checkMissSummary`).
   */
  acceptMiss?: (challengeId: string, summary: MissSummary) => MissSummary | null;
  /**
   * The daily miss caps (`settings.retention`), applied to what is received:
   * a day's mistakes, the miss-log entries taken per day and per question,
   * and how many misses a summary can claim for the days it spans.
   */
  caps?: MissCaps;
}

/** The daily miss caps, as `settings.retention` sets them. */
export interface MissCaps {
  /** Misses recorded per day, across every question. */
  perDay: number;
  /** Misses recorded per question per day. */
  perItemPerDay: number;
}

function inWindow(day: string, today: string, keepDays: number): boolean {
  if (!isDayKey(day) || day > today) return false;
  return daysBetween(day, today) < keepDays;
}

/**
 * A received summary can claim no more misses than the per-question daily
 * cap allows over the days it spans - from its first miss to today, inside
 * the window, with a day of slack for time zones. So one merge can neither
 * claim a million misses nor push the admin's "Most missed" totals around.
 */
function capSummary(s: MissSummary, today: string, keepDays: number, caps: MissCaps): MissSummary {
  const perItem = Math.max(1, Math.floor(caps.perItemPerDay));
  const first = new Date(Date.parse(s.firstAt));
  const spanned = Number.isNaN(first.getTime()) ? NaN : daysBetween(first.toISOString().slice(0, 10), today);
  const days = Math.max(1, Math.min(keepDays, Number.isFinite(spanned) ? spanned + 2 : keepDays));
  const total = Math.max(1, Math.min(s.count, perItem * days));
  const keys: Record<string, number> = {};
  for (const key of Object.keys(s.keys)) define(keys, key, Math.min(s.keys[key], total));
  return {
    ...s,
    count: total,
    lastDayCount: Math.max(1, Math.min(s.lastDayCount, perItem, total)),
    revealed: Math.min(s.revealed, total),
    keys
  };
}

function mergeSummaries(a: MissSummary, b: MissSummary, today: string): MissSummary {
  const later = Date.parse(b.lastAt) > Date.parse(a.lastAt) ? b : a;
  const keys: Record<string, number> = { ...a.keys };
  for (const key of Object.keys(b.keys)) define(keys, key, Math.max(hasOwn(keys, key) ? keys[key] : 0, b.keys[key]));
  let lastDay = a.lastDay;
  let lastDayCount = a.lastDayCount;
  if (b.lastDay > lastDay) {
    lastDay = b.lastDay;
    lastDayCount = b.lastDayCount;
  } else if (b.lastDay === lastDay) lastDayCount = Math.max(lastDayCount, b.lastDayCount);
  if (lastDay > today) lastDay = today;
  const merged: MissSummary = {
    count: Math.max(a.count, b.count),
    firstAt: minIso(a.firstAt, b.firstAt) ?? a.firstAt,
    lastAt: maxIso(a.lastAt, b.lastAt) ?? a.lastAt,
    lastDay,
    lastDayCount,
    open: a.open || b.open,
    revealed: Math.max(a.revealed, b.revealed),
    keys: topKeys(keys),
    lastAnswer: later.lastAnswer ?? a.lastAnswer ?? b.lastAnswer
  };
  if (a.codeOnly && b.codeOnly) merged.codeOnly = true;
  return merged;
}

/**
 * Merge a received log (a guest's, or this account's offline copy) into the
 * server's. Idempotent: merging the same log twice gives the same result as
 * once, so a retried or repeated sign-in never double counts.
 *   - XP, lessons and tests come only from `credits` (priced by the server).
 *   - Re-solves and mistakes take the larger of the two per day.
 *   - Miss summaries: count max, first time min, last time max, through
 *     `acceptMiss`.
 *   - The miss log is a union keyed by (challenge, time), through `acceptEntry`.
 *   - With `caps`, nothing received counts past the daily miss caps.
 * A day after `today`, or older than the retention window, is ignored.
 */
export function mergeActivityLogs(server: unknown, incoming: unknown, ctx: MergeContext): ActivityLog {
  const rules = ctx.rules ?? DEFAULT_ACTIVITY_RULES;
  const today = ctx.today;
  const base = normalizeActivityLog(server);
  const next = cloneLog(base);
  const inc = normalizeActivityLog(incoming);
  const rowFor = (day: string): DayRecord =>
    hasOwn(next.days, day) ? { ...normalizeDay(next.days[day]) } : emptyDay('merge');

  for (const credit of ctx.credits ?? []) {
    if (!inWindow(credit.day, today, rules.keepDays)) continue;
    const row = rowFor(credit.day);
    if (credit.isTest) row.tests += 1;
    else row.lessons += 1;
    row.xp += count(credit.awardedXp);
    touch(row, credit.at);
    define(next.days, credit.day, row);
    next.lastDay = maxDay(next.lastDay, credit.day);
  }

  for (const day of Object.keys(inc.days)) {
    if (!inWindow(day, today, rules.keepDays)) continue;
    const theirs = inc.days[day];
    const existed = hasOwn(next.days, day);
    if (!existed && theirs.reSolves === 0 && theirs.mistakes === 0) continue;
    const row = rowFor(day);
    row.reSolves = Math.max(row.reSolves, theirs.reSolves);
    row.mistakes = Math.max(row.mistakes, ctx.caps ? Math.min(theirs.mistakes, Math.max(0, Math.floor(ctx.caps.perDay))) : theirs.mistakes);
    if (theirs.reSolves > 0 || theirs.mistakes > 0) {
      if (theirs.firstAt) touch(row, theirs.firstAt);
      if (theirs.lastAt) touch(row, theirs.lastAt);
    }
    define(next.days, day, row);
    next.lastDay = maxDay(next.lastDay, day);
  }

  for (const id of Object.keys(inc.misses)) {
    const received = inc.misses[id];
    // A summary dated after the account's today came from a wrong clock.
    if (received.lastDay > today) continue;
    const accepted = ctx.acceptMiss ? ctx.acceptMiss(id, received) : received;
    if (!accepted) continue;
    const theirs = ctx.caps ? capSummary(accepted, today, rules.keepDays, ctx.caps) : accepted;
    const ours = hasOwn(next.misses, id) ? next.misses[id] : null;
    define(next.misses, id, ours ? mergeSummaries(ours, theirs, today) : mergeSummaries(theirs, theirs, today));
  }

  // The caps count what the log already holds for a day (and a question on
  // that day), so a merge only fills whatever room is left.
  const perDay = new Map<string, number>();
  const perItem = new Map<string, number>();
  const bump = (map: Map<string, number>, key: string) => map.set(key, (map.get(key) ?? 0) + 1);
  for (const e of next.missLog) {
    bump(perDay, e.day);
    bump(perItem, `${e.challengeId}|${e.day}`);
  }

  const seen = new Set(next.missLog.map((e) => `${e.challengeId}|${e.at}`));
  const added: MissEntry[] = [];
  for (const entry of inc.missLog) {
    const key = `${entry.challengeId}|${entry.at}`;
    if (seen.has(key)) continue;
    const accepted = ctx.acceptEntry ? ctx.acceptEntry(entry) : entry;
    // The window is checked on the day as accepted - the server works it out
    // again from the entry's time rather than believing the one sent.
    if (!accepted || !inWindow(accepted.day, today, rules.keepDays)) continue;
    if (ctx.caps) {
      const itemKey = `${accepted.challengeId}|${accepted.day}`;
      if ((perDay.get(accepted.day) ?? 0) >= ctx.caps.perDay || (perItem.get(itemKey) ?? 0) >= ctx.caps.perItemPerDay) continue;
      bump(perDay, accepted.day);
      bump(perItem, itemKey);
    }
    seen.add(key);
    const clean: MissEntry = { ...accepted };
    delete clean.synced;
    added.push(clean);
  }
  next.missLog = capLog(
    [...next.missLog, ...added].map((e) => {
      if (e.synced === undefined) return e;
      const clean = { ...e };
      delete clean.synced;
      return clean;
    }).sort(byTime),
    rules.missLogCap
  );

  if (next.lastDay && next.lastDay > today) next.lastDay = today;
  return pruneDays(next, rules.keepDays, today);
}

/* ----------------------------------------------------------------- backfill */

/** What the backfill needs to know about a challenge. */
export interface BackfillLookup {
  (id: string): { isStageTest?: boolean; xpReward?: number } | null | undefined;
}

/**
 * Day rows rebuilt from `attempts[*].solvedAt`, for accounts (and guests)
 * whose history predates the log. Lossy on purpose and marked as such
 * (`source: 'backfill'`): `solvedAt` used to be overwritten by every
 * re-solve, and the XP is re-derived from the recorded tries and hints.
 */
export function backfillFromAttempts(
  attempts: unknown,
  lookup: BackfillLookup,
  zone: string | null | undefined,
  rules: XpRules = DEFAULT_XP_RULES,
  limits: { maxAttempts: number; maxHints: number } = { maxAttempts: 50, maxHints: 10 }
): Record<string, DayRecord> {
  const days: Record<string, DayRecord> = {};
  const all = plainObject(attempts);
  for (const id of Object.keys(all)) {
    const attempt = plainObject(all[id]) as Partial<ChallengeAttempt>;
    const at = isoOrNull(attempt.solvedAt);
    if (!at) continue;
    const day = dayKeyIn(zone, new Date(at));
    const row = hasOwn(days, day) ? days[day] : emptyDay('backfill');
    const challenge = lookup(id);
    if (challenge?.isStageTest) row.tests += 1;
    else row.lessons += 1;
    if (challenge) {
      const tries = Math.max(1, Math.min(limits.maxAttempts, Number(attempt.attempts) || 1));
      const hints = Math.max(0, Math.min(limits.maxHints, Number(attempt.hintsUsed) || 0));
      row.xp += xpForSolve(Number(challenge.xpReward) || 0, tries, hints, rules);
    }
    touch(row, at);
    define(days, day, row);
  }
  return days;
}

/**
 * Add backfilled rows to a log - only on days the log does not already have,
 * so a backfill can never double a day that was recorded live - and stamp it.
 */
export function withBackfill(log: ActivityLog, days: Record<string, DayRecord>, at: string, rules: ActivityRules = DEFAULT_ACTIVITY_RULES, today?: string): ActivityLog {
  const next = cloneLog(log);
  for (const day of Object.keys(days)) {
    if (hasOwn(next.days, day)) continue;
    define(next.days, day, days[day]);
    next.lastDay = maxDay(next.lastDay, day);
  }
  next.backfilledAt = at;
  return pruneDays(next, rules.keepDays, maxDay(today ?? null, next.lastDay) ?? at.slice(0, 10));
}

/* ------------------------------------------------------------ the heatmap */

function heatLevel(xp: number, solves: number, mistakes: number): HeatCell['level'] {
  if (xp <= 0) return solves > 0 || mistakes > 0 ? 1 : 0;
  if (xp <= 100) return 1;
  if (xp <= 250) return 2;
  if (xp <= 500) return 3;
  return 4;
}

function countLevel(n: number): HeatCell['level'] {
  return n === 0 ? 0 : n <= 2 ? 1 : n <= 5 ? 2 : n <= 9 ? 3 : 4;
}

/**
 * GitHub-style grid of `weeks` columns of seven days ending on `today`,
 * Monday first, oldest week first. Intensity is the XP credited that day.
 * Days before the log started can be filled from `fallback` (solve counts
 * derived from `attempts`), so an old account's history still shows.
 */
export function activityGridFromLog(
  days: Record<string, DayRecord> | null | undefined,
  weeks: number,
  today: string,
  fallback?: (day: string) => number
): HeatCell[][] {
  const map = days ?? {};
  const start = addDays(weekStartFor(today, 1), -(Math.max(1, weeks) - 1) * 7);
  const grid: HeatCell[][] = [];
  for (let w = 0; w < Math.max(1, weeks); w++) {
    const column: HeatCell[] = [];
    for (let d = 0; d < 7; d++) {
      const key = addDays(start, w * 7 + d);
      if (key > today) {
        column.push({ day: key, count: 0, level: 0 });
      } else if (hasOwn(map, key)) {
        const row = normalizeDay(map[key]);
        const solves = row.lessons + row.tests + row.reSolves;
        column.push({ day: key, count: solves, xp: row.xp, level: heatLevel(row.xp, solves, row.mistakes) });
      } else {
        const n = fallback ? Math.max(0, fallback(key) || 0) : 0;
        column.push({ day: key, count: n, level: countLevel(n) });
      }
    }
    grid.push(column);
  }
  return grid;
}

/* ---------------------------------------------------- server <-> browser */

/** What `GET /api/activity` (and a merge response) returns. */
export interface ActivityView {
  /** The zone the account's days are counted in. */
  timeZone: string;
  /** The account's current day. */
  today: string;
  /** The first day in `days`. */
  from: string;
  days: Record<string, DayRecord>;
  misses: Record<string, MissSummary>;
  lastDay: string | null;
}

/** Miss-log entries a signed-in learner recorded while the server could not take them. */
export function unsyncedMisses(log: ActivityLog): MissEntry[] {
  return log.missLog.filter((e) => e.synced === false);
}

/** Every entry marked as taken by the server. */
export function markMissesSynced(log: ActivityLog, which?: (entry: MissEntry) => boolean): ActivityLog {
  if (!log.missLog.some((e) => e.synced === false && (!which || which(e)))) return log;
  return {
    ...log,
    missLog: log.missLog.map((e) => {
      if (e.synced !== false || (which && !which(e))) return e;
      const clean = { ...e };
      delete clean.synced;
      return clean;
    })
  };
}

/**
 * How big a whole `POST /api/progress/merge` body may get. The server's JSON
 * limit is 256 kB; the rest is headroom. The caller subtracts what the
 * progress itself weighs and trims the activity to what is left.
 */
export const MERGE_BODY_MAX_BYTES = 200_000;

/** A signed-in learner's own rows this recent go up too: an offline re-solve counts only in its day row. */
const PENDING_RECENT_DAYS = 14;

/** The UTF-8 size of `value` as JSON - what it weighs in a request body. */
export function jsonByteLength(value: unknown): number {
  const text = JSON.stringify(value) ?? '';
  let bytes = 0;
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    if (code < 0x80) bytes += 1;
    else if (code < 0x800) bytes += 2;
    else if (code >= 0xd800 && code <= 0xdbff && i + 1 < text.length) {
      bytes += 4; // a surrogate pair is one 4-byte character
      i += 1;
    } else bytes += 3;
  }
  return bytes;
}

export interface MergeTrimOptions {
  /**
   * Keep the JSON of the result under this many bytes: the oldest miss-log
   * entries go first, then the oldest days, then the stalest summaries.
   */
  maxBytes?: number;
  /**
   * A signed-in learner's own log: the server already has everything that
   * was synced, so only the entries still pending go - with the summaries
   * and days they touch, and the last two weeks of days.
   */
  pendingOnly?: boolean;
}

/**
 * The part of a log that goes up with a merge: days inside the retention
 * window, the miss summaries and the newest `missLogCap` entries - trimmed
 * by size so the request stays under the server's 256 kB limit.
 */
export function trimActivityForMerge(
  log: ActivityLog,
  today: string,
  rules: ActivityRules = DEFAULT_ACTIVITY_RULES,
  options: MergeTrimOptions = {}
): Pick<ActivityLog, 'days' | 'misses' | 'missLog'> {
  const maxBytes = options.maxBytes ?? MERGE_BODY_MAX_BYTES;
  let missLog = capLog(log.missLog, rules.missLogCap);
  let wantDay = (day: string) => inWindow(day, today, rules.keepDays);
  let wantMiss = (_id: string) => true;
  if (options.pendingOnly) {
    missLog = missLog.filter((e) => e.synced === false);
    const ids = new Set(missLog.map((e) => e.challengeId));
    const touched = new Set(missLog.map((e) => e.day));
    wantDay = (day) => inWindow(day, today, rules.keepDays) && (touched.has(day) || daysBetween(day, today) < PENDING_RECENT_DAYS);
    wantMiss = (id) => ids.has(id);
  }

  const days: Record<string, DayRecord> = {};
  for (const day of Object.keys(log.days)) if (wantDay(day)) define(days, day, log.days[day]);
  const misses: Record<string, MissSummary> = {};
  for (const id of Object.keys(log.misses)) if (wantMiss(id)) define(misses, id, log.misses[id]);

  let size = jsonByteLength({ days, misses, missLog });
  if (size <= maxBytes) return { days, misses, missLog };

  // Too big: shed the least useful first. Each removal takes its own JSON -
  // and the comma beside it, unless it was the last one left - off the size.
  let drop = 0;
  while (drop < missLog.length && size > maxBytes) {
    size -= jsonByteLength(missLog[drop]) + (missLog.length - drop > 1 ? 1 : 0);
    drop += 1;
  }
  missLog = missLog.slice(drop);
  const shed = <T>(map: Record<string, T>, order: string[]) => {
    let left = order.length;
    for (const key of order) {
      if (size <= maxBytes) return;
      size -= jsonByteLength(key) + 1 + jsonByteLength(map[key]) + (left > 1 ? 1 : 0);
      delete map[key];
      left -= 1;
    }
  };
  shed(days, Object.keys(days).sort());
  shed(misses, Object.keys(misses).sort((a, b) => Date.parse(misses[a].lastAt) - Date.parse(misses[b].lastAt)));
  return { days, misses, missLog };
}

/**
 * Take the server's view of the account into the browser's copy: its days
 * replace ours inside the window it covers (older local days stay), its miss
 * summaries replace ours, and our miss log is kept - minus the pending flags
 * when everything has just been sent.
 */
export function adoptActivityView(local: ActivityLog, view: Partial<ActivityView> | null | undefined, options: { ownerId?: string; synced?: boolean; now?: string } = {}): ActivityLog {
  if (!view || typeof view !== 'object') return local;
  const incoming = normalizeActivityLog({ days: view.days, misses: view.misses });
  const from = isDayKey(view.from) ? view.from : null;
  const days: Record<string, DayRecord> = {};
  for (const day of Object.keys(local.days)) if (from && day < from) define(days, day, local.days[day]);
  for (const day of Object.keys(incoming.days)) define(days, day, incoming.days[day]);
  let next: ActivityLog = {
    ...local,
    v: 1,
    days,
    misses: view.misses ? incoming.misses : local.misses,
    lastDay: maxDay(maxDay(local.lastDay, view.lastDay ?? null), isDayKey(view.today) ? view.today : null),
    backfilledAt: local.backfilledAt ?? options.now ?? new Date().toISOString()
  };
  if (options.synced) next = markMissesSynced(next);
  if (options.ownerId) next.ownerId = options.ownerId;
  return next;
}
