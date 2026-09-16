import React from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowRight, BookOpen, CheckCircle2, Lock, Play, RotateCcw, Swords } from 'lucide-react';
import type { ReadingResolver } from '@/types';
import { useSession } from '@/platform/session';
import { stageStatus } from '@/platform/progress';
import { intents } from '@/platform/events';
import { usePracticeSession } from '../session/PracticeSessionProvider';

export interface LearningPathProps {
  /** Where a stage's reading lives, if the app has any. */
  readingFor?: ReadingResolver;
}

/**
 * The ten stages, in order. Each card shows lesson progress and the state of
 * the stage's coding test; the primary action follows that state.
 */
export const LearningPath: React.FC<LearningPathProps> = ({ readingFor }) => {
  const { stages, stats } = useSession();
  const { openPractice, openStageTest } = usePracticeSession();

  return (
    <ol className="space-y-4">
      {stages.map((stage, i) => {
        const { done, total, percent, hasTest, testPassed, testUnlocked } = stageStatus(stage, stats);
        const premiumLocked = Boolean(stage.isPremium) && !stats.isPremium;
        const locked = stage.state === 'Locked' && !premiumLocked;
        const testPending = stage.state === 'Test pending';
        const completed = stage.state === 'Completed';
        const active = stage.state === 'In progress';

        const primary = () => {
          if (premiumLocked) intents.openPro();
          else if (testPending) openStageTest(stage.id);
          else if (!locked) openPractice(stage.id);
        };

        const label = premiumLocked
          ? 'Unlock with Pro'
          : testPending
            ? 'Take the test'
            : completed
              ? 'Review'
              : done > 0
                ? 'Continue'
                : 'Start';

        const Icon = premiumLocked ? Lock : testPending ? Swords : completed ? RotateCcw : Play;
        const reading = readingFor?.(stage.id) ?? null;

        return (
          <motion.li
            key={stage.id}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: Math.min(i * 0.04, 0.4), duration: 0.35 }}
            className={`relative rounded-2xl border p-5 sm:p-6 transition-colors ${
              completed
                ? 'bg-[var(--color-primary)]/5 border-[var(--color-primary)]/30'
                : testPending
                  ? 'bg-gray-50 dark:bg-[#161b22] border-[var(--color-secondary)]/40'
                  : active
                    ? 'bg-gray-50 dark:bg-[#161b22] border-black/10 dark:border-white/15 shadow-lg'
                    : 'bg-gray-50/60 dark:bg-[#161b22]/60 border-black/5 dark:border-white/5'
            } ${locked ? 'opacity-70' : ''}`}
            aria-label={`Stage ${stage.index}, ${stage.name}, ${done} of ${total} lessons solved${
              hasTest ? `, test ${testPassed ? 'passed' : testUnlocked ? 'ready' : 'locked'}` : ''
            }`}
          >
            <div className="flex flex-col md:flex-row md:items-center gap-5">
              <div
                className={`w-14 h-14 rounded-xl flex items-center justify-center text-2xl shrink-0 border ${
                  completed
                    ? 'bg-[var(--color-primary)]/15 border-[var(--color-primary)]/30'
                    : locked
                      ? 'bg-black/5 dark:bg-white/5 border-black/5 dark:border-white/5 grayscale'
                      : 'bg-white dark:bg-[#0d1117] border-black/10 dark:border-white/10'
                }`}
                aria-hidden="true"
              >
                {locked || premiumLocked ? <Lock size={20} className="text-gray-400" /> : stage.icon}
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-center gap-2 mb-1">
                  <span className="font-mono text-xs text-gray-500">STAGE {stage.index}</span>
                  {stage.isPremium && (
                    <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-[var(--color-warning)]/15 text-[var(--color-warning)] border border-[var(--color-warning)]/30">
                      Pro
                    </span>
                  )}
                  <span
                    className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${
                      completed
                        ? 'bg-[var(--color-primary)]/15 text-[var(--color-primary)]'
                        : testPending
                          ? 'bg-[var(--color-secondary)]/15 text-[var(--color-secondary)]'
                          : active
                            ? 'bg-black/5 dark:bg-white/10 text-gray-700 dark:text-gray-200'
                            : 'bg-black/5 dark:bg-white/5 text-gray-500'
                    }`}
                  >
                    {premiumLocked ? 'Pro only' : stage.state}
                  </span>
                </div>
                <h3
                  className={`text-lg sm:text-xl font-bold ${
                    locked ? 'text-gray-500' : 'text-gray-900 dark:text-white'
                  }`}
                >
                  {stage.name}
                </h3>
                <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">{stage.description}</p>

                <div className="mt-4 flex items-center gap-3">
                  <div className="flex-1 h-1.5 bg-black/5 dark:bg-white/10 rounded-full overflow-hidden">
                    <div
                      className={`h-full transition-all ${completed ? 'bg-[var(--color-primary)]' : 'bg-[var(--color-secondary)]'}`}
                      style={{ width: `${percent}%` }}
                    />
                  </div>
                  <span className="font-mono text-xs text-gray-600 dark:text-gray-400 shrink-0">
                    {done}/{total} lessons
                  </span>
                </div>

                {reading && (
                  <Link
                    to={reading.href}
                    className="mt-3 mr-4 inline-flex items-center gap-1.5 text-xs font-medium text-[var(--color-secondary)] hover:underline underline-offset-2"
                  >
                    <BookOpen size={13} />
                    {done === 0 && !completed ? 'Read first' : 'Read the article'}
                    {reading.minutes ? ` · ${reading.minutes} min` : ''}
                  </Link>
                )}

                {hasTest && (
                  <div
                    className={`mt-3 inline-flex items-center gap-2 text-xs font-mono ${
                      testPassed
                        ? 'text-[var(--color-primary)]'
                        : testUnlocked
                          ? 'text-[var(--color-secondary)]'
                          : 'text-gray-500'
                    }`}
                  >
                    {testPassed ? <CheckCircle2 size={14} /> : testUnlocked ? <Swords size={14} /> : <Lock size={12} />}
                    <span>
                      {testPassed
                        ? 'Stage test passed'
                        : testUnlocked
                          ? 'Stage test ready'
                          : `Stage test · unlocks after ${total} lessons`}
                      {stage.test && <span className="text-gray-500 font-sans"> — {stage.test.title}</span>}
                    </span>
                  </div>
                )}
              </div>

              {!locked && (
                <div className="flex md:flex-col gap-2 md:items-stretch shrink-0">
                  <button
                    type="button"
                    onClick={primary}
                    className={`inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-lg font-bold text-sm transition ${
                      premiumLocked
                        ? 'bg-[var(--color-warning)] text-black hover:brightness-110'
                        : completed
                          ? 'border border-black/10 dark:border-white/15 text-gray-800 dark:text-gray-100 hover:bg-black/5 dark:hover:bg-white/5'
                          : 'bg-[var(--color-primary)] text-white dark:text-black hover:brightness-110'
                    }`}
                  >
                    <Icon size={16} />
                    <span>{label}</span>
                    {!completed && !premiumLocked && <ArrowRight size={16} />}
                  </button>
                  {testPending && (
                    <button
                      type="button"
                      onClick={() => openPractice(stage.id)}
                      className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-lg text-sm font-medium border border-black/10 dark:border-white/10 text-gray-700 dark:text-gray-300 hover:bg-black/5 dark:hover:bg-white/5"
                    >
                      Review lessons
                    </button>
                  )}
                </div>
              )}
            </div>
          </motion.li>
        );
      })}
    </ol>
  );
};
