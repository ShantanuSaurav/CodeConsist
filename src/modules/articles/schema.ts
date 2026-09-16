/** Zod schema for a parsed article - what every stage's reading must satisfy. */
import { z } from 'zod';
import type { Article } from '@/types';

export const ArticleSectionSchema = z
  .object({
    id: z.string().min(1),
    title: z.string().min(1),
    tags: z.array(z.string().min(1)),
    body: z.string().min(200, 'a section needs at least a paragraph')
  })
  .strict();

export const ArticleSchema: z.ZodType<Article> = z
  .object({
    stageId: z.string().regex(/^stage-\d+$/, 'missing "<!-- stage: stage-N -->" under the title'),
    title: z.string().min(1),
    summary: z.string().min(1, 'add a "> summary" line under the title'),
    readingMinutes: z.number().int().positive(),
    sections: z.array(ArticleSectionSchema).min(4)
  })
  .strict()
  .superRefine((a, ctx) => {
    const ids = new Set<string>();
    a.sections.forEach((s, i) => {
      if (ids.has(s.id)) ctx.addIssue({ code: z.ZodIssueCode.custom, message: `duplicate section id "${s.id}"`, path: ['sections', i, 'id'] });
      ids.add(s.id);
      if ((s.body.match(/```/g) ?? []).length % 2 !== 0)
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'unbalanced code fence', path: ['sections', i, 'body'] });
    });
  }) as z.ZodType<Article>;
