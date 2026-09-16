import React from 'react';
import { motion } from 'framer-motion';
import { Database, Layout, Lock, Network, Rocket } from 'lucide-react';
import { useGame } from '../../context/GameContext';
import { stageStatus } from '../../services/contentService';

/** How the ten stages group into the four tracks on the roadmap. */
const TRACKS = [
  {
    title: 'Foundations',
    icon: <Layout size={20} className="text-[var(--color-secondary)]" />,
    stageIds: ['stage-1', 'stage-2']
  },
  {
    title: 'Computer Science',
    icon: <Network size={20} className="text-[var(--color-warning)]" />,
    stageIds: ['stage-3', 'stage-4']
  },
  {
    title: 'Web & Backend',
    icon: <Database size={20} className="text-[var(--color-primary)]" />,
    stageIds: ['stage-5', 'stage-6', 'stage-7']
  },
  {
    title: 'Engineering',
    icon: <Rocket size={20} className="text-purple-400" />,
    stageIds: ['stage-8', 'stage-9', 'stage-10']
  }
];

/**
 * The skill tree, filled in from the learner's actual progress. Each node is a
 * stage; its bar is lessons solved plus the stage test.
 */
export const SkillRoadmap: React.FC = () => {
  const { stages, stats, openPractice, openStageTest, openSubModal } = useGame();

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
      {TRACKS.map((track, idx) => (
        <motion.div
          key={track.title}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: idx * 0.08, duration: 0.5 }}
          className="bg-gray-50 dark:bg-[#161b22] border border-black/5 dark:border-white/5 rounded-2xl p-6"
        >
          <div className="flex items-center space-x-3 mb-6">
            <div className="w-10 h-10 rounded-lg bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 flex items-center justify-center">
              {track.icon}
            </div>
            <h3 className="text-lg font-bold text-gray-900 dark:text-white">{track.title}</h3>
          </div>

          <div className="space-y-5 relative">
            <div className="absolute left-[11px] top-4 bottom-4 w-px bg-black/5 dark:bg-white/10 z-0" />

            {track.stageIds.map((id) => {
              const stage = stages.find((s) => s.id === id);
              if (!stage) return null;
              const { percent, done, total, testPassed, hasTest } = stageStatus(stage, stats);
              // Lessons are most of the bar; the test is the last slice.
              const overall = hasTest ? Math.round((done + (testPassed ? 1 : 0)) / (total + 1) * 100) : percent;
              const premiumLocked = Boolean(stage.isPremium) && !stats.isPremium;
              const locked = stage.state === 'Locked';
              const complete = stage.state === 'Completed';
              const started = overall > 0;

              const open = () => {
                if (premiumLocked) openSubModal();
                else if (stage.state === 'Test pending') openStageTest(stage.id);
                else if (!locked) openPractice(stage.id);
              };

              return (
                <button
                  key={id}
                  type="button"
                  onClick={open}
                  disabled={locked && !premiumLocked}
                  className="relative z-10 flex items-center w-full text-left group disabled:cursor-not-allowed"
                  aria-label={`Stage ${stage.index} ${stage.name}, ${overall}% complete`}
                >
                  <div
                    className={`w-6 h-6 rounded-full border-2 flex items-center justify-center bg-gray-50 dark:bg-[#161b22] transition-colors shrink-0 ${
                      complete
                        ? 'border-[var(--color-primary)]'
                        : started
                          ? 'border-[var(--color-secondary)]'
                          : 'border-gray-400 dark:border-gray-600'
                    }`}
                  >
                    {complete && <div className="w-2 h-2 rounded-full bg-[var(--color-primary)]" />}
                    {started && !complete && <div className="w-2 h-2 rounded-full bg-[var(--color-secondary)]" />}
                    {!started && <Lock size={10} className="text-gray-400 dark:text-gray-600" />}
                  </div>

                  <div className="ml-4 flex-1 min-w-0">
                    <div className="flex justify-between items-center mb-1 gap-2">
                      <span
                        className={`text-sm font-medium truncate ${
                          started || !locked ? 'text-gray-900 dark:text-white group-hover:underline' : 'text-gray-500'
                        }`}
                      >
                        {stage.name}
                        {stage.isPremium && <span className="ml-1 text-[10px] text-[var(--color-warning)] font-bold">PRO</span>}
                      </span>
                      {started && <span className="text-xs font-mono text-gray-600 dark:text-gray-400 shrink-0">{overall}%</span>}
                    </div>

                    <div className="w-full h-1 bg-black/5 dark:bg-white/5 rounded-full overflow-hidden">
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${overall}%` }}
                        transition={{ duration: 0.8, delay: 0.2 }}
                        className={`h-full ${complete ? 'bg-[var(--color-primary)]' : 'bg-[var(--color-secondary)]'}`}
                      />
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </motion.div>
      ))}
    </div>
  );
};
