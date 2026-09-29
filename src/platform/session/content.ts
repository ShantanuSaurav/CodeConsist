/**
 * The content the session works from.
 *
 * The app hands the session its bundled content (the modules own their
 * content; the platform must not import them). The API serves the very same
 * bank - it runs the same registry loader - so we only reach for it to pick up
 * edits without a page reload.
 *
 * Each stage's lessons are grouped into units (src/platform/progress/units.ts):
 * the server's grouping when the bank came from the API (it knows an admin's
 * regrouping and which lessons are hidden), else the grouping it sent last
 * time (`cq-unit-defs-v1`), else the default one. The concatenated units are
 * the stage's lesson order.
 */
import type { Challenge, LanguageTrack, Stage, UnitDef } from '@/types';
import { api } from '../api-client/api';
import { DEFAULT_UNIT_SETTINGS, toUnitDefs } from '../progress/units';
import { groupIntoStages, withResolvedUnits } from '../progress/stages';
import type { UnitSettings } from '../settings/types';
import { STORAGE_KEYS, readJson, writeJson } from '../storage/storage';

// Grouping a flat bank under its stages moved to src/platform/progress/stages.ts
// (Phase 5), so the server builds the very same stages; it is still exported
// from here for the app.
export { groupIntoStages };

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
  /**
   * Premium stages this viewer has not unlocked, as the server decided when
   * it served the bank: their challenges are `locked` stubs (no prompt, no
   * answers). Empty for the offline bundle, which still locks premium stages
   * in the UI from the cached entitlements.
   */
  lockedStageIds: string[];
  source: 'api' | 'bundle';
}

/** The unit groupings cached from the server, per stage: ids and names only. */
export type UnitDefCache = Record<string, UnitDef[]>;

/**
 * Every stage with its units, under the CURRENT unit settings: the units a
 * stage already carries (the server's grouping), else the cached grouping
 * for bundled or offline content, else the default. Re-run whenever the
 * settings change, so the "~6 min" and the default grouping follow them.
 */
export function withUnits(stages: readonly Stage[], cfg: UnitSettings = DEFAULT_UNIT_SETTINGS, cachedDefs: UnitDefCache | null = null): Stage[] {
  return stages.map((stage) => {
    const own = stage.units && stage.units.length ? stage.units : null;
    const cached = cachedDefs && Object.prototype.hasOwnProperty.call(cachedDefs, stage.id) ? cachedDefs[stage.id] : null;
    return withResolvedUnits(stage, own ?? cached, cfg);
  });
}

/** The groupings the server sent last time, made safe. */
export function readUnitDefCache(): UnitDefCache {
  const raw = readJson<unknown>(STORAGE_KEYS.unitDefs, null);
  const out: UnitDefCache = {};
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
  for (const [stageId, defs] of Object.entries(raw as Record<string, unknown>)) {
    if (!stageId || stageId === '__proto__' || !Array.isArray(defs)) continue;
    const clean = defs.filter(
      (d): d is UnitDef => Boolean(d) && typeof d.id === 'string' && typeof d.name === 'string' && Array.isArray(d.challengeIds)
    );
    if (clean.length) out[stageId] = clean.map((d) => ({ ...d, challengeIds: d.challengeIds.filter((id) => typeof id === 'string') }));
  }
  return out;
}

/** Remember the server's groupings (ids and names only) for the next offline start. */
export function writeUnitDefCache(stages: readonly Stage[]): UnitDefCache {
  const cache: UnitDefCache = {};
  for (const stage of stages) if (stage.units?.length) cache[stage.id] = toUnitDefs(stage.units);
  writeJson(STORAGE_KEYS.unitDefs, cache);
  return cache;
}

/** Build a bundle from already-grouped stages and their challenges. */
export function makeBundle(
  stages: Stage[],
  challenges: Challenge[],
  tracks: LanguageTrack[],
  source: ContentBundle['source'] = 'bundle',
  hiddenTracks: string[] = [],
  lockedStageIds: string[] = []
): ContentBundle {
  return { stages, challenges, byId: new Map(challenges.map((c) => [c.id, c])), tracks, hiddenTracks, lockedStageIds, source };
}

/**
 * Fetch the bank from the API; null when it is unreachable or empty.
 * `fallbackTracks` covers an API built before tracks existed.
 *
 * The answer depends on who asks (it is requested with the session): a
 * premium stage this viewer has not unlocked arrives as `locked` stubs,
 * which group into their stage like any other challenge, and its id is in
 * `lockedStageIds`. Fetch it again whenever the viewer's access changes.
 * The server's unit groupings are cached for the next offline start.
 */
export async function loadFromApi(fallbackTracks: LanguageTrack[] = []): Promise<ContentBundle | null> {
  try {
    const { stages, challenges, languageTracks, hiddenLanguages, lockedStageIds } = await api.content();
    if (!Array.isArray(challenges) || challenges.length === 0) return null;
    const tracks = Array.isArray(languageTracks) && languageTracks.length ? (languageTracks as LanguageTrack[]) : fallbackTracks;
    const hidden = Array.isArray(hiddenLanguages) ? hiddenLanguages : [];
    const locked = Array.isArray(lockedStageIds) ? lockedStageIds.filter((id): id is string => typeof id === 'string') : [];
    const grouped = groupIntoStages(stages, challenges);
    if (grouped.some((s) => s.units?.length)) writeUnitDefCache(grouped);
    return makeBundle(grouped, challenges, tracks, 'api', hidden, locked);
  } catch {
    return null;
  }
}
