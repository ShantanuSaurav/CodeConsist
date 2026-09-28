import React from 'react';
import { Link } from 'react-router-dom';
import { useSession } from '@/platform/session';
import { describeGoalProgress } from '@/platform/habits';
import type { HabitStatus } from '@/platform/habits';
import { ROUTES } from '@/config/routes';
import { ProgressRing, StreakFlame } from '@/ui';
import type { StreakFlameState } from '@/ui';

/** How the flame shows today's streak. */
export function flameState(habits: HabitStatus): StreakFlameState {
  if (habits.streak <= 0) return 'none';
  if (habits.activeToday) return 'active';
  if (habits.atRisk) return 'atRisk';
  if (habits.frozenNow.length > 0) return 'frozen';
  return 'active';
}

/** "12-day streak, at risk. Daily goal 40 of 100 XP." */
export function habitSummaryLabel(habits: HabitStatus): string {
  const streak =
    habits.streak > 0
      ? `${habits.streak}-day streak${habits.activeToday ? '' : habits.atRisk ? ', at risk' : ''}.`
      : 'No streak yet.';
  const goal = habits.goal
    ? habits.goal.met
      ? `Daily goal met (${describeGoalProgress(habits.goal.metric, habits.goal.done, habits.goal.target)}).`
      : habits.goal.reached
        ? // Reached after the goal was lowered: the next lesson today counts it.
          'Daily goal reached, one more lesson today counts it.'
        : `Daily goal ${describeGoalProgress(habits.goal.metric, habits.goal.done, habits.goal.target).replace(' / ', ' of ')}.`
    : '';
  return [streak, goal].filter(Boolean).join(' ');
}

interface HabitChipProps {
  /** The mobile top bar's smaller version. */
  compact?: boolean;
  /** Called after navigating (a mobile drawer closes itself). */
  onNavigate?: () => void;
  className?: string;
}

/**
 * The streak flame and the daily-goal ring, everywhere in the dashboard
 * frame (the sidebar, the mobile top bar). Opens the dashboard's goal card.
 */
export const HabitChip: React.FC<HabitChipProps> = ({ compact = false, onNavigate, className = '' }) => {
  const { habits } = useSession();
  const goal = habits.goal;
  const ring = compact ? 22 : 26;
  return (
    <Link
      to={{ pathname: ROUTES.dashboard, hash: 'daily-goal' }}
      onClick={onNavigate}
      className={`habit-chip ${compact ? 'is-compact' : ''} ${className}`.replace(/\s+/g, ' ').trim()}
      aria-label={habitSummaryLabel(habits)}
      title={habitSummaryLabel(habits)}
    >
      <StreakFlame streak={habits.streak} state={flameState(habits)} size={compact ? 15 : 16} />
      {goal && (
        <ProgressRing
          value={goal.done}
          max={goal.target}
          size={ring}
          stroke={3}
          tone={goal.met ? 'success' : 'accent'}
          label={goal.met ? 'Daily goal met' : `Daily goal ${goal.percent}%`}
        />
      )}
    </Link>
  );
};
