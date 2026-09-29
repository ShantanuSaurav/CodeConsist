import React from 'react';
import type { MotivationOption } from '@/platform/settings';
import { ChoiceCards } from '@/ui';
import { OptionIcon } from './icons';

/** "Why are you learning?" - the admin's answers, each with its icon. Plain props: the page owns the answer. */
export const MotivationStep: React.FC<{ options: MotivationOption[]; value: string | null; onChange: (id: string) => void }> = ({ options, value, onChange }) => (
  <ChoiceCards
    ariaLabel="Why you are learning"
    value={value}
    onChange={(id) => onChange(id)}
    options={options.map((o) => ({
      value: o.id,
      title: (
        <span className="inline-flex items-center gap-2">
          <OptionIcon name={o.icon} />
          {o.label}
        </span>
      ),
      description: o.description || undefined
    }))}
  />
);
