import type { CodingSettings } from '../settings/types';

export type CodingWorkflow = 'playground' | 'challenges' | 'examples';

export function executionDisabledReason(settings: CodingSettings | undefined, language: string, workflow: CodingWorkflow | null = 'playground'): string | null {
  if (!settings) return null;
  if (!settings.enabled) return 'Code execution is paused by the administrator. Your code is still available to edit.';
  if (workflow && !settings.workflows[workflow]) return `The ${workflow} coding workflow is paused by the administrator.`;
  const languages = settings.languages as Record<string, boolean>;
  if (languages[language] === false) return `${language === 'cpp' ? 'C++' : language.toUpperCase()} execution is paused by the administrator.`;
  if (language === 'web' || language === 'html') {
    if (!settings.workflows.webPreview) return 'Web previews are paused by the administrator.';
    if (['html', 'css', 'javascript'].some(key => languages[key] === false)) return 'Web previews require HTML, CSS and JavaScript execution to be enabled by the administrator.';
  }
  return null;
}
