import React from 'react';

const STEPS = [
  {
    step: '01',
    title: 'Learn',
    desc: 'Twenty bite-sized lessons per stage: quizzes, output prediction, fill-the-blanks, pseudocode ordering. Each new idea is explained before you are asked about it.'
  },
  {
    step: '02',
    title: 'Practice',
    desc: 'Write real functions and fix planted bugs in a proper editor. Every submission runs against test cases; nothing is simulated.'
  },
  {
    step: '03',
    title: 'Build',
    desc: 'Each stage ends in a mandatory coding problem with hidden cases. The next stage stays locked until you clear it.'
  },
  {
    step: '04',
    title: 'Progress',
    desc: 'XP, levels and streaks are computed from what you actually solved. The roadmap fills in as you go.'
  }
];

export const HowItWorks: React.FC = () => (
  <section className="py-20 sm:py-28">
    <div className="max-w-6xl mx-auto px-6">
      <div className="max-w-2xl mb-12">
        <div className="eyebrow">How it works</div>
        <h2 className="text-[1.75rem] sm:text-[2.25rem] font-semibold tracking-tight text-fg leading-tight">
          A path from first variable to shipping software.
        </h2>
        <p className="mt-4 text-fg-secondary text-lg leading-relaxed">
          Ten stages, in order. You cannot skip ahead, and you never have to guess what to learn next.
        </p>
      </div>

      <ol className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 border-t border-border">
        {STEPS.map((s) => (
          <li key={s.step} className="pt-6 pb-2 lg:pr-8 lg:border-r lg:last:border-r-0 border-border-subtle lg:[&:not(:first-child)]:pl-8">
            <div className="font-mono text-xs text-fg-muted mb-3">{s.step}</div>
            <h3 className="text-lg font-semibold text-fg tracking-tight mb-2">{s.title}</h3>
            <p className="text-sm text-fg-secondary leading-relaxed">{s.desc}</p>
          </li>
        ))}
      </ol>
    </div>
  </section>
);
