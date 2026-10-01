import React, { useMemo, useRef } from 'react';
import { ArrowRight } from 'lucide-react';
import { useSession } from '@/platform/session';
import { intents } from '@/platform/events';
import { optionOrder } from '@/platform/grading-engine/answers';
import { Bone, ButtonLink, CodeBlock } from '@/ui';
import type { Challenge, ChallengeType } from '@/types';
import { useNextChallenge } from './useNextChallenge';

const TYPE_LABEL: Record<ChallengeType, string> = {
  quiz: 'Quiz',
  multi_select: 'Multi-select',
  output_prediction: 'Output prediction',
  fill_blank: 'Fill in the blanks',
  pseudocode_order: 'Put in order',
  debug: 'Debug',
  code_runner: 'Code'
};

const ACTION_LABEL: Record<ChallengeType, string> = {
  quiz: 'Check answer',
  multi_select: 'Check answer',
  output_prediction: 'Check answer',
  fill_blank: 'Fill the blanks',
  pseudocode_order: 'Put it in order',
  debug: 'Fix the bug',
  code_runner: 'Solve it now'
};

/** Every lesson counts: the panel shows whatever the visitor's next one is. */
const anyLesson = () => true;

/** A stable shuffle so the ordering lesson's lines are not shown in the answer order. */
const shuffled = (lines: string[]) => [...lines].sort((a, b) => a.length - b.length || a.localeCompare(b));

/** The body of the panel, by lesson type - the same shapes the practice modal renders. */
const Preview: React.FC<{ challenge: Challenge }> = ({ challenge: c }) => {
  const order = useMemo(() => (c.options ? optionOrder(c) : []), [c]);

  if (c.type === 'code_runner' || c.type === 'debug') {
    return <CodeBlock code={c.starterCode ?? c.codeSnippet ?? ''} language={c.language} showLineNumbers />;
  }
  if (c.type === 'pseudocode_order') {
    return (
      <div className="challenge-options" aria-hidden="true">
        {shuffled(c.pseudocodeLines ?? []).map((line, i) => (
          <div key={i} className="option-btn">
            <span className="option-letter">{i + 1}</span>
            <span className="option-text font-mono">{line}</span>
          </div>
        ))}
      </div>
    );
  }
  return (
    <>
      {c.codeSnippet && <CodeBlock code={c.codeSnippet} language={c.language} />}
      {c.type === 'fill_blank' && (
        <p className="font-mono text-xs text-fg-muted">
          {c.blanks?.length ?? 0} {(c.blanks?.length ?? 0) === 1 ? 'blank' : 'blanks'} to fill
        </p>
      )}
      {c.options && (
        <div className="challenge-options" aria-hidden="true">
          {order.map((index, position) => (
            <div key={index} className="option-btn">
              <span className="option-letter">{String.fromCharCode(65 + position)}</span>
              <span className="option-text">{c.options?.[index]}</span>
            </div>
          ))}
        </div>
      )}
    </>
  );
};

/**
 * The panel's own shape while the content bank is on its way - head, prompt,
 * code, footer - so nothing jumps when the lesson lands. A calm sheen, no pulse.
 */
const HeroPanelSkeleton: React.FC = () => (
  <div className="panel hero-panel overflow-hidden flex flex-col min-h-[26rem]" aria-hidden="true">
    <div className="panel-head !py-2.5">
      <div className="grid gap-1.5 flex-1 min-w-0">
        <Bone w="11rem" h="0.625rem" />
        <Bone w="55%" h="0.875rem" />
      </div>
      <Bone w="3.5rem" h="1.25rem" />
    </div>
    <div className="flex-1 p-4 sm:p-5 grid content-start gap-3">
      <Bone w="92%" h="0.8125rem" />
      <Bone w="68%" h="0.8125rem" />
      <Bone h="13rem" className="mt-1 !rounded-md" />
    </div>
    <div className="hero-panel-foot flex items-center justify-between px-4 sm:px-5 py-3 border-t border-border-subtle bg-surface-2">
      <Bone w="6.5rem" h="0.75rem" />
      <Bone w="7rem" h="1.75rem" className="!rounded-sm" />
    </div>
  </div>
);

