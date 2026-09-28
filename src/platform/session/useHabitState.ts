/**
 * The learner's streak and daily goal as screens show them, and the one
 * place that announces what happened to them.
 *
 *   - `habits` is DERIVED, never stored: the habits engine settles a copy of
 *     the raw streak fields (`stats.streak`, `bestStreak`, `lastActiveDay`,
 *     `habit`) as of the learner's today and reads today's day record for
 *     the goal (src/platform/habits `learnerHabitStatus` - the server runs
 *     the same). It follows the day the session rolls at local midnight,
 *     and re-reads the clock every few minutes for "at risk" and the hours
 *     left - without handing screens a new object when nothing changed.
 *   - Each `habit:*` event is emitted once per learner (`cq-habit-seen-v1`,
 *     so a refresh never announces the same thing twice, and one account's
 *     goal met today never hides another's on a shared browser):
 *       announceSolve  - what a solve did (the server's word when it
 *                        answered, else this browser's): goal met
 *                        (`source: 'solve'`), freeze earned or used, a
 *                        repair completed, a milestone reached;
 *       the watcher    - a goal met that no solve here announced (met
 *                        offline or on another device, learned from a
 *                        sync) as `source: 'sync'`, and freezes used over
 *                        days nobody was here for.
 *     While a solve is on its way (`holdAnnouncements`) the watcher waits,
 *     so the optimistic day row never passes for a sync.
 *   - Reminder banners dismissed for the day are remembered in the same key.
 *
 * The seen keys are kept per owner (the account id, or 'guest'). A guest
 * who signs in brings their progress into the account, so what was
 * announced to them carries over to it; any other change of owner starts
 * from that owner's own keys.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { DailyGoalOption, DayRecord, UserStats } from '@/types';
import { eventBus } from '../events';
import { enabledGoalOptions, isMilestone, learnerGoal, learnerHabitStatus, learnerRules, streakFieldsOf, streakStrip } from '../habits';
import type { HabitRules, HabitSettingsView, HabitStatus, StreakStripCell } from '../habits';
import { addDays, isDayKey } from '../time/days';
import { STORAGE_KEYS, readJson, writeJson } from '../storage/storage';

/** How often the clock is read again for "at risk" and the hours left. */
const CLOCK_MS = 5 * 60_000;
/** Seen keys older than this many days are forgotten. */
const SEEN_DAYS = 30;

/* ------------------------------------------------------------ seen store */

/** Whose announcements these are when there is no account. */
export const GUEST_OWNER = 'guest';

/** `{ v: 2, owners: { [owner]: { [key]: day recorded } } }` (a v1 copy, with no owner, is dropped). */
export interface SeenStore {
  v: 2;
  owners: Record<string, Record<string, string>>;
}

const safeKey = (key: string) => Boolean(key) && key !== '__proto__' && key !== 'constructor' && key !== 'prototype';

export function readSeen(): SeenStore {
  const raw = readJson<{ v?: unknown; owners?: unknown } | null>(STORAGE_KEYS.habitSeen, null);
  const owners: Record<string, Record<string, string>> = {};
  if (raw && raw.v === 2 && raw.owners && typeof raw.owners === 'object' && !Array.isArray(raw.owners)) {
    for (const [owner, entries] of Object.entries(raw.owners as Record<string, unknown>)) {
      if (!safeKey(owner) || !entries || typeof entries !== 'object' || Array.isArray(entries)) continue;
      const keys: Record<string, string> = {};
      for (const [key, day] of Object.entries(entries as Record<string, unknown>)) if (safeKey(key) && isDayKey(day)) keys[key] = day;
      owners[owner] = keys;
    }
  }
  return { v: 2, owners };
}

/** Written pruned: keys older than SEEN_DAYS go, and owners left with none. */
export function writeSeen(store: SeenStore, today: string): void {
  const oldest = addDays(today, -SEEN_DAYS);
  const owners: Record<string, Record<string, string>> = {};
  for (const [owner, entries] of Object.entries(store.owners)) {
    const keys: Record<string, string> = {};
    for (const [key, day] of Object.entries(entries)) if (day >= oldest) keys[key] = day;
    if (Object.keys(keys).length > 0) owners[owner] = keys;
  }
  store.owners = owners;
  writeJson(STORAGE_KEYS.habitSeen, { v: 2, owners });
}

