/* ==========================================================================
   The Practice line a screen shows ("6 to practice: 2 mistakes, 4 due", or
   "All caught up"): what the next session would hold, worked out with the
   same builder the session uses, so the promise and the session agree.
   ========================================================================== */
import type { ReviewSettings } from '../settings/types';
import { addDays, daysBetween, formatDayLabel, isDayKey } from '../time/days';
import { buildReviewSession } from './session';
import type { BuildReviewSessionInput } from './session';

export interface ReviewSummary {
  /** Practice sessions are switched on. */
  enabled: boolean;
  /** Questions the next session would hold. */
  total: number;
  mistakes: number;
  due: number;
  weak: number;
  /** When there is nothing now: the day the next question falls due (null when none ever will). */
  nextDueDay: string | null;
}

export const EMPTY_REVIEW_SUMMARY: ReviewSummary = { enabled: false, total: 0, mistakes: 0, due: 0, weak: 0, nextDueDay: null };

/** What the next session (for the whole bank, or one stage) would hold. */
export function reviewSummary(input: Omit<BuildReviewSessionInput, 'seed'> & { settings: ReviewSettings }): ReviewSummary {
  if (!input.settings.enabled) return EMPTY_REVIEW_SUMMARY;
  const plan = buildReviewSession({ ...input, seed: 0 });
  const count = (reason: string) => plan.items.filter((i) => i.reason === reason).length;
  return {
    enabled: true,
    total: plan.items.length,
    mistakes: count('mistake'),
    due: count('due'),
    weak: count('weak'),
    nextDueDay: plan.nextDueDay
  };
}

/** "6 to practice: 2 mistakes, 4 due" - or null when there is nothing. */
export function describeReviewSummary(summary: Pick<ReviewSummary, 'total' | 'mistakes' | 'due' | 'weak'>): string | null {
  if (summary.total <= 0) return null;
  const parts: string[] = [];
  if (summary.mistakes > 0) parts.push(`${summary.mistakes} ${summary.mistakes === 1 ? 'mistake' : 'mistakes'}`);
  if (summary.due > 0) parts.push(`${summary.due} due`);
  if (summary.weak > 0) parts.push(`${summary.weak} to strengthen`);
  return `${summary.total} to practice${parts.length ? `: ${parts.join(', ')}` : ''}`;
}

/** When the next question falls due, in words: "tomorrow", "in 3 days", or the date. */
export function describeNextReview(day: string | null | undefined, today: string): string | null {
  if (!isDayKey(day) || !isDayKey(today)) return null;
  if (day <= today) return 'today';
  if (day === addDays(today, 1)) return 'tomorrow';
  const n = daysBetween(today, day);
  return n <= 13 ? `in ${n} days` : `on ${formatDayLabel(day)}`;
}
