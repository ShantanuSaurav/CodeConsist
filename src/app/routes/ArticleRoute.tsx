import React from 'react';
import { ArticlePage } from '@/modules/articles';
import { roadmapLinksForStage } from '@/modules/roadmaps';

/** A stage's article, with the roadmaps module supplying the "also on the roadmaps" links. */
export const ArticleRoute: React.FC = () => <ArticlePage relatedFor={roadmapLinksForStage} />;
