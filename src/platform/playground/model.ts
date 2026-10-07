import type { ExecutionResult } from '@/types';

export const PLAYGROUND_LANGUAGES = ['javascript', 'python', 'sql', 'java', 'c', 'cpp', 'web'] as const;
export type PlaygroundLanguage = (typeof PLAYGROUND_LANGUAGES)[number];
export type PlaygroundProgram =
  | { language: Exclude<PlaygroundLanguage, 'web'>; code: string; stdin: string }
  | { language: 'web'; files: { html: string; css: string; js: string } };
export interface PlaygroundSave {
  id: string;
  title: string;
  program: PlaygroundProgram;
  createdAt: string;
  updatedAt: string;
}
export interface PlaygroundRun {
  id: string;
  program: PlaygroundProgram;
  ranAt: string;
}

export function playgroundLanguage(value: unknown): value is PlaygroundLanguage {
  return PLAYGROUND_LANGUAGES.includes(value as PlaygroundLanguage);
}

export function normalizePlaygroundProgram(value: unknown): PlaygroundProgram | null {
  if (!value || typeof value !== 'object') return null;
  const input = value as Record<string, unknown>;
  if (!playgroundLanguage(input.language)) return null;
  if (input.language === 'web') {
    if (!input.files || typeof input.files !== 'object') return null;
    const files = input.files as Record<string, unknown>;
    if (typeof files.html !== 'string' || typeof files.css !== 'string' || typeof files.js !== 'string') return null;
    if (files.html.length + files.css.length + files.js.length > 100_000) return null;
    return { language: 'web', files: { html: files.html, css: files.css, js: files.js } };
  }
  if (typeof input.code !== 'string' || input.code.length > 100_000) return null;
  if (typeof input.stdin !== 'string' || input.stdin.length > 10_000) return null;
  if (!['java', 'c', 'cpp'].includes(input.language) && input.stdin !== '') return null;
  return { language: input.language, code: input.code, stdin: input.stdin };
}

export function playgroundTitle(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 && value.trim().length <= 80
    ? value.trim() : null;
}

export function samePlaygroundProgram(left: PlaygroundProgram, right: PlaygroundProgram): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

export function successfulPlaygroundRun(result: ExecutionResult): boolean {
  return result.status === 'passed' && !result.stderr;
}

export function appendPlaygroundRun(history: PlaygroundRun[], run: PlaygroundRun): PlaygroundRun[] {
  const others = history.filter((entry) => entry.program.language !== run.program.language);
  const languageRuns = history.filter((entry) => entry.program.language === run.program.language &&
    !samePlaygroundProgram(entry.program, run.program));
  return [...others, run, ...languageRuns.slice(0, 19)];
}
