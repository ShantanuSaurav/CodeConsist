import React, { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Check, Circle, Lock } from 'lucide-react';
import { useSession } from '@/platform/session';
import { intents } from '@/platform/events';
import { ROUTES } from '@/config/routes';
import { isPremiumLocked, stageStatus } from '@/platform/progress';
import { levelProgress } from '@/platform/xp-leveling/leveling';
import { achievements, activityGrid, greeting, rankTitle, relativeDay, solvedOn, xpEarnedOn } from '@/platform/xp-leveling/insights';
import { Button, ButtonLink, ProgressBar, Stat } from '@/ui';

/* Heat levels: from the page surface up to the accent, no glow. */
const HEAT = ['bg-surface-3', 'bg-accent/30', 'bg-accent/55', 'bg-accent/80', 'bg-accent'];
const DAILY_SOLVES = 3;
const DAILY_XP = 100;

export const DashboardHome: React.FC = () => {
  const { stats, stages, learnerStages, user, challengeById, activeTrack } = useSession();
  const level = levelProgress(stats.xp);
  const name = user && user.provider !== 'guest' ? user.username : 'there';

  // Where to pick up: the stage whose test is waiting, else the one in
  // progress, WITHIN the learner's selected track - "Continue learning" never
  // jumps into a different language's stage.
  const current = useMemo(
    () => learnerStages.find((s) => s.state === 'Test pending') ?? learnerStages.find((s) => s.state === 'In progress') ?? null,
    [learnerStages]
  );
  const currentStatus = current ? stageStatus(current, stats) : null;
  // A premium stage the learner has not bought is skippable, not a blocker;
  // one they own counts like any other stage.
  const allDone = !current && learnerStages.length > 0 && learnerStages.every((s) => s.state === 'Completed' || isPremiumLocked(s, stats));

  const grid = useMemo(() => activityGrid(stats, 14), [stats]);
  const todaySolves = solvedOn(stats).length;
  const todayXp = xpEarnedOn(stats, challengeById);
  const recent = useMemo(() => achievements(stats, stages).filter((a) => a.earnedAt).slice(0, 3), [stats, stages]);
  const nextUp = useMemo(() => achievements(stats, stages).find((a) => !a.earnedAt), [stats, stages]);

  const goals = [
    { label: 'Complete a lesson', done: todaySolves >= 1, detail: todaySolves >= 1 ? 'Done' : '0 / 1' },
    { label: `Solve ${DAILY_SOLVES} challenges`, done: todaySolves >= DAILY_SOLVES, detail: `${Math.min(todaySolves, DAILY_SOLVES)} / ${DAILY_SOLVES}` },
    { label: `Earn ${DAILY_XP} XP`, done: todayXp >= DAILY_XP, detail: `${Math.min(todayXp, DAILY_XP)} / ${DAILY_XP}` }
  ];

  const stageNo = current ? String(current.index).padStart(2, '0') : null;

  return (
    <div className="page max-w-5xl">
      {/* ------------------------------------------------------------ header */}
      <header className="mb-8">
        <div className="eyebrow">Dashboard</div>
        <h1 className="text-[1.75rem] leading-tight font-semibold tracking-tight text-fg">
          {greeting()}, {name}.
        </h1>
        <p className="text-fg-secondary mt-1.5">
          {stats.streak > 0
            ? `${stats.streak}-day streak. Continue where you left off.`
            : todaySolves > 0
              ? 'Streak started. Come back tomorrow to keep it alive.'
              : 'Solve one challenge today to start a streak.'}
        </p>
      </header>

      {/* ------------------------------------------------- continue learning */}
      <section aria-labelledby="continue-heading" className="pb-8 mb-8 border-b border-border-subtle">
        <h2 id="continue-heading" className="eyebrow">
          {current?.state === 'Test pending' ? 'Stage test waiting' : 'Continue learning'}
        </h2>

        {current && currentStatus ? (
          <div className="grid gap-6 lg:grid-cols-[1fr_auto] lg:items-end">
            <div className="min-w-0">
              <div className="font-mono text-xs text-fg-muted mb-1">
                {activeTrack.track.label} · Stage {stageNo}
              </div>
              <h3 className="text-xl font-semibold text-fg tracking-tight">{current.name}</h3>
              <p className="text-fg-secondary mt-1 max-w-2xl">
                {current.state === 'Test pending' && current.test
                  ? `All ${currentStatus.total} lessons done. Pass "${current.test.title}" to unlock the next stage.`
                  : current.description}
              </p>

              <div className="mt-5 max-w-xl">
                <ProgressBar value={currentStatus.percent} label={`${currentStatus.done} of ${currentStatus.total} lessons`} />
                <div className="mt-2 flex items-center justify-between text-xs font-mono text-fg-muted">
                  <span>
                    {currentStatus.done} / {currentStatus.total} lessons completed
                  </span>
                  <span>{currentStatus.percent}%</span>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap gap-2 lg:flex-col lg:items-stretch">
              <Button
                variant="primary"
                onClick={() => (current.state === 'Test pending' ? intents.openStageTest(current.id) : intents.openPractice(current.id))}
              >
                {current.state === 'Test pending' ? 'Take the stage test' : currentStatus.done > 0 ? 'Continue lesson' : 'Start stage'}
                <ArrowRight size={15} />
              </Button>
              <ButtonLink to={ROUTES.learn} variant="secondary">
                All stages
              </ButtonLink>
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <h3 className="text-xl font-semibold text-fg tracking-tight">{allDone ? 'Every stage cleared' : 'Nothing in progress'}</h3>
              <p className="text-fg-secondary mt-1">
                {allDone
                  ? 'Revisit any stage from the Learn page, or drill specific topics in Challenges.'
                  : 'Open the Learn page to start Stage 01.'}
              </p>
            </div>
            <ButtonLink to={ROUTES.learn} variant="primary">
              Open the path <ArrowRight size={15} />
            </ButtonLink>
          </div>
        )}
      </section>

      {/* -------------------------------------------------------------- stats */}
      <section aria-label="Your numbers" className="pb-8 mb-8 border-b border-border-subtle">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-y-6 sm:divide-x sm:divide-border-subtle">
          <Stat
            label="Streak"
            value={`${stats.streak} ${stats.streak === 1 ? 'day' : 'days'}`}
            hint={stats.bestStreak > stats.streak ? `Best ${stats.bestStreak}` : undefined}
          />
          <Stat label="XP" value={stats.xp.toLocaleString()} hint={`${level.into} / ${level.needed} to next level`} className="sm:pl-6" />
          <Stat label="Level" value={String(level.level).padStart(2, '0')} hint={rankTitle(level.level)} className="sm:pl-6" />
          <Stat label="Solved" value={stats.completedChallenges.length} hint="challenges" className="sm:pl-6" />
        </div>
      </section>

      {/* ------------------------------------------------- activity + goals */}
      <div className="grid gap-10 lg:grid-cols-[1fr_18rem]">
        <section aria-labelledby="activity-heading" className="min-w-0">
          <div className="flex items-baseline justify-between mb-4">
            <h2 id="activity-heading" className="section-title">
              Activity
            </h2>
            <span className="text-xs text-fg-muted">Last 14 weeks</span>
          </div>
          <div className="overflow-x-auto scroll-thin pb-1">
            <div className="flex gap-1">
              {grid.map((column, i) => (
                <div key={i} className="flex flex-col gap-1">
                  {column.map((cell) => (
                    <div
                      key={cell.day}
                      className={`w-3 h-3 rounded-[2px] ${HEAT[cell.level]}`}
                      title={`${cell.day}: ${cell.count} solved`}
                    />
                  ))}
                </div>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-2 mt-3 text-xs text-fg-muted">
            <span>Less</span>
            <div className="flex gap-1">
              {HEAT.map((cls) => (
                <div key={cls} className={`w-3 h-3 rounded-[2px] ${cls}`} />
              ))}
            </div>
            <span>More</span>
          </div>

          {/* Recent achievements, as a list under the activity graph. */}
          <div className="mt-8">
            <div className="flex items-baseline justify-between mb-2">
              <h3 className="text-sm font-medium text-fg">Recent achievements</h3>
              <Link to={ROUTES.achievements} className="text-xs text-fg-muted hover:text-fg">
                View all
              </Link>
            </div>
            <ul className="row-list">
              {recent.length === 0 && (
                <li className="py-3 text-sm text-fg-muted">Nothing yet — your first solve unlocks the first badge.</li>
              )}
              {recent.map((a) => (
                <li key={a.id} className="row py-2.5">
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="w-5 h-5 rounded-xs bg-success-soft text-success flex items-center justify-center shrink-0">
                      <Check size={12} strokeWidth={2.5} />
                    </span>
                    <span className="text-sm text-fg truncate">{a.title}</span>
                  </div>
                  <span className="text-xs text-fg-muted shrink-0">{relativeDay(a.earnedAt!)}</span>
                </li>
              ))}
              {nextUp && (
                <li className="row py-2.5">
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="w-5 h-5 rounded-xs bg-surface-3 text-fg-muted flex items-center justify-center shrink-0">
                      <Lock size={11} />
                    </span>
                    <span className="text-sm text-fg-secondary truncate">
                      Next: {nextUp.title} <span className="text-fg-muted">— {nextUp.detail}</span>
                    </span>
                  </div>
                </li>
              )}
            </ul>
          </div>
        </section>

        <section aria-labelledby="goals-heading" className="min-w-0">
          <h2 id="goals-heading" className="section-title mb-4">
            Daily goals
          </h2>
          <ul className="row-list">
            {goals.map((g) => (
              <li key={g.label} className="row py-2.5">
                <div className="flex items-center gap-3 min-w-0">
                  {g.done ? (
                    <span className="w-5 h-5 rounded-xs bg-success-soft text-success flex items-center justify-center shrink-0">
                      <Check size={12} strokeWidth={2.5} />
                    </span>
                  ) : (
                    <span className="w-5 h-5 flex items-center justify-center text-fg-muted shrink-0">
                      <Circle size={12} />
                    </span>
                  )}
                  <span className={`text-sm ${g.done ? 'text-fg-secondary line-through' : 'text-fg'}`}>{g.label}</span>
                </div>
                <span className="text-xs font-mono text-fg-muted shrink-0">{g.detail}</span>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
};
