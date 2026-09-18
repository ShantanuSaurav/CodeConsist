import { describe, expect, it } from 'vitest';
import { ROADMAPS, ROADMAPS_VERIFIED, ROADMAP_BY_SLUG, roadmapNodeIds, roadmapsForStage } from '../content';
import { summarise } from '../services/progress';
import { roadmapLinksForStage } from '../index';

describe('roadmaps content (dev loader)', () => {
  it('every roadmap passes the schema (the deferred dev check finds nothing)', async () => {
    await expect(ROADMAPS_VERIFIED).resolves.toEqual([]);
  });

  it('loads every roadmap in display order with unique slugs', () => {
    expect(ROADMAPS.length).toBeGreaterThanOrEqual(10);
    expect(ROADMAPS.map((r) => r.order)).toEqual([...ROADMAPS.map((r) => r.order)].sort((a, b) => a - b));
    expect(ROADMAP_BY_SLUG.get('frontend')?.title).toBe('Frontend Developer');
  });

  it('links stages to the roadmap topics that practise them', () => {
    const hits = roadmapsForStage('stage-7');
    expect(hits.length).toBeGreaterThan(0);
    expect(hits.every((h) => h.node.stageId === 'stage-7')).toBe(true);
    expect(roadmapLinksForStage('stage-7')[0].href).toMatch(/^\/dashboard\/roadmap\//);
  });

  it('summarises progress like roadmap.sh: done over (total - skipped)', () => {
    const frontend = ROADMAP_BY_SLUG.get('frontend')!;
    const ids = roadmapNodeIds(frontend);
    const statuses = { [ids[0]]: 'done', [ids[1]]: 'skipped', [ids[2]]: 'learning' } as const;
    const s = summarise(frontend, statuses as any);
    expect(s).toMatchObject({ done: 1, skipped: 1, learning: 1, total: ids.length });
    expect(s.percent).toBe(Math.round((1 / (ids.length - 1)) * 100));
  });
});
