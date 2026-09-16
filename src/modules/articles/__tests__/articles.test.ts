import { describe, expect, it } from 'vitest';
import { parseArticle } from '../parse';
import { ArticleSchema } from '../schema';
import { ARTICLES, sectionFor, sectionForTags } from '../content';
import { resolveReading } from '../index';

const sample = `# Title here
<!-- stage: stage-3 -->
> One-line summary.

## First section
<!-- tags: loops, arrays -->
${'Body text. '.repeat(30)}

## Second section
<!-- tags: hash-map -->
${'More text. '.repeat(30)}
`;

describe('article parsing', () => {
  it('reads the title, stage, summary and tagged sections', () => {
    const a = parseArticle(sample, 'sample.md');
    expect(a.title).toBe('Title here');
    expect(a.stageId).toBe('stage-3');
    expect(a.summary).toBe('One-line summary.');
    expect(a.sections.map((s) => s.id)).toEqual(['first-section', 'second-section']);
    expect(a.sections[0].tags).toEqual(['loops', 'arrays']);
    expect(a.sections[0].body).not.toMatch(/<!--/);
    expect(ArticleSchema.safeParse(a).success).toBe(false); // only two sections
  });

  it('a missing stage marker fails the schema with a helpful message', () => {
    const a = parseArticle(sample.replace('<!-- stage: stage-3 -->\n', ''), 'x.md');
    const result = ArticleSchema.safeParse(a);
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.issues[0].message).toMatch(/stage/);
  });
});

describe('articles content (dev loader)', () => {
  it('loads one valid article per stage', () => {
    expect(ARTICLES).toHaveLength(10);
    expect(new Set(ARTICLES.map((a) => a.stageId)).size).toBe(10);
  });

  it('matches a challenge to the section sharing the most tags, else the first', () => {
    const hit = sectionForTags('stage-1', ['hoisting', 'var']);
    expect(hit?.section.id).toBe('variables-scope-and-hoisting');
    const fallback = sectionFor({ stageId: 'stage-1', tags: ['nothing-matches'] });
    expect(fallback?.section.id).toBe(ARTICLES.find((a) => a.stageId === 'stage-1')?.sections[0].id);
    expect(sectionFor({ stageId: 'stage-99' })).toBeNull();
  });

  it('resolveReading deep-links with tags and links the article without', () => {
    expect(resolveReading('stage-1', ['closures'])).toEqual({ href: '/dashboard/learn/stage-1/read#scope-and-closures', label: 'Read: Scope and closures' });
    expect(resolveReading('stage-1')).toMatchObject({ href: '/dashboard/learn/stage-1/read' });
    expect(resolveReading('stage-99')).toBeNull();
  });
});
