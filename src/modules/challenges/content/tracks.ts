import type { LanguageTrack } from '@/types';
import { STAGE_META } from './stages';

/**
 * Language tracks: ordered slices of `STAGE_META` that each form one
 * self-contained learning path with its own lock chain.
 *
 * This is deliberately NOT a second content system. `buildStages()` still
 * produces one flat, authored list of stages; a track is just "which of those
 * stage ids belong together, in what order". Locking ("stage 2 opens once
 * stage 1 is cleared") is evaluated PER TRACK by `platform/progress`, so the
 * C track's first stage never sits behind Stage 10 of the core path, and the
 * core path never waits on C.
 *
 * The core path is the full ten-stage Devlingo journey exactly as it always
 * was - Programming Basics through Python, data structures, the web, backend,
 * SQL, tooling, system design and shipping, each stage gated by its test.
 */
export const LANGUAGE_TRACKS: LanguageTrack[] = [
  {
    id: 'core',
    label: 'Developer path',
    icon: '🧭',
    tagline: 'Basics to shipping, in ten stages',
    description:
      'The full path: JavaScript fundamentals, Python, data structures and algorithms, the web, backend APIs, SQL, tooling and testing, system design and shipping real projects. Every stage ends in a coding test that opens the next.',
    primaryLanguage: 'javascript',
    stageIds: ['stage-1', 'stage-2', 'stage-3', 'stage-4', 'stage-5', 'stage-6', 'stage-7', 'stage-8', 'stage-9', 'stage-10']
  },
  {
    id: 'c',
    label: 'C',
    icon: '🔧',
    tagline: 'Where memory is not a mystery',
    description: 'Variables, control flow, functions, arrays and pointers - the fundamentals every systems language is built on.',
    primaryLanguage: 'c',
    stageIds: ['stage-c1']
  },
  {
    id: 'cpp',
    label: 'C++',
    icon: '➕',
    tagline: 'C, plus the tools to structure it',
    description: 'C fundamentals extended with references, classes and the standard library containers you reach for daily.',
    primaryLanguage: 'cpp',
    stageIds: ['stage-cpp1']
  }
];

export const DEFAULT_TRACK_ID = LANGUAGE_TRACKS[0].id;

export function trackById(id: string | null | undefined): LanguageTrack | undefined {
  return id ? LANGUAGE_TRACKS.find((t) => t.id === id) : undefined;
}

export function trackForStageId(stageId: string): LanguageTrack | undefined {
  return LANGUAGE_TRACKS.find((t) => t.stageIds.includes(stageId));
}

/* Every stage must belong to exactly one track, and every track id must name a real stage - checked in the tests. */
export const STAGE_IDS_IN_TRACKS = new Set(LANGUAGE_TRACKS.flatMap((t) => t.stageIds));
export const UNTRACKED_STAGE_IDS = STAGE_META.map((s) => s.id).filter((id) => !STAGE_IDS_IN_TRACKS.has(id));