/**
 * The hero is the product. On the right, the visitor's own next lesson - the
 * first unsolved one in their current stage, in order, whatever its type -
 * rendered with the same pieces the practice modal uses. Opening it lands on
 * exactly that lesson, and the panel moves on as they solve.
 */
export const Hero: React.FC = () => {
  const { allChallenges, contentReady } = useSession();
  const next = useNextChallenge(anyLesson);
  const sample = next?.challenge ?? null;

  const lessons = allChallenges.filter((c) => !c.isStageTest).length;
  const tests = allChallenges.filter((c) => c.isStageTest).length;

  // What was on screen when the hero first painted. Anything that replaces it
  // later (the real figures, a lesson in place of the skeleton, the next
  // lesson once this one is solved) fades in where it lands; what was there
  // from the start only takes part in the hero's own entrance.
  const firstEyebrow = useRef(contentReady);
  const firstSampleId = useRef(sample?.id ?? null);

  return (
    <section className="hero pt-28 pb-16 sm:pt-36 sm:pb-24">
      <div className="max-w-6xl mx-auto px-6 grid grid-cols-1 lg:grid-cols-[1fr_1.05fr] gap-12 lg:gap-16 items-center">
        <div className="max-w-xl">
          <div className="eyebrow hero-in hero-in-1">
            <span key={String(contentReady)} className={contentReady !== firstEyebrow.current ? 'content-fade-in' : undefined}>
              {contentReady ? `${lessons} lessons · ${tests} stage tests · real code execution` : 'Developer training environment'}
            </span>
          </div>
          <h1 className="hero-in hero-in-2 text-[2.5rem] sm:text-[3.25rem] leading-[1.05] font-semibold tracking-tight text-fg">
            Learn to code by
            <br />
            actually writing it.
          </h1>
          <p className="hero-in hero-in-3 mt-6 text-lg text-fg-secondary leading-relaxed">
            A staged path from programming basics to shipping software. Read the concept, predict the output, fill the blanks,
            then write the function — graded by running your code for real.
          </p>

          <div className="hero-in hero-in-4 mt-8 flex flex-col sm:flex-row gap-3">
            <ButtonLink to="/dashboard/learn" variant="primary" size="lg" className="cta-arrow">
              Start learning <ArrowRight size={15} aria-hidden="true" />
            </ButtonLink>
            <ButtonLink to="/dashboard/roadmap" variant="secondary" size="lg">
              Explore the roadmaps
            </ButtonLink>
          </div>

          <p className="hero-in hero-in-5 mt-8 text-sm text-fg-muted">
            Free, runs on your machine · No videos · Every stage ends in a coding test
          </p>
        </div>

        {/* Your next lesson */}
        <div className="hero-panel-wrap min-w-0">
          {sample ? (
            <div
              key={sample.id}
              className={`panel hero-panel overflow-hidden ${sample.id !== firstSampleId.current ? 'content-fade-in' : ''}`.trim()}
            >
              <div className="panel-head !py-2.5">
                <div className="min-w-0">
                  <div className="font-mono text-[11px] uppercase tracking-wider text-fg-muted">
                    Stage {next?.stage?.index ?? '01'} · {sample.language} · {TYPE_LABEL[sample.type]}
                  </div>
                  <div className="text-sm font-medium text-fg truncate">{sample.title}</div>
                </div>
                <span className="badge">{sample.difficulty}</span>
              </div>
              <div className="p-4 sm:p-5 flex flex-col gap-4">
                <p className="challenge-prompt !text-sm">{sample.prompt}</p>
                <Preview challenge={sample} />
              </div>
              <div className="flex items-center justify-between px-4 sm:px-5 py-3 border-t border-border-subtle bg-surface-2">
                <span className="font-mono text-xs text-fg-muted">
                  +{sample.xpReward} XP · {next?.position} / {next?.total}
                </span>
                <button type="button" className="btn btn-primary btn-sm" onClick={() => intents.openPractice(sample.stageId, sample.id)}>
                  {ACTION_LABEL[sample.type]}
                </button>
              </div>
            </div>
          ) : (
            <HeroPanelSkeleton />
          )}
        </div>
      </div>
    </section>
  );
};
