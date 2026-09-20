import React, { useEffect } from 'react';
import { Link, Navigate, useLocation, useParams } from 'react-router-dom';
import { ArrowLeft, Clock, Map as MapIcon, Play } from 'lucide-react';
import { Markdown } from '@/platform/markdown';
import { useSession } from '@/platform/session';
import { stageStatus } from '@/platform/progress';
import { intents } from '@/platform/events';
import { ROUTES } from '@/config/routes';
import { Button } from '@/ui';
import { articleFor } from '../content';

export interface RelatedLink {
  href: string;
  label: string;
}

export interface ArticlePageProps {
  /** Other places that reference this stage (roadmap topics, say) - supplied by the app. */
  relatedFor?: (stageId: string) => RelatedLink[];
}

/**
 * The reading for one stage: a table of contents, the article, and the way
 * into the lessons. Deep links (#section-id) scroll to the section, which is
 * how "Read about this topic" in the practice modal and roadmap nodes land.
 */
export const ArticlePage: React.FC<ArticlePageProps> = ({ relatedFor }) => {
  const { stageId = '' } = useParams();
  const { hash } = useLocation();
  const { stages, stats } = useSession();
  const article = articleFor(stageId);
  const stage = stages.find((s) => s.id === stageId);

  useEffect(() => {
    if (!hash) return;
    const id = decodeURIComponent(hash.slice(1));
    // Content renders synchronously, but give the layout one frame.
    const t = window.setTimeout(() => document.getElementById(id)?.scrollIntoView({ block: 'start' }), 30);
    return () => window.clearTimeout(t);
  }, [hash, stageId]);

  if (!article || !stage) return <Navigate to={ROUTES.learn} replace />;

  const status = stageStatus(stage, stats);
  const locked = stage.state === 'Locked';
  const testPending = stage.state === 'Test pending';
  const related = relatedFor?.(stageId) ?? [];

  const cta = () => (testPending ? intents.openStageTest(stage.id) : intents.openPractice(stage.id));
  const ctaLabel = locked
    ? 'Stage locked'
    : testPending
      ? 'Take the stage test'
      : status.done > 0
        ? `Continue the lessons (${status.done}/${status.total})`
        : 'Start the lessons';

  return (
    <div className="page max-w-6xl">
      <Link to={ROUTES.learn} className="inline-flex items-center gap-1.5 text-sm text-fg-muted hover:text-fg mb-6">
        <ArrowLeft size={14} /> Learning path
      </Link>

      <div className="grid grid-cols-1 lg:grid-cols-[15rem_1fr] gap-10 lg:gap-14">
        {/* Table of contents */}
        <aside className="lg:sticky lg:top-8 self-start order-2 lg:order-1 min-w-0 lg:max-h-[calc(100vh-4rem)] lg:overflow-y-auto scroll-thin">
          <div className="eyebrow">In this article</div>
          <ol className="border-l border-border">
            {article.sections.map((s, i) => {
              const active = hash === `#${s.id}`;
              return (
                <li key={s.id}>
                  <a
                    href={`#${s.id}`}
                    className={`flex gap-2 py-1.5 pl-3 -ml-px border-l text-sm ${
                      active ? 'border-accent text-fg font-medium' : 'border-transparent text-fg-secondary hover:text-fg'
                    }`}
                  >
                    <span className="font-mono text-xs text-fg-muted w-5 shrink-0 pt-0.5">{String(i + 1).padStart(2, '0')}</span>
                    <span>{s.title}</span>
                  </a>
                </li>
              );
            })}
          </ol>

          <div className="mt-6 pt-5 border-t border-border-subtle">
            <Button variant="primary" block onClick={cta} disabled={locked} title={locked ? 'Finish the earlier stages first' : undefined}>
              <Play size={13} />
              {ctaLabel}
            </Button>
          </div>

          {related.length > 0 && (
            <div className="mt-6 pt-5 border-t border-border-subtle">
              <div className="eyebrow">On the roadmaps</div>
              <ul className="space-y-1.5 text-sm">
                {related.slice(0, 5).map((link) => (
                  <li key={link.href}>
                    <Link to={link.href} className="flex w-full min-w-0 items-center gap-1.5 text-fg-secondary hover:text-fg" title={link.label}>
                      <MapIcon size={13} className="shrink-0 text-fg-muted" />
                      <span className="truncate min-w-0">{link.label}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </aside>

        {/* Article */}
        <article className="order-1 lg:order-2 min-w-0 max-w-[68ch]">
          <header className="mb-10">
            <div className="flex flex-wrap items-center gap-3 text-xs font-mono text-fg-muted mb-3">
              <span className="uppercase tracking-wider">Stage {String(stage.index).padStart(2, '0')} · Reading</span>
              <span className="inline-flex items-center gap-1">
                <Clock size={12} /> {article.readingMinutes} min
              </span>
              <span>{article.sections.length} sections</span>
            </div>
            <h1 className="text-[1.75rem] sm:text-[2rem] font-semibold tracking-tight text-fg leading-tight">{article.title}</h1>
            {article.summary && <p className="text-lg text-fg-secondary mt-4 leading-relaxed">{article.summary}</p>}
          </header>

          {article.sections.map((s) => (
            <section key={s.id} id={s.id} className="scroll-mt-24 mb-12">
              <h2 className="text-xl font-semibold tracking-tight text-fg mb-4">{s.title}</h2>
              <Markdown source={s.body} headingOffset={1} />
            </section>
          ))}

          <div className="border-t border-border pt-6 flex flex-wrap items-center justify-between gap-4">
            <div>
              <div className="font-medium text-fg">Ready to practise?</div>
              <div className="text-sm text-fg-secondary mt-0.5">
                {status.total} lessons{stage.test ? ` and the stage test "${stage.test.title}"` : ''} wait in Stage{' '}
                {String(stage.index).padStart(2, '0')}.
              </div>
            </div>
            <Button variant="primary" onClick={cta} disabled={locked}>
              <Play size={13} />
              {locked ? 'Stage locked' : testPending ? 'Take the test' : status.done > 0 ? 'Continue' : 'Start'}
            </Button>
          </div>
        </article>
      </div>
    </div>
  );
};
