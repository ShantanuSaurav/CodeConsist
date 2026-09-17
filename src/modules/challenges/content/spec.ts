/**
 * How challenge content is discovered and validated.
 *
 * Every `.ts` file under this directory (except the ones listed) exports a
 * `challenges: Challenge[]` array. Topic folders keep a stage's batches
 * together; `stage-tests.ts` holds the ten mandatory tests. Adding a topic is
 * adding a folder - nothing here changes.
 */
import type { Challenge } from '@/types';
import type { ContentRecord, ContentSpec } from '@/platform/content-registry';
import { STAGE_META } from './stages';

const STAGE_ORDER = new Map(STAGE_META.map((s, i) => [s.id, i]));

/**
 * Stage order first, then file path, then authored position. Files are
 * imported alphabetically, which on its own would open the library on the
 * Algorithms stage; and within a file the ORIGINAL position is the tiebreak,
 * not the id text - an id sort put "a10" before "a2" the moment an author
 * skipped zero-padding.
 */
export function compareChallenges(a: ContentRecord<Challenge>, b: ContentRecord<Challenge>): number {
  const stage = (STAGE_ORDER.get(a.item.stageId) ?? 999) - (STAGE_ORDER.get(b.item.stageId) ?? 999);
  if (stage !== 0) return stage;
  if (a.file !== b.file) return a.file < b.file ? -1 : 1;
  return a.index - b.index;
}

export const challengesSpec: ContentSpec<Challenge> = {
  kind: 'challenges',
  dir: 'modules/challenges/content',
  extensions: ['.ts'],
  exclude: ['index.ts', 'spec.ts', 'stages.ts'],
  shape: 'array',
  exportName: 'challenges',
  schema: () => import('../schema').then((m) => m.ChallengeSchema),
  idOf: (c) => c.id,
  compare: compareChallenges
};

/** Re-exported so the Node loader can read stage metadata without touching the browser-only index. */
export { STAGE_META };
