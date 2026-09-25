import React from 'react';
import { BookOpen, Code2, Hammer, TrendingUp } from 'lucide-react';
import { useSession } from '@/platform/session';
import { Reveal } from './Reveal';

const STEPS = [
  {
    step: '01',
    title: 'Learn',
    icon: BookOpen,
    // Not "twenty per stage": the C and C++ stages have fifteen.
    desc: 'Bite-sized lessons in every stage: quizzes, output prediction, fill-the-blanks, pseudocode ordering. Each new idea is explained before you are asked about it.'
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
    // fill-in-the-blank programs.
    desc: 'Each stage ends in a mandatory test. The next stage stays locked until you clear it.'
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
  // true the day the C and C++ tracks arrived.
  const { stages, contentReady } = useSession();
  const pathLine =
    contentReady && stages.length > 0
      ? `${stages.length} stages, in order, each ending in a coding test.`
      : 'Stages in order, each ending in a coding test.';

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
                  <p className="text-sm text-fg-secondary leading-relaxed">{s.desc}</p>
                </div>
              </Reveal>
            );
          })}
        </ol>
      </div>
    </section>
  );
};
