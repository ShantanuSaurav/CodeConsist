/* ==========================================================================
   The engine over a whole progress row and the effective settings: the one
   way the browser (guests, and the optimistic copy) and the server work out
   a learner's streak status, and what a passing solve does to it. Keeping
   both sides on these two functions is what makes them agree.
   ========================================================================== */
import type { DailyGoalOption } from '@/types';
import type { GoalSettings, ReminderSettings, StreakSettings } from '../settings/types';
import { effectiveGoal } from './goals';
import { applySolve, habitRulesFrom, habitStatus, streakFieldsOf } from './streak';
import type { HabitDay, HabitEvents, HabitRules, HabitStatus, StreakFields } from './types';

/** The settings the habits engine reads: public, so the browser has them too. */
export interface HabitSettingsView {
  streak: StreakSettings;
  goals: GoalSettings;
  reminders: ReminderSettings;
}

/** A progress row, as far as streaks go. */
export type StreakRow = { streak?: unknown; bestStreak?: unknown; lastActiveDay?: unknown; habit?: unknown };

export interface LearnerContext {
  settings: HabitSettingsView;
  /** `retention.activityDaysKept` (server only - the browser keeps the default). */
  keepDays?: number;
  /** The learner's chosen goal (`preferences.dailyGoalId`). */
  dailyGoalId: string | null | undefined;
  /** The learner's day. */
  today: string;
  /** Today's day record (after the solve, for `learnerSolve`). */
  day: HabitDay | null | undefined;
}

export function learnerRules(ctx: Pick<LearnerContext, 'settings' | 'keepDays'>): HabitRules {
  return habitRulesFrom(ctx.settings, ctx.keepDays ? { activityDaysKept: ctx.keepDays } : null);
}

/** The goal that applies to this learner now (null when daily goals are off). */
export function learnerGoal(ctx: Pick<LearnerContext, 'settings' | 'dailyGoalId'>): DailyGoalOption | null {
  return effectiveGoal(ctx.dailyGoalId, ctx.settings.goals);
}

/** The learner's streak and goal today, derived (a settled copy - nothing is written). */
export function learnerHabitStatus(row: StreakRow | null | undefined, ctx: LearnerContext & { now?: Date; zone?: string | null }): HabitStatus {
  const rules = learnerRules(ctx);
  return habitStatus(streakFieldsOf(row, rules), {
    today: ctx.today,
    now: ctx.now,
    zone: ctx.zone,
    day: ctx.day,
    goal: learnerGoal(ctx),
    goalOptions: ctx.settings.goals.options,
    rules,
    atRisk: { enabled: ctx.settings.reminders.atRisk.enabled, fromLocalHour: ctx.settings.reminders.atRisk.fromLocalHour }
  });
}

/**
 * One passing solve on today's row (the row AFTER the solve was added):
 * the streak fields to store and what happened. The goal bonus is not paid
 * here - the caller pays `events.bonusXp` when `events.goalMet` (the server
 * always; the browser only for a guest).
 */
export function learnerSolve(row: StreakRow | null | undefined, ctx: LearnerContext & { at: string }): { fields: StreakFields; events: HabitEvents } {
  const rules = learnerRules(ctx);
  const { state, events } = applySolve(streakFieldsOf(row, rules), {
    today: ctx.today,
    day: ctx.day,
    goal: learnerGoal(ctx),
    rules,
    at: ctx.at
  });
  return { fields: state, events };
}
