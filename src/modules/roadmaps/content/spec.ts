import type { Roadmap } from '@/types';
import type { ContentSpec } from '@/platform/content-registry';

/** One roadmap per file, exported as `roadmap`. Hub order comes from `order`. */
export const roadmapsSpec: ContentSpec<Roadmap> = {
  kind: 'roadmaps',
  dir: 'modules/roadmaps/content',
  extensions: ['.ts'],
  exclude: ['index.ts', 'spec.ts', 'helpers.ts'],
  shape: 'single',
  exportName: 'roadmap',
  schema: () => import('../schema').then((m) => m.RoadmapSchema),
  idOf: (r) => r.slug,
  compare: (a, b) => a.item.order - b.item.order || (a.item.slug < b.item.slug ? -1 : 1)
};
