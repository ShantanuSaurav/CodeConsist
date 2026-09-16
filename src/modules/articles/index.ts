/**
 * Public API of the articles module.
 *
 * Owns: the per-stage reading (Markdown under content/), the section-by-tag
 * matcher, the article page and the in-modal reading panel.
 * Emits: practice:open / practice:openTest (from the article page's CTA).
 */
import type { ReadingLink, ReadingResolver } from '@/types';
import { ROUTES } from '@/config/routes';
import { articleFor, sectionForTags } from './content';

export { ArticlePage } from './pages/ArticlePage';
export type { ArticlePageProps, RelatedLink } from './pages/ArticlePage';
export { ReadingPanel } from './components/ReadingPanel';
export { ARTICLES, articleFor, sectionFor, sectionForTags } from './content';
export { ArticleSchema } from './schema';
export { parseArticle } from './parse';

/**
 * The reading link other modules show for a stage or a challenge. With tags
 * it deep-links to the best-matching section; without, to the article itself.
 */
export const resolveReading: ReadingResolver = (stageId, tags): ReadingLink | null => {
  const article = articleFor(stageId);
  if (!article) return null;
  if (tags && tags.length) {
    const match = sectionForTags(stageId, tags);
    if (match) return { href: ROUTES.article(stageId, match.section.id), label: `Read: ${match.section.title}` };
  }
  return { href: ROUTES.article(stageId), label: article.title, minutes: article.readingMinutes };
};
