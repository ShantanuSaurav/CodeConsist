/* ==========================================================================
   The streak engine: freezes, breaks, repair and history.

   A progress row keeps the raw streak (`streak`, `bestStreak`,
   `lastActiveDay`) and `habit` (HabitState). Nothing here reads a clock:
   every function is told what day it is, in the learner's own zone.

     settle(state, today)      works out every day since the last streak day
                               that has fully passed without activity:
                               a freeze covers it while one is held (used
                               greedily, day by day); with none left the run
                               breaks, is saved to `runs`, and - when the gap
                               is short enough - a repair offer opens.
     applySolve(state, ...)    settles, then: counts towards an open repair,
                               snapshots the daily goal the first time it is
                               met (and moves towards the next freeze), and
                               counts today as a streak day under `dayRule`.
     habitStatus(state, ...)   settles a COPY and describes the result - reads
                               derive, writes persist.

   Settling is a pure function of the state and the day, processed one day
   at a time, so settling day by day gives exactly what settling at once
   does, and settling twice changes nothing. A settle that is persisted
   later gives the same result as one persisted straight away.

   Frozen and repaired days bridge a gap; they never add to the count.

   Pure and free of React, shared by the browser (guests, and the optimistic
   copy) and the server (src/platform/server-lib.ts).
   ========================================================================== */
import type { DailyGoalOption, HabitState, StreakRepair, StreakRun } from '@/types';
import { addDays, daysBetween, isDayKey, localHourIn, msUntilLocalMidnight } from '../time/days';
import type { GoalSettings, StreakSettings } from '../settings/types';
import { dayGoalStatus, effectiveGoal, goalProgress, goalSnapshot } from './goals';
import type { HabitDay, HabitEvents, HabitRules, HabitStatus, SettleEvents, StreakFields, StreakStripCell } from './types';

/** The Phase 3 streak settings' defaults (settings/defaults.ts spreads them into `streak`). */
export const DEFAULT_HABIT_SETTINGS: Pick<StreakSettings, 'dayRule' | 'freeze' | 'repair' | 'milestones' | 'runsKept' | 'mergeReplayDays'> = {
  dayRule: 'any-solve',
  freeze: { enabled: true, earnEveryGoalDays: 7, maxHeld: 2, startingCount: 0 },
  repair: { enabled: true, windowDays: 2, lessonsPerMissedDay: 3 },
  milestones: [3, 7, 14, 30, 50, 100, 365],
  runsKept: 50,
  mergeReplayDays: 7
};

const DEFAULT_KEEP_DAYS = 400;
/** No stored counter is believed past this. */
const MAX_COUNT = 100_000;

function int(value: unknown, min: number, max: number, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(min, Math.min(max, Math.floor(n))) : fallback;
}

