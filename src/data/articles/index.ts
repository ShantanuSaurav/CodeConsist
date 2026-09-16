/* ==========================================================================
   Stage articles - the reading that goes with each stage's lessons.

   Each article is a Markdown file next to this one. Its "# " heading is the
   title, the first "> " quote is the summary, and every "## " heading starts a
   section. A section may declare the challenge tags it explains on the line
   after its heading:

       ## Loops and off-by-one errors
       <!-- tags: loops, off-by-one -->

   The practice modal uses those tags to show the right section next to a
   challenge ("Read about this topic").
   ========================================================================== */
import type { Article, ArticleSection, Challenge } from '../../types';
import { slugify } from '../../lib/markdown';

import stage1 from './programming-basics.md?raw';
import stage2 from './python-fundamentals.md?raw';
import stage3 from './data-structures.md?raw';
import stage4 from './algorithms.md?raw';
import stage5 from './web-development.md?raw';
import stage6 from './backend-apis.md?raw';
import stage7 from './databases-sql.md?raw';
import stage8 from './git-tooling-testing.md?raw';
import stage9 from './system-design.md?raw';
import stage10 from './shipping.md?raw';

const SOURCES: Record<string, string> = {
  'stage-1': stage1,
  'stage-2': stage2,
  'stage-3': stage3,
  'stage-4': stage4,
  'stage-5': stage5,
  'stage-6': stage6,
  'stage-7': stage7,
  'stage-8': stage8,
  'stage-9': stage9,
  'stage-10': stage10
};

const TAGS_LINE = /^<!--\s*tags:\s*([^>]*?)\s*-->\s*$/m;

function parseArticle(stageId: string, source: string): Article {
  const text = source.replace(/\r\n/g, '\n');
  const [head, ...rest] = text.split(/\n(?=## )/);

  const titleMatch = head.match(/^#\s+(.+)$/m);
  const summaryMatch = head.match(/^>\s?(.+)$/m);

  const sections: ArticleSection[] = rest.map((chunk) => {
    const lines = chunk.split('\n');
    const title = lines[0].replace(/^##\s+/, '').trim();
    let body = lines.slice(1).join('\n');
    let tags: string[] = [];
    const tagsMatch = body.match(TAGS_LINE);
    if (tagsMatch) {
      tags = tagsMatch[1]
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean);
      body = body.replace(TAGS_LINE, '');
    }
    return { id: slugify(title), title, tags, body: body.trim() };
  });

  const words = text.split(/\s+/).length;

  return {
    stageId,
    title: titleMatch?.[1].trim() ?? stageId,
    summary: summaryMatch?.[1].trim() ?? '',
    readingMinutes: Math.max(3, Math.round(words / 200)),
    sections
  };
}

export const ARTICLES: Article[] = Object.entries(SOURCES).map(([stageId, src]) => parseArticle(stageId, src));

export const ARTICLE_BY_STAGE = new Map(ARTICLES.map((a) => [a.stageId, a]));

export function articleFor(stageId: string): Article | undefined {
  return ARTICLE_BY_STAGE.get(stageId);
}

/**
 * The article section that best explains a challenge: the one sharing the
 * most tags with it, else the first section of the stage's article.
 */
export function sectionFor(challenge: Challenge): { article: Article; section: ArticleSection } | null {
  const article = ARTICLE_BY_STAGE.get(challenge.stageId);
  if (!article || article.sections.length === 0) return null;
  const tags = new Set((challenge.tags ?? []).map((t) => t.toLowerCase()));
  let best = article.sections[0];
  let bestScore = 0;
  for (const s of article.sections) {
    const score = s.tags.reduce((n, t) => n + (tags.has(t.toLowerCase()) ? 1 : 0), 0);
    if (score > bestScore) {
      best = s;
      bestScore = score;
    }
  }
  return { article, section: best };
}
