import React from 'react';
import type { DailyGoalOption } from '@/types';
import { describeGoalTarget } from '@/platform/habits';
import { ChoiceCards } from '@/ui';

/** A daily goal: the options the dashboard's goal picker offers (`goals.options`). */
export const GoalStep: React.FC<{ options: DailyGoalOption[]; value: string | null; onChange: (id: string) => void }> = ({ options, value, onChange }) => (
  <ChoiceCards
    ariaLabel="Daily goal"
    value={value}
    onChange={(id) => onChange(id)}
    options={options.map((o) => ({
      value: o.id,
      title: o.label,
      description: o.blurb || undefined,
      meta: `${describeGoalTarget(o.metric, o.target)}${o.bonusXp > 0 ? ` · +${o.bonusXp} XP` : ''}`
    }))}
  />
);
