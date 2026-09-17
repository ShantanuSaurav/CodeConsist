/**
 * Stage articles - the reading that goes with each stage's lessons.
 *
 * Every `.md` file in this directory is one article, discovered by the glob
 * below (which must match `articlesSpec`). See ../parse.ts for the format.
 */
import type { Article, ArticleSection, Challenge } from '@/types';
import { loadFromGlob } from '@/platform/content-registry';
import { articlesSpec } from './spec';

const modules = import.meta.glob('./*.md', { eager: true, query: '?raw', import: 'default' });

const loaded = loadFromGlob(articlesSpec, modules);

export const ARTICLES: Article[] = loaded.items;

/** Development only: the deferred schema check's issues. */
export const ARTICLES_VERIFIED = loaded.verified;

export const ARTICLE_BY_STAGE = new Map(ARTICLES.map((a) => [a.stageId, a]));

export function articleFor(stageId: string): Article | undefined {
  return ARTICLE_BY_STAGE.get(stageId);
}

/** The section of a stage's article that best matches a set of tags. */
export function sectionForTags(stageId: string, tags: readonly string[]): { article: Article; section: ArticleSection } | null {
  const article = ARTICLE_BY_STAGE.get(stageId);
  if (!article || article.sections.length === 0) return null;
  const wanted = new Set(tags.map((t) => t.toLowerCase()));
  let best = article.sections[0];
  let bestScore = 0;
  for (const s of article.sections) {
    const score = s.tags.reduce((n, t) => n + (wanted.has(t.toLowerCase()) ? 1 : 0), 0);
    if (score > bestScore) {
      best = s;
      bestScore = score;
    }
  }
  return { article, section: best };
}

/**
 * The article section that best explains a challenge: the one sharing the
 * most tags with it, else the first section of the stage's article.
 */
export function sectionFor(challenge: Pick<Challenge, 'stageId' | 'tags'>): { article: Article; section: ArticleSection } | null {
  return sectionForTags(challenge.stageId, challenge.tags ?? []);
}

export { articlesSpec } from './spec';
