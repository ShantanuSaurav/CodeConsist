import React, { useEffect } from 'react';
import { Link, Navigate, useLocation, useParams } from 'react-router-dom';
import { ArrowLeft, Clock, Map as MapIcon, Play, Swords } from 'lucide-react';
import { articleFor } from '../data/articles';
import { roadmapsForStage } from '../data/roadmaps';
import { Markdown } from '../lib/markdown';
import { useGame } from '../context/GameContext';
import { stageStatus } from '../services/contentService';

/**
 * The reading for one stage: a table of contents, the article, and the way
 * into the lessons. Deep links (#section-id) scroll to the section, which is
 * how "Read about this topic" in the practice modal and roadmap nodes land.
 */
export const ArticlePage: React.FC = () => {
  const { stageId = '' } = useParams();
  const { hash } = useLocation();
  const { stages, stats, openPractice, openStageTest } = useGame();
  const article = articleFor(stageId);
  const stage = stages.find((s) => s.id === stageId);

  useEffect(() => {
    if (!hash) return;
    const id = decodeURIComponent(hash.slice(1));
    // Content renders synchronously, but give the layout one frame.
    const t = window.setTimeout(() => document.getElementById(id)?.scrollIntoView({ block: 'start' }), 30);
    return () => window.clearTimeout(t);
  }, [hash, stageId]);

  if (!article || !stage) return <Navigate to="/dashboard/learn" replace />;

  const status = stageStatus(stage, stats);
  const locked = stage.state === 'Locked';
  const testPending = stage.state === 'Test pending';
  const related = roadmapsForStage(stageId);

  const cta = () => (testPending ? openStageTest(stage.id) : openPractice(stage.id));

  return (
    <div className="p-6 sm:p-8 max-w-6xl mx-auto">
      <Link
        to="/dashboard/learn"
        className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-900 dark:hover:text-white mb-6"
      >
        <ArrowLeft size={14} /> Learning path
      </Link>

      <div className="grid grid-cols-1 lg:grid-cols-[16rem_1fr] gap-10">
        {/* Table of contents */}
        <aside className="lg:sticky lg:top-8 self-start order-2 lg:order-1">
          <div className="rounded-2xl border border-black/5 dark:border-white/5 bg-gray-50 dark:bg-[#161b22] p-5">
            <div className="text-[10px] font-mono uppercase tracking-wider text-gray-500 mb-3">In this article</div>
            <ol className="space-y-1.5 text-sm">
              {article.sections.map((s, i) => (
                <li key={s.id}>
                  <a
                    href={`#${s.id}`}
                    className={`flex gap-2 text-gray-700 dark:text-gray-300 hover:text-[var(--color-primary)] ${
                      hash === `#${s.id}` ? 'text-[var(--color-primary)] font-semibold' : ''
                    }`}
                  >
                    <span className="font-mono text-xs text-gray-400 w-5 shrink-0 pt-0.5">{String(i + 1).padStart(2, '0')}</span>
                    <span>{s.title}</span>
                  </a>
                </li>
              ))}
            </ol>

            <div className="mt-5 pt-5 border-t border-black/5 dark:border-white/5">
              <button
                type="button"
                onClick={cta}
                disabled={locked}
                className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-[var(--color-primary)] text-white dark:text-black text-sm font-bold hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed"
                title={locked ? 'Finish the earlier stages first' : undefined}
              >
                {testPending ? <Swords size={14} /> : <Play size={14} />}
                {locked
                  ? 'Stage locked'
                  : testPending
                    ? 'Take the stage test'
                    : status.done > 0
                      ? `Continue the lessons (${status.done}/${status.total})`
                      : 'Start the lessons'}
              </button>
            </div>

            {related.length > 0 && (
              <div className="mt-5 pt-5 border-t border-black/5 dark:border-white/5">
                <div className="text-[10px] font-mono uppercase tracking-wider text-gray-500 mb-2">On the roadmaps</div>
                <ul className="space-y-1.5 text-sm">
                  {related.slice(0, 5).map(({ roadmap, node }) => (
                    <li key={roadmap.slug}>
                      <Link
                        to={`/dashboard/roadmap/${roadmap.slug}`}
                        className="inline-flex items-center gap-1.5 text-gray-700 dark:text-gray-300 hover:text-[var(--color-primary)]"
                      >
                        <MapIcon size={13} className="shrink-0" />
                        <span className="truncate">
                          {roadmap.title} · {node.title}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </aside>

        {/* Article */}
        <article className="order-1 lg:order-2 min-w-0">
          <header className="mb-8">
            <div className="flex flex-wrap items-center gap-3 text-xs font-mono text-gray-500 mb-3">
              <span className="text-[var(--color-primary)] uppercase tracking-wider">
                Stage {stage.index} · Reading
              </span>
              <span className="inline-flex items-center gap-1">
                <Clock size={12} /> {article.readingMinutes} min read
              </span>
              <span>{article.sections.length} sections</span>
            </div>
            <h1 className="text-3xl sm:text-4xl font-bold text-gray-900 dark:text-white leading-tight">{article.title}</h1>
            {article.summary && <p className="text-lg text-gray-600 dark:text-gray-400 mt-4">{article.summary}</p>}
          </header>

          {article.sections.map((s) => (
            <section key={s.id} id={s.id} className="scroll-mt-24 mb-10">
              <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-3">{s.title}</h2>
              <Markdown source={s.body} headingOffset={1} />
            </section>
          ))}

          <div className="rounded-2xl border border-[var(--color-primary)]/30 bg-[var(--color-primary)]/5 p-6 flex flex-wrap items-center justify-between gap-4">
            <div>
              <div className="font-bold text-gray-900 dark:text-white">Ready to practise?</div>
              <div className="text-sm text-gray-600 dark:text-gray-400">
                {status.total} lessons{stage.test ? ` and the stage test "${stage.test.title}"` : ''} wait in Stage {stage.index}.
              </div>
            </div>
            <button
              type="button"
              onClick={cta}
              disabled={locked}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-[var(--color-primary)] text-white dark:text-black font-bold hover:brightness-110 disabled:opacity-50"
            >
              {testPending ? <Swords size={16} /> : <Play size={16} />}
              {locked ? 'Stage locked' : testPending ? 'Take the test' : status.done > 0 ? 'Continue' : 'Start'}
            </button>
          </div>
        </article>
      </div>
    </div>
  );
};
