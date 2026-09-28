/* ==========================================================================
   The Practice-session (review) defaults: the `review` settings section as
   it ships. Kept beside the rules that read them (./schedule, ./session,
   ./xp); src/platform/settings/defaults.ts copies them into DEFAULT_SETTINGS.
   ========================================================================== */
import type { ReviewSettings } from '../settings/types';

/** The answer-graded kinds: the ones a Practice session uses unless the admin adds code kinds. */
export const DEFAULT_REVIEW_ITEM_TYPES = ['quiz', 'output_prediction', 'multi_select', 'fill_blank', 'pseudocode_order'];

export const DEFAULT_REVIEW_SETTINGS: ReviewSettings = {
  enabled: true,
  intervalsDays: [1, 3, 7, 21],
  wrongResetsToBox: 0,
  initialBox: { clean: 1, assisted: 0 },
  sessionSize: { min: 5, max: 8 },
  mix: { mistakes: 3, due: 4 },
  weak: { scoreBelow: 80, hintsAtLeast: 2 },
  mistakeWindowDays: 30,
  itemTypes: [...DEFAULT_REVIEW_ITEM_TYPES],
  attemptsBeforeReveal: 1,
  requeueMissed: true,
  xp: { correctFirstTry: 5, correctAfterMiss: 2, sessionBonus: 5, dailyCap: 60 },
  sessionTtlHours: 12,
  guestMergeWindowDays: 2
};
