import React, { useMemo } from 'react';
import { motion } from 'framer-motion';
import { useGame } from '../../context/GameContext';

/**
 * The numbers strip under the hero. Derived from the content bank rather than
 * invented, so they are true for whoever is running this copy.
 */
export const SocialProof: React.FC = () => {
  const { allChallenges, stages } = useGame();

  const stats = useMemo(() => {
    const lessons = allChallenges.filter((c) => !c.isStageTest).length;
    const tests = allChallenges.filter((c) => c.isStageTest).length;
    const executable = allChallenges.filter((c) => c.type === 'code_runner' || c.type === 'debug').length;
    const languages = new Set(allChallenges.map((c) => c.language)).size;
    return [
      { value: String(lessons), label: 'Hand-checked lessons' },
      { value: String(tests), label: `Stage tests across ${stages.length} stages` },
      { value: String(executable), label: 'Problems graded by real test runs' },
      { value: String(languages), label: 'Languages and notations' }
    ];
  }, [allChallenges, stages.length]);

  return (
    <section className="py-24 border-y border-black/5 dark:border-white/5 bg-gray-50 dark:bg-[#161b22]/50 relative">
      <div className="max-w-7xl mx-auto px-6 text-center">
        <h2 className="text-sm font-mono text-gray-600 dark:text-gray-400 mb-12 tracking-widest uppercase">
          Built for developers who want to keep growing
        </h2>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
          {stats.map((stat, index) => (
            <motion.div
              key={stat.label}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: index * 0.1, duration: 0.6 }}
              className="flex flex-col items-center"
            >
              <div className="text-4xl md:text-5xl font-bold text-gray-900 dark:text-white mb-2 font-mono">{stat.value}</div>
              <div className="text-sm text-gray-500 font-medium">{stat.label}</div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
};
