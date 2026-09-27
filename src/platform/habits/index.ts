/**
 * Daily goal and streak rules: freezes, repair, history and the goal a
 * learner picked. Pure - no React - so the server bundle
 * (src/platform/server-lib.ts) runs exactly this code too. The React side
 * is src/platform/session/useHabitState.ts.
 */
export type {
  DayRule,
  GoalStatus,
  HabitDay,
  HabitEvents,
  HabitRules,
  HabitStatus,
  RepairStatus,
  SettleEvents,
  StreakFields,
  StreakStripCell
} from './types';
export {
  DEFAULT_GOAL_SETTINGS,
  GOAL_ID_RE,
  GOAL_METRICS,
  GOAL_TARGET_BOUNDS,
  dayGoalStatus,
  describeGoalProgress,
  describeGoalTarget,
  effectiveGoal,
  enabledGoalOptions,
  goalProgress,
  goalSnapshot,
  goalValue,
  isGoalOptionAvailable
} from './goals';
export {
  DEFAULT_HABIT_RULES,
  DEFAULT_HABIT_SETTINGS,
  applySolve,
  emptyHabit,
  habitRulesFrom,
  habitStatus,
  isMilestone,
  normalizeHabit,
  replayDays,
  resetHabit,
  settle,
  streakFieldsOf,
  streakStrip
} from './streak';
export type { ApplySolveInput, HabitStatusInput, ReplayDay } from './streak';
export { learnerGoal, learnerHabitStatus, learnerRules, learnerSolve } from './learner';
export type { HabitSettingsView, LearnerContext, StreakRow } from './learner';
export { pickHabitBanner, welcomeBackTier, withoutName } from './reminders';
export type { BannerOptions, HabitBanner, HabitBannerKind } from './reminders';
