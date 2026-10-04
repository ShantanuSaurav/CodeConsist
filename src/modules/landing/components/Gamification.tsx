import React from 'react';
import { Check, Lock } from 'lucide-react';
import { useLeveling, useSession } from '@/platform/session';
import { describeGoalProgress } from '@/platform/habits';
import { ProgressBar, Reveal, Stat, useInView } from '@/ui';

/** "Progress you can see" - every figure here is the visitor's real number. */
export const Gamification: React.FC = () => {
  const { stats, stages, habits } = useSession();
  const { levelProgress, nextRankLevel, rankTitle } = useLeveling();
  const level = levelProgress(stats.xp);
  // Today's daily goal - the visitor's own choice, else the default option -
  // counted from the day log in their own zone (the habits engine).
  const goal = habits.goal;
  const nextRank = nextRankLevel(level.level);
  const shown = stages.slice(0, 5);

  // The bars sit at zero until the card scrolls in, then grow to the real value.
  const [barsRef, barsIn] = useInView<HTMLDivElement>();

  return (
    <section className="py-20 sm:py-28 border-t border-border">
      <div className="max-w-6xl mx-auto px-6">
        <Reveal className="max-w-2xl mb-12">
          <div className="eyebrow">Progress</div>
          <h2 className="text-[1.75rem] sm:text-[2.25rem] font-semibold tracking-tight text-fg leading-tight">
            Progress you can see, computed from what you solved.
          </h2>
          <p className="mt-4 text-fg-secondary text-lg leading-relaxed">
            XP, levels, streaks and stage unlocks are all derived from your real attempts. Nothing on this page is a mock-up:
            these are your numbers right now.
          </p>
        </Reveal>

        <div className="grid grid-cols-1 lg:grid-cols-[1fr_1fr] gap-6 lg:gap-8">
          {/* Your numbers */}
          <Reveal delay={80}>
            <div ref={barsRef} className="progress-card landing-progress h-full">
              <div className="grid grid-cols-3 gap-6 pb-6 mb-6 border-b border-border-subtle">
                <Stat label="Streak" value={`${habits.streak} ${habits.streak === 1 ? 'day' : 'days'}`} />
                <Stat label="Level" value={String(level.level).padStart(2, '0')} hint={rankTitle(level.level)} />
                <Stat label="XP" value={stats.xp.toLocaleString()} hint={nextRank ? `next rank at level ${nextRank}` : 'top rank'} />
              </div>

              <div className="mb-6">
                <div className="flex items-center justify-between text-sm mb-2">
                  <span className="text-fg">Level {String(level.level).padStart(2, '0')}</span>
                  <span className="font-mono text-xs text-fg-muted">
                    {level.into} / {level.needed} XP
                  </span>
                </div>
                <ProgressBar value={barsIn ? level.percent : 0} label={`${level.into} of ${level.needed} XP into this level`} />
              </div>

              {goal && (
                <div>
                  <div className="flex items-center justify-between text-sm mb-2">
                    <span className="text-fg">Daily goal · {goal.label}</span>
                    <span className="font-mono text-xs text-fg-muted">{describeGoalProgress(goal.metric, goal.done, goal.target)}</span>
                  </div>
                  <ProgressBar
                    value={barsIn ? goal.percent : 0}
                    tone="success"
                    label={`Daily goal: ${describeGoalProgress(goal.metric, goal.done, goal.target).replace(' / ', ' of ')} today`}
                  />
                </div>
              )}
            </div>
          </Reveal>

          {/* Stage unlocks */}
          <Reveal delay={160}>
            <div className="progress-card h-full">
              <div className="eyebrow">Stage unlocks</div>
              <ol className="border-t border-border-subtle">
                {shown.map((stage, i) => {
                  const done = stage.state === 'Completed';
                  const active = stage.state === 'In progress' || stage.state === 'Test pending';
                  return (
                    <Reveal
                      as="li"
                      key={stage.id}
                      delay={260 + i * 70}
                      className="flex items-center gap-3 py-3 border-b border-border-subtle"
                    >
                      {done ? (
                        <span className="w-5 h-5 rounded-xs bg-success-soft text-success flex items-center justify-center shrink-0">
                          <Check size={12} strokeWidth={2.5} />
                        </span>
                      ) : active ? (
                        <span className="w-5 h-5 rounded-xs border-[1.5px] border-accent shrink-0" />
                      ) : (
                        <span className="w-5 h-5 flex items-center justify-center text-fg-muted shrink-0">
                          <Lock size={12} />
                        </span>
                      )}
                      <span className="font-mono text-xs text-fg-muted w-6 shrink-0">{String(stage.index).padStart(2, '0')}</span>
                      <span className={`text-sm truncate ${active ? 'text-fg font-medium' : done ? 'text-fg-secondary' : 'text-fg-muted'}`}>
                        {stage.name}
                      </span>
                      {active && <span className="ml-auto badge badge-accent">Current</span>}
                    </Reveal>
                  );
                })}
                {stages.length > shown.length && (
                  <li className="py-3 text-xs text-fg-muted font-mono">+ {stages.length - shown.length} more stages</li>
                )}
              </ol>
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  );
};
