/**
 * The browser's activity log: a guest's own days and wrong answers, or a
 * signed-in learner's mirror of the account's (which the server owns).
 *
 * Persisted under `cq-activity-v1` and tagged with `ownerId` exactly like the
 * stats, so a log recorded under one account is never sent into another.
 * Every change goes through the pure reducer in src/platform/activity/log.ts,
 * the same code the server runs.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { MutableRefObject } from 'react';
import type { ActivityLog, DayRecord, MissEntry, MissSummary, UserStats } from '@/types';
import {
  adoptActivityView,
  applyActivityEvent,
  backfillFromAttempts,
  emptyActivityLog,
  markMissesSynced,
  normalizeActivityLog,
  normalizeDay,
  withBackfill
} from '../activity/log';
import type { ActivityEvent, ActivityRules, ActivityView, BackfillLookup } from '../activity/log';
import type { XpRules } from '../xp-leveling/leveling';
import { STORAGE_KEYS, readJson, writeJson } from '../storage/storage';

function define<T>(map: Record<string, T>, key: string, value: T): void {
  Object.defineProperty(map, key, { value, writable: true, enumerable: true, configurable: true });
}

/** The stored log, made safe - or a fresh one that still needs its backfill. */
export function readCachedActivity(): ActivityLog {
  const raw = readJson<unknown>(STORAGE_KEYS.activity, null);
  return raw ? normalizeActivityLog(raw) : emptyActivityLog();
}

export interface ActivityLogApi {
  activity: ActivityLog;
  /** Always the latest log, for callbacks that must not wait for a render. */
  activityRef: MutableRefObject<ActivityLog>;
  replaceActivity: (next: ActivityLog) => void;
  /** Apply one event locally; returns the log as it was before, for a rollback. */
  applyEvent: (event: ActivityEvent, ctx: { day: string; at: string; rules?: ActivityRules }) => ActivityLog;
  /** Rebuild days from `attempts` once, for history that predates the log (guests, and old caches). */
  backfillOnce: (stats: UserStats, lookup: BackfillLookup, zone: string | null, rules: XpRules, today: string) => void;
  /** Take the server's view (after a merge, or a restore). */
  adoptView: (view: ActivityView | null | undefined, options: { ownerId?: string; synced?: boolean }) => void;
  /** The server's row for one day wins over the optimistic one. */
  adoptDay: (row: (DayRecord & { day: string }) | null | undefined) => void;
  /** The server's summaries for the challenges it just took misses for. */
  adoptMisses: (misses: Record<string, MissSummary> | null | undefined) => void;
  /** Mark queued misses as taken by the server (all, or those `which` picks). */
  markSynced: (which?: (entry: MissEntry) => boolean) => void;
  /** Forget everything (signing out): the account's log lives on the server. */
  resetActivity: () => void;
  /** A progress reset: the wrong answers go, the days (history) stay. */
  clearMisses: () => void;
  /** Tag the log with the account it now belongs to. */
  setOwner: (ownerId: string | undefined) => void;
}

export function useActivityLog(): ActivityLogApi {
  const [activity, setActivity] = useState<ActivityLog>(readCachedActivity);
  const activityRef = useRef(activity);

  useEffect(() => {
    writeJson(STORAGE_KEYS.activity, activity);
  }, [activity]);

  const replaceActivity = useCallback((next: ActivityLog) => {
    activityRef.current = next;
    setActivity(next);
  }, []);

  const applyEvent = useCallback<ActivityLogApi['applyEvent']>(
    (event, ctx) => {
      const before = activityRef.current;
      const next = applyActivityEvent(before, event, ctx);
      if (before.ownerId) next.ownerId = before.ownerId;
      replaceActivity(next);
      return before;
    },
    [replaceActivity]
  );

  const backfillOnce = useCallback<ActivityLogApi['backfillOnce']>(
    (stats, lookup, zone, rules, today) => {
      const log = activityRef.current;
      if (log.backfilledAt) return;
      const days = backfillFromAttempts(stats.attempts, lookup, zone, rules);
      const next = withBackfill(log, days, new Date().toISOString(), undefined, today);
      if (log.ownerId) next.ownerId = log.ownerId;
      replaceActivity(next);
    },
    [replaceActivity]
  );

  const adoptView = useCallback<ActivityLogApi['adoptView']>(
    (view, options) => {
      if (!view) return;
      replaceActivity(adoptActivityView(activityRef.current, view, options));
    },
    [replaceActivity]
  );

  const adoptDay = useCallback<ActivityLogApi['adoptDay']>(
    (row) => {
      if (!row || typeof row.day !== 'string') return;
      const log = activityRef.current;
      const days = { ...log.days };
      define(days, row.day, normalizeDay(row));
      replaceActivity({ ...log, days, lastDay: !log.lastDay || row.day > log.lastDay ? row.day : log.lastDay });
    },
    [replaceActivity]
  );

  const adoptMisses = useCallback<ActivityLogApi['adoptMisses']>(
    (misses) => {
      if (!misses || typeof misses !== 'object') return;
      const log = activityRef.current;
      const incoming = normalizeActivityLog({ misses }).misses;
      const next = { ...log.misses };
      for (const id of Object.keys(incoming)) define(next, id, incoming[id]);
      replaceActivity({ ...log, misses: next });
    },
    [replaceActivity]
  );

  const markSynced = useCallback<ActivityLogApi['markSynced']>(
    (which) => replaceActivity(markMissesSynced(activityRef.current, which)),
    [replaceActivity]
  );

  const resetActivity = useCallback(() => {
    // Nothing to backfill: the next account's history comes from its server.
    replaceActivity({ ...emptyActivityLog(), backfilledAt: new Date().toISOString() });
  }, [replaceActivity]);

  const clearMisses = useCallback(() => {
    replaceActivity({ ...activityRef.current, misses: {}, missLog: [] });
  }, [replaceActivity]);

  const setOwner = useCallback(
    (ownerId: string | undefined) => {
      const log = activityRef.current;
      if (log.ownerId === ownerId) return;
      const next = { ...log };
      if (ownerId) next.ownerId = ownerId;
      else delete next.ownerId;
      replaceActivity(next);
    },
    [replaceActivity]
  );

  // Every action is stable, so the object only changes when the log does.
  return useMemo(
    () => ({
      activity,
      activityRef,
      replaceActivity,
      applyEvent,
      backfillOnce,
      adoptView,
      adoptDay,
      adoptMisses,
      markSynced,
      resetActivity,
      clearMisses,
      setOwner
    }),
    [activity, replaceActivity, applyEvent, backfillOnce, adoptView, adoptDay, adoptMisses, markSynced, resetActivity, clearMisses, setOwner]
  );
}
