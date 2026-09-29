import React from 'react';
import type { ExperienceLevel, ExperienceOption } from '@/platform/settings';
import { ChoiceCards } from '@/ui';

const LEVELS: ExperienceLevel[] = ['new', 'some', 'experienced'];

/** How much the learner already knows: the three fixed answers, in the admin's words. */
export const ExperienceStep: React.FC<{
  options: Record<ExperienceLevel, ExperienceOption>;
  value: string | null;
  onChange: (id: ExperienceLevel) => void;
}> = ({ options, value, onChange }) => (
  <ChoiceCards
    ariaLabel="How much you already know"
    columns={1}
    value={(LEVELS as string[]).includes(value ?? '') ? (value as ExperienceLevel) : null}
    onChange={(id) => onChange(id)}
    options={LEVELS.map((id) => ({ value: id, title: options[id]?.label ?? id, description: options[id]?.description || undefined }))}
  />
);
