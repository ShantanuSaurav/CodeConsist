import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowUpRight, Clock, Search } from 'lucide-react';
import { useSession } from '@/platform/session';
import { ROUTES } from '@/config/routes';
import { Badge, EmptyState, PageHeader } from '@/ui';
import { ARTICLES } from '../content';
import '../styles/articles.css';

export const ArticlesIndexPage: React.FC = () => {
  const { stages } = useSession();
  const [query, setQuery] = useState('');
  const articles = ARTICLES.map((article) => ({ article, stage: stages.find((stage) => stage.id === article.stageId) })).filter(({ article, stage }) => stage && `${article.title} ${article.summary} ${stage.name}`.toLowerCase().includes(query.toLowerCase()));
  return <div className="page articles-index">
    <PageHeader eyebrow="THE READING ROOM" title="Build real understanding." description="The ideas behind the code. Thoughtful guides to read at your own pace, then put into practice." aside={<span className="articles-count">{ARTICLES.length} field guides</span>} />
    <label className="articles-search"><Search size={18} aria-hidden="true" /><span className="sr-only">Search articles</span><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Find a concept, language or topic…" /></label>
    <div className="articles-list">
      {articles.map(({ article, stage }, index) => <Link className="article-index-row" to={ROUTES.article(article.stageId)} key={article.stageId}>
        <span className="article-index-number" aria-hidden="true">{String(index + 1).padStart(2, '0')}</span>
        <div className="article-index-main"><span className="eyebrow">{stage!.name}</span><h2>{article.title}</h2><p>{article.summary}</p><div className="article-index-meta"><span><Clock size={13} />{article.readingMinutes} min read</span><span>{article.sections.length} sections</span><Badge tone={stage!.state === 'Completed' ? 'success' : 'neutral'}>{stage!.state}</Badge></div></div>
        <ArrowUpRight className="article-index-arrow" size={24} aria-hidden="true" />
      </Link>)}
      {!articles.length && <EmptyState title="No matching articles" action={<button className="btn btn-secondary" onClick={() => setQuery('')}>Clear search</button>}>Try a different topic or clear your search.</EmptyState>}
    </div>
  </div>;
};
