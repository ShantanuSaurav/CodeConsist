import React, { useMemo } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { Check, Crown, Lock, Sparkles, Swords } from 'lucide-react';
import { useGame } from '../../context/GameContext';
import { stageStatus } from '../../services/contentService';
import { Stage } from '../../types';

type NodeState = 'locked' | 'current' | 'completed';

/** Rough reading/solving time from the lesson count - a label, never a claim about progress. */
function estimatedMinutes(stage: Stage): number {
  return Math.max(5, Math.round(stage.challenges.length * 4));
}

function totalXp(stage: Stage): number {
  return stage.challenges.reduce((sum, c) => sum + c.xpReward, 0) + (stage.test?.xpReward ?? 0);
}

/**
 * The learning journey as a single connected vertical path - one node per
 * stage, states and the fill of the connecting line driven entirely by the
 * learner's REAL progress (never invented). Devlingo's progression is
 * strictly linear (a stage unlocks only once the one before it is cleared),
 * so at most one stage is ever actionable: that one is "current" (pulse +
 * a "Continue learning" call to action), everything before it is
 * "completed", everything after is "locked".
 */
export const SkillRoadmap: React.FC = () => {
  // Scoped to the learner's selected language track (see GameContext), not
  // the raw cross-language `stages` - the roadmap is strictly linear, and
  // showing every language's stages in one chain would block, say, Python's
  // stage 2 behind finishing every JavaScript stage first.
  const { learnerStages: stages, stats, openPractice, openStageTest, openSubModal } = useGame();
  const reduceMotion = useReducedMotion();

  const currentIndex = useMemo(
    () => stages.findIndex((s) => s.state === 'In progress' || s.state === 'Test pending'),
    [stages]
  );

  /** How far the connecting line should be filled in, as a percent of its full height. */
  const railFillPercent = useMemo(() => {
    const completedCount = stages.filter((s) => s.state === 'Completed').length;
    let fraction = completedCount;
    if (currentIndex >= 0) {
      const { done, total, testPassed, hasTest } = stageStatus(stages[currentIndex], stats);
      const currentFraction = hasTest
        ? (done + (testPassed ? 1 : 0)) / (total + 1)
        : total > 0
          ? done / total
          : 0;
      fraction += currentFraction;
    }
    return stages.length > 0 ? Math.min(100, (fraction / stages.length) * 100) : 0;
  }, [stages, stats, currentIndex]);

  return (
    <div className="roadmap-wrap">
      <div className="roadmap-rail" aria-hidden="true">
        <div
          className="roadmap-rail-fill"
          style={{ height: `${railFillPercent}%`, transition: reduceMotion ? 'none' : undefined }}
        />
      </div>

      <ol className="roadmap-path">
        {stages.map((stage, i) => {
          const { done, total, percent, hasTest, testPassed } = stageStatus(stage, stats);
          const premiumLocked = Boolean(stage.isPremium) && !stats.isPremium;
          const completed = stage.state === 'Completed';
          const isCurrent = i === currentIndex;
          const locked = !completed && !isCurrent;
          const state: NodeState = completed ? 'completed' : isCurrent ? 'current' : 'locked';
          const canOpen = !locked || premiumLocked;

          const open = () => {
            if (premiumLocked) openSubModal();
            else if (stage.state === 'Test pending') openStageTest(stage.id);
            else if (!locked) openPractice(stage.id);
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
                  premiumLocked ? 'Pro only' : state === 'completed' ? 'completed' : state === 'current' ? 'in progress' : 'locked'
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
                  </span>

                  {!locked && (
                    <span className="roadmap-node-progress">
                      <span
                        className="roadmap-node-progress-fill"
                        style={{
                          width: `${hasTest ? Math.round(((done + (testPassed ? 1 : 0)) / (total + 1)) * 100) : percent}%`
                        }}
                      />
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
    </div>
  );
};
