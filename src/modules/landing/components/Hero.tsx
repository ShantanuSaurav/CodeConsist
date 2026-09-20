import React, { useMemo } from 'react';
import { ArrowRight } from 'lucide-react';
import { useSession } from '@/platform/session';
import { intents } from '@/platform/events';
import { optionOrder } from '@/platform/grading-engine/answers';
import { ButtonLink, CodeBlock } from '@/ui';

/**
 * The hero is the product. On the right, a real challenge from the bank
 * rendered with the same pieces the practice modal uses - prompt, code,
 * options, footer - so what a visitor sees is what they will get.
 */
export const Hero: React.FC = () => {
  const { allChallenges, contentReady } = useSession();

  const sample = useMemo(() => {
    const short = (c: (typeof allChallenges)[number]) => (c.codeSnippet?.split('\n').length ?? 99) <= 6 && (c.options?.length ?? 0) === 4;
    return (
      allChallenges.find((c) => c.stageId === 'stage-1' && c.type === 'output_prediction' && short(c)) ??
      allChallenges.find((c) => c.type === 'output_prediction' && short(c)) ??
      allChallenges.find((c) => c.type === 'quiz' && (c.options?.length ?? 0) === 4) ??
      null
    );
  }, [allChallenges]);

  const order = useMemo(() => (sample ? optionOrder(sample) : []), [sample]);
  const lessons = allChallenges.filter((c) => !c.isStageTest).length;
  const tests = allChallenges.filter((c) => c.isStageTest).length;

  return (
    <section className="pt-28 pb-16 sm:pt-36 sm:pb-24">
      <div className="max-w-6xl mx-auto px-6 grid grid-cols-1 lg:grid-cols-[1fr_1.05fr] gap-12 lg:gap-16 items-center">
        <div className="max-w-xl">
          <div className="eyebrow">
            {contentReady ? `${lessons} lessons · ${tests} stage tests · real code execution` : 'Developer training environment'}
          </div>
          <h1 className="text-[2.5rem] sm:text-[3.25rem] leading-[1.05] font-semibold tracking-tight text-fg">
            Learn to code by
            <br />
            actually writing it.
          </h1>
          <p className="mt-6 text-lg text-fg-secondary leading-relaxed">
            A staged path from programming basics to shipping software. Read the concept, predict the output, fill the blanks,
            then write the function — graded by running your code for real.
          </p>

          <div className="mt-8 flex flex-col sm:flex-row gap-3">
            <ButtonLink to="/dashboard/learn" variant="primary" size="lg">
              Start learning <ArrowRight size={15} />
            </ButtonLink>
            <ButtonLink to="/dashboard/roadmap" variant="secondary" size="lg">
              Explore the roadmaps
            </ButtonLink>
          </div>

          <p className="mt-8 text-sm text-fg-muted">Free, runs on your machine · No videos · Every stage ends in a coding test</p>
        </div>

        {/* Product snapshot */}
        <div className="min-w-0">
          {sample ? (
            <div className="panel overflow-hidden">
              <div className="panel-head !py-2.5">
                <div className="min-w-0">
                  <div className="font-mono text-[11px] uppercase tracking-wider text-fg-muted">
                    Stage 01 · {sample.language} · {sample.type === 'quiz' ? 'Quiz' : 'Output prediction'}
                  </div>
                  <div className="text-sm font-medium text-fg truncate">{sample.title}</div>
                </div>
                <span className="badge">{sample.difficulty}</span>
              </div>
              <div className="p-4 sm:p-5 flex flex-col gap-4">
                <p className="challenge-prompt !text-sm">{sample.prompt}</p>
                {sample.codeSnippet && <CodeBlock code={sample.codeSnippet} language={sample.language} />}
                <div className="challenge-options" aria-hidden="true">
                  {order.map((index, position) => (
                    <div key={index} className={`option-btn ${position === 2 ? 'selected' : ''}`.trim()}>
                      <span className="option-letter">{String.fromCharCode(65 + position)}</span>
                      <span className="option-text">{sample.options?.[index]}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="flex items-center justify-between px-4 sm:px-5 py-3 border-t border-border-subtle bg-surface-2">
                <span className="font-mono text-xs text-fg-muted">
                  +{sample.xpReward} XP · 1 / 20
                </span>
                <button type="button" className="btn btn-primary btn-sm" onClick={() => intents.openPractice(sample.stageId, sample.id)}>
                  Check answer
                </button>
              </div>
            </div>
          ) : (
            <div className="panel h-[26rem] animate-pulse" aria-hidden="true" />
          )}
        </div>
      </div>
    </section>
  );
};
