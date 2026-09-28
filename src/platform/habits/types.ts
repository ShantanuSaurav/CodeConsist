/* ==========================================================================
   The shapes the habits engine works with: the rules it takes (from the
   `streak` settings), the streak part of a progress row, what a settle or a
   solve reports, and the read-only status screens show.

   The stored shapes themselves (HabitState, StreakRun, StreakRepair,
   DailyGoalOption, DayGoal) live in src/types: the progress row and the day
   record carry them.
   ========================================================================== */
import type { DailyGoalMetric, DayGoal, DayRecord, HabitState, StreakRepair, StreakRun } from '@/types';
import type { DayRule, StreakSettings } from '../settings/types';

export type { DayRule };

/** The streak rules the engine applies, from `settings.streak` (and the retention window). */
export interface HabitRules {
  dayRule: DayRule;
  freeze: StreakSettings['freeze'];
  repair: StreakSettings['repair'];
  /** Past runs kept. */
  runsKept: number;
  /** Frozen and repaired days further back than this from today are forgotten. */
  keepDays: number;
  /** Streak lengths worth celebrating, ascending. */
  milestones: number[];
}

/** The streak part of a progress row: the three numbers every row has, and `habit`. */
export interface StreakFields {
  /** The raw stored streak: the length of the current run as of `lastActiveDay`. */
  streak: number;
  bestStreak: number;
  /** The last day that counted as a streak day. */
  lastActiveDay: string | null;
  habit: HabitState;
}

/** What the engine reads from a day record. `reviews` arrives with the review feature (a later phase). */
export type HabitDay = Partial<Pick<DayRecord, 'xp' | 'lessons' | 'tests' | 'reSolves' | 'units' | 'goal' | 'goalBonusXp'>> & {
  reviews?: number;
};

/** What working out the missed days changed. */
export interface SettleEvents {
  /** Days a freeze covered in this settle. */
  frozenDays: string[];
  /** The run that broke in this settle, or null. */
  broken: { lostStreak: number; repairOffered: boolean } | null;
  /** An open repair offer ran out. */
  repairExpired: boolean;
}

/** What one passing solve changed (on top of the settle before it). */
export interface HabitEvents extends SettleEvents {
  /** The daily goal was met for the first time today. */
  goalMet: boolean;
  /** The snapshot to put on the day when `goalMet`. */
  goal: DayGoal | null;
  /** The goal option's bonus when `goalMet` (the caller decides whether this solve pays it). */
  bonusXp: number;
  /** A streak freeze was earned. */
  freezeEarned: boolean;
  /** An open repair was completed: the lost streak is back. */
  repaired: boolean;
  /** Today became a streak day with this solve. */
  streakDay: boolean;
}

/** The daily goal as it stands today. */
export interface GoalStatus {
  optionId: string;
  label: string;
  metric: DailyGoalMetric;
  target: number;
  done: number;
  /** Met and counted today: the day holds the goal's snapshot, and its bonus was paid. */
  met: boolean;
  /**
   * Today's progress reaches the goal. True whenever `met`; true without it
   * when the goal was lowered after the day's last lesson - the next solve
   * today meets it (and pays the bonus).
   */
  reached: boolean;
  metAt: string | null;
  bonusXp: number;
  /** 0-100. */
  percent: number;
  /** Met today under a goal chosen earlier (the day's snapshot, not the current choice). */
  fromSnapshot: boolean;
}

/** An open repair, with what is left to do. */
export interface RepairStatus extends StreakRepair {
  remaining: number;
  /** The last day it can be completed on (= `expiresDay`). */
  deadline: string;
}

/**
 * Everything a screen shows about the learner's streak and goal today.
 * Derived, never stored: `habitStatus` settles a copy, so reading it never
 * changes anything.
 */
export interface HabitStatus {
  day: string;
  /**
   * What makes a day count, as in effect: `streak.dayRule`, except that
   * 'goal-met' with daily goals off counts any passing solve.
   */
  dayRule: DayRule;
  /** The streak as it stands today: 0 once a missed day was not covered. */
  streak: number;
  bestStreak: number;
  lastActiveDay: string | null;
  /** Today already counts as a streak day. */
  activeToday: boolean;
  /** A live streak, today not yet counted, and it is late enough in the day to say so. */
  atRisk: boolean;
  /** Whole hours left until the learner's midnight (rounded up). */
  hoursLeft: number;
  freezes: number;
  maxFreezes: number;
  freezesEnabled: boolean;
  freezeProgress: number;
  freezeEvery: number;
  /** Goal days until the next freeze, or null when none can be earned now (at the maximum, or freezes off). */
  nextFreezeIn: number | null;
  /** Days a freeze covered since the last active day - the gap the streak survived. */
  frozenNow: string[];
  repair: RepairStatus | null;
  /** Null when daily goals are switched off. */
  goal: GoalStatus | null;
  /** Days since the last streak day (0 when active today), or null with no streak day ever. */
  daysAway: number | null;
  runStart: string | null;
  runs: StreakRun[];
  /** The next milestone above the current streak, or null past the last one. */
  nextMilestone: number | null;
}

/** One cell of a streak strip. */
export interface StreakStripCell {
  day: string;
  state: 'active' | 'frozen' | 'repaired' | 'missed' | 'today' | 'none';
}
