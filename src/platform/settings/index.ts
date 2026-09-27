/**
 * The settings store's shared code, for the learner app.
 *
 * Everything except the zod schema (`./schema`), which only the server
 * bundle and the lazy admin chunk import - so zod never reaches the shell.
 */
export type {
  AccessSettings,
  BadgeFamily,
  BadgeMetric,
  BadgeSettings,
  CelebrationSettings,
  CopySettings,
  CorsMode,
  DayRule,
  GateMode,
  GoalSettings,
  LevelSettings,
  PublicSettings,
  RateLimitBucketKey,
  RateLimitMode,
  RateRule,
  ReminderSettings,
  RetentionSettings,
  Settings,
  SettingsIssue,
  SettingsOverrides,
  SettingsSectionId,
  SfxEvent,
  StreakSettings,
  UnitSettings,
  WelcomeBackTier,
  XpSettings
} from './types';
export { DEFAULT_SETTINGS } from './defaults';
export {
  ADMIN_ONLY_SECTIONS,
  BADGE_METRICS,
  COPY_MAX_LENGTH,
  COPY_SAMPLE,
  DAY_RULES,
  GOAL_METRIC_LABELS,
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
export { getCopy, getSettingsRevision, getSettingsSnapshot, setSettingsSnapshot, subscribe } from './store';
export { useCopy } from './useCopy';
export type { CopyVars } from './useCopy';
