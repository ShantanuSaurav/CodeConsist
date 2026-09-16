/* ==========================================================================
   Roadmaps - roadmap.sh-style skill maps, authored for Devlingo.

   Each roadmap is a list of sections, each a list of topic nodes with a short
   description and curated links (official docs, free courses, the matching
   roadmap.sh page). Nodes that Devlingo practises carry a stageId and tags so
   the UI can jump straight into the lessons and the article for that topic.

   The descriptions and structure here are Devlingo's own. roadmap.sh's
   content is copyrighted and may not be republished, so we link to it rather
   than copy it - every roadmap and most nodes point there for the community
   version.
   ========================================================================== */
import type { Roadmap, RoadmapNode } from '../../types';
import { frontend } from './frontend';
import { backend } from './backend';
import { fullStack } from './full-stack';
import { devops } from './devops';
import { javascript } from './javascript';
import { python } from './python';
import { sql } from './sql';
import { computerScience } from './computer-science';
import { systemDesign } from './system-design';
import { gitGithub } from './git-github';

export const ROADMAPS: Roadmap[] = [
  frontend,
  backend,
  fullStack,
  devops,
  javascript,
  python,
  sql,
  computerScience,
  systemDesign,
  gitGithub
];

export const ROADMAP_BY_SLUG = new Map(ROADMAPS.map((r) => [r.slug, r]));

export function roadmapNodes(roadmap: Roadmap): RoadmapNode[] {
  return roadmap.sections.flatMap((s) => s.nodes);
}

/** Every node id in a roadmap, for progress bookkeeping. */
export function roadmapNodeIds(roadmap: Roadmap): string[] {
  return roadmapNodes(roadmap).map((n) => n.id);
}

/** Roadmaps that practise a given stage, for the "also on the roadmap" links. */
export function roadmapsForStage(stageId: string): { roadmap: Roadmap; node: RoadmapNode }[] {
  const out: { roadmap: Roadmap; node: RoadmapNode }[] = [];
  for (const roadmap of ROADMAPS) {
    const node = roadmapNodes(roadmap).find((n) => n.stageId === stageId);
    if (node) out.push({ roadmap, node });
  }
  return out;
}