function plainObject(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function maxDay(a: string | null | undefined, b: string | null | undefined): string | null {
  const x = isDayKey(a) ? a : null;
  const y = isDayKey(b) ? b : null;
  if (!x) return y;
  if (!y) return x;
  return x >= y ? x : y;
}

/**
 * The engine's rules from the settings (`streak`, and `retention.activityDaysKept`
 * where known). `dayRule` is the rule in effect: 'goal-met' with no goal to
 * meet (daily goals switched off, or no option enabled - known when
 * `settings.goals` is given) counts any passing solve, so switching goals
 * off can never stop every streak from counting.
 */
export function habitRulesFrom(
  settings: { streak?: Partial<StreakSettings> | null; goals?: Pick<GoalSettings, 'enabled' | 'options' | 'defaultOptionId'> | null } | null | undefined,
  retention?: { activityDaysKept?: number } | null
): HabitRules {
  const s = { ...DEFAULT_HABIT_SETTINGS, ...(settings?.streak ?? {}) };
  const freeze = { ...DEFAULT_HABIT_SETTINGS.freeze, ...plainObject(s.freeze) } as StreakSettings['freeze'];
  const repair = { ...DEFAULT_HABIT_SETTINGS.repair, ...plainObject(s.repair) } as StreakSettings['repair'];
  const noGoal = Boolean(settings?.goals) && effectiveGoal(null, settings!.goals) === null;
  return {
    dayRule: s.dayRule === 'xp-earned' ? 'xp-earned' : s.dayRule === 'goal-met' && !noGoal ? 'goal-met' : 'any-solve',
    freeze: {
      enabled: freeze.enabled !== false,
      earnEveryGoalDays: int(freeze.earnEveryGoalDays, 1, 60, 7),
      maxHeld: int(freeze.maxHeld, 0, 10, 2),
      startingCount: int(freeze.startingCount, 0, 10, 0)
    },
    repair: {
      enabled: repair.enabled !== false,
      windowDays: int(repair.windowDays, 1, 7, 2),
      lessonsPerMissedDay: int(repair.lessonsPerMissedDay, 1, 20, 3)
    },
    runsKept: int(s.runsKept, 1, 1000, 50),
    keepDays: int(retention?.activityDaysKept, 1, 5000, DEFAULT_KEEP_DAYS),
    milestones: (Array.isArray(s.milestones) ? s.milestones : [])
      .map((n) => Number(n))
      .filter((n) => Number.isInteger(n) && n > 0)
      .sort((a, b) => a - b)
  };
}

export const DEFAULT_HABIT_RULES: HabitRules = habitRulesFrom(null);

/* -------------------------------------------------------------- normalizing */

export function emptyHabit(startingCount = 0): HabitState {
  return {
    v: 1,
    freezes: Math.max(0, Math.floor(startingCount) || 0),
    freezeProgress: 0,
    settledThrough: null,
    frozenDays: [],
    repairedDays: [],
    repairedOn: [],
    repair: null,
    runStart: null,
    runs: []
  };
}

function dayList(raw: unknown, keep: number): string[] {
  const days = Array.isArray(raw) ? raw.filter((d): d is string => isDayKey(d)) : [];
  return [...new Set(days)].sort().slice(-Math.max(1, keep));
}

function normalizeRun(raw: unknown): StreakRun | null {
  const r = plainObject(raw);
  if (!isDayKey(r.start) || !isDayKey(r.end) || r.start > r.end) return null;
  const length = int(r.length, 1, MAX_COUNT, 0);
  if (length < 1) return null;
  const ended = r.ended === 'reset' || r.ended === 'admin' ? r.ended : 'missed';
  return { start: r.start, end: r.end, length, ended };
}

function normalizeRepair(raw: unknown): StreakRepair | null {
  const r = plainObject(raw);
  const lostStreak = int(r.lostStreak, 0, MAX_COUNT, 0);
  const missedDays = dayList(r.missedDays, 30);
  if (lostStreak < 1 || missedDays.length === 0 || !isDayKey(r.expiresDay)) return null;
  const required = int(r.required, 1, 1000, 1);
  return {
    lostStreak,
    lostRunStart: isDayKey(r.lostRunStart) ? r.lostRunStart : null,
    missedDays,
    expiresDay: r.expiresDay,
    required,
    done: int(r.done, 0, required, 0)
  };
}

/**
 * A habit record with every field present and sane. A row from before
 * habits existed gets one derived from its streak: the current run started
 * `streak - 1` days before the last active day, and it holds the starting
 * number of freezes. Freezes held are never taken away (a lowered maximum
 * only stops more being earned); lists are trimmed to `runsKept` and
 * `keepDays`.
 */
export function normalizeHabit(
  raw: unknown,
  progress: { streak?: unknown; lastActiveDay?: unknown } | null | undefined,
  rules: HabitRules = DEFAULT_HABIT_RULES
): HabitState {
  const src = plainObject(raw);
  const streak = int(progress?.streak, 0, MAX_COUNT, 0);
  const lastActiveDay = isDayKey(progress?.lastActiveDay) ? (progress!.lastActiveDay as string) : null;
  const known = Object.keys(src).length > 0;
  const derivedStart = streak > 0 && lastActiveDay ? addDays(lastActiveDay, -(streak - 1)) : null;
  return {
    v: 1,
    freezes: known ? int(src.freezes, 0, 100, 0) : rules.freeze.startingCount,
    freezeProgress: int(src.freezeProgress, 0, 1000, 0),
    settledThrough: isDayKey(src.settledThrough) ? src.settledThrough : null,
    frozenDays: dayList(src.frozenDays, rules.keepDays),
    repairedDays: dayList(src.repairedDays, rules.keepDays),
    repairedOn: dayList(src.repairedOn, rules.keepDays),
    repair: normalizeRepair(src.repair),
    runStart: streak > 0 ? (isDayKey(src.runStart) && (!lastActiveDay || src.runStart <= lastActiveDay) ? src.runStart : derivedStart) : null,
    runs: (Array.isArray(src.runs) ? src.runs : [])
      .map(normalizeRun)
      .filter((r): r is StreakRun => r !== null)
      .slice(-rules.runsKept)
  };
}

/** The streak part of any progress row (or local stats), normalized. */
export function streakFieldsOf(
  progress: { streak?: unknown; bestStreak?: unknown; lastActiveDay?: unknown; habit?: unknown } | null | undefined,
  rules: HabitRules = DEFAULT_HABIT_RULES
): StreakFields {
  const lastActiveDay = isDayKey(progress?.lastActiveDay) ? (progress!.lastActiveDay as string) : null;
  // A streak with no day it was last active on is not a streak.
  const streak = lastActiveDay ? int(progress?.streak, 0, MAX_COUNT, 0) : 0;
  return {
    streak,
    bestStreak: Math.max(streak, int(progress?.bestStreak, 0, MAX_COUNT, 0)),
    lastActiveDay,
    habit: normalizeHabit(progress?.habit, { streak, lastActiveDay }, rules)
  };
}

function cloneFields(fields: StreakFields): StreakFields {
  const h = fields.habit;
  return {
    ...fields,
    habit: {
      ...h,
      frozenDays: [...h.frozenDays],
      repairedDays: [...h.repairedDays],
      repairedOn: [...h.repairedOn],
      repair: h.repair ? { ...h.repair, missedDays: [...h.repair.missedDays] } : null,
      runs: [...h.runs]
    }
  };
}

function runOf(s: StreakFields, ended: StreakRun['ended']): StreakRun | null {
  if (s.streak < 1 || !s.lastActiveDay) return null;
  const start = s.habit.runStart && s.habit.runStart <= s.lastActiveDay ? s.habit.runStart : addDays(s.lastActiveDay, -(s.streak - 1));
  return { start, end: s.lastActiveDay, length: s.streak, ended };
}

function pushRun(s: StreakFields, run: StreakRun | null, rules: HabitRules): void {
  if (!run) return;
  s.habit.runs = [...s.habit.runs, run].slice(-rules.runsKept);
}

function trimDays(s: StreakFields, today: string, rules: HabitRules): void {
  const keep = (d: string) => daysBetween(d, today) < rules.keepDays;
  s.habit.frozenDays = s.habit.frozenDays.filter(keep);
  s.habit.repairedDays = s.habit.repairedDays.filter(keep);
  s.habit.repairedOn = s.habit.repairedOn.filter(keep);
}

/* ------------------------------------------------------------------- settle */

/**
 * Work out every day from the one after the later of `lastActiveDay` and
 * `settledThrough`, up to yesterday. Today is never settled: it is still
 * going on.
 */
export function settle(fields: StreakFields, today: string, rules: HabitRules = DEFAULT_HABIT_RULES): { state: StreakFields; events: SettleEvents } {
  const events: SettleEvents = { frozenDays: [], broken: null, repairExpired: false };
  if (!isDayKey(today)) return { state: fields, events };
  const s = cloneFields(fields);
  const h = s.habit;
  const yesterday = addDays(today, -1);
  const window = rules.repair.windowDays;

  const expire = (asOf: string) => {
    if (h.repair && (asOf > h.repair.expiresDay || h.repair.missedDays.length > window)) {
      h.repair = null;
      events.repairExpired = true;
    }
  };

  const from = maxDay(s.lastActiveDay, h.settledThrough);
  let day = from ? addDays(from, 1) : null;
  while (day && day <= yesterday) {
    if (s.streak > 0 && s.lastActiveDay) {
      if (rules.freeze.enabled && h.freezes > 0) {
        // Greedy: a freeze covers the day as soon as it is missed.
        h.freezes -= 1;
        h.frozenDays = [...h.frozenDays, day];
        events.frozenDays.push(day);
      } else {
        // The run breaks. It goes into the history, and - when repair is on -
        // an offer opens to win it back.
        const lost = s.streak;
        const broken = runOf(s, 'missed');
        pushRun(s, broken, rules);
        if (!rules.repair.enabled) h.repair = null;
        else if (h.repair) {
          // A new run broke while an older one is still on offer (a long
          // window): the offer grows to cover both runs and this day too, so
          // the bigger loss can still be won back. Its deadline stays.
          const missedDays = [...h.repair.missedDays, day];
          h.repair = {
            ...h.repair,
            lostStreak: h.repair.lostStreak + lost,
            missedDays,
            required: rules.repair.lessonsPerMissedDay * missedDays.length
          };
        } else {
          h.repair = {
            lostStreak: lost,
            lostRunStart: broken?.start ?? null,
            missedDays: [day],
            expiresDay: addDays(day, window),
            required: rules.repair.lessonsPerMissedDay,
            done: 0
          };
        }
        events.broken = { lostStreak: h.repair?.lostStreak ?? lost, repairOffered: Boolean(h.repair) };
        s.streak = 0;
        h.runStart = null;
      }
    } else if (h.repair) {
      // No run, an open offer: one more missed day to repair.
      h.repair.missedDays = [...h.repair.missedDays, day];
      h.repair.required = rules.repair.lessonsPerMissedDay * h.repair.missedDays.length;
    }
    h.settledThrough = day;
    expire(addDays(day, 1));
    if (s.streak === 0 && !h.repair) {
      // Nothing left that a missed day could change: skip to yesterday.
      h.settledThrough = yesterday;
      break;
    }
    day = addDays(day, 1);
  }
  expire(today);
  trimDays(s, today, rules);
  return { state: s, events };
}

/* ------------------------------------------------------------------- solving */

/** Does a day (with this solve) count as a streak day under `dayRule`? */
function countsAsStreakDay(rules: HabitRules, day: HabitDay | null | undefined, goalMet: boolean, passing: boolean): boolean {
  if (!passing) return false;
  if (rules.dayRule === 'xp-earned') return (Number(day?.xp) || 0) > 0;
  if (rules.dayRule === 'goal-met') return goalMet;
  return true;
}

export interface ApplySolveInput {
  /** The learner's day. */
  today: string;
  /** Today's day record AFTER this solve was added to it. */
  day: HabitDay | null | undefined;
  /** The goal that applies (`effectiveGoal`), or null when goals are off. */
  goal: DailyGoalOption | null;
  rules?: HabitRules;
  /** When it happened (the goal snapshot's `metAt`). */
  at: string;
  /** A passing solve. Anything else only settles. */
  passing?: boolean;
  /**
   * How many solves this stands for (a merge replays a day at once): what
   * it adds to an open repair. 1 when left out; 0 counts nothing towards a
   * repair (a replayed day with no new solves).
   */
  count?: number;
}

/**
 * One passing solve: settle, then
 *   1. repair   - an open offer counts it; complete, the lost streak is added
 *                 back (`streak = lostStreak + streak`), its run comes out of
 *                 the history and the missed days become repaired days;
 *   2. goal     - met for the first time today: the snapshot to record, the
 *                 option's bonus (paid by the caller) and a step towards the
 *                 next freeze (not while holding the maximum);
 *   3. streak   - today counts under `dayRule`: +1, or a new run at 1.
 * The goal comes before the streak day so `dayRule: goal-met` sees it.
 */
export function applySolve(fields: StreakFields, input: ApplySolveInput): { state: StreakFields; events: HabitEvents } {
  const rules = input.rules ?? DEFAULT_HABIT_RULES;
  const passing = input.passing !== false;
  const { state: settled, events: settleEvents } = settle(fields, input.today, rules);
  const s = cloneFields(settled);
  const h = s.habit;
  const events: HabitEvents = { ...settleEvents, goalMet: false, goal: null, bonusXp: 0, freezeEarned: false, repaired: false, streakDay: false };
  if (!passing || !isDayKey(input.today)) return { state: s, events };
  const today = input.today;

  // 1. Repair - only solves made after the days it covers (a merge may
  // replay an older day; its solves came before the offer).
  const solves = input.count === undefined ? 1 : Math.max(0, Math.floor(Number(input.count) || 0));
  if (h.repair && solves > 0 && today > h.repair.missedDays[h.repair.missedDays.length - 1]) {
    const repair = { ...h.repair };
    repair.done = Math.min(repair.required, repair.done + solves);
    if (repair.done >= repair.required) {
      s.streak = repair.lostStreak + s.streak;
      if (repair.lostRunStart) h.runStart = repair.lostRunStart;
      h.repairedDays = [...new Set([...h.repairedDays, ...repair.missedDays])].sort();
      // When it was won back (the admin's "repairs completed this week").
      h.repairedOn = [...new Set([...h.repairedOn, today])].sort();
      // The runs it restores are no longer finished runs: every run that
      // broke from the restored run's start on (one, or two when the offer grew).
      if (repair.lostRunStart) {
        const from = repair.lostRunStart;
        h.runs = h.runs.filter((r) => !(r.ended === 'missed' && r.start >= from));
      } else {
        const at = h.runs.map((r) => r.ended === 'missed' && r.length === repair.lostStreak).lastIndexOf(true);
        if (at !== -1) h.runs = h.runs.filter((_, i) => i !== at);
      }
      h.repair = null;
      s.bestStreak = Math.max(s.bestStreak, s.streak);
      events.repaired = true;
    } else {
      h.repair = repair;
    }
  }

  // 2. The daily goal, the first time today.
  if (input.goal && !input.day?.goal && goalProgress(input.day, input.goal).met) {
    events.goalMet = true;
    events.goal = goalSnapshot(input.goal, input.at);
    events.bonusXp = Math.max(0, Math.floor(Number(input.goal.bonusXp) || 0));
    if (rules.freeze.enabled && h.freezes < rules.freeze.maxHeld) {
      h.freezeProgress += 1;
      if (h.freezeProgress >= rules.freeze.earnEveryGoalDays) {
        h.freezes += 1;
        h.freezeProgress = 0;
        events.freezeEarned = true;
      }
    }
  }

  // 3. Today as a streak day. Never on a day before the last one counted
  // (a flight west): the day never moves backwards. Nor on a day already
  // settled (a merge replaying an older day onto a state worked out past
  // it): the missed days after it were settled without it, so counting it
  // now would carry a run over days nobody practised.
  const goalMet = Boolean(input.day?.goal) || events.goalMet;
  const later = today > (maxDay(s.lastActiveDay, h.settledThrough) ?? '');
  if (later && countsAsStreakDay(rules, input.day, goalMet, passing)) {
    if (s.streak > 0) s.streak += 1;
    else {
      s.streak = 1;
      h.runStart = today;
    }
    s.lastActiveDay = today;
    s.bestStreak = Math.max(s.bestStreak, s.streak);
    events.streakDay = true;
  }
  return { state: s, events };
}

/**
 * One day to replay (a merge): its record, and how many NEW solves the
 * server credited on it (what counts towards an open repair).
 */
export interface ReplayDay {
  day: string;
  row: HabitDay;
  solves: number;
}

/**
 * Replay days in date order, each as one `applySolve` standing for its new
 * solves (a merge: offline or guest days the account has not seen). Only a
 * day with new solves is replayed - a day record alone (counters a browser
 * reported) is never a streak day. A day is never counted twice: one on or
 * before the last streak day, or already settled, can still meet its goal
 * or feed an open repair, but it never adds a streak day, and a day after
 * `today` is skipped. Returns the state and every goal met on the way, for
 * the caller to record (and pay).
 */
export function replayDays(
  fields: StreakFields,
  days: ReplayDay[],
  options: { today: string; goal: DailyGoalOption | null; rules?: HabitRules; at: string }
): { state: StreakFields; goals: Array<{ day: string; goal: NonNullable<HabitEvents['goal']>; bonusXp: number }>; repaired: boolean; freezesEarned: number } {
  const rules = options.rules ?? DEFAULT_HABIT_RULES;
  let state = fields;
  const goals: Array<{ day: string; goal: NonNullable<HabitEvents['goal']>; bonusXp: number }> = [];
  let repaired = false;
  let freezesEarned = 0;
  const ordered = [...days]
    .filter((d) => isDayKey(d.day) && d.day <= options.today && Math.floor(Number(d.solves) || 0) > 0)
    .sort((a, b) => (a.day < b.day ? -1 : 1));
  for (const entry of ordered) {
    const { state: next, events } = applySolve(state, { today: entry.day, day: entry.row, goal: options.goal, rules, at: options.at, count: Math.max(0, Math.floor(entry.solves) || 0) });
    state = next;
    if (events.goalMet && events.goal) goals.push({ day: entry.day, goal: events.goal, bonusXp: events.bonusXp });
    if (events.repaired) repaired = true;
    if (events.freezeEarned) freezesEarned += 1;
  }
  return { state, goals, repaired, freezesEarned };
}

/* ------------------------------------------------------------------ reading */

export interface HabitStatusInput {
  today: string;
  now?: Date;
  /** The learner's zone, for the hour of the day and the hours left. */
  zone?: string | null;
  day: HabitDay | null | undefined;
  goal: DailyGoalOption | null;
  /** Every goal option (to label a snapshot met under an earlier choice). */
  goalOptions?: DailyGoalOption[];
  rules?: HabitRules;
  /** `reminders.atRisk`: whether it is shown at all, and not before this local hour. */
  atRisk?: { enabled: boolean; fromLocalHour: number };
}

/** The learner's streak and goal as they stand today. Settles a copy: never changes anything. */
export function habitStatus(fields: StreakFields, input: HabitStatusInput): HabitStatus {
  const rules = input.rules ?? DEFAULT_HABIT_RULES;
  const now = input.now ?? new Date();
  const { state } = settle(fields, input.today, rules);
  const h = state.habit;
  const activeToday = state.lastActiveDay === input.today;
  const hoursLeft = Math.max(0, Math.ceil(msUntilLocalMidnight(now, input.zone) / 3_600_000));
  const risk = input.atRisk ?? { enabled: true, fromLocalHour: 18 };
  const atRisk = risk.enabled && state.streak > 0 && !activeToday && localHourIn(input.zone, now) >= risk.fromLocalHour;
  const canEarn = rules.freeze.enabled && h.freezes < rules.freeze.maxHeld;
  return {
    day: input.today,
    dayRule: rules.dayRule,
    streak: state.streak,
    bestStreak: state.bestStreak,
    lastActiveDay: state.lastActiveDay,
    activeToday,
    atRisk,
    hoursLeft,
    freezes: h.freezes,
    maxFreezes: rules.freeze.maxHeld,
    freezesEnabled: rules.freeze.enabled,
    freezeProgress: h.freezeProgress,
    freezeEvery: rules.freeze.earnEveryGoalDays,
    nextFreezeIn: canEarn ? Math.max(1, rules.freeze.earnEveryGoalDays - h.freezeProgress) : null,
    frozenNow: state.streak > 0 && state.lastActiveDay ? h.frozenDays.filter((d) => d > state.lastActiveDay! && d < input.today) : [],
    repair: h.repair ? { ...h.repair, remaining: Math.max(0, h.repair.required - h.repair.done), deadline: h.repair.expiresDay } : null,
    goal: dayGoalStatus(input.day, input.goal, input.goalOptions ?? []),
    daysAway: state.lastActiveDay ? Math.max(0, daysBetween(state.lastActiveDay, input.today)) : null,
    runStart: state.streak > 0 ? h.runStart : null,
    runs: h.runs,
    nextMilestone: rules.milestones.find((m) => m > state.streak) ?? null
  };
}

/** Does `n` sit exactly on a milestone? */
export function isMilestone(n: number, rules: HabitRules = DEFAULT_HABIT_RULES): boolean {
  return n > 0 && rules.milestones.includes(n);
}

/**
 * A progress reset: the current run (settled as of `today`) is closed into
 * the history as `ended: 'reset'`, the history is kept, and everything else
 * starts over - freezes back to the starting number.
 */
export function resetHabit(fields: StreakFields, today: string, rules: HabitRules = DEFAULT_HABIT_RULES): StreakFields {
  const { state } = settle(fields, today, rules);
  const next = cloneFields(state);
  pushRun(next, runOf(next, 'reset'), rules);
  return {
    streak: 0,
    bestStreak: 0,
    lastActiveDay: null,
    habit: { ...emptyHabit(rules.freeze.startingCount), runs: next.habit.runs }
  };
}

/**
 * The last `count` days up to today, each marked as a streak day, frozen,
 * repaired, missed, today (not counted yet) or none (before any activity).
 * A day inside a run (the current one, or one in the history) counted as a
 * streak day when it happened - even with no day record to show for it (a
 * day before the activity log began, a streak set by support); any other
 * day is read from the day records under the current `dayRule`.
 */
export function streakStrip(
  fields: StreakFields,
  days: Record<string, HabitDay> | null | undefined,
  today: string,
  count: number,
  rules: HabitRules = DEFAULT_HABIT_RULES
): StreakStripCell[] {
  // As of today: a freeze used on a day nobody has looked at since still shows.
  const settled = settle(fields, today, rules).state;
  const map = days ?? {};
  const has = (d: string) => Object.prototype.hasOwnProperty.call(map, d);
  const frozen = new Set(settled.habit.frozenDays);
  const repaired = new Set(settled.habit.repairedDays);
  const current =
    settled.streak > 0 && settled.lastActiveDay
      ? { start: settled.habit.runStart ?? addDays(settled.lastActiveDay, -(settled.streak - 1)), end: settled.lastActiveDay }
      : null;
  const inRun = (d: string): boolean =>
    (current !== null && d >= current.start && d <= current.end) || settled.habit.runs.some((r) => d >= r.start && d <= r.end);
  const active = (d: string): boolean => {
    if (!has(d)) return false;
    const row = map[d];
    const solves = (Number(row.lessons) || 0) + (Number(row.tests) || 0) + (Number(row.reSolves) || 0) + (Number(row.reviews) || 0);
    if (rules.dayRule === 'xp-earned') return (Number(row.xp) || 0) > 0;
    if (rules.dayRule === 'goal-met') return Boolean(row.goal);
    return solves > 0;
  };
  const known = Object.keys(map).filter((d) => isDayKey(d) && active(d)).sort();
  const firstEver = [known[0], settled.habit.runs[0]?.start, settled.habit.runStart].filter(isDayKey).sort()[0] ?? null;
  const cells: StreakStripCell[] = [];
  const n = Math.max(1, Math.floor(count));
  for (let i = n - 1; i >= 0; i--) {
    const d = addDays(today, -i);
    let state: StreakStripCell['state'];
    if (d === today) state = settled.lastActiveDay === today || active(d) ? 'active' : 'today';
    else if (frozen.has(d)) state = 'frozen';
    else if (repaired.has(d)) state = 'repaired';
    else if (active(d) || d === settled.lastActiveDay || inRun(d)) state = 'active';
    else state = firstEver && d > firstEver ? 'missed' : 'none';
    cells.push({ day: d, state });
  }
  return cells;
}
