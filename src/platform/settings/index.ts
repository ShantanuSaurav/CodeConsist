/**
 * The settings store's shared code, for the learner app.
 *
 * Everything except the zod schema (`./schema`), which only the server
 * bundle and the lazy admin chunk import - so zod never reaches the shell.
 */
export type {
  LevelSettings,
  PublicSettings,
  RetentionSettings,
  Settings,
  SettingsIssue,
  SettingsOverrides,
  SettingsSectionId,
  StreakSettings,
  XpSettings
} from './types';
export { DEFAULT_SETTINGS } from './defaults';
export { ADMIN_ONLY_SECTIONS, SECTION_META, SETTING_META, isSettingsGroup, metaFor, pathsInSection, sectionOfPath } from './meta';
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
  overrideLeaves,
  patchFromEdits,
  publicSettings,
  setPath
} from './merge';
export type { PatchResult } from './merge';
export { fillCopy, tokensIn } from './copy';
export { getCopy, getSettingsRevision, getSettingsSnapshot, setSettingsSnapshot, subscribe } from './store';
