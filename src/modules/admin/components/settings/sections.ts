/**
 * The sections of the Rules & rewards page, in display order, straight from
 * SECTION_META (src/platform/settings/meta.ts). A section with no custom
 * `Component` is rendered by GenericSection from its settings' metadata; a
 * later phase adds a section by adding metadata (and, only if it needs more
 * than fields, a Component here).
 */
import type React from 'react';
import { SECTION_META } from '@/platform/settings';
import type { SectionMeta } from '@/platform/settings';
import type { SectionProps } from './GenericSection';
import { LevelsSection } from './LevelsSection';
import { CopySection } from './CopySection';
import { AccessSection } from './AccessSection';
import { UnitsSection } from './UnitsSection';
import { GoalsSection } from './GoalsSection';
import { StreakSection } from './StreakSection';
import { RemindersSection } from './RemindersSection';
import { FeedbackSection } from './FeedbackSection';
import { ReviewSection } from './ReviewSection';

export interface SectionEntry extends Pick<SectionMeta, 'id' | 'title' | 'description' | 'audience'> {
  Component?: React.FC<SectionProps>;
}

const CUSTOM: Partial<Record<string, React.FC<SectionProps>>> = {
  levels: LevelsSection,
  // Streak, freezes & repair, with a worked example that follows the values being edited.
  streak: StreakSection,
  // Daily goal, with how many learners chose each option.
  goals: GoalsSection,
  // In-app reminders, every message previewed together (the welcome-back tiers too).
  reminders: RemindersSection,
  // Units, with how many there are and the most the perfect bonus can pay.
  units: UnitsSection,
  // Answer feedback & retries, with what the numbers mean for one question.
  feedback: FeedbackSection,
  // Practice sessions, with what the schedule and the XP mean at these values.
  review: ReviewSection,
  // Site copy, grouped by where it appears, with previews in the real counts.
  copy: CopySection,
  // Limits & access, with the live status card (proxy diagnostic, limiter, CORS).
  access: AccessSection
};

export const SECTIONS: SectionEntry[] = SECTION_META.map(({ id, title, description, audience }) => ({
  id,
  title,
  description,
  audience,
  Component: CUSTOM[id]
}));

export function sectionById(id: string | undefined): SectionEntry | undefined {
  return SECTIONS.find((section) => section.id === id);
}
