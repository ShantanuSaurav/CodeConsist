import React from 'react';
import { motion } from 'framer-motion';
import { ArrowRight, Terminal } from 'lucide-react';
import { Link } from 'react-router-dom';
import { PixelSnow } from '../backgrounds/PixelSnow';
import { useGame } from '../../context/GameContext';

type NodeStatus = 'completed' | 'active' | 'locked';

export const Hero: React.FC = () => {
  const { stages, allChallenges } = useGame();

  // The progression column on the right is the learner's own first six
  // stages, not a mock-up: a returning visitor sees where they actually are.
  const nodes = stages.slice(0, 6).map((s) => ({
    id: s.id,
    label: s.name,
    status: (s.state === 'Completed'
      ? 'completed'
      : s.state === 'Locked'
        ? 'locked'
        : 'active') as NodeStatus
  }));
  if (!nodes.some((n) => n.status === 'active')) {
    const first = nodes.find((n) => n.status === 'locked');
    if (first) first.status = 'active';
  }

  const lessons = allChallenges.filter((c) => !c.isStageTest).length;
  const tests = allChallenges.filter((c) => c.isStageTest).length;

  return (
    <section className="relative min-h-screen flex items-center pt-20 overflow-hidden">
      <PixelSnow density={60} speed={0.8} />

      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-[var(--color-primary)]/10 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-[var(--color-secondary)]/10 rounded-full blur-[120px] pointer-events-none" />

      <div className="max-w-7xl mx-auto px-6 w-full grid grid-cols-1 lg:grid-cols-2 gap-12 items-center relative z-10">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, ease: 'easeOut' }}
          className="flex flex-col items-start space-y-8"
        >
          <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 text-sm font-mono text-gray-700 dark:text-gray-300">
            <Terminal size={14} className="text-[var(--color-primary)]" />
            <span>
              {lessons} lessons · {tests} stage tests · real code execution
            </span>
          </div>

          <h1 className="text-5xl md:text-7xl font-extrabold tracking-tight text-gray-900 dark:text-white leading-[1.1]">
            Learn to Code.
            <br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-[var(--color-primary)] to-[var(--color-secondary)]">
              Level Up for Real.
            </span>
          </h1>

          <p className="text-lg md:text-xl text-gray-600 dark:text-gray-400 max-w-lg leading-relaxed">
            The professional developer training environment. Ten stages of hand-checked lessons, each
            capped by a LeetCode-style coding test, all graded by running your code for real.
          </p>

          <div className="flex flex-col sm:flex-row items-center gap-4 w-full sm:w-auto">
            <Link
              to="/dashboard/learn"
              className="group relative w-full sm:w-auto inline-flex items-center justify-center space-x-2 px-8 py-4 bg-[var(--color-primary)] text-white dark:text-black font-bold rounded-lg overflow-hidden transition-all hover:scale-105 hover:shadow-[0_0_20px_rgba(57,255,20,0.4)]"
            >
              <span className="relative z-10">Start Learning Free</span>
              <ArrowRight size={18} className="relative z-10 group-hover:translate-x-1 transition-transform" />
              <div className="absolute inset-0 bg-white/20 translate-y-full group-hover:translate-y-0 transition-transform duration-300 ease-out" />
            </Link>

            <Link
              to="/dashboard/roadmap"
              className="w-full sm:w-auto px-8 py-4 bg-black/5 dark:bg-white/5 hover:bg-black/10 dark:hover:bg-white/10 text-gray-900 dark:text-white font-medium rounded-lg border border-black/10 dark:border-white/10 transition-colors flex items-center justify-center"
            >
              Explore the Roadmap
            </Link>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 1, delay: 0.2 }}
          className="relative h-[600px] flex items-center justify-center lg:justify-end"
        >
          <div className="relative w-full max-w-sm flex flex-col items-center">
            {nodes.map((node, index) => (
              <React.Fragment key={node.id}>
                <motion.div
                  whileHover={node.status !== 'locked' ? { scale: 1.05 } : {}}
                  className={`w-52 p-4 rounded-xl border flex items-center justify-between backdrop-blur-md transition-colors cursor-default ${
                    node.status === 'completed'
                      ? 'bg-[var(--color-primary)]/10 border-[var(--color-primary)]/30 text-[var(--color-primary)]'
                      : node.status === 'active'
                        ? 'bg-black/5 dark:bg-white/10 border-black/30 dark:border-white/30 text-gray-900 dark:text-white shadow-[0_0_15px_rgba(255,255,255,0.1)]'
                        : 'bg-black/5 dark:bg-white/5 border-black/5 dark:border-white/5 text-gray-500'
                  }`}
                >
                  <span className="font-mono text-sm font-bold truncate">{node.label}</span>
                  {node.status === 'completed' && <div className="w-2 h-2 rounded-full bg-[var(--color-primary)] shrink-0" />}
                  {node.status === 'active' && (
                    <motion.div
                      animate={{ scale: [1, 1.5, 1], opacity: [1, 0.5, 1] }}
                      transition={{ duration: 2, repeat: Infinity }}
                      className="w-2 h-2 rounded-full bg-gray-900 dark:bg-white shrink-0"
                    />
                  )}
                  {node.status === 'locked' && <div className="w-2 h-2 rounded-full border border-gray-500 shrink-0" />}
                </motion.div>

                {index < nodes.length - 1 && (
                  <div className="h-8 w-px relative my-1">
                    <div
                      className={`absolute inset-0 ${
                        node.status === 'completed' ? 'bg-[var(--color-primary)]/50' : 'bg-black/10 dark:bg-white/10'
                      }`}
                    />
                    {node.status === 'active' && (
                      <motion.div
                        initial={{ top: 0, height: 0, opacity: 1 }}
                        animate={{ top: '100%', height: 0, opacity: 0 }}
                        transition={{ duration: 1.5, repeat: Infinity, ease: 'linear' }}
                        className="absolute left-0 right-0 bg-gray-900 dark:bg-white shadow-[0_0_8px_currentColor]"
                      />
                    )}
                  </div>
                )}
              </React.Fragment>
            ))}
          </div>
        </motion.div>
      </div>
    </section>
  );
};
