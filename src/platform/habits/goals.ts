/* ==========================================================================
   The daily goal: which option applies, what it counts and how far along
   today is.

   A goal counts from the day record (src/platform/activity/log.ts), which
   holds only what was actually credited:
     xp      - XP paid that day (a 0-XP re-solve adds nothing; the goal's own
               bonus is kept out of it, so meeting the goal cannot feed itself)
     lessons - first-time lesson solves, plus review answers once reviews exist
     units   - units first completed that day
   A day met under one goal stays met when the learner picks another: the
   day keeps a snapshot of the goal it met (`DayRecord.goal`).

   Pure and free of React, shared by the browser and the server bundle.
   ========================================================================== */
import type { DailyGoalMetric, DailyGoalOption, DayGoal } from '@/types';
import type { GoalSettings } from '../settings/types';
import type { GoalStatus, HabitDay } from './types';

export const GOAL_METRICS: readonly DailyGoalMetric[] = ['xp', 'lessons', 'units'];

/** How big a target may be, per metric (checked by the settings schema). */
export const GOAL_TARGET_BOUNDS: Record<DailyGoalMetric, { min: number; max: number }> = {
  xp: { min: 10, max: 2000 },
  lessons: { min: 1, max: 50 },
  units: { min: 1, max: 20 }
};

/** A goal option id: it is stored on accounts and days. */
export const GOAL_ID_RE = /^[a-z0-9-]{1,32}$/;

/**
 * The defaults: XP goals, with "Regular" (100 XP, today's "Earn 100 XP" on
 * the dashboard) for anyone who has not chosen.
 */
export const DEFAULT_GOAL_SETTINGS: GoalSettings = {
  enabled: true,
  options: [
    { id: 'casual', label: 'Casual', blurb: 'A few minutes a day', metric: 'xp', target: 50, bonusXp: 5, enabled: true },
    { id: 'regular', label: 'Regular', blurb: 'About one short unit a day', metric: 'xp', target: 100, bonusXp: 10, enabled: true },
    { id: 'serious', label: 'Serious', blurb: 'A solid session every day', metric: 'xp', target: 250, bonusXp: 25, enabled: true },
    { id: 'intense', label: 'Intense', blurb: 'For a big push', metric: 'xp', target: 500, bonusXp: 50, enabled: true }
  ],
  defaultOptionId: 'regular',
  oneMorePrompt: true
};

type GoalsLike = Pick<GoalSettings, 'enabled' | 'options' | 'defaultOptionId'>;

function num(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}

/** The options a learner can pick right now. */
export function enabledGoalOptions(goals: GoalsLike | null | undefined): DailyGoalOption[] {
  return Array.isArray(goals?.options) ? goals!.options.filter((o) => o && o.enabled) : [];
}

/** Can a learner choose this option now? (An enabled option that exists.) */
export function isGoalOptionAvailable(id: unknown, goals: GoalsLike | null | undefined): boolean {
  return typeof id === 'string' && enabledGoalOptions(goals).some((o) => o.id === id);
}

/**
 * The goal that applies: the learner's choice when it is still offered,
 * else the default option (else the first enabled one). The learner's stored
 * choice is never changed here - re-enabling the option restores it. Null
 * when daily goals are off, or no option is enabled.
 */
export function effectiveGoal(dailyGoalId: string | null | undefined, goals: GoalsLike | null | undefined): DailyGoalOption | null {
  if (!goals || goals.enabled === false) return null;
  const options = enabledGoalOptions(goals);
  return (
    options.find((o) => o.id === dailyGoalId) ??
    options.find((o) => o.id === goals.defaultOptionId) ??
    options[0] ??
    null
  );
}

/** How much of `metric` a day holds. */
export function goalValue(day: HabitDay | null | undefined, metric: DailyGoalMetric): number {
  if (!day) return 0;
  if (metric === 'xp') return num(day.xp);
  if (metric === 'units') return num(day.units);
  return num(day.lessons) + num(day.reviews);
}

/** A day's progress against one goal. */
export function goalProgress(
  day: HabitDay | null | undefined,
  goal: Pick<DailyGoalOption, 'metric' | 'target'>
): { done: number; target: number; met: boolean; percent: number } {
  const target = Math.max(1, num(goal.target));
  const done = goalValue(day, goal.metric);
  return { done, target, met: done >= target, percent: Math.min(100, Math.round((done / target) * 100)) };
}

/** What the day records when the goal is met. */
export function goalSnapshot(goal: Pick<DailyGoalOption, 'id' | 'metric' | 'target'>, at: string): DayGoal {
  return { optionId: goal.id, metric: goal.metric, target: num(goal.target) || 1, metAt: at };
}

/** "100 XP", "3 lessons", "1 unit". */
export function describeGoalTarget(metric: DailyGoalMetric, target: number): string {
  if (metric === 'xp') return `${target} XP`;
  const noun = metric === 'units' ? 'unit' : 'lesson';
  return `${target} ${noun}${target === 1 ? '' : 's'}`;
}

/** "40 / 100 XP", "2 / 3 lessons". */
export function describeGoalProgress(metric: DailyGoalMetric, done: number, target: number): string {
  if (metric === 'xp') return `${done} / ${target} XP`;
  return `${done} / ${describeGoalTarget(metric, target)}`;
}

/**
 * Today's goal as a screen shows it. A day already met keeps its snapshot
 * (the goal it met, even if the learner has picked another since); otherwise
 * it is progress against `goal`. Null when there is no goal (goals off).
 *
 * `met` means met and counted: the day holds the snapshot a solve put there
 * (and the bonus it paid). Progress that already reaches the goal without
 * one - the learner lowered their goal after the day's last lesson - is
 * `reached`, not met: the next solve today counts it and pays the bonus.
 */
export function dayGoalStatus(
  day: HabitDay | null | undefined,
  goal: DailyGoalOption | null,
  options: DailyGoalOption[] = []
): GoalStatus | null {
  if (!goal) return null;
  const met = day?.goal ?? null;
  if (met) {
    const option = options.find((o) => o.id === met.optionId);
    const done = goalValue(day, met.metric);
    return {
      optionId: met.optionId,
      label: option?.label ?? goal.label,
      metric: met.metric,
      target: met.target,
      done: Math.max(done, met.target),
      met: true,
      reached: true,
      metAt: met.metAt,
      bonusXp: num(day?.goalBonusXp),
      percent: 100,
      fromSnapshot: met.optionId !== goal.id
    };
  }
  const progress = goalProgress(day, goal);
  return {
    optionId: goal.id,
    label: goal.label,
    metric: goal.metric,
    target: progress.target,
    done: progress.done,
    met: false,
    reached: progress.met,
    metAt: null,
    bonusXp: goal.bonusXp,
    percent: progress.percent,
    fromSnapshot: false
  };
}
