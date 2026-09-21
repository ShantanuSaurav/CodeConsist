import React from 'react';
import { BookOpen, Code2, Hammer, TrendingUp } from 'lucide-react';
import { Reveal } from './Reveal';

const STEPS = [
  {
    step: '01',
    title: 'Learn',
    icon: BookOpen,
    desc: 'Twenty bite-sized lessons per stage: quizzes, output prediction, fill-the-blanks, pseudocode ordering. Each new idea is explained before you are asked about it.'
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
    desc: 'Each stage ends in a mandatory coding problem with hidden cases. The next stage stays locked until you clear it.'
  },
  {
    step: '04',
    title: 'Progress',
    icon: TrendingUp,
    desc: 'XP, levels and streaks are computed from what you actually solved. The roadmap fills in as you go.'
  }
];

export const HowItWorks: React.FC = () => (
  <section className="py-20 sm:py-28">
    <div className="max-w-6xl mx-auto px-6">
      <Reveal className="max-w-2xl mb-12">
        <div className="eyebrow">How it works</div>
        <h2 className="text-[1.75rem] sm:text-[2.25rem] font-semibold tracking-tight text-fg leading-tight">
          A path from first variable to shipping software.
        </h2>
        <p className="mt-4 text-fg-secondary text-lg leading-relaxed">
          Ten stages, in order. You cannot skip ahead, and you never have to guess what to learn next.
        </p>
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
