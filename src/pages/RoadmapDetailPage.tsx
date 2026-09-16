import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  BookOpen,
  Check,
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
import { ROADMAP_BY_SLUG, roadmapNodeIds } from '../data/roadmaps';
import { useRoadmapProgress, summarise } from '../lib/roadmapProgress';
import { useFocusTrap } from '../lib/useFocusTrap';
import { useGame } from '../context/GameContext';
import { articleFor } from '../data/articles';
import type { ResourceKind, RoadmapNode, RoadmapNodeStatus, RoadmapSection } from '../types';

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

const STATUS_STYLE: Record<RoadmapNodeStatus, string> = {
  pending: 'bg-[#fff4c2] dark:bg-[#3a3416] border-[#e6c95a] dark:border-[#7a6a1f] text-gray-900 dark:text-[#f5e7a0]',
  learning: 'bg-[var(--color-secondary)]/10 border-[var(--color-secondary)] text-gray-900 dark:text-white',
  done: 'bg-[var(--color-primary)]/15 border-[var(--color-primary)] text-gray-900 dark:text-white',
  skipped: 'bg-black/5 dark:bg-white/5 border-black/10 dark:border-white/10 text-gray-400 line-through'
};

/* ------------------------------------------------------------------ node */

const NodeButton: React.FC<{
  node: RoadmapNode;
  status: RoadmapNodeStatus;
  active: boolean;
  onClick: () => void;
}> = ({ node, status, active, onClick }) => (
  <button
    type="button"
    onClick={onClick}
    aria-pressed={active}
    className={`relative w-full text-left px-3.5 py-2.5 rounded-lg border-2 text-sm font-semibold shadow-sm transition hover:-translate-y-0.5 hover:shadow-md ${
      STATUS_STYLE[status]
    } ${active ? 'ring-2 ring-offset-2 ring-[var(--color-primary)] ring-offset-white dark:ring-offset-[#0d1117]' : ''} ${
      node.optional && status === 'pending' ? 'border-dashed' : ''
    }`}
  >
    <span className="flex items-center gap-2">
      {status === 'done' && <Check size={14} className="text-[var(--color-primary)] shrink-0" />}
      {status === 'learning' && <CircleDashed size={14} className="text-[var(--color-secondary)] shrink-0" />}
      <span className="truncate">{node.title}</span>
      {node.stageId && (
        <span
          className="ml-auto shrink-0 text-[var(--color-primary)]"
          title="Practised in Devlingo"
          aria-label="Practised in Devlingo"
        >
          <Swords size={12} />
        </span>
      )}
    </span>
  </button>
);

/* --------------------------------------------------------------- section */

