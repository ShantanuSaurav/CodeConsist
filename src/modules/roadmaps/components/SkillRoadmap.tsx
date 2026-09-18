import React, { useMemo } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { Check, Crown, Database, Layout, Lock, Network, Rocket, Sparkles, Swords } from 'lucide-react';
import type { Stage } from '@/types';
import { useSession } from '@/platform/session';
import { stageStatus } from '@/platform/progress';
import { intents } from '@/platform/events';
import '../styles/roadmap.css';

type NodeState = 'locked' | 'current' | 'completed';

interface Group {
  title: string;
  icon: React.ReactNode;
  stageIds: string[];
}

/** How the core path's ten stages group along the rail. Other tracks are one group each. */
const CORE_GROUPS: Group[] = [
  { title: 'Foundations', icon: <Layout size={13} className="text-[var(--color-secondary)]" />, stageIds: ['stage-1', 'stage-2'] },
  { title: 'Computer Science', icon: <Network size={13} className="text-[var(--color-warning)]" />, stageIds: ['stage-3', 'stage-4'] },
  { title: 'Web & Backend', icon: <Database size={13} className="text-[var(--color-primary)]" />, stageIds: ['stage-5', 'stage-6', 'stage-7'] },
  { title: 'Engineering', icon: <Rocket size={13} className="text-purple-400" />, stageIds: ['stage-8', 'stage-9', 'stage-10'] }
];

/** Rough reading/solving time from the lesson count - a label, never a claim about progress. */
function estimatedMinutes(stage: Stage): number {
  return Math.max(5, Math.round(stage.challenges.length * 4));
}

function totalXp(stage: Stage): number {
  return stage.challenges.reduce((sum, c) => sum + c.xpReward, 0) + (stage.test?.xpReward ?? 0);
}

/**
 * The learner's track as one connected vertical path - one node per stage,
 * grouped under the headings the path has always had, states and the fill of
 * the rail driven entirely by REAL progress (never invented). Progression is
 * strictly linear within a track, so at most one stage is ever actionable:
 * that one is "current" (pulse + a call to action), everything before it is
 * "completed", everything after is "locked". Clicking an open node jumps
 * into its lessons or its pending test.
 */
