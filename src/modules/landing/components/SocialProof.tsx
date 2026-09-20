import React, { useMemo } from 'react';
import { useSession } from '@/platform/session';
import { Stat } from '@/ui';

/**
 * The numbers strip under the hero. Derived from the content bank rather than
 * invented, so they are true for whoever is running this copy.
 */
export const SocialProof: React.FC = () => {
  const { allChallenges, stages } = useSession();

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
    <section className="border-y border-border bg-surface">
      <div className="max-w-6xl mx-auto px-6 py-8 grid grid-cols-2 md:grid-cols-4 gap-y-6 md:divide-x md:divide-border-subtle">
        {stats.map((stat, i) => (
          <div key={stat.label} className={i > 0 ? 'md:pl-8' : ''}>
            <Stat label={stat.label} value={<span className="font-mono text-2xl">{stat.value}</span>} />
          </div>
        ))}
      </div>
    </section>
  );
};
