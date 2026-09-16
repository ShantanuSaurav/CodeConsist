import React from 'react';
import { motion } from 'framer-motion';
import { Award, CheckCircle2, Circle, Flame, Lock } from 'lucide-react';
import { useGame } from '../../context/GameContext';
import { levelProgress } from '../../lib/leveling';
import { nextRankLevel, rankTitle, solvedOn } from '../../lib/progressInsights';

const DAILY_GOAL = 3;

/** "Learning should feel like progress" - the cards show the visitor's real numbers. */
export const Gamification: React.FC = () => {
  const { stats, stages } = useGame();
  const level = levelProgress(stats.xp);
  const today = solvedOn(stats).length;
  const goalPercent = Math.min(100, Math.round((today / DAILY_GOAL) * 100));
  const nextRank = nextRankLevel(level.level);

  return (
    <section className="py-32 bg-gray-50 dark:bg-[#161b22]/30 border-y border-black/5 dark:border-white/5 relative overflow-hidden">
      <div className="absolute top-0 right-0 w-1/3 h-full bg-[var(--color-primary)]/5 blur-[150px] pointer-events-none" />

      <div className="max-w-7xl mx-auto px-6">
        <div className="text-center mb-20">
          <h2 className="text-3xl md:text-5xl font-bold text-gray-900 dark:text-white mb-6">
            Learning Should Feel Like Progress.
          </h2>
          <p className="text-gray-600 dark:text-gray-400 text-lg max-w-2xl mx-auto">
            Stay motivated with RPG-style progression. Build your streak, earn XP, and unlock the next stage.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          <motion.div
            whileHover={{ y: -5 }}
            className="bg-white dark:bg-[#0d1117] border border-black/10 dark:border-white/10 rounded-2xl p-8 flex flex-col space-y-8"
          >
            <div className="flex items-center space-x-3 text-[var(--color-warning)]">
              <Flame size={24} className="fill-[var(--color-warning)]" />
              <span className="font-bold text-xl">
                {stats.streak} Day Streak
              </span>
            </div>

            <div className="h-px bg-black/5 dark:bg-white/5 w-full" />

            <div>
              <div className="text-sm font-mono text-gray-500 mb-2">DAILY GOAL</div>
              <div className="flex items-center justify-between mb-2">
                <div className="text-gray-900 dark:text-white font-medium">Solve {DAILY_GOAL} challenges</div>
                <div className="text-[var(--color-primary)] font-mono font-bold">
                  {today} / {DAILY_GOAL}
                </div>
              </div>
              <div className="w-full h-2 bg-black/5 dark:bg-white/5 rounded-full overflow-hidden">
                <motion.div
                  initial={{ width: 0 }}
                  whileInView={{ width: `${goalPercent}%` }}
                  viewport={{ once: true }}
                  transition={{ duration: 1, delay: 0.3 }}
                  className="h-full bg-[var(--color-primary)]"
                />
              </div>
            </div>
          </motion.div>

          <motion.div
            whileHover={{ y: -5 }}
            className="bg-gradient-to-br from-white to-gray-50 dark:from-[#161b22] dark:to-[#0d1117] border border-black/10 dark:border-white/10 rounded-2xl p-8 flex flex-col items-center justify-center text-center shadow-lg"
          >
            <div className="w-20 h-20 rounded-full bg-[var(--color-secondary)]/10 border border-[var(--color-secondary)]/30 flex items-center justify-center mb-6 relative">
              <Award size={32} className="text-[var(--color-secondary)]" />
              <div className="absolute -bottom-2 bg-[var(--color-secondary)] text-black text-xs font-bold px-2 py-0.5 rounded-full">
                LVL {String(level.level).padStart(2, '0')}
              </div>
            </div>
            <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2">{rankTitle(level.level)}</h3>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              {nextRank ? `Next rank at Level ${nextRank}` : 'Top rank reached'} · {level.into}/{level.needed} XP into this level
            </p>
          </motion.div>

          <motion.div
            whileHover={{ y: -5 }}
            className="bg-white dark:bg-[#0d1117] border border-black/10 dark:border-white/10 rounded-2xl p-8"
          >
            <div className="text-sm font-mono text-gray-500 mb-6">STAGE UNLOCKS</div>
            <div className="space-y-4">
              {stages.slice(0, 4).map((stage) => {
                const done = stage.state === 'Completed';
                const active = stage.state === 'In progress' || stage.state === 'Test pending';
                return (
                  <div
                    key={stage.id}
                    className={
                      active
                        ? 'flex items-center space-x-3 text-gray-900 dark:text-white font-medium bg-black/5 dark:bg-white/5 p-2 rounded-lg -mx-2'
                        : done
                          ? 'flex items-center space-x-3 text-gray-700 dark:text-gray-300'
                          : 'flex items-center space-x-3 text-gray-500'
                    }
                  >
                    {done ? (
                      <CheckCircle2 size={18} className="text-[var(--color-primary)] shrink-0" />
                    ) : active ? (
                      <Circle size={18} className="text-[var(--color-secondary)] fill-[var(--color-secondary)]/20 shrink-0" />
                    ) : (
                      <Lock size={18} className="shrink-0" />
                    )}
                    <span className="truncate">{stage.name}</span>
                  </div>
                );
              })}
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
};
