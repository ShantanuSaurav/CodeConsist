/**
 * Roadmaps - roadmap.sh-style skill maps, authored for Devlingo.
 *
 * Each file under this directory is one roadmap (`export const roadmap`),
 * discovered by the glob below; the pattern must match `roadmapsSpec`. The
 * descriptions and structure here are Devlingo's own. roadmap.sh's content is
 * copyrighted and may not be republished, so we link to it rather than copy it.
 */
import type { Roadmap, RoadmapNode } from '@/types';
import { loadFromGlob } from '@/platform/content-registry';
import { roadmapsSpec } from './spec';

const modules = import.meta.glob(['./*.ts', '!./index.ts', '!./spec.ts', '!./helpers.ts'], { eager: true });

const loaded = loadFromGlob(roadmapsSpec, modules);

export const ROADMAPS: Roadmap[] = loaded.items;

/** Development only: the deferred schema check's issues. */
export const ROADMAPS_VERIFIED = loaded.verified;

export const ROADMAP_BY_SLUG = new Map(ROADMAPS.map((r) => [r.slug, r]));

export function roadmapNodes(roadmap: Roadmap): RoadmapNode[] {
  return roadmap.sections.flatMap((s) => s.nodes);
}

/** Every node id in a roadmap, for progress bookkeeping. */
export function roadmapNodeIds(roadmap: Roadmap): string[] {
  return roadmapNodes(roadmap).map((n) => n.id);
}

/** Roadmaps that practise a given stage, for the "also on the roadmaps" links. */
export function roadmapsForStage(stageId: string): { roadmap: Roadmap; node: RoadmapNode }[] {
  const out: { roadmap: Roadmap; node: RoadmapNode }[] = [];
  for (const roadmap of ROADMAPS) {
    const node = roadmapNodes(roadmap).find((n) => n.stageId === stageId);
    if (node) out.push({ roadmap, node });
  }
  return out;
}

export { roadmapsSpec } from './spec';