/**
 * A guest just became `owner` (signed in; their progress went into the
 * account): what was announced to the guest is the account's now, and the
 * next guest in this browser starts fresh.
 */
export function adoptGuestSeen(store: SeenStore, owner: string): boolean {
  const guest = store.owners[GUEST_OWNER];
  if (owner === GUEST_OWNER || !guest || Object.keys(guest).length === 0) return false;
  store.owners[owner] = { ...guest, ...(store.owners[owner] ?? {}) };
  delete store.owners[GUEST_OWNER];
  return true;
}

/* ------------------------------------------------------------- the hook */

/** What a solve did to the streak and the goal, as announced. */
export interface SolveHabitEvents {
  goalMet: boolean;
  /** The goal bonus that is really paid (the server's; a guest's own). */
  bonusXp: number;
  freezeEarned: boolean;
  repaired: boolean;
  streakDay: boolean;
  frozenDays: string[];
}

export interface HabitStateInput {
  /** Whose streak this is: the account id, or null for a guest (the seen keys are kept per owner). */
  owner: string | null;
  stats: UserStats;
  settings: HabitSettingsView;
  /** The learner's chosen goal option, or null for the default. */
  dailyGoalId: string | null;
  /** The learner's day (rolls at their midnight). */
  today: string;
  /** Today's activity row. */
  todayRow: DayRecord;
  /** The zone the learner's days are counted in. */
  zone: string | null;
}

export interface HabitStateApi {
  habits: HabitStatus;
  rules: HabitRules;
  /** The goal options a learner can pick now. */
  goalOptions: DailyGoalOption[];
  /** The goal that applies today (the choice, else the default), or null when goals are off. */
  dailyGoal: DailyGoalOption | null;
  /** The last `count` days, marked active, frozen, repaired, missed or today. */
  strip: (days: Record<string, DayRecord>, count: number) => StreakStripCell[];
  /** Announce what one solve did, once each. `after` is the streak and freezes it left. */
  announceSolve: (day: string, events: SolveHabitEvents, after: { streak: number; freezes: number }) => void;
  /** Hold the sync watcher while a solve is on its way; call the returned function when it has landed. */
  holdAnnouncements: () => () => void;
  isDismissed: (key: string) => boolean;
  dismiss: (key: string) => void;
}

/** The same object as last time when nothing in it changed, so screens do not re-render every clock tick. */
function useStable<T>(value: T): T {
  const ref = useRef<{ json: string; value: T } | null>(null);
  const json = JSON.stringify(value);
  if (!ref.current || ref.current.json !== json) ref.current = { json, value };
  return ref.current.value;
}

