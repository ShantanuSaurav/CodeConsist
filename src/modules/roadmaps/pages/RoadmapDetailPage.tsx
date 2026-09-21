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
import { Badge, Button, ButtonLink, ProgressBar, useFocusTrap } from '@/ui';
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
 * "practised in CodeConsist" mark, status pill and a chevron into the drawer.
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
        <span className="rm-topic-devlingo" title="Practised in CodeConsist" aria-label="Practised in CodeConsist">
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
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label={node.title}
        tabIndex={-1}
        className="absolute right-0 top-0 h-full w-full sm:w-[28rem] bg-surface border-l border-border shadow-dialog overflow-y-auto outline-none"
      >
        <div className="sticky top-0 z-10 bg-surface px-6 py-4 border-b border-border flex items-start justify-between gap-3">
          <div>
            <div className="eyebrow !mb-1">Topic{node.optional ? ' · optional' : ''}</div>
            <h2 className="text-lg font-semibold text-fg leading-snug tracking-tight">{node.title}</h2>
          </div>
          <Button variant="ghost" size="sm" icon onClick={onClose} aria-label="Close">
            <X size={16} />
          </Button>
        </div>

        <div className="px-6 py-5 space-y-6">
          <div className="segmented" role="group" aria-label="Status">
            {STATUS_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => onStatus(opt.value)}
                aria-pressed={status === opt.value}
                className={`segmented-option ${status === opt.value ? 'is-active' : ''}`.trim()}
              >
                {opt.icon}
                {opt.label}
              </button>
            ))}
          </div>

          <p className="text-[0.9375rem] leading-relaxed text-fg-secondary">{node.description}</p>

          {stage && (
            <div className="border-t border-b border-border-subtle py-4">
              <div className="eyebrow">Practise this on CodeConsist</div>
              <div className="text-sm font-medium text-fg">
                Stage {String(stage.index).padStart(2, '0')} · {stage.name}
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button
                  variant="primary"
                  size="sm"
                  disabled={stageLocked}
                  onClick={() => {
                    onClose();
                    intents.openPractice(stage.id);
                  }}
                  title={stageLocked ? 'Finish the earlier stages to unlock this one' : undefined}
                >
                  <Play size={13} /> {stageLocked ? 'Stage locked' : 'Start the lessons'}
                </Button>
                {reading && (
                  <ButtonLink to={reading.href} size="sm" variant="secondary">
                    <BookOpen size={13} /> {reading.label}
                  </ButtonLink>
                )}
              </div>
            </div>
          )}

          <div>
            <h3 className="eyebrow">Free resources</h3>
            <ul className="border-t border-border-subtle">
              {node.resources.map((r) => {
                const internal = r.url.startsWith('/');
                const inner = (
                  <>
                    <Badge className="shrink-0 mt-0.5" tone={r.kind === 'practice' ? 'accent' : 'neutral'}>
                      {KIND_ICON[r.kind]} {KIND_LABEL[r.kind]}
                    </Badge>
                    <span className="flex-1 text-sm text-fg group-hover:underline underline-offset-2">{r.title}</span>
                    {!internal && <ExternalLink size={13} className="text-fg-muted shrink-0 mt-1" />}
                  </>
                );
                const cls = 'group flex items-start gap-2.5 py-2.5 -mx-2 px-2 rounded-xs hover:bg-surface-2 transition-colors';
                return (
                  <li key={r.url + r.title} className="border-b border-border-subtle">
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
    <div className="page max-w-4xl">
      <Link to={ROUTES.roadmaps} className="inline-flex items-center gap-1.5 text-sm text-fg-muted hover:text-fg mb-6">
        <ArrowLeft size={14} /> All roadmaps
      </Link>

      <header className="flex flex-wrap items-end justify-between gap-6 pb-6 mb-6 border-b border-border-subtle">
        <div className="flex-1 max-w-2xl min-w-[16rem]">
          <div className="eyebrow">{roadmap.kind === 'role' ? 'Role-based roadmap' : 'Skill-based roadmap'}</div>
          <h1 className="text-[1.75rem] leading-tight font-semibold tracking-tight text-fg">{roadmap.title}</h1>
          <p className="text-fg-secondary mt-2 text-[0.9375rem] leading-relaxed">{roadmap.description}</p>
        </div>

        <div className="w-full sm:w-64">
          <div className="flex justify-between items-baseline mb-2">
            <span className="text-xs text-fg-muted">Your progress</span>
            <span className="font-mono text-sm font-medium text-fg tabular-nums">{summary.percent}%</span>
          </div>
          <ProgressBar value={summary.percent} label={`${summary.done} of ${total} topics done`} />
          <div className="flex flex-wrap gap-x-3 gap-y-1 mt-2 text-[11px] font-mono text-fg-muted">
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
          <Swords size={12} className="text-accent" /> practised in CodeConsist
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
