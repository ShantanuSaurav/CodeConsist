import React, { useMemo } from 'react';
import { motion } from 'framer-motion';
import { CheckCircle2, Play } from 'lucide-react';
import { useGame } from '../../context/GameContext';
import { CodeBlock } from '../CodeBlock';

const FORMATS = [
  ['Quiz & output prediction', 'Read a snippet, say exactly what it prints.'],
  ['Fill the blanks & ordering', 'Complete code inline, or drag pseudocode into the right order.'],
  ['Code & debug', 'Write the function or fix the planted bug. Graded by real test runs.']
];

/** "Learn by doing" section - shows a real challenge from the bank, not a mock-up. */
export const LearningExperience: React.FC = () => {
  const { allChallenges, openPractice } = useGame();

  const sample = useMemo(
    () =>
      allChallenges.find(
        (c) => c.stageId === 'stage-1' && c.type === 'code_runner' && (c.starterCode?.split('\n').length ?? 0) <= 8
      ) ?? allChallenges.find((c) => c.type === 'code_runner'),
    [allChallenges]
  );

  return (
    <section className="py-32 bg-white dark:bg-[#0d1117]">
      <div className="max-w-7xl mx-auto px-6">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-24 items-center">
          <div>
            <h2 className="text-3xl md:text-5xl font-bold text-gray-900 dark:text-white mb-6">Learn by Doing.</h2>
            <p className="text-gray-600 dark:text-gray-400 text-lg mb-8">
              No long videos. Seven interactive lesson formats that get straight to the point, and a
              coding test at the end of every stage.
            </p>

            <div className="space-y-4">
              {FORMATS.map(([title, desc]) => (
                <div
                  key={title}
                  className="bg-gray-50 dark:bg-[#161b22] border border-black/5 dark:border-white/5 p-5 rounded-xl flex items-start gap-3"
                >
                  <CheckCircle2 size={18} className="text-[var(--color-primary)] mt-0.5 shrink-0" />
                  <div>
                    <h4 className="font-bold text-gray-900 dark:text-white mb-1">{title}</h4>
                    <p className="text-gray-600 dark:text-gray-400 text-sm">{desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {sample && (
            <motion.div
              initial={{ opacity: 0, x: 20 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              className="rounded-xl overflow-hidden border border-black/10 dark:border-white/10 bg-gray-50 dark:bg-[#161b22] shadow-2xl"
            >
              <div className="flex items-center justify-between px-4 py-3 border-b border-black/5 dark:border-white/5 bg-white dark:bg-[#0d1117]">
                <div className="flex space-x-2">
                  <div className="w-3 h-3 rounded-full bg-red-500/20 border border-red-500/50" />
                  <div className="w-3 h-3 rounded-full bg-yellow-500/20 border border-yellow-500/50" />
                  <div className="w-3 h-3 rounded-full bg-green-500/20 border border-green-500/50" />
                </div>
                <div className="font-mono text-xs text-gray-500 truncate px-3">{sample.title}</div>
                <div className="w-12" />
              </div>

              <div className="p-5">
                <p className="text-sm text-gray-700 dark:text-gray-300 mb-4">{sample.prompt}</p>
                <CodeBlock code={sample.starterCode ?? ''} language={sample.language} showLineNumbers />
              </div>

              <div className="px-5 py-4 border-t border-black/5 dark:border-white/5 bg-white dark:bg-[#0d1117] flex items-center justify-between gap-3">
                <button
                  type="button"
                  onClick={() => openPractice(sample.stageId, sample.id)}
                  className="flex items-center space-x-2 px-4 py-2 bg-[var(--color-primary)]/10 text-[var(--color-primary)] rounded-lg hover:bg-[var(--color-primary)]/20 transition-colors font-medium text-sm"
                >
                  <Play size={16} />
                  <span>Solve it now</span>
                </button>
                <div className="flex items-center space-x-3 text-sm">
                  <span className="text-gray-500">{sample.testCases?.length ?? 0} test cases</span>
                  <span className="font-mono text-[var(--color-warning)] font-bold">+{sample.xpReward} XP</span>
                </div>
              </div>
            </motion.div>
          )}
        </div>
      </div>
    </section>
  );
};
