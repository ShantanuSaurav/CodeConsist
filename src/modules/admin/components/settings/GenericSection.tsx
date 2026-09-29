import React from 'react';
import { SETTING_META, pathsInSection } from '@/platform/settings/meta';
import type { Settings } from '@/platform/settings';
import type { SettingsContext } from '../../services/adminApi';
import { SettingField } from './fields';

/** Everything a section needs to show and edit its settings. Built by pages/AdminRules.tsx. */
export interface SectionProps {
  sectionId: string;
  /** The effective settings WITH this page's unsaved edits - what a save would produce. */
  draft: Settings;
  /** The effective settings as saved. */
  saved: Settings;
  valueOf: (path: string) => unknown;
  defaultOf: (path: string) => unknown;
  isOverridden: (path: string) => boolean;
  isEdited: (path: string) => boolean;
  fromEnv: (path: string) => boolean;
  issueFor: (path: string) => string | undefined;
  onChange: (path: string, value: unknown) => void;
  onReset: (path: string) => void;
  context: SettingsContext | null;
}

/**
 * Any section, straight from the metadata: one field per setting, in the
 * order meta.ts lists them. Every setting is editable here the day it is
 * added; a custom section (LevelsSection) wraps this and adds helpers.
 */
export const GenericSection: React.FC<SectionProps & { only?: string[] }> = (props) => {
  const paths = (props.only ?? pathsInSection(props.sectionId)).filter((path) => SETTING_META[path]);
  return (
    <div>
      {paths.map((path) => (
        <SettingField
          key={path}
          path={path}
          meta={SETTING_META[path]}
          value={props.valueOf(path)}
          defaultValue={props.defaultOf(path)}
          overridden={props.isOverridden(path)}
          edited={props.isEdited(path)}
          fromEnv={props.fromEnv(path)}
          error={props.issueFor(path)}
          issueFor={props.issueFor}
          onChange={(value) => props.onChange(path, value)}
          onReset={() => props.onReset(path)}
        />
      ))}
    </div>
  );
};
