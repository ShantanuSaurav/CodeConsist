/**
 * The settings store's shared code, for the learner app.
 *
 * Everything except the zod schema (`./schema`) and the admin metadata
 * (`./meta`: every setting's label, help text and bounds, and `./env`),
 * which only the server bundle and the lazy admin chunk import - so zod and
 * the admin's help text never reach the shell.
 */
export type {
  AccessSettings,
  AnswerChallengeType,
  BadgeFamily,
  BadgeMetric,
  BadgeSettings,
  CelebrationSettings,
  CopySettings,
  CorsMode,
  DayRule,
  ExperienceAction,
  ExperienceLevel,
  ExperienceOption,
  FeedbackNoteContext,
  FeedbackSettings,
  GateMode,
  GoalSettings,
  LearningModeCopy,
  LevelSettings,
  MotivationOption,
  OnboardingSettings,
  OnboardingStep,
  OnboardingStepId,
  PlacementSettings,
  ProgressionGateMode,
  PublicSettings,
  RateLimitBucketKey,
  RateLimitMode,
  RateRule,
  ReminderSettings,
  RetentionSettings,
  ReviewSettings,
  Settings,
  SettingsIssue,
  SettingsOverrides,
  SettingsSectionId,
  SfxEvent,
  StreakSettings,
  TestOutSettings,
  UnitSettings,
  WelcomeBackTier,
  XpSettings
} from './types';
export { DEFAULT_SETTINGS } from './defaults';
export { ADMIN_ONLY_SECTIONS, isSettingsGroup } from './leaves';
export type { RowFieldMeta, SectionMeta, SettingKind, SettingMeta } from './meta';
export {
  DEFAULT_PUBLIC_SETTINGS,
  applySettingsPatch,
  coerceSettings,
  getPath,
  isPlainObject,
  mergeSettings,
  normalizeOrigin,
  overrideLeaves,
  patchFromEdits,
  publicSettings,
  setPath,
  settingsFingerprint
} from './merge';
export type { PatchResult } from './merge';
export { fillCopy, tokensIn } from './copy';
export {
  ANSWER_CHALLENGE_TYPES,
  DEFAULT_FEEDBACK_SETTINGS,
  effectiveAttemptBudget,
  noteContextFor,
  revealCap,
  wrongAnswerNotesAllowed
} from './budget';
export type { BudgetSettings } from './budget';
export { getCopy, getSettingsRevision, getSettingsSnapshot, setSettingsSnapshot, subscribe } from './store';
export { useCopy } from './useCopy';
export type { CopyVars } from './useCopy';
