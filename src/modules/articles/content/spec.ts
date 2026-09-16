import type { Article } from '@/types';
import type { ContentSpec } from '@/platform/content-registry';
import { ArticleSchema } from '../schema';
import { parseArticle } from '../parse';

/** One Markdown file per stage. The stage comes from the marker under the title. */
export const articlesSpec: ContentSpec<Article> = {
  kind: 'articles',
  dir: 'modules/articles/content',
  extensions: ['.md'],
  shape: 'text',
  parse: parseArticle,
  schema: ArticleSchema,
  idOf: (a) => a.stageId,
  compare: (a, b) => Number(a.item.stageId.slice(6)) - Number(b.item.stageId.slice(6))
};
