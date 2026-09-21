import React from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import { PageHeader, ProgressBar, SectionHeader } from '@/ui';
import { ROUTES } from '@/config/routes';
import { SkillRoadmap } from '../components/SkillRoadmap';
import { ROADMAPS, roadmapNodeIds } from '../content';
import { summarise, useAllRoadmapProgress } from '../services/progress';
import { useSession } from '@/platform/session';
import type { Roadmap } from '@/types';

/** One roadmap as a row: title, description, progress, chevron. */
const RoadmapRow: React.FC<{ roadmap: Roadmap; statuses: Record<string, any> }> = ({ roadmap, statuses }) => {
  const summary = summarise(roadmap, statuses);
  const total = roadmapNodeIds(roadmap).length;
  const started = summary.done + summary.learning > 0;
  return (
    <li className="border-b border-border-subtle">
      <Link to={ROUTES.roadmap(roadmap.slug)} className="group grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-4 py-3 -mx-2 px-2 rounded-xs hover:bg-surface-2 transition-colors">
        <span className="min-w-0">
          <span className="flex items-center gap-2">
            <span className="text-sm font-medium text-fg truncate">{roadmap.title}</span>
            {summary.percent === 100 && <span className="badge badge-success">Done</span>}
          </span>
          <span className="text-sm text-fg-secondary mt-0.5 line-clamp-1">{roadmap.description}</span>
        </span>
        <span className="text-right">
          <span className={`block font-mono text-xs tabular-nums ${started ? 'text-fg' : 'text-fg-muted'}`}>
            {summary.done} / {total}
          </span>
          {started && <ProgressBar value={summary.percent} size="sm" tone={summary.percent === 100 ? 'success' : 'accent'} className="w-16 mt-1.5" label={`${summary.done} of ${total} topics`} />}
        </span>
        <ChevronRight size={15} className="text-fg-muted" aria-hidden="true" />
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
    <div className="page max-w-4xl">
      <PageHeader
        title="Roadmaps"
        description="Step-by-step maps of what to learn and in which order. Each topic has a short explanation, curated free resources and - where CodeConsist covers it - a jump into the lessons. Mark topics done, learning or skipped; progress is saved in this browser."
      />

      <div className="grid gap-10 md:grid-cols-2 md:gap-12 pb-10 mb-10 border-b border-border-subtle">
        <section aria-labelledby="roles-heading" className="min-w-0">
          <SectionHeader title={<span id="roles-heading">Role-based</span>} />
          <ol className="border-t border-border-subtle">
            {roles.map((r) => (
              <RoadmapRow key={r.slug} roadmap={r} statuses={store[r.slug] ?? {}} />
            ))}
          </ol>
        </section>

        <section aria-labelledby="skills-heading" className="min-w-0">
          <SectionHeader title={<span id="skills-heading">Skill-based</span>} />
          <ol className="border-t border-border-subtle">
            {skills.map((r) => (
              <RoadmapRow key={r.slug} roadmap={r} statuses={store[r.slug] ?? {}} />
            ))}
          </ol>
        </section>
      </div>

      <section aria-labelledby="skill-map-heading" className="max-w-2xl">
        <SectionHeader
          title={<span id="skill-map-heading">{core ? 'Your CodeConsist path' : `Your path: ${activeTrack.track.label}`}</span>}
          description={tracks.length > 1 ? 'Switch tracks from the sidebar to see that path instead.' : undefined}
          aside={
            <div className="sm:text-right">
              <div className="font-mono text-lg font-semibold text-fg tabular-nums leading-none">
                {cleared}
                <span className="text-fg-muted text-sm"> / {learnerStages.length}</span>
              </div>
              <div className="text-xs text-fg-muted mt-1">stages · {stats.xp.toLocaleString()} XP</div>
            </div>
          }
        />
        <SkillRoadmap />
      </section>
    </div>
  );
};
