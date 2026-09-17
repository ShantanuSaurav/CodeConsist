/**
 * Markdown article -> Article.
 *
 * The "# " heading is the title, `<!-- stage: stage-N -->` on the next line
 * binds the article to a stage, the first "> " quote is the summary, and every
 * "## " heading starts a section. A section may declare the challenge tags it
 * explains on the line after its heading:
 *
 *     ## Loops and off-by-one errors
 *     <!-- tags: loops, off-by-one -->
 *
 * Pure: no React, no DOM, so the Node loader runs it too.
 */
import type { Article, ArticleSection } from '@/types';
import { slugify } from '@/platform/markdown/slugify';

const TAGS_LINE = /^<!--\s*tags:\s*([^>]*?)\s*-->\s*$/m;
const STAGE_LINE = /^<!--\s*stage:\s*(stage-\d+)\s*-->\s*$/m;

export function parseArticle(source: string, file = ''): Article {
  const text = source.replace(/\r\n/g, '\n');
  const [head, ...rest] = text.split(/\n(?=## )/);

  const titleMatch = head.match(/^#\s+(.+)$/m);
  const summaryMatch = head.match(/^>\s?(.+)$/m);
  const stageMatch = head.match(STAGE_LINE);

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
    // A missing marker fails schema validation with the file name, on purpose.
    stageId: stageMatch?.[1] ?? '',
    title: titleMatch?.[1].trim() ?? file,
    summary: summaryMatch?.[1].trim() ?? '',
    readingMinutes: Math.max(3, Math.round(words / 200)),
    sections
  };
}
