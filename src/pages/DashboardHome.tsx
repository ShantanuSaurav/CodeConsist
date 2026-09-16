import React, { useMemo } from 'react';
import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { ArrowRight, Award, CheckCircle2, Circle, Code2, Flame, Lock, Swords, Zap } from 'lucide-react';
import { useGame } from '../context/GameContext';
import { stageStatus } from '../services/contentService';
import { levelProgress } from '../lib/leveling';
import { achievements, activityGrid, greeting, rankTitle, relativeDay, solvedOn, xpEarnedOn } from '../lib/progressInsights';

const CARD = 'bg-gray-50 dark:bg-[#161b22] border border-black/5 dark:border-white/5 rounded-2xl';
const HEAT = [
  'bg-black/5 dark:bg-white/5',
  'bg-[var(--color-primary)]/25',
  'bg-[var(--color-primary)]/50',
  'bg-[var(--color-primary)]/75',
  'bg-[var(--color-primary)]'
];
const DAILY_SOLVES = 3;
const DAILY_XP = 100;

export const DashboardHome: React.FC = () => {
  const { stats, stages, user, challengeById, openPractice, openStageTest } = useGame();
  const level = levelProgress(stats.xp);
  const name = user && user.provider !== 'guest' ? user.username : 'Developer';

  // Where to pick up: the stage whose test is waiting, else the one in progress.
  const current = useMemo(
    () => stages.find((s) => s.state === 'Test pending') ?? stages.find((s) => s.state === 'In progress') ?? null,
    [stages]
  );
  const currentStatus = current ? stageStatus(current, stats) : null;
  const allDone = !current && stages.length > 0 && stages.every((s) => s.state === 'Completed' || s.isPremium);

  const grid = useMemo(() => activityGrid(stats, 14), [stats]);
  const todaySolves = solvedOn(stats).length;
  const todayXp = xpEarnedOn(stats, challengeById);
  const recent = useMemo(() => achievements(stats, stages).filter((a) => a.earnedAt).slice(0, 3), [stats, stages]);
  const nextUp = useMemo(() => achievements(stats, stages).find((a) => !a.earnedAt), [stats, stages]);

  const goals = [
    { label: 'Complete 1 lesson', done: todaySolves >= 1, detail: todaySolves >= 1 ? 'Done' : 'Any challenge counts' },
    { label: `Solve ${DAILY_SOLVES} challenges`, done: todaySolves >= DAILY_SOLVES, detail: `${Math.min(todaySolves, DAILY_SOLVES)} / ${DAILY_SOLVES}` },
    { label: `Earn ${DAILY_XP} XP`, done: todayXp >= DAILY_XP, detail: `${Math.min(todayXp, DAILY_XP)} / ${DAILY_XP} XP` }
  ];

  return (
    <div className="p-6 sm:p-8 max-w-6xl mx-auto space-y-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
            {greeting()}, {name}.
          </h1>
          <p className="text-gray-600 dark:text-gray-400">
            {stats.streak > 0
              ? `You're on a ${stats.streak}-day streak. Keep it up!`
              : todaySolves > 0
                ? 'Streak started. Come back tomorrow to keep it alive.'
                : 'Solve one challenge today to start a streak.'}
          </p>
        </div>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <motion.div whileHover={{ y: -2 }} className={`${CARD} p-6 flex items-center space-x-4`}>
          <div className="w-12 h-12 rounded-full bg-[var(--color-warning)]/10 flex items-center justify-center shrink-0">
            <Flame size={24} className="text-[var(--color-warning)] fill-[var(--color-warning)]" />
          </div>
          <div>
            <div className="text-sm text-gray-600 dark:text-gray-400 font-medium">Current Streak</div>
            <div className="text-2xl font-bold text-gray-900 dark:text-white font-mono">
              {stats.streak} {stats.streak === 1 ? 'Day' : 'Days'}
            </div>
            {stats.bestStreak > stats.streak && <div className="text-xs text-gray-500">Best {stats.bestStreak}</div>}
          </div>
        </motion.div>

        <motion.div whileHover={{ y: -2 }} className={`${CARD} p-6 flex items-center space-x-4`}>
          <div className="w-12 h-12 rounded-full bg-[var(--color-primary)]/10 flex items-center justify-center shrink-0">
            <Zap size={24} className="text-[var(--color-primary)] fill-[var(--color-primary)]" />
          </div>
          <div>
            <div className="text-sm text-gray-600 dark:text-gray-400 font-medium">Total XP</div>
            <div className="text-2xl font-bold text-gray-900 dark:text-white font-mono">{stats.xp.toLocaleString()} XP</div>
            <div className="text-xs text-gray-500">{stats.completedChallenges.length} solved</div>
          </div>
        </motion.div>

        <motion.div whileHover={{ y: -2 }} className={`${CARD} p-6 flex items-center space-x-4`}>
          <div className="w-12 h-12 rounded-full bg-[var(--color-secondary)]/10 flex items-center justify-center shrink-0">
            <Award size={24} className="text-[var(--color-secondary)]" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm text-gray-600 dark:text-gray-400 font-medium">Current Level</div>
            <div className="text-2xl font-bold text-gray-900 dark:text-white font-mono">
              Level {String(level.level).padStart(2, '0')}
            </div>
            <div className="text-xs text-gray-500 truncate">
              {rankTitle(level.level)} · {level.into}/{level.needed} XP
            </div>
          </div>
        </motion.div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-8">
          {/* Continue learning */}
          <div className="bg-gradient-to-r from-gray-50 to-white dark:from-[#161b22] dark:to-[#0d1117] border border-black/5 dark:border-white/5 rounded-2xl p-8 relative overflow-hidden">
            <div className="absolute right-0 top-0 h-full w-1/2 bg-gradient-to-l from-[var(--color-primary)]/5 to-transparent pointer-events-none" />
            <div className="relative z-10">
              <div className="text-sm font-mono text-gray-600 dark:text-gray-400 mb-4 tracking-wider uppercase">
                {current?.state === 'Test pending' ? 'Stage test waiting' : 'Continue Learning'}
              </div>

              {current && currentStatus ? (
                <>
                  <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
                    Stage {current.index}: {current.name}
                  </h2>
                  <p className="text-gray-600 dark:text-gray-400 mb-6">
                    {current.state === 'Test pending' && current.test
                      ? `All ${currentStatus.total} lessons done. Pass "${current.test.title}" to unlock the next stage.`
                      : current.description}
                  </p>

                  <div className="mb-6">
                    <div className="flex justify-between items-center mb-2">
                      <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                        {currentStatus.done} / {currentStatus.total} lessons
                      </span>
                      <span className="text-sm font-mono text-[var(--color-primary)]">{currentStatus.percent}%</span>
                    </div>
                    <div className="w-full h-2 bg-black/5 dark:bg-white/10 rounded-full overflow-hidden">
                      <div className="h-full bg-[var(--color-primary)] transition-all" style={{ width: `${currentStatus.percent}%` }} />
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-3">
                    <button
                      type="button"
                      onClick={() =>
                        current.state === 'Test pending' ? openStageTest(current.id) : openPractice(current.id)
                      }
                      className="flex items-center space-x-2 px-6 py-3 bg-[var(--color-primary)] text-white dark:text-black font-bold rounded-lg hover:brightness-110 transition"
                    >
                      {current.state === 'Test pending' ? <Swords size={18} /> : null}
                      <span>{current.state === 'Test pending' ? 'Take the stage test' : currentStatus.done > 0 ? 'Continue' : 'Start'}</span>
                      <ArrowRight size={18} />
                    </button>
                    <Link
                      to="/dashboard/learn"
                      className="px-6 py-3 rounded-lg border border-black/10 dark:border-white/10 text-gray-700 dark:text-gray-200 hover:bg-black/5 dark:hover:bg-white/5 font-medium"
                    >
                      See all stages
                    </Link>
                  </div>
                </>
              ) : (
                <>
                  <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
                    {allDone ? 'Every stage cleared' : 'Nothing in progress'}
                  </h2>
                  <p className="text-gray-600 dark:text-gray-400 mb-6">
                    {allDone
                      ? 'Revisit any stage from the Learn page, or drill specific topics in Challenges.'
                      : 'Open the Learn page to start Stage 01.'}
                  </p>
                  <Link
                    to="/dashboard/learn"
                    className="inline-flex items-center space-x-2 px-6 py-3 bg-[var(--color-primary)] text-white dark:text-black font-bold rounded-lg hover:brightness-110 transition"
                  >
                    <span>Open the path</span>
                    <ArrowRight size={18} />
                  </Link>
                </>
              )}
            </div>
          </div>

          {/* Activity heatmap */}
          <div className={`${CARD} p-8`}>
            <div className="flex items-baseline justify-between mb-6">
              <h3 className="text-lg font-bold text-gray-900 dark:text-white">Learning Activity</h3>
              <span className="text-xs text-gray-500">Last 14 weeks</span>
            </div>
            <div className="flex space-x-1.5 overflow-x-auto pb-2">
              {grid.map((column, i) => (
                <div key={i} className="flex flex-col space-y-1.5">
                  {column.map((cell) => (
                    <div
                      key={cell.day}
                      className={`w-3.5 h-3.5 rounded-sm ${HEAT[cell.level]} hover:ring-2 hover:ring-gray-400 dark:hover:ring-white transition-all`}
                      title={`${cell.day}: ${cell.count} solved`}
                    />
                  ))}
                </div>
              ))}
            </div>
            <div className="flex items-center justify-end space-x-2 mt-4 text-xs text-gray-500 font-medium">
              <span>Less</span>
              <div className="flex space-x-1">
                {HEAT.map((cls) => (
                  <div key={cls} className={`w-3 h-3 rounded-sm ${cls}`} />
                ))}
              </div>
              <span>More</span>
            </div>
          </div>
        </div>

        <div className="space-y-8">
          {/* Daily goals */}
          <div className={`${CARD} p-6`}>
            <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-6">Daily Goals</h3>
            <div className="space-y-4">
              {goals.map((g) => (
                <div key={g.label} className="flex items-start space-x-3">
                  {g.done ? (
                    <CheckCircle2 size={20} className="text-[var(--color-primary)] shrink-0 mt-0.5" />
                  ) : (
                    <Circle size={20} className="text-gray-400 shrink-0 mt-0.5" />
                  )}
                  <div>
                    <div className={`text-gray-900 dark:text-white font-medium ${g.done ? 'line-through opacity-70' : ''}`}>
                      {g.label}
                    </div>
                    <div className="text-xs text-gray-500 font-mono mt-1">{g.detail}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Achievements */}
          <div className={`${CARD} p-6`}>
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-lg font-bold text-gray-900 dark:text-white">Recent Achievements</h3>
              <Link to="/dashboard/achievements" className="text-xs text-[var(--color-secondary)] hover:underline">
                View All
              </Link>
            </div>

            <div className="space-y-3">
              {recent.length === 0 && (
                <p className="text-sm text-gray-500">Nothing yet — your first solve unlocks the first badge.</p>
              )}
              {recent.map((a) => (
                <div
                  key={a.id}
                  className="flex items-center space-x-3 p-3 bg-black/5 dark:bg-white/5 rounded-xl border border-black/5 dark:border-white/5"
                >
                  <div className="w-10 h-10 rounded-lg bg-[var(--color-warning)]/10 flex items-center justify-center shrink-0">
                    {a.kind === 'streak' ? (
                      <Flame size={20} className="text-[var(--color-warning)]" />
                    ) : a.kind === 'stage' ? (
                      <Award size={20} className="text-[var(--color-secondary)]" />
                    ) : (
                      <Code2 size={20} className="text-[#a855f7]" />
                    )}
                  </div>
                  <div className="min-w-0">
                    <div className="text-gray-900 dark:text-white text-sm font-medium truncate">{a.title}</div>
                    <div className="text-xs text-gray-500">Earned {relativeDay(a.earnedAt!)}</div>
                  </div>
                </div>
              ))}
              {nextUp && (
                <div className="flex items-center space-x-3 p-3 rounded-xl border border-dashed border-black/10 dark:border-white/10">
                  <div className="w-10 h-10 rounded-lg bg-black/5 dark:bg-white/5 flex items-center justify-center shrink-0">
                    <Lock size={18} className="text-gray-400" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-gray-700 dark:text-gray-300 text-sm font-medium truncate">Next: {nextUp.title}</div>
                    <div className="text-xs text-gray-500 truncate">{nextUp.detail}</div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
