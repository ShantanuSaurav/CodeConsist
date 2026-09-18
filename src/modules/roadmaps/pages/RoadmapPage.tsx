import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { PageHeader } from '@/ui';
import { ROUTES } from '@/config/routes';
import { SkillRoadmap } from '../components/SkillRoadmap';
import { ROADMAPS, roadmapNodeIds } from '../content';
import { summarise, useAllRoadmapProgress } from '../services/progress';
import { useSession } from '@/platform/session';
import type { Roadmap } from '@/types';

/** One roadmap as a full-width row: icon, title, description, progress, arrow. */
const RoadmapRow: React.FC<{ roadmap: Roadmap; statuses: Record<string, any> }> = ({ roadmap, statuses }) => {
  const summary = summarise(roadmap, statuses);
  const total = roadmapNodeIds(roadmap).length;
  const started = summary.done + summary.learning > 0;
  return (
    <li>
      <Link
        to={ROUTES.roadmap(roadmap.slug)}
        className={`group flex items-center gap-4 rounded-2xl border bg-gray-50 dark:bg-[#161b22] px-4 py-3.5 sm:px-5 transition hover:border-[var(--color-primary)]/50 hover:shadow-lg hover:-translate-y-px ${
          summary.percent === 100 ? 'border-[var(--color-primary)]/40' : 'border-black/5 dark:border-white/5'
        }`}
      >
        <span
          className="w-11 h-11 shrink-0 rounded-xl border border-black/5 dark:border-white/10 bg-white dark:bg-[#0d1117] flex items-center justify-center text-xl"
          aria-hidden="true"
        >
          {roadmap.icon}
        </span>
        <span className="flex-1 min-w-0">
          <span className="flex items-center gap-2">
            <span className="font-bold text-gray-900 dark:text-white truncate">{roadmap.title}</span>
            {summary.percent === 100 && (
              <span className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-[var(--color-primary)]/15 text-[var(--color-primary)]">
                done
              </span>
            )}
          </span>
          <span className="block text-sm text-gray-600 dark:text-gray-400 mt-0.5 line-clamp-1 sm:line-clamp-2">{roadmap.description}</span>
          <span className="mt-2.5 flex items-center gap-3">
            <span className="flex-1 h-1 bg-black/5 dark:bg-white/10 rounded-full overflow-hidden">
              <span className="block h-full bg-[var(--color-primary)] transition-all" style={{ width: `${summary.percent}%` }} />
            </span>
            <span className={`shrink-0 text-[11px] font-mono ${started ? 'text-[var(--color-primary)]' : 'text-gray-500'}`}>
              {summary.done}/{total} topics{summary.learning ? ` · ${summary.learning} learning` : ''}
            </span>
          </span>
        </span>
        <ArrowRight size={18} className="shrink-0 text-gray-400 group-hover:text-[var(--color-primary)] group-hover:translate-x-0.5 transition" />
      </Link>
    </li>
  );
};

export const RoadmapPage: React.FC = () => {
  const store = useAllRoadmapProgress();
  const { activeTrack, tracks, learnerStages, stats } = useSession();
  const cleared = learnerStages.filter((s) => s.state === 'Completed').length;
  const core = activeTrack.track.id === 'core';
  const roles = ROADMAPS.filter((r) => r.kind === 'role');
  const skills = ROADMAPS.filter((r) => r.kind === 'skill');

  return (
    <div className="p-6 sm:p-8 max-w-5xl mx-auto space-y-12">
      <section>
        <PageHeader
          eyebrow="Roadmaps"
          title="Developer roadmaps"
          description={
            <>
              Step-by-step maps of what to learn and in which order. Each topic has a short
              explanation, curated links to free resources, and - where Devlingo covers it - a jump straight into the
              lessons and the article. Mark topics done, learning or skipped; progress is saved in this browser.
            </>
          }
        />

        <div className="max-w-3xl">
          <h2 className="text-xs font-mono uppercase tracking-wider text-gray-500 mb-3">Role-based</h2>
          <ol className="space-y-2.5 mb-8">
            {roles.map((r) => (
              <RoadmapRow key={r.slug} roadmap={r} statuses={store[r.slug] ?? {}} />
            ))}
          </ol>

          <h2 className="text-xs font-mono uppercase tracking-wider text-gray-500 mb-3">Skill-based</h2>
          <ol className="space-y-2.5">
            {skills.map((r) => (
              <RoadmapRow key={r.slug} roadmap={r} statuses={store[r.slug] ?? {}} />
            ))}
          </ol>
        </div>
      </section>

      <section>
        <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="text-xs font-mono uppercase tracking-wider text-[var(--color-primary)] mb-2">Your Devlingo path</div>
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
              {core ? 'Master the Stack' : `The path through ${activeTrack.track.label}`}
            </h2>
            <p className="text-gray-600 dark:text-gray-400 mt-2">
              {core
                ? 'The ten stages as one connected path, filled in from your solved lessons and passed tests. Click an open node to jump in.'
                : `${activeTrack.track.label}'s stages as one connected path, filled in from your real progress. Click an open node to jump in.`}
              {tracks.length > 1 ? ' Switch tracks from the sidebar to see that path instead.' : ''}
            </p>
          </div>
          <div className="text-right">
            <div className="text-3xl font-bold font-mono text-gray-900 dark:text-white">
              {cleared}
              <span className="text-gray-400 text-xl"> / {learnerStages.length}</span>
            </div>
            <div className="text-xs text-gray-500">stages cleared · {stats.xp} XP</div>
          </div>
        </div>
        <div className="max-w-3xl">
          <SkillRoadmap />
        </div>
      </section>
    </div>
  );
};
