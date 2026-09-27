import React, { useCallback, useRef } from 'react';
import { useSession } from '@/platform/session';
import { useAppEvent } from '@/platform/events';
import type { AppEvents } from '@/platform/events';
import { describeGoalTarget } from '@/platform/habits';
import { fillCopy } from '@/platform/settings';
import { useToast } from '@/ui';

/**
 * Mount once: toasts the streak and goal news that no screen shows itself -
 * a freeze earned, a streak repaired, a milestone reached, and a daily goal
 * met somewhere else (offline, or on another device) and learned from a
 * sync. A goal met in a lesson on screen is that lesson's to show (its
 * "one more?" card), so it is not toasted here. Renders nothing.
 *
 * Each event arrives once (the session remembers what it announced); the
 * words are the admin's (`settings.reminders`, `celebrations.copy`). A
 * milestone reached inside a lesson run waits for the run
 * (`celebrateOrHold`): its end screen announces the streak itself, so the
 * toast shows only if the run closes before that screen.
 */
export const HabitToaster: React.FC = () => {
  const { settings, habits, celebrateOrHold } = useSession();
  const { notify } = useToast();
  // Read in the listeners, which stay subscribed across renders.
  const live = useRef({ settings, habits });
  live.current = { settings, habits };

  const onFreezeEarned = useCallback(
    ({ freezes, maxFreezes }: AppEvents['habit:freezeEarned']) =>
      notify(fillCopy(live.current.settings.reminders.freezeEarned, { freezes, maxFreezes }), 'success'),
    [notify]
  );
  const onRepaired = useCallback(
    ({ streak }: AppEvents['habit:streakRepaired']) => notify(fillCopy(live.current.settings.reminders.streakRepaired, { streak }), 'success'),
    [notify]
  );
  const onMilestone = useCallback(
    ({ streak }: AppEvents['habit:milestone']) =>
      celebrateOrHold(() => notify(fillCopy(live.current.settings.celebrations.copy.streakUp, { n: streak }), 'success')),
    [notify, celebrateOrHold]
  );
  const onGoalMet = useCallback(
    ({ source, label, bonusXp }: AppEvents['habit:goalMet']) => {
      if (source !== 'sync') return;
      const goal = live.current.habits.goal;
      const described = goal ? describeGoalTarget(goal.metric, goal.target) : label;
      notify(fillCopy(live.current.settings.reminders.goalMet.toast, { goal: described, bonusXp }), 'success');
    },
    [notify]
  );

  useAppEvent('habit:freezeEarned', onFreezeEarned);
  useAppEvent('habit:streakRepaired', onRepaired);
  useAppEvent('habit:milestone', onMilestone);
  useAppEvent('habit:goalMet', onGoalMet);
  return null;
};
