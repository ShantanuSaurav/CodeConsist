import React, { useMemo } from 'react';
import { COPY_SAMPLE, SETTING_META, pathsInSection } from '@/platform/settings';
import type { SettingMeta } from '@/platform/settings';
import { SettingField } from './fields';
import type { SectionProps } from './GenericSection';

/** How the copy keys are grouped on the page, by the part of the path after `copy.`. */
const GROUPS: Array<{ title: string; blurb: string; parts: string[] }> = [
  {
    title: 'Offline and errors',
    blurb: 'What visitors read when something cannot be reached or has broken. Plain words: never an instruction only a developer could follow.',
    parts: ['offline', 'runtime', 'error']
  },
  { title: 'Sync status', blurb: 'Settings > Sync and the sidebar indicator.', parts: ['sync'] },
  { title: 'Playground', blurb: 'The Playground page.', parts: ['playground'] },
  { title: 'Landing page', blurb: 'The public home page. The counts are filled from the content, so they are never out of date.', parts: ['landing'] },
  { title: 'Limits', blurb: 'The answers to "too many attempts" and a busy code runner. The server sends these too.', parts: ['limits'] },
  { title: 'Premium', blurb: 'When someone without access tries to solve a premium lesson.', parts: ['premium'] },
  { title: 'Not found', blurb: 'The page for an address that matches nothing.', parts: ['notFound'] },
  { title: 'Meta description', blurb: 'What search engines and link previews show.', parts: ['meta'] }
];

/**
 * Site copy: every piece of learner-facing wording that used to be fixed in
 * the code, grouped by where it appears. Each field shows its allowed
 * `{tokens}` as chips, the default, and a live preview filled with the REAL
 * counts from the content (lessons, stages, free and premium stages) rather
 * than made-up numbers.
 */
export const CopySection: React.FC<SectionProps> = (props) => {
  const { context } = props;
  const sample = useMemo(() => {
    const content = context?.content;
    return content ? { ...COPY_SAMPLE, ...content } : COPY_SAMPLE;
  }, [context]);

  const paths = pathsInSection('copy').filter((path) => SETTING_META[path]);
  const grouped = GROUPS.map((group) => ({
    ...group,
    paths: paths.filter((path) => group.parts.includes(path.split('.')[1]))
  }));
  // Anything a later phase adds that no group names still gets a place.
  const known = new Set(grouped.flatMap((group) => group.paths));
  const other = paths.filter((path) => !known.has(path));
  if (other.length) grouped.push({ title: 'Other', blurb: '', parts: [], paths: other });

  const metaFor = (path: string): SettingMeta => ({ ...SETTING_META[path], sample });

  return (
    <div className="space-y-6">
      {grouped
        .filter((group) => group.paths.length > 0)
        .map((group) => (
          <section key={group.title} aria-label={group.title}>
            <h3 className="text-sm font-semibold text-fg mt-2">{group.title}</h3>
            {group.blurb && <p className="text-xs text-fg-muted mt-0.5">{group.blurb}</p>}
            <div>
              {group.paths.map((path) => (
                <SettingField
                  key={path}
                  path={path}
                  meta={metaFor(path)}
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
          </section>
        ))}
    </div>
  );
};
