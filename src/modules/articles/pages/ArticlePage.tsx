import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, Navigate, useLocation, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Clock, Map as MapIcon, Play } from 'lucide-react';
import { Markdown } from '@/platform/markdown';
import { useSession } from '@/platform/session';
import { stageStatus } from '@/platform/progress';
import { intents } from '@/platform/events';
import { ROUTES } from '@/config/routes';
import { Button, useSlidingIndicator } from '@/ui';
import { articleFor } from '../content';
import '../styles/article.css';

export interface RelatedLink {
  href: string;
  label: string;
}

export interface ArticlePageProps {
  /** Other places that reference this stage (roadmap topics, say) - supplied by the app. */
  relatedFor?: (stageId: string) => RelatedLink[];
}

/** The reading line, in px from the viewport top: just below the sections' scroll margin (scroll-mt-24). */
const READING_LINE = 120;

/**
 * Which section is being read: the last one whose top has crossed the
 * reading line. At the very bottom of the page the last section wins, since
 * a short closing section can never scroll up that far.
 *
 * `hold(id)` pins an entry while a jump to it scrolls the page, so the table
 * of contents goes straight there instead of ticking through every section
 * on the way. The pin lets go once the page has been still for a moment.
 */
function useActiveSection(ids: string[]): { activeId: string | null; hold: (id: string) => void } {
  const [activeId, setActiveId] = useState<string | null>(ids[0] ?? null);
  const held = useRef(false);
  const settle = useRef(0);

  const release = useCallback((ms: number) => {
    window.clearTimeout(settle.current);
    settle.current = window.setTimeout(() => {
      held.current = false;
    }, ms);
  }, []);

  const hold = useCallback(
    (id: string) => {
      held.current = true;
      setActiveId(id);
      release(300);
    },
    [release]
  );

  useEffect(() => {
    let frame = 0;
    const measure = () => {
      frame = 0;
      let current = ids[0] ?? null;
      for (const id of ids) {
        const el = document.getElementById(id);
        if (el && el.getBoundingClientRect().top <= READING_LINE) current = id;
      }
      if (ids.length && window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4) {
        current = ids[ids.length - 1];
      }
      setActiveId(current);
    };
    const onScroll = () => {
      // Mid-jump: keep the pinned entry, and push the release back while the page still moves.
      if (held.current) release(150);
      else if (!frame) frame = requestAnimationFrame(measure);
    };
    measure();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
    };
  }, [ids, release]);

  return { activeId, hold };
}

/**
 * The reading for one stage: a table of contents, the article, and the way
 * into the lessons. Deep links (#section-id) land on the section, which is
 * how "Read about this topic" in the practice modal and roadmap nodes land.
 *
 * The contents follow the reader: one accent bar glides to the section in
 * view. Picking an entry scrolls there smoothly (instantly under reduced
 * motion); arriving by a link jumps straight there, like any navigation.
 */
export const ArticlePage: React.FC<ArticlePageProps> = ({ relatedFor }) => {
  const { stageId = '' } = useParams();
  const { hash, key } = useLocation();
  const navigate = useNavigate();
  const { stages, stats } = useSession();
  const article = articleFor(stageId);
  const stage = stages.find((s) => s.id === stageId);

  const ids = useMemo(() => article?.sections.map((s) => s.id) ?? [], [article]);
  const { activeId, hold } = useActiveSection(ids);
  const tocRef = useRef<HTMLDivElement>(null);
  const barRef = useRef<HTMLSpanElement>(null);
  useSlidingIndicator(tocRef, barRef, '.toc-link.is-active', 'y', activeId);

  // The contents' own jumps have already scrolled; this skips the hash
  // change they cause. Everything else (a link from elsewhere, Back) jumps.
  const jumped = useRef<string | null>(null);
  useEffect(() => {
    if (!hash) return;
    const id = decodeURIComponent(hash.slice(1));
    if (jumped.current === id) {
      jumped.current = null;
      return;
    }
    // Content renders synchronously, but give the layout one frame.
    const t = window.setTimeout(() => {
      const el = document.getElementById(id);
      if (!el) return;
      if (ids.includes(id)) hold(id);
      el.scrollIntoView({ block: 'start', behavior: 'instant' });
    }, 30);
    return () => window.clearTimeout(t);
  }, [hash, key, stageId, ids, hold]);

  if (!article || !stage) return <Navigate to={ROUTES.learn} replace />;

  const jumpTo = (event: React.MouseEvent<HTMLAnchorElement>, id: string) => {
    // New-tab and other modified clicks keep the browser's behaviour.
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const el = document.getElementById(id);
    if (!el) return;
    event.preventDefault();
    hold(id);
    // Smooth via the page's scroll-behavior; tokens.css makes it instant under reduced motion.
    el.scrollIntoView({ block: 'start' });
    if (hash !== `#${id}`) {
      jumped.current = id;
      navigate({ hash: `#${id}` });
    }
  };

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
      <Link to={ROUTES.learn} className="article-back mb-6">
        <ArrowLeft size={14} aria-hidden="true" /> Learning path
      </Link>

      <div className="grid grid-cols-1 lg:grid-cols-[15rem_1fr] gap-10 lg:gap-14">
        {/* Table of contents */}
        <aside className="lg:sticky lg:top-8 self-start order-2 lg:order-1 min-w-0 lg:max-h-[calc(100vh-4rem)] lg:overflow-y-auto scroll-thin">
          <div id="toc-heading" className="eyebrow">
            In this article
          </div>
          <nav aria-labelledby="toc-heading">
            <div ref={tocRef} className="toc">
              <span ref={barRef} className="toc-indicator" aria-hidden="true" />
              <ol className="toc-list">
                {article.sections.map((s, i) => {
                  const active = activeId === s.id;
                  return (
                    <li key={s.id}>
                      <a
                        href={`#${s.id}`}
                        onClick={(e) => jumpTo(e, s.id)}
                        aria-current={active ? 'location' : undefined}
                        className={`toc-link ${active ? 'is-active' : ''}`.trim()}
                      >
                        <span className="toc-num">{String(i + 1).padStart(2, '0')}</span>
                        <span>{s.title}</span>
                      </a>
                    </li>
                  );
                })}
              </ol>
            </div>
          </nav>

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
                    <Link to={link.href} className="article-related" title={link.label}>
                      <MapIcon size={13} className="shrink-0" aria-hidden="true" />
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
            <div className="flex flex-wrap items-center gap-3 text-xs font-mono text-fg-muted mb-3 tabular-nums">
              <span className="uppercase tracking-wider">Stage {String(stage.index).padStart(2, '0')} · Reading</span>
              <span className="inline-flex items-center gap-1">
                <Clock size={12} aria-hidden="true" /> {article.readingMinutes} min
              </span>
              <span>{article.sections.length} sections</span>
            </div>
            <h1 className="text-[1.75rem] sm:text-[2rem] font-semibold tracking-tight text-fg leading-tight text-balance">{article.title}</h1>
            {article.summary && <p className="text-lg text-fg-secondary mt-4 leading-relaxed text-pretty">{article.summary}</p>}
          </header>

          {article.sections.map((s) => (
            <section key={s.id} id={s.id} className="scroll-mt-24 mb-12">
              <h2 className="text-xl font-semibold tracking-tight text-fg mb-4 text-balance">{s.title}</h2>
              <Markdown source={s.body} headingOffset={1} className="article-prose" />
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
