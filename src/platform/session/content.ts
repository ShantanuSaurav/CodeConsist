/**
 * The content the session works from.
 *
 * The app hands the session its bundled content (the modules own their
 * content; the platform must not import them). The API serves the very same
 * bank - it runs the same registry loader - so we only reach for it to pick up
 * edits without a page reload.
 */
import type { Challenge, LanguageTrack, Stage } from '@/types';
import { api } from '../api-client/api';

export interface ContentBundle {
  stages: Stage[];
  challenges: Challenge[];
  byId: Map<string, Challenge>;
  /** The language tracks (ordered slices of `stages`), in display order. */
  tracks: LanguageTrack[];
  /**
   * Track ids an administrator has unpublished (see /admin/languages). Only
   * ever populated when content came from the API - the offline bundle has no
   * way to know about a server-side admin decision, so it shows every track,
   * which is an honest, documented limitation of working offline.
   */
  hiddenTracks: string[];
  source: 'api' | 'bundle';
}

/**
 * Group a flat challenge list under its stages, splitting each stage's test
 * (isStageTest) out of the lessons. Stage order follows `stageMeta`.
 */
export function groupIntoStages(
  stageMeta: Array<Omit<Stage, 'challenges' | 'state' | 'test'>>,
  challenges: Challenge[]
): Stage[] {
  const byStage = new Map<string, Challenge[]>();
  const testByStage = new Map<string, Challenge>();
  for (const challenge of challenges) {
    if (challenge.isStageTest) {
      testByStage.set(challenge.stageId, challenge);
      continue;
    }
    const list = byStage.get(challenge.stageId);
    if (list) list.push(challenge);
    else byStage.set(challenge.stageId, [challenge]);
  }
  return stageMeta.map((meta) => ({
    ...meta,
    state: 'Locked' as const,
    challenges: byStage.get(meta.id) ?? [],
    test: testByStage.get(meta.id)
  }));
}

/** Build a bundle from already-grouped stages and their challenges. */
export function makeBundle(
  stages: Stage[],
  challenges: Challenge[],
  tracks: LanguageTrack[],
  source: ContentBundle['source'] = 'bundle',
  hiddenTracks: string[] = []
): ContentBundle {
  return { stages, challenges, byId: new Map(challenges.map((c) => [c.id, c])), tracks, hiddenTracks, source };
}

/**
 * Fetch the bank from the API; null when it is unreachable or empty.
 * `fallbackTracks` covers an API built before tracks existed.
 */
export async function loadFromApi(fallbackTracks: LanguageTrack[] = []): Promise<ContentBundle | null> {
  try {
    const { stages, challenges, languageTracks, hiddenLanguages } = await api.content();
    if (!Array.isArray(challenges) || challenges.length === 0) return null;
    const tracks = Array.isArray(languageTracks) && languageTracks.length ? (languageTracks as LanguageTrack[]) : fallbackTracks;
    const hidden = Array.isArray(hiddenLanguages) ? hiddenLanguages : [];
    return makeBundle(groupIntoStages(stages, challenges), challenges, tracks, 'api', hidden);
  } catch {
    return null;
  }
}