export function useHabitState({ owner: ownerId, stats, settings, dailyGoalId, today, todayRow, zone }: HabitStateInput): HabitStateApi {
  const owner = ownerId || GUEST_OWNER;
  // The clock, for "at risk" (not before the admin's hour) and the hours left.
  const [clock, setClock] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setClock(Date.now()), CLOCK_MS);
    return () => window.clearInterval(timer);
  }, []);

  const rules = useMemo(() => learnerRules({ settings }), [settings]);
  const dailyGoal = useMemo(() => learnerGoal({ settings, dailyGoalId }), [settings, dailyGoalId]);
  const goalOptions = useMemo(() => enabledGoalOptions(settings.goals), [settings.goals]);

  const derived = useMemo(
    () =>
      learnerHabitStatus(stats, {
        settings,
        dailyGoalId,
        today,
        day: todayRow,
        now: new Date(clock),
        zone
      }),
    // Only the streak fields of the stats matter here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [stats.streak, stats.bestStreak, stats.lastActiveDay, stats.habit, settings, dailyGoalId, today, todayRow, clock, zone]
  );
  const habits = useStable(derived);

  const statsRef = useRef(stats);
  statsRef.current = stats;
  const strip = useCallback(
    (days: Record<string, DayRecord>, count: number) => streakStrip(streakFieldsOf(statsRef.current, rules), days, today, count, rules),
    // Recomputed when the streak moves, the day rolls or the rules change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rules, today, habits]
  );

  /* ------------------------------------------------------ seen and dismissed */
  const seenRef = useRef<SeenStore | null>(null);
  const seen = useCallback(() => (seenRef.current ??= readSeen()), []);
  const [dismissedVersion, setDismissedVersion] = useState(0);

  // A guest signing in: their announcements (and dismissed banners) go with
  // their progress into the account. Declared before the watcher below, so
  // it runs first in the same commit.
  const lastOwner = useRef(owner);
  useEffect(() => {
    if (lastOwner.current === owner) return;
    const fromGuest = lastOwner.current === GUEST_OWNER;
    lastOwner.current = owner;
    if (fromGuest && adoptGuestSeen(seen(), owner)) {
      writeSeen(seen(), today);
      setDismissedVersion((n) => n + 1);
    }
  }, [owner, seen, today]);

  const hasSeen = useCallback((key: string) => Object.prototype.hasOwnProperty.call(seen().owners[owner] ?? {}, key), [seen, owner]);
  const markSeen = useCallback(
    (key: string, day: string) => {
      const store = seen();
      store.owners[owner] = { ...(store.owners[owner] ?? {}), [key]: day };
      writeSeen(store, day);
    },
    [seen, owner]
  );
  /** Emit once: false when this key was already announced. */
  const once = useCallback(
    (key: string, day: string, emit: () => void) => {
      if (hasSeen(key)) return false;
      markSeen(key, day);
      emit();
      return true;
    },
    [hasSeen, markSeen]
  );

  const isDismissed = useCallback(
    (key: string) => hasSeen(`dismissed:${key}`),
    // dismissedVersion re-creates it, so banners re-read after a dismissal.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [hasSeen, dismissedVersion]
  );
  const dismiss = useCallback(
    (key: string) => {
      markSeen(`dismissed:${key}`, today);
      setDismissedVersion((n) => n + 1);
    },
    [markSeen, today]
  );

  /* ------------------------------------------------------------ announcing */
  const habitsRef = useRef(habits);
  habitsRef.current = habits;
  const goalRef = useRef(dailyGoal);
  goalRef.current = dailyGoal;

  const announceSolve = useCallback<HabitStateApi['announceSolve']>(
    (day, events, after) => {
      if (events.frozenDays.length > 0) {
        once(`freezeUsed:${events.frozenDays.join(',')}`, day, () => eventBus.emit('habit:freezeUsed', { days: events.frozenDays, streak: after.streak }));
      }
      if (events.repaired) once(`repaired:${day}`, day, () => eventBus.emit('habit:streakRepaired', { streak: after.streak }));
      if (events.goalMet) {
        once(`goalMet:${day}`, day, () =>
          eventBus.emit('habit:goalMet', {
            day,
            source: 'solve',
            label: habitsRef.current.goal?.label ?? goalRef.current?.label ?? '',
            bonusXp: events.bonusXp,
            streak: after.streak
          })
        );
      }
      if (events.freezeEarned) {
        once(`freezeEarned:${day}`, day, () => eventBus.emit('habit:freezeEarned', { freezes: after.freezes, maxFreezes: rules.freeze.maxHeld }));
      }
      if (events.streakDay && isMilestone(after.streak, rules)) {
        once(`milestone:${after.streak}:${day}`, day, () => eventBus.emit('habit:milestone', { streak: after.streak }));
      }
    },
    [once, rules]
  );

  // Solves on their way: the watcher waits for them (and looks again when they land).
  const inFlight = useRef(0);
  const [landed, setLanded] = useState(0);
  const holdAnnouncements = useCallback(() => {
    inFlight.current += 1;
    let released = false;
    return () => {
      if (released) return;
      released = true;
      inFlight.current = Math.max(0, inFlight.current - 1);
      setLanded((n) => n + 1);
    };
  }, []);

  // The watcher: what a sync brought that no solve here announced.
  useEffect(() => {
    if (inFlight.current > 0) return;
    const day = habits.day;
    if (habits.goal?.met) {
      once(`goalMet:${day}`, day, () =>
        eventBus.emit('habit:goalMet', { day, source: 'sync', label: habits.goal?.label ?? '', bonusXp: habits.goal?.bonusXp ?? 0, streak: habits.streak })
      );
    }
    if (habits.frozenNow.length > 0) {
      once(`freezeUsed:${habits.frozenNow.join(',')}`, day, () => eventBus.emit('habit:freezeUsed', { days: habits.frozenNow, streak: habits.streak }));
    }
  }, [habits, landed, once]);

  return useMemo(
    () => ({ habits, rules, goalOptions, dailyGoal, strip, announceSolve, holdAnnouncements, isDismissed, dismiss }),
    [habits, rules, goalOptions, dailyGoal, strip, announceSolve, holdAnnouncements, isDismissed, dismiss]
  );
}
