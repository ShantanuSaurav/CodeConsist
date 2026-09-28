/**
 * Practice sessions (review): the spaced-repetition schedule, the session
 * builder, what an answer pays and the summary screens show. Pure - no
 * React - so the server bundle (src/platform/server-lib.ts) runs exactly
 * this code too. The UI calls it "Practice"; the code says review, so it
 * never clashes with the Learn/Practice mode switch.
 */
export { DEFAULT_REVIEW_ITEM_TYPES, DEFAULT_REVIEW_SETTINGS } from './defaults';
export {
  applyReviewResult,
  clampBox,
  intervalsOf,
  mergeReviewStates,
  normalizeReviewMap,
  normalizeReviewState,
  outcomeOf,
  reviewStateOf
} from './schedule';
export type { ReviewProgress, ScheduleRules } from './schedule';
export { buildReviewSession, reviewCandidates, seededShuffle } from './session';
export type { BuildReviewSessionInput, ReviewBankItem, ReviewMiss, ReviewSessionPlan } from './session';
export {
  REVIEW_LOG_MAX,
  answerReview,
  creditReviewLog,
  normalizeReviewEvent,
  reviewXpFor,
  reviewXpRemaining,
  sessionBonusFor,
  sessionComplete
} from './xp';
export type { ReviewAnswerInput, ReviewAnswerResult, ReviewAnswered, ReviewCredit, ReviewSessionRecord } from './xp';
export { EMPTY_REVIEW_SUMMARY, describeNextReview, describeReviewSummary, reviewSummary } from './summary';
export type { ReviewSummary } from './summary';
