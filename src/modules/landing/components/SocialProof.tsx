import React, { useMemo, useRef } from 'react';
import { useSession } from '@/platform/session';
import { Bone, Stat } from '@/ui';
import { CountUp, Reveal } from './Reveal';

/**
 * The numbers strip under the hero. Derived from the content bank rather than
 * invented, so they are true for whoever is running this copy. Each figure
 * counts up from zero the first time it scrolls into view; one already on
 * screen is just the number. Until the bank arrives each figure is a quiet
 * placeholder instead of a misleading zero.
 */
export const SocialProof: React.FC = () => {
  const { allChallenges, stages, contentReady } = useSession();
  // Figures that replace a placeholder fade in where they land.
  const arrivedLate = useRef(!contentReady);

  const stats = useMemo(() => {
    const lessons = allChallenges.filter((c) => !c.isStageTest).length;
    const tests = allChallenges.filter((c) => c.isStageTest).length;
    const executable = allChallenges.filter((c) => c.type === 'code_runner' || c.type === 'debug').length;
    const languages = new Set(allChallenges.map((c) => c.language)).size;
    return [
      { value: lessons, label: 'Lessons', hint: 'hand-checked' },
      { value: tests, label: 'Stage tests', hint: `across ${stages.length} stages` },
      { value: executable, label: 'Code problems', hint: 'graded by real test runs' },
      { value: languages, label: 'Languages', hint: 'and notations' }
    ];
  }, [allChallenges, stages.length]);

  return (
    <section className="stat-strip border-y border-border bg-surface">
      <div className="max-w-6xl mx-auto px-6 py-10 grid grid-cols-2 md:grid-cols-4 gap-y-8 md:divide-x md:divide-border-subtle">
        {stats.map((stat, i) => (
          <Reveal key={stat.label} step={i} className={i > 0 ? 'md:pl-8' : ''}>
            <Stat
              label={stat.label}
              value={
                contentReady ? (
                  <CountUp value={stat.value} className={arrivedLate.current ? 'content-fade-in' : undefined} />
                ) : (
                  <Bone w="3.5rem" h="1.5rem" className="my-[0.15rem]" />
                )
              }
              hint={contentReady ? stat.hint : <span className="invisible">{stat.hint}</span>}
            />
          </Reveal>
        ))}
      </div>
    </section>
  );
};
