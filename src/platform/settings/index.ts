/**
 * The settings store's shared code, for the learner app.
 *
 * Everything except the zod schema (`./schema`), which only the server
 * bundle and the lazy admin chunk import - so zod never reaches the shell.
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
export {
  ADMIN_ONLY_SECTIONS,
  ANSWER_KINDS,
  BADGE_METRICS,
  COPY_MAX_LENGTH,
  ASSESSMENT_SAMPLE,
  COPY_SAMPLE,
  DAY_RULES,
  EXPERIENCE_LEVELS,
  GOAL_METRIC_LABELS,
  NOTE_CONTEXTS,
  ONBOARDING_ICONS,
  ONBOARDING_STEP_IDS,
  QUESTION_KINDS,
  RATE_LIMIT_BUCKETS,
  REMINDER_SAMPLE,
  SOUND_EVENTS,
  SECTION_META,
  SETTING_META,
  WELCOME_BACK_TOKENS,
  isSettingsGroup,
  metaFor,
  pathsInSection,
  sectionOfPath
} from './meta';
export type { RowFieldMeta, SectionMeta, SettingKind, SettingMeta } from './meta';
export {
  DEFAULT_PUBLIC_SETTINGS,
  applySettingsPatch,
  coerceSettings,
  defaultsWithEnv,
  envValues,
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
