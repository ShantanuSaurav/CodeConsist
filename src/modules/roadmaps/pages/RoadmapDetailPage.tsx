import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  BookOpen,
  Check,
  ChevronRight,
  CircleDashed,
  ExternalLink,
  FileText,
  GraduationCap,
  Map as MapIcon,
  Play,
  SkipForward,
  Swords,
  Video,
  X
} from 'lucide-react';
import '../styles/roadmap.css';
import { ROADMAP_BY_SLUG, roadmapNodeIds } from '../content';
import { useRoadmapProgress, summarise } from '../services/progress';
import { useFocusTrap } from '@/ui';
import { useSession } from '@/platform/session';
import { intents } from '@/platform/events';
import { ROUTES } from '@/config/routes';
import type { ReadingResolver, ResourceKind, RoadmapNode, RoadmapNodeStatus, RoadmapSection } from '@/types';

export interface RoadmapDetailPageProps {
  /** Reading for a topic's stage and tags, supplied by the app. */
  readingFor?: ReadingResolver;
}

const KIND_LABEL: Record<ResourceKind, string> = {
  docs: 'Official docs',
  article: 'Article',
  video: 'Video',
  course: 'Course',
  roadmap: 'roadmap.sh',
  practice: 'Practice',
  book: 'Book'
};

const KIND_ICON: Record<ResourceKind, React.ReactNode> = {
  docs: <FileText size={14} />,
  article: <FileText size={14} />,
  video: <Video size={14} />,
  course: <GraduationCap size={14} />,
  roadmap: <MapIcon size={14} />,
  practice: <Play size={14} />,
  book: <BookOpen size={14} />
};

const STATUS_LABEL: Record<RoadmapNodeStatus, string> = {
  pending: 'Pending',
  learning: 'Learning',
  done: 'Done',
  skipped: 'Skipped'
};

type StatusFilter = RoadmapNodeStatus | 'all';

/* ------------------------------------------------------------------ topic */

/**
 * One topic as a full-width row on the rail: status marker, title, the
 * "practised in Devlingo" mark, status pill and a chevron into the drawer.
 */
const TopicRow: React.FC<{
  node: RoadmapNode;
  status: RoadmapNodeStatus;
  active: boolean;
  onClick: () => void;
}> = ({ node, status, active, onClick }) => (
  <li>
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`rm-topic rm-topic-${status} ${active ? 'is-active' : ''} ${node.optional ? 'is-optional' : ''}`.trim()}
    >
      <span className="rm-topic-marker" aria-hidden="true">
        {status === 'done' ? <Check size={12} strokeWidth={3} /> : status === 'learning' ? <CircleDashed size={12} /> : status === 'skipped' ? <SkipForward size={11} /> : null}
      </span>
      <span className="rm-topic-body">
        <span className="rm-topic-title">{node.title}</span>
        {node.optional && <span className="rm-topic-optional">optional</span>}
      </span>
      {node.stageId && (
        <span className="rm-topic-devlingo" title="Practised in Devlingo" aria-label="Practised in Devlingo">
          <Swords size={12} />
        </span>
      )}
      <span className={`rm-topic-status is-${status}`}>{STATUS_LABEL[status]}</span>
      <ChevronRight size={16} className="rm-topic-chevron" aria-hidden="true" />
    </button>
  </li>
);

/* --------------------------------------------------------------- section */