const SectionBlock: React.FC<{
  section: RoadmapSection;
  index: number;
  statuses: Record<string, RoadmapNodeStatus>;
  activeId: string | null;
  onSelect: (node: RoadmapNode) => void;
}> = ({ section, index, statuses, activeId, onSelect }) => {
  const left = index % 2 === 0;
  const done = section.nodes.filter((n) => statuses[n.id] === 'done').length;

  return (
    <li className="relative">
      {/* Spine segment */}
      <div className="absolute left-1/2 -translate-x-1/2 top-0 bottom-0 w-1 bg-[#6a7ea8]/60 dark:bg-[#8fa3cf]/50 hidden md:block" aria-hidden="true" />

      <div className={`relative md:grid md:grid-cols-[1fr_16rem_1fr] md:gap-0 items-start py-6`}>
        {/* Left column */}
        <div className={`hidden md:flex flex-col gap-2 pr-10 ${left ? '' : 'invisible'}`}>
          {left && section.nodes.map((n) => (
            <div key={n.id} className="relative">
              <NodeButton node={n} status={statuses[n.id] ?? 'pending'} active={activeId === n.id} onClick={() => onSelect(n)} />
              <span className="absolute top-1/2 -right-10 w-10 border-t-2 border-dotted border-[#6a7ea8]/70 dark:border-[#8fa3cf]/60" aria-hidden="true" />
            </div>
          ))}
        </div>

        {/* Center topic */}
        <div className="relative z-10 flex flex-col items-center">
          <div className="w-full rounded-xl border-2 border-[#3b4a6b] dark:border-[#8fa3cf] bg-[#ffe066] dark:bg-[#5a4d12] text-gray-900 dark:text-[#fff1b8] px-4 py-3 shadow-md text-center">
            <div className="text-[10px] font-mono uppercase tracking-wider opacity-70">Section {String(index + 1).padStart(2, '0')}</div>
            <div className="font-bold leading-snug">{section.title}</div>
            <div className="text-[11px] font-mono mt-1 opacity-80">
              {done}/{section.nodes.length} done
            </div>
          </div>
          {section.description && (
            <p className="mt-3 text-xs text-center text-gray-500 dark:text-gray-400 max-w-[16rem]">{section.description}</p>
          )}

          {/* Mobile: nodes under the topic */}
          <div className="md:hidden mt-4 w-full flex flex-col gap-2">
            {section.nodes.map((n) => (
              <NodeButton key={n.id} node={n} status={statuses[n.id] ?? 'pending'} active={activeId === n.id} onClick={() => onSelect(n)} />
            ))}
          </div>
        </div>

        {/* Right column */}
        <div className={`hidden md:flex flex-col gap-2 pl-10 ${left ? 'invisible' : ''}`}>
          {!left && section.nodes.map((n) => (
            <div key={n.id} className="relative">
              <span className="absolute top-1/2 -left-10 w-10 border-t-2 border-dotted border-[#6a7ea8]/70 dark:border-[#8fa3cf]/60" aria-hidden="true" />
              <NodeButton node={n} status={statuses[n.id] ?? 'pending'} active={activeId === n.id} onClick={() => onSelect(n)} />
            </div>
          ))}
        </div>
      </div>
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
}> = ({ node, status, onStatus, onClose }) => {
  const { stages, openPractice } = useGame();
  const ref = useRef<HTMLDivElement>(null);
  useFocusTrap(ref, true);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const stage = node.stageId ? stages.find((s) => s.id === node.stageId) : undefined;
  const article = node.stageId ? articleFor(node.stageId) : undefined;
  const section = useMemo(() => {
    if (!article) return undefined;
    const tags = new Set((node.tags ?? []).map((t) => t.toLowerCase()));
    let best = article.sections[0];
    let score = 0;
    for (const s of article.sections) {
      const n = s.tags.filter((t) => tags.has(t.toLowerCase())).length;
      if (n > score) {
        best = s;
        score = n;
      }
    }
    return best;
  }, [article, node.tags]);

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
                    openPractice(stage.id);
                  }}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-[var(--color-primary)] text-white dark:text-black text-sm font-bold hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed"
                  title={stageLocked ? 'Finish the earlier stages to unlock this one' : undefined}
                >
                  <Play size={14} /> {stageLocked ? 'Stage locked' : 'Start the lessons'}
                </button>
                {article && (
                  <Link
                    to={`/dashboard/learn/${stage.id}/read${section ? `#${section.id}` : ''}`}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-black/10 dark:border-white/15 text-sm font-medium text-gray-800 dark:text-gray-100 hover:bg-black/5 dark:hover:bg-white/5"
                  >
                    <BookOpen size={14} /> Read: {section?.title ?? article.title}
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

export const RoadmapDetailPage: React.FC = () => {
  const { slug = '' } = useParams();
  const roadmap = ROADMAP_BY_SLUG.get(slug);
  const { statuses, set } = useRoadmapProgress(slug);
  const [active, setActive] = useState<RoadmapNode | null>(null);

  useEffect(() => setActive(null), [slug]);

  if (!roadmap) return <Navigate to="/dashboard/roadmap" replace />;

  const summary = summarise(roadmap, statuses);
  const total = roadmapNodeIds(roadmap).length;

  return (
    <div className="p-6 sm:p-8 max-w-6xl mx-auto">
      <Link
        to="/dashboard/roadmap"
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

      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-gray-500 mb-8">
        <span className="inline-flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-sm border-2 border-[#e6c95a] bg-[#fff4c2] dark:bg-[#3a3416] dark:border-[#7a6a1f]" /> Pending
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-sm border-2 border-[var(--color-secondary)] bg-[var(--color-secondary)]/10" /> Learning
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-sm border-2 border-[var(--color-primary)] bg-[var(--color-primary)]/15" /> Done
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-sm border-2 border-dashed border-[#e6c95a]" /> Optional
        </span>
        <span className="inline-flex items-center gap-1.5">
          <Swords size={12} className="text-[var(--color-primary)]" /> Practised in Devlingo
        </span>
        <a
          href={roadmap.roadmapShUrl}
          target="_blank"
          rel="noreferrer"
          className="ml-auto inline-flex items-center gap-1 hover:text-gray-900 dark:hover:text-white"
        >
          Community version on roadmap.sh <ExternalLink size={12} />
        </a>
      </div>

      <ol className="relative">
        {roadmap.sections.map((section, i) => (
          <SectionBlock
            key={section.id}
            section={section}
            index={i}
            statuses={statuses}
            activeId={active?.id ?? null}
            onSelect={setActive}
          />
        ))}
      </ol>

      {active && (
        <NodeDrawer
          node={active}
          status={statuses[active.id] ?? 'pending'}
          onStatus={(s) => set(active.id, s)}
          onClose={() => setActive(null)}
        />
      )}
    </div>
  );
};
