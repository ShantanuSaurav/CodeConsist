/** Zod schemas for roadmap content - the one definition of a valid roadmap. */
import { z } from 'zod';
import type { Roadmap } from '@/types';

export const RESOURCE_KINDS = ['docs', 'article', 'video', 'course', 'roadmap', 'practice', 'book'] as const;

const SLUG = z.string().regex(/^[a-z0-9][a-z0-9-]*$/, 'slugs are lowercase letters, digits and dashes');

export const ResourceSchema = z
  .object({
    title: z.string().min(1),
    url: z.string().refine((u) => u.startsWith('/') || /^https?:\/\//.test(u), 'must be an https URL or an in-app path'),
    kind: z.enum(RESOURCE_KINDS)
  })
  .strict();

export const RoadmapNodeSchema = z
  .object({
    id: SLUG,
    title: z.string().min(1),
    description: z.string().min(40, 'give the topic at least a sentence or two'),
    resources: z.array(ResourceSchema).min(1),
    stageId: z.string().regex(/^stage-\d+$/).optional(),
    tags: z.array(z.string()).optional(),
    optional: z.boolean().optional()
  })
  .strict();

export const RoadmapSectionSchema = z
  .object({
    id: SLUG,
    title: z.string().min(1),
    description: z.string().optional(),
    nodes: z.array(RoadmapNodeSchema).min(1)
  })
  .strict();

export const RoadmapSchema: z.ZodType<Roadmap> = z
  .object({
    slug: SLUG,
    order: z.number().int().positive(),
    title: z.string().min(1),
    kind: z.enum(['role', 'skill']),
    description: z.string().min(20),
    icon: z.string().min(1),
    roadmapShUrl: z.string().url().startsWith('https://roadmap.sh/'),
    sections: z.array(RoadmapSectionSchema).min(1)
  })
  .strict()
  .superRefine((r, ctx) => {
    const ids = new Set<string>();
    r.sections.forEach((s, si) =>
      s.nodes.forEach((n, ni) => {
        if (ids.has(n.id)) ctx.addIssue({ code: z.ZodIssueCode.custom, message: `duplicate node id "${n.id}"`, path: ['sections', si, 'nodes', ni, 'id'] });
        ids.add(n.id);
      })
    );
  }) as z.ZodType<Roadmap>;
