/**
 * Public API of the roadmaps module.
 *
 * Owns: the roadmap.sh-style skill maps (content/), per-topic done/learning/
 * skipped tracking (browser-local), the hub and detail pages, and the stage
 * skill tree.
 * Emits: practice:open, practice:openTest, account:openPro (from nodes).
 */
import { ROUTES } from '@/config/routes';
import { roadmapsForStage } from './content';

export { RoadmapPage } from './pages/RoadmapPage';
export { RoadmapDetailPage } from './pages/RoadmapDetailPage';
export type { RoadmapDetailPageProps } from './pages/RoadmapDetailPage';
export { SkillRoadmap } from './components/SkillRoadmap';
export { ROADMAPS, ROADMAP_BY_SLUG, roadmapNodes, roadmapNodeIds, roadmapsForStage } from './content';
export { summarise, nodeStatus, setNodeStatus } from './services/progress';

/** Links to the roadmap topics that practise a stage - for other modules' "see also" lists. */
export function roadmapLinksForStage(stageId: string): { href: string; label: string }[] {
  return roadmapsForStage(stageId).map(({ roadmap, node }) => ({
    href: ROUTES.roadmap(roadmap.slug),
    label: `${roadmap.title} · ${node.title}`
  }));
}
