import React from 'react';
import type { LearningMode } from '@/types';
import type { LearningModeCopy } from '@/platform/settings';
import { LearningModeCards } from '@/ui';

/** Learn or Practice - the shared mode cards, with the one the experience answer suggests marked. */
export const ModeStep: React.FC<{
  options: Record<LearningMode, LearningModeCopy>;
  value: LearningMode | null;
  recommended: LearningMode | null;
  onChange: (mode: LearningMode) => void;
}> = ({ options, value, recommended, onChange }) => (
  <LearningModeCards options={options} value={value} recommended={recommended} recommendedLabel="Suggested for you" onChoose={onChange} />
);