/** A section is one node on the rail; its topics hang below it as rows. */
const SectionBlock: React.FC<{
  section: RoadmapSection;
  index: number;
  statuses: Record<string, RoadmapNodeStatus>;
  filter: StatusFilter;
  activeId: string | null;
  onSelect: (node: RoadmapNode) => void;
}> = ({ section, index, statuses, filter, activeId, onSelect }) => {
  const statusOf = (n: RoadmapNode) => statuses[n.id] ?? 'pending';
  const done = section.nodes.filter((n) => statusOf(n) === 'done').length;
  const visible = filter === 'all' ? section.nodes : section.nodes.filter((n) => statusOf(n) === filter);
  const complete = done === section.nodes.length && section.nodes.length > 0;
  if (visible.length === 0) return null;

  return (
    <li className="rm-section">
      <div className="rm-section-head">
        <span className={`rm-section-marker ${complete ? 'is-complete' : done > 0 ? 'is-started' : ''}`.trim()} aria-hidden="true">
          {complete ? <Check size={16} strokeWidth={3} /> : String(index + 1).padStart(2, '0')}
        </span>
        <div className="rm-section-body">
          <div className="rm-section-title-row">
            <h2 className="rm-section-title">{section.title}</h2>
            <span className="rm-section-count">
              {done}/{section.nodes.length} done
            </span>
          </div>
          {section.description && <p className="rm-section-desc">{section.description}</p>}
          <span className="rm-section-progress">
            <span className="rm-section-progress-fill" style={{ width: `${section.nodes.length ? Math.round((done / section.nodes.length) * 100) : 0}%` }} />
          </span>
        </div>
      </div>
      <ul className="rm-topics">
        {visible.map((n) => (
          <TopicRow key={n.id} node={n} status={statusOf(n)} active={activeId === n.id} onClick={() => onSelect(n)} />
        ))}
      </ul>
    </li>
  );
};

/* ---------------------------------------------------------------- drawer */

const STATUS_OPTIONS: { value: RoadmapNodeStatus; label: string; icon: React.ReactNode }[] = [
  { value: 'pending', label: 'Pending', icon: <CircleDashed size={14} /> },
  { value: 'learning', label: 'Learning', icon: <BookOpen size={14} /> },
  { value: 'done', label: 'Done', icon: <Check size={14} /> },
  { value: 'skipped', label: 'Skip', icon: <SkipForward size={14} /> }
];

