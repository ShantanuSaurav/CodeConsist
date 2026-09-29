import React from 'react';
import { BookOpen, Code2, Hammer, TrendingUp } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useContentStats, useSession } from '@/platform/session';
import { useCopy } from '@/platform/settings';
import { Reveal } from './Reveal';

interface Step {
  step: string;
  title: string;
  icon: LucideIcon;
  /** An admin-editable piece of site copy, or fixed words. */
  copyKey?: string;
  desc?: string;
}

const STEPS: Step[] = [
  {
    step: '01',
    title: 'Learn',
    icon: BookOpen,
    // Not "twenty per stage": the C and C++ stages have fifteen.
    copyKey: 'copy.landing.howLessons'
  },
  {
    step: '02',
    title: 'Practice',
    icon: Code2,
    desc: 'Write real functions and fix planted bugs in a proper editor. Every submission runs against test cases; nothing is simulated.'
  },
  {
    step: '03',
    title: 'Build',
    icon: Hammer,
    // Not "a coding problem with hidden cases": the C and C++ stage tests are
    // fill-in-the-blank programs. Editable, and it must stay true about how
    // stages unlock (`buildStepWithSkip` while placement or test-out is on).
    copyKey: 'copy.landing.buildStep'
  },
  {
    step: '04',
    title: 'Progress',
    icon: TrendingUp,
    desc: 'XP, levels and streaks are computed from what you actually solved. The roadmap fills in as you go.'
  }
];

export const HowItWorks: React.FC = () => {
  // Counted from the content, not written down: "ten stages" stopped being
  // true the day the C and C++ tracks arrived. The sentence around the count
  // is admin-editable (`copy.landing.pathLine`).
  const { contentReady, settings } = useSession();
  const stats = useContentStats();
  const copy = useCopy();
  // While placement or test-out is on, the lines say a learner can skip
  // ahead (`…WithSkip`); with both off, the base lines - both admin-editable.
  const canSkip = settings.placement.enabled || settings.testOut.enabled;
  const pathLine =
    contentReady && stats.stages > 0
      ? copy(canSkip ? 'copy.landing.pathLineWithSkip' : 'copy.landing.pathLine', { stages: stats.stages })
      : 'Stages in order, each ending in a coding test.';
  const copyKeyOf = (step: Step) => (step.copyKey === 'copy.landing.buildStep' && canSkip ? 'copy.landing.buildStepWithSkip' : step.copyKey);

  return (
    <section className="py-20 sm:py-28">
      <div className="max-w-6xl mx-auto px-6">
        <Reveal className="max-w-2xl mb-12">
          <div className="eyebrow">How it works</div>
          <h2 className="text-[1.75rem] sm:text-[2.25rem] font-semibold tracking-tight text-fg leading-tight">
            A path from first variable to shipping software.
          </h2>
          <p className="mt-4 text-fg-secondary text-lg leading-relaxed">{pathLine}</p>
        </Reveal>

        <ol className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {STEPS.map((s, i) => {
            const Icon = s.icon;
            return (
              <Reveal as="li" key={s.step} delay={i * 110}>
                <div className="step-card">
                  <div className="flex items-start justify-between">
                    <span className="step-num">{s.step}</span>
                    <Icon size={18} className="step-icon" aria-hidden="true" />
                  </div>
                  <h3 className="text-lg font-semibold text-fg tracking-tight mb-2">{s.title}</h3>
                  <p className="text-sm text-fg-secondary leading-relaxed">{s.copyKey ? copy(copyKeyOf(s) ?? s.copyKey, { ...stats }) : s.desc}</p>
                </div>
              </Reveal>
            );
          })}
        </ol>
      </div>
    </section>
  );
};
