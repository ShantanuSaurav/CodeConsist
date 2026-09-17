import { SupportedLanguage } from '../types';

/**
 * A language track is a self-contained learning path: an ordered slice of
 * `STAGE_META` (see `stages.ts`) that all share one primary language.
 *
 * This is intentionally NOT a new content system. It is a grouping over the
 * exact same `Stage`/`Challenge` records everything else already reads -
 * `buildStages()` still produces one flat, authored list of stages; a track
 * is just "which of those stage ids belong to this language, in what order".
 * Locking/progress ("stage 2 opens once stage 1 is cleared") is then computed
 * PER TRACK by re-running the existing `applyProgress` over just that slice,
 * so JavaScript stage 3 does not sit locked behind the unrelated Python
 * stage, and each language advances independently.
 */
export interface LanguageTrack {
  id: SupportedLanguage;
  label: string;
  icon: string;
  tagline: string;
  description: string;
  /** Stage ids from STAGE_META, in the order this track presents them. */
  stageIds: string[];
}

export const LANGUAGE_TRACKS: LanguageTrack[] = [
  {
    id: 'javascript',
    label: 'JavaScript',
    icon: '🟨',
    tagline: 'The language of the web',
    description:
      'Variables through system design: the full nine-stage path, from your first `let` to caching, queues and shipping real projects.',
    stageIds: [
      'stage-1',
      'stage-3',
      'stage-4',
      'stage-5',
      'stage-6',
      'stage-7',
      'stage-8',
      'stage-9',
      'stage-10'
    ]
  },
  {
    id: 'python',
    label: 'Python',
    icon: '🐍',
    tagline: 'Clean syntax, real depth',
    description: 'Lists, dicts, slicing, comprehensions and idiomatic Python, taught the same way: theory, example, then practice.',
    stageIds: ['stage-2']
  },
  {
    id: 'c',
    label: 'C',
    icon: '🔧',
    tagline: 'Where memory is not a mystery',
    description: 'Variables, control flow, functions, arrays and pointers - the fundamentals every systems language is built on.',
    stageIds: ['stage-c1']
  },
  {
    id: 'cpp',
    label: 'C++',
    icon: '➕',
    tagline: 'C, plus the tools to structure it',
    description: 'C fundamentals extended with references, classes and the standard library containers you reach for daily.',
    stageIds: ['stage-cpp1']
  }
];

export function trackForLanguage(language: SupportedLanguage): LanguageTrack | undefined {
  return LANGUAGE_TRACKS.find((t) => t.id === language);
}

export function trackForStageId(stageId: string): LanguageTrack | undefined {
  return LANGUAGE_TRACKS.find((t) => t.stageIds.includes(stageId));
}

export const DEFAULT_LANGUAGE: SupportedLanguage = LANGUAGE_TRACKS[0].id;
