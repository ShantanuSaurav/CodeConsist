import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, ExternalLink } from 'lucide-react';
import { PageHeader } from '@/ui';
import { ROUTES } from '@/config/routes';
import { SkillRoadmap } from '../components/SkillRoadmap';
import { ROADMAPS, roadmapNodeIds } from '../content';
import { summarise, useAllRoadmapProgress } from '../services/progress';
import type { Roadmap } from '@/types';

const RoadmapCard: React.FC<{ roadmap: Roadmap; statuses: Record<string, any> }> = ({ roadmap, statuses }) => {
  const summary = summarise(roadmap, statuses);
  const total = roadmapNodeIds(roadmap).length;
  return (
    <Link
      to={ROUTES.roadmap(roadmap.slug)}
      className="group flex flex-col rounded-2xl border border-black/5 dark:border-white/5 bg-gray-50 dark:bg-[#161b22] p-5 hover:border-[var(--color-primary)]/40 hover:shadow-lg transition"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <span className="text-2xl" aria-hidden="true">
            {roadmap.icon}
          </span>
          <h3 className="font-bold text-gray-900 dark:text-white truncate">{roadmap.title}</h3>
        </div>
        <ArrowRight size={16} className="text-gray-400 group-hover:text-[var(--color-primary)] group-hover:translate-x-0.5 transition shrink-0 mt-1" />
      </div>
      <p className="text-sm text-gray-600 dark:text-gray-400 mt-3 line-clamp-3 flex-1">{roadmap.description}</p>
      <div className="mt-4">
        <div className="flex justify-between text-xs font-mono text-gray-500 mb-1.5">
          <span>
            {summary.done} / {total} topics
          </span>
          <span className={summary.percent > 0 ? 'text-[var(--color-primary)]' : ''}>{summary.percent}%</span>
        </div>
        <div className="h-1.5 w-full bg-black/5 dark:bg-white/10 rounded-full overflow-hidden">
          <div className="h-full bg-[var(--color-primary)] transition-all" style={{ width: `${summary.percent}%` }} />
        </div>
      </div>
    </Link>
  );
};

export const RoadmapPage: React.FC = () => {
  const store = useAllRoadmapProgress();
  const roles = ROADMAPS.filter((r) => r.kind === 'role');
  const skills = ROADMAPS.filter((r) => r.kind === 'skill');

  return (
    <div className="p-6 sm:p-8 max-w-7xl mx-auto space-y-12">
      <section>
        <PageHeader
          eyebrow="Roadmaps"
          title="Developer roadmaps"
          description={
            <>
              Step-by-step maps of what to learn and in which order, roadmap.sh-style. Each topic has a short
              explanation, curated links to free resources, and - where Devlingo covers it - a jump straight into the
              lessons and the article. Mark topics done, learning or skipped; progress is saved in this browser.
            </>
          }
          aside={
            <a
              href="https://roadmap.sh"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
            >
              Community roadmaps at roadmap.sh <ExternalLink size={14} />
            </a>
          }
        />

        <h2 className="text-xs font-mono uppercase tracking-wider text-gray-500 mb-3">Role-based</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 mb-8">
          {roles.map((r) => (
            <RoadmapCard key={r.slug} roadmap={r} statuses={store[r.slug] ?? {}} />
          ))}
        </div>

        <h2 className="text-xs font-mono uppercase tracking-wider text-gray-500 mb-3">Skill-based</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {skills.map((r) => (
            <RoadmapCard key={r.slug} roadmap={r} statuses={store[r.slug] ?? {}} />
          ))}
        </div>
      </section>

      <section>
        <div className="mb-6">
          <div className="text-xs font-mono uppercase tracking-wider text-[var(--color-primary)] mb-2">Your Devlingo path</div>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Master the Stack</h2>
          <p className="text-gray-600 dark:text-gray-400 mt-2">
            The ten stages as a skill tree, filled in from your solved lessons and passed tests. Click a node to jump in.
          </p>
        </div>
        <SkillRoadmap />
      </section>
    </div>
  );
};