const NodeDrawer: React.FC<{
  node: RoadmapNode;
  status: RoadmapNodeStatus;
  onStatus: (s: RoadmapNodeStatus) => void;
  onClose: () => void;
  readingFor?: ReadingResolver;
}> = ({ node, status, onStatus, onClose, readingFor }) => {
  const { stages } = useSession();
  const ref = useRef<HTMLDivElement>(null);
  useFocusTrap(ref, true);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const stage = node.stageId ? stages.find((s) => s.id === node.stageId) : undefined;
  const reading = useMemo(
    () => (node.stageId ? readingFor?.(node.stageId, node.tags) ?? null : null),
    [node.stageId, node.tags, readingFor]
  );

  const stageLocked = stage ? stage.state === 'Locked' : false;

  return (
    <div className="fixed inset-0 z-[450]" role="presentation">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px]" onClick={onClose} />
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label={node.title}
        tabIndex={-1}
        className="absolute right-0 top-0 h-full w-full sm:w-[28rem] bg-white dark:bg-[#0d1117] border-l border-black/10 dark:border-white/10 shadow-2xl overflow-y-auto outline-none"
      >
        <div className="sticky top-0 z-10 bg-white/95 dark:bg-[#0d1117]/95 backdrop-blur px-6 py-4 border-b border-black/5 dark:border-white/5 flex items-start justify-between gap-3">
          <div>
            <div className="text-[10px] font-mono uppercase tracking-wider text-gray-500 mb-1">
              Topic{node.optional ? ' · optional' : ''}
            </div>
            <h2 className="text-xl font-bold text-gray-900 dark:text-white leading-snug">{node.title}</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-gray-500 hover:text-gray-900 dark:hover:text-white hover:bg-black/5 dark:hover:bg-white/5"
            aria-label="Close"
          >
            <X size={20} />
          </button>
        </div>

        <div className="px-6 py-5 space-y-6">
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Status">
            {STATUS_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => onStatus(opt.value)}
                aria-pressed={status === opt.value}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition ${
                  status === opt.value
                    ? opt.value === 'done'
                      ? 'bg-[var(--color-primary)] text-white dark:text-black border-transparent'
                      : opt.value === 'learning'
                        ? 'bg-[var(--color-secondary)] text-white dark:text-black border-transparent'
                        : 'bg-gray-800 text-white dark:bg-white dark:text-black border-transparent'
                    : 'border-black/10 dark:border-white/15 text-gray-700 dark:text-gray-300 hover:bg-black/5 dark:hover:bg-white/5'
                }`}
              >
                {opt.icon}
                {opt.label}
              </button>
            ))}
          </div>

          <p className="text-[15px] leading-relaxed text-gray-700 dark:text-gray-300">{node.description}</p>

          {stage && (
            <div className="rounded-xl border border-[var(--color-primary)]/30 bg-[var(--color-primary)]/5 p-4">
              <div className="text-[10px] font-mono uppercase tracking-wider text-[var(--color-primary)] mb-2">
                Practise this on Devlingo
              </div>
              <div className="font-semibold text-gray-900 dark:text-white">
                Stage {stage.index} · {stage.name}
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={stageLocked}
                  onClick={() => {
                    onClose();
                    intents.openPractice(stage.id);
                  }}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-[var(--color-primary)] text-white dark:text-black text-sm font-bold hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed"
                  title={stageLocked ? 'Finish the earlier stages to unlock this one' : undefined}
                >
                  <Play size={14} /> {stageLocked ? 'Stage locked' : 'Start the lessons'}
                </button>
                {reading && (
                  <Link
                    to={reading.href}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-black/10 dark:border-white/15 text-sm font-medium text-gray-800 dark:text-gray-100 hover:bg-black/5 dark:hover:bg-white/5"
                  >
                    <BookOpen size={14} /> {reading.label}
                  </Link>
                )}
              </div>
            </div>
          )}

          <div>
            <h3 className="text-xs font-mono uppercase tracking-wider text-gray-500 mb-3">Free resources</h3>
            <ul className="space-y-2">
              {node.resources.map((r) => {
                const internal = r.url.startsWith('/');
                const inner = (
                  <>
                    <span
                      className={`inline-flex items-center gap-1 shrink-0 text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded ${
                        r.kind === 'roadmap'
                          ? 'bg-[#ffe066]/60 dark:bg-[#5a4d12] text-gray-900 dark:text-[#fff1b8]'
                          : r.kind === 'docs'
                            ? 'bg-[var(--color-secondary)]/10 text-[var(--color-secondary)]'
                            : r.kind === 'practice'
                              ? 'bg-[var(--color-primary)]/10 text-[var(--color-primary)]'
                              : 'bg-black/5 dark:bg-white/10 text-gray-600 dark:text-gray-300'
                      }`}
                    >
                      {KIND_ICON[r.kind]} {KIND_LABEL[r.kind]}
                    </span>
                    <span className="flex-1 text-sm text-gray-800 dark:text-gray-200 group-hover:underline underline-offset-2">{r.title}</span>
                    {!internal && <ExternalLink size={13} className="text-gray-400 shrink-0 mt-1" />}
                  </>
                );
                const cls =
                  'group flex items-start gap-2.5 rounded-lg border border-black/5 dark:border-white/5 bg-gray-50 dark:bg-[#161b22] px-3 py-2.5 hover:border-black/15 dark:hover:border-white/15 transition';
                return (
                  <li key={r.url + r.title}>
                    {internal ? (
                      <Link to={r.url} className={cls} onClick={onClose}>
                        {inner}
                      </Link>
                    ) : (
                      <a href={r.url} target="_blank" rel="noreferrer" className={cls}>
                        {inner}
                      </a>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
};

/* ------------------------------------------------------------------ page */

export const RoadmapDetailPage: React.FC<RoadmapDetailPageProps> = ({ readingFor }) => {
  const { slug = '' } = useParams();
  const roadmap = ROADMAP_BY_SLUG.get(slug);
  const { statuses, set } = useRoadmapProgress(slug);
  const [active, setActive] = useState<RoadmapNode | null>(null);
  const [filter, setFilter] = useState<StatusFilter>('all');

  useEffect(() => {
    setActive(null);
    setFilter('all');
  }, [slug]);

  if (!roadmap) return <Navigate to={ROUTES.roadmaps} replace />;

  const summary = summarise(roadmap, statuses);
  const total = roadmapNodeIds(roadmap).length;

  return (
    <div className="p-6 sm:p-8 max-w-4xl mx-auto">
      <Link
        to={ROUTES.roadmaps}
        className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-900 dark:hover:text-white mb-6"
      >
        <ArrowLeft size={14} /> All roadmaps
      </Link>

      <header className="flex flex-wrap items-end justify-between gap-6 mb-4">
        <div className="max-w-2xl">
          <div className="text-xs font-mono uppercase tracking-wider text-[var(--color-primary)] mb-2">
            {roadmap.kind === 'role' ? 'Role-based roadmap' : 'Skill-based roadmap'}
          </div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white flex items-center gap-3">
            <span aria-hidden="true">{roadmap.icon}</span>
            {roadmap.title}
          </h1>
          <p className="text-gray-600 dark:text-gray-400 mt-2">{roadmap.description}</p>
        </div>

        <div className="w-full sm:w-72 rounded-2xl border border-black/5 dark:border-white/5 bg-gray-50 dark:bg-[#161b22] p-4">
          <div className="flex justify-between text-sm mb-2">
            <span className="text-gray-600 dark:text-gray-400">Your progress</span>
            <span className="font-mono font-bold text-[var(--color-primary)]">{summary.percent}%</span>
          </div>
          <div className="h-2 w-full bg-black/5 dark:bg-white/10 rounded-full overflow-hidden">
            <div className="h-full bg-[var(--color-primary)] transition-all" style={{ width: `${summary.percent}%` }} />
          </div>
          <div className="flex flex-wrap gap-x-3 gap-y-1 mt-3 text-[11px] font-mono text-gray-500">
            <span>{summary.done} done</span>
            <span>{summary.learning} learning</span>
            <span>{summary.skipped} skipped</span>
            <span>{total} total</span>
          </div>
        </div>
      </header>

      {/* The legend is the filter: click a status to show only those topics. */}
      <div className="rm-filter" role="group" aria-label="Show topics by status">
        {(
          [
            ['all', 'All topics', total],
            ['pending', 'Pending', total - summary.done - summary.learning - summary.skipped],
            ['learning', 'Learning', summary.learning],
            ['done', 'Done', summary.done],
            ['skipped', 'Skipped', summary.skipped]
          ] as Array<[StatusFilter, string, number]>
        ).map(([value, label, count]) => (
          <button
            key={value}
            type="button"
            onClick={() => setFilter(value)}
            aria-pressed={filter === value}
            className={`rm-filter-btn is-${value} ${filter === value ? 'is-active' : ''}`.trim()}
          >
            <span className="rm-filter-dot" aria-hidden="true" />
            {label}
            <span className="rm-filter-count">{count}</span>
          </button>
        ))}
        <span className="rm-filter-hint">
          <Swords size={12} className="text-[var(--color-primary)]" /> practised in Devlingo
        </span>
      </div>

      <div className="rm-wrap">
        <div className="rm-rail" aria-hidden="true">
          <span className="rm-rail-fill" style={{ height: `${summary.percent}%` }} />
        </div>
        <ol className="rm-sections">
          {roadmap.sections.map((section, i) => (
            <SectionBlock
              key={section.id}
              section={section}
              index={i}
              statuses={statuses}
              filter={filter}
              activeId={active?.id ?? null}
              onSelect={setActive}
            />
          ))}
        </ol>
        {filter !== 'all' && roadmap.sections.every((sec) => sec.nodes.every((n) => (statuses[n.id] ?? 'pending') !== filter)) && (
          <p className="rm-empty">No {STATUS_LABEL[filter].toLowerCase()} topics yet.</p>
        )}
      </div>

      {active && (
        <NodeDrawer
          node={active}
          status={statuses[active.id] ?? 'pending'}
          onStatus={(s) => set(active.id, s)}
          onClose={() => setActive(null)}
          readingFor={readingFor}
        />
      )}
    </div>
  );
};
