import React, { useMemo } from 'react';
import { ArrowRight } from 'lucide-react';
import { useContentStats, useSession } from '@/platform/session';
import { useCopy } from '@/platform/settings';
import { intents } from '@/platform/events';
import { optionOrder } from '@/platform/grading-engine/answers';
import { ButtonLink, CodeBlock, ProgressBar } from '@/ui';
import { ROUTES } from '@/config/routes';
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
      <div className="landing-options" aria-hidden="true">
        {shuffled(c.pseudocodeLines ?? []).map((line, i) => (
          <div key={i} className="landing-option">
            <span className="landing-option-letter">{i + 1}</span>
            <span className="font-mono">{line}</span>
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
        <div className="landing-options" aria-hidden="true">
          {order.map((index, position) => (
            <div key={index} className="landing-option">
              <span className="landing-option-letter">{String.fromCharCode(65 + position)}</span>
              <span>{c.options?.[index]}</span>
            </div>
          ))}
        </div>
      )}
    </>
  );
};

/**
 * The hero is the product. On the right, the visitor's own next lesson - the
 * first unsolved one in their current stage, in order, whatever its type -
 * rendered with the same pieces the practice modal uses. Opening it lands on
 * exactly that lesson, and the panel moves on as they solve.
 */
export const Hero: React.FC = () => {
  const { contentReady, activeTrack, learnerStages, habits, stats: learnerStats } = useSession();
  const next = useNextChallenge(anyLesson);
  const sample = next?.challenge ?? null;

  // Counted from the bank the session has, never typed into a template.
  const stats = useContentStats();
  const { lessons, tests } = stats;
  const copy = useCopy();

  return (
    <section className="hero landing-hero">
      <div className="landing-hero-inner">
        <div className="landing-hero-copy">
          <div className="eyebrow hero-in hero-in-1">
            {contentReady ? `${lessons} lessons · ${tests} stage tests · real code execution` : 'Developer training environment'}
          </div>
          <h1 className="hero-in hero-in-1">
            Small steps.
            <br />
            <span>Real developer.</span>
          </h1>
          <p className="hero-in hero-in-2 landing-hero-description">
            Go from understanding code to building with it. A clear learning path, hands-on challenges, and a space to make ideas work.
          </p>

          <div className="hero-in hero-in-3 landing-hero-actions">
            <ButtonLink to={ROUTES.learn} variant="primary" size="lg" className="cta-arrow">
              Start Learning <ArrowRight size={15} />
            </ButtonLink>
            <ButtonLink to={ROUTES.roadmaps} variant="secondary" size="lg">
              Explore Roadmaps
            </ButtonLink>
          </div>

          <p className="hero-in hero-in-4 mt-8 text-sm text-fg-muted">
            {/* Admin-editable (`copy.landing.heroFootnote`); the stage counts come from the content. */}
            {contentReady ? copy('copy.landing.heroFootnote', { ...stats }) : 'Free to start · Every stage ends in a coding test'}
          </p>
        </div>

        {/* Your next lesson */}
        <div className="hero-panel-wrap landing-workspace">
          <div className="workspace-caption"><span><span className="workspace-live-dot" />YOUR DEVELOPER WORKSPACE</span><span>One step closer, every day.</span></div>
          <div className="workspace-grid">
          <aside className="workspace-path">
            <span className="eyebrow">YOUR PATH</span><h2>{activeTrack.track.label}</h2>
            <ol>{learnerStages.slice(0, 4).map((stage) => <li key={stage.id} className={`workspace-node ${stage.state === 'Completed' ? 'is-done' : stage.state === 'Locked' ? 'is-locked' : 'is-current'}`}><span className="workspace-node-dot" aria-hidden="true" /><div><span className="workspace-stage-index">STAGE {String(stage.index).padStart(2, '0')}</span><strong>{stage.name}</strong><small>{stage.state}</small></div></li>)}</ol>
            <ButtonLink to={ROUTES.learn} variant="ghost" size="sm">View learning path <ArrowRight size={14} /></ButtonLink>
          </aside>
          {sample ? (
            <div className="panel hero-panel overflow-hidden">
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
                <p className="text-sm leading-relaxed text-fg-secondary">{sample.prompt}</p>
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
            <div className="panel hero-panel h-[26rem] animate-pulse" aria-label="Loading your next lesson" />
          )}
          </div>
          <div className="workspace-status"><span><b>{learnerStats.xp.toLocaleString()}</b> XP earned</span><span><b>{habits.streak}</b> day streak</span>{habits.goal && <div className="workspace-goal"><span>Daily goal</span><ProgressBar value={habits.goal.percent} size="sm" label={`Daily goal ${habits.goal.percent}%`} /><b>{habits.goal.percent}%</b></div>}</div>
        </div>
      </div>
    </section>
  );
};