export const SkillRoadmap: React.FC = () => {
  const { learnerStages: stages, activeTrack, stats } = useSession();
  const reduceMotion = useReducedMotion();

  const groups = useMemo<Group[]>(() => {
    const ids = new Set(stages.map((s) => s.id));
    const core = CORE_GROUPS.map((g) => ({ ...g, stageIds: g.stageIds.filter((id) => ids.has(id)) })).filter((g) => g.stageIds.length);
    const covered = new Set(core.flatMap((g) => g.stageIds));
    const rest = stages.filter((s) => !covered.has(s.id)).map((s) => s.id);
    if (core.length && rest.length === 0) return core;
    const restGroup: Group = {
      title: activeTrack.track.label,
      icon: <span aria-hidden="true">{activeTrack.track.icon}</span>,
      stageIds: rest
    };
    return core.length ? [...core, restGroup] : [restGroup];
  }, [stages, activeTrack]);

  const currentIndex = useMemo(() => stages.findIndex((s) => s.state === 'In progress' || s.state === 'Test pending'), [stages]);

  /** How far the rail should be filled in, as a percent of its full height. */
  const railFillPercent = useMemo(() => {
    const completedCount = stages.filter((s) => s.state === 'Completed').length;
    let fraction = completedCount;
    if (currentIndex >= 0) {
      const { done, total, testPassed, hasTest } = stageStatus(stages[currentIndex], stats);
      fraction += hasTest ? (done + (testPassed ? 1 : 0)) / (total + 1) : total > 0 ? done / total : 0;
    }
    return stages.length > 0 ? Math.min(100, (fraction / stages.length) * 100) : 0;
  }, [stages, stats, currentIndex]);

  const byId = useMemo(() => new Map(stages.map((s) => [s.id, s])), [stages]);

  return (
    <div className="roadmap-wrap">
      <div className="roadmap-rail" aria-hidden="true">
        <div className="roadmap-rail-fill" style={{ height: `${railFillPercent}%`, transition: reduceMotion ? 'none' : undefined }} />
      </div>

      {groups.map((group) => (
        <section key={group.title} className="roadmap-group" aria-label={group.title}>
          <div className="roadmap-group-head">
            <span className="roadmap-group-head-icon">{group.icon}</span>
            {group.title}
          </div>
          <ol className="roadmap-path">
            {group.stageIds.map((id) => {
              const stage = byId.get(id);
              if (!stage) return null;
              const i = stages.indexOf(stage);
              const { done, total, percent, hasTest, testPassed } = stageStatus(stage, stats);
              const premiumLocked = Boolean(stage.isPremium) && !stats.isPremium;
              const completed = stage.state === 'Completed';
              const isCurrent = i === currentIndex;
              const locked = !completed && !isCurrent;
              const state: NodeState = completed ? 'completed' : isCurrent ? 'current' : 'locked';
              const canOpen = !locked || premiumLocked;
              const overall = hasTest ? Math.round(((done + (testPassed ? 1 : 0)) / (total + 1)) * 100) : percent;

              const open = () => {
                if (premiumLocked) intents.openPro();
                else if (stage.state === 'Test pending') intents.openStageTest(stage.id);
                else if (!locked) intents.openPractice(stage.id);
              };

              return (
                <li key={stage.id} className="roadmap-item">
                  <motion.button
                    type="button"
                    onClick={open}
                    disabled={!canOpen}
                    initial={reduceMotion ? false : { opacity: 0, y: 24 }}
                    whileInView={reduceMotion ? undefined : { opacity: 1, y: 0 }}
                    viewport={{ once: true, amount: 0.4 }}
                    transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
                    className={`roadmap-node roadmap-node-${state} ${canOpen ? 'is-clickable' : ''}`}
                    aria-label={`Stage ${stage.index}: ${stage.name} - ${
                      premiumLocked ? 'Pro only' : state === 'completed' ? 'completed' : state === 'current' ? `in progress, ${overall}%` : 'locked'
                    }`}
                  >
                    <span className="roadmap-node-marker">
                      {premiumLocked ? (
                        <Crown size={18} />
                      ) : state === 'completed' ? (
                        <Check size={18} strokeWidth={3} />
                      ) : state === 'locked' ? (
                        <Lock size={16} />
                      ) : (
                        <span className="roadmap-node-icon-emoji" aria-hidden="true">
                          {stage.icon}
                        </span>
                      )}
                      {state === 'current' && !reduceMotion && <span className="roadmap-node-pulse" />}
                    </span>

                    <span className="roadmap-node-body">
                      <span className="roadmap-node-head">
                        <span className="roadmap-node-index">Stage {stage.index}</span>
                        {premiumLocked && <span className="roadmap-node-pro">PRO</span>}
                        {!premiumLocked && hasTest && testPassed && (
                          <span className="roadmap-node-tag is-done">
                            <Check size={11} /> Test passed
                          </span>
                        )}
                        {!premiumLocked && isCurrent && stage.state === 'Test pending' && (
                          <span className="roadmap-node-tag is-ready">
                            <Swords size={11} /> Test ready
                          </span>
                        )}
                      </span>

                      <span className="roadmap-node-title">{stage.name}</span>
                      <span className="roadmap-node-desc">{stage.description}</span>

                      <span className="roadmap-node-meta">
                        <span>~{estimatedMinutes(stage)} min</span>
                        <span>+{totalXp(stage)} XP</span>
                        <span>
                          {done}/{total} lessons
                        </span>
                        {overall > 0 && <span>{overall}%</span>}
                      </span>

                      {!locked && (
                        <span className="roadmap-node-progress">
                          <span className="roadmap-node-progress-fill" style={{ width: `${overall}%` }} />
                        </span>
                      )}

                      {isCurrent && (
                        <span className="roadmap-node-cta">
                          <Sparkles size={13} />
                          {stage.state === 'Test pending' ? 'Take the stage test' : done > 0 ? 'Continue learning' : 'Start this stage'}
                        </span>
                      )}
                      {premiumLocked && <span className="roadmap-node-cta is-muted">Unlock with Pro</span>}
                      {locked && !premiumLocked && (
                        <span className="roadmap-node-cta is-muted">Finish the stage before this one to unlock it</span>
                      )}
                    </span>
                  </motion.button>
                </li>
              );
            })}
          </ol>
        </section>
      ))}
    </div>
  );
};
