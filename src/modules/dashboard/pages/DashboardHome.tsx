import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { ArrowRight, Check, Lock, Snowflake } from 'lucide-react';
import { useLeveling, useSession } from '@/platform/session';
import { intents } from '@/platform/events';
import { ROUTES } from '@/config/routes';
import { isPremiumLocked, stageStatus } from '@/platform/progress';
import { achievements, badgeProgress, dayOf, greeting, nextBadge, relativeDay } from '@/platform/xp-leveling/insights';
import { activityGridFromLog } from '@/platform/activity/log';
import { describeGoalProgress, describeGoalTarget } from '@/platform/habits';
import { fillCopy } from '@/platform/settings';
import { formatDayLabel } from '@/platform/time/days';
import { Button, ButtonLink, ChoiceCards, ProgressBar, ProgressRing, Stat, StreakStrip } from '@/ui';

/* Heat levels: from the page surface up to the accent, no glow. */
const HEAT = ['bg-surface-3', 'bg-accent/30', 'bg-accent/55', 'bg-accent/80', 'bg-accent'];

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** Text ending as a sentence: a full stop added only when it has no closing punctuation of its own. */
const sentence = (text: string) => {
  const t = text.trim();
  return !t || /[.!?…]$/.test(t) ? t : `${t}.`;
};

/**
 * Today's goal and the streak behind it: the ring, how far along, the goal
 * picker, freezes and the last two weeks. Everything comes from the session's
 * derived `habits` (the habits engine) and the admin's goal options.
 */
const DailyGoalCard: React.FC = () => {
  const { habits, goalOptions, dailyGoalId, setDailyGoal, streakStrip, settings } = useSession();
  const [changing, setChanging] = useState(false);
  const changeButton = useRef<HTMLButtonElement>(null);
  /** Close the picker; focus goes back to the button that opened it. */
  const closePicker = () => {
    setChanging(false);
    changeButton.current?.focus();
  };
  const goal = habits.goal;
  const strip = useMemo(() => streakStrip(14), [streakStrip]);
  const chosen = dailyGoalId && goalOptions.some((o) => o.id === dailyGoalId) ? dailyGoalId : goal && !goal.fromSnapshot ? goal.optionId : settings.goals.defaultOptionId;

  return (
    <section id="daily-goal" aria-labelledby="goals-heading" className="min-w-0 scroll-mt-16">
      <div className="flex items-baseline justify-between gap-3 mb-4">
        <h2 id="goals-heading" className="section-title">
          {goal ? 'Daily goal' : 'Streak'}
        </h2>
        {goal && goalOptions.length > 1 && (
          <button
            ref={changeButton}
            type="button"
            className="link-btn text-sm inline-flex items-center min-h-[44px] px-2 -mr-2"
            onClick={() => setChanging((v) => !v)}
            aria-expanded={changing}
          >
            {changing ? 'Done' : 'Change'}
          </button>
        )}
      </div>

      {goal && (
        <div className="flex items-center gap-4">
          <ProgressRing
            value={goal.done}
            max={goal.target}
            size={64}
            stroke={6}
            tone={goal.met ? 'success' : 'accent'}
            label={goal.met ? 'Daily goal met' : goal.reached ? 'Daily goal reached, not counted yet' : `Daily goal ${goal.percent}% done`}
          >
            {goal.met ? <Check size={18} strokeWidth={3} className="text-success" /> : `${goal.percent}%`}
          </ProgressRing>
          <div className="min-w-0">
            <div className="text-lg font-semibold text-fg font-mono tabular-nums">{describeGoalProgress(goal.metric, goal.done, goal.target)}</div>
            <div className="text-sm text-fg-secondary">
              {goal.label}
              {goal.met
                ? goal.bonusXp > 0
                  ? ` · done for today, +${goal.bonusXp} XP bonus`
                  : ' · done for today'
                : goal.reached
                  ? // Lowered after today's last lesson: counted (and paid) by the next one.
                    ` · reached - one more lesson today counts it${goal.bonusXp > 0 ? ` (+${goal.bonusXp} XP)` : ''}`
                  : goal.bonusXp > 0
                    ? ` · +${goal.bonusXp} XP when you reach it`
                    : ''}
            </div>
          </div>
        </div>
      )}
      {goal?.fromSnapshot && (
        <p className="text-xs text-fg-muted mt-2">Today counted towards your earlier goal. The one you picked applies from tomorrow.</p>
      )}

      {changing && goal && (
        <div className="mt-4">
          <ChoiceCards
            ariaLabel="Daily goal"
            columns={1}
            value={chosen}
            onChange={(id, via) => {
              setDailyGoal(id);
              // The arrow keys browse (each one checks a card); a click,
              // Enter or Space settles it and closes the picker.
              if (via === 'pick') closePicker();
            }}
            options={goalOptions.map((o) => ({
              value: o.id,
              title: o.label,
              description: o.blurb || undefined,
              meta: `${describeGoalTarget(o.metric, o.target)}${o.bonusXp > 0 ? ` · +${o.bonusXp} XP` : ''}`
            }))}
          />
        </div>
      )}

      <div className="mt-5 space-y-2 text-sm">
        {habits.freezesEnabled && (
          <p className="flex items-center gap-2 text-fg-secondary">
            <Snowflake size={14} className="text-info shrink-0" aria-hidden="true" />
            <span>
              Freezes {habits.freezes}/{habits.maxFreezes}
              {habits.nextFreezeIn !== null
                ? ` · next in ${plural(habits.nextFreezeIn, 'goal day')}`
                : habits.maxFreezes > 0 && habits.freezes >= habits.maxFreezes
                  ? ' · the most you can hold'
                  : ''}
            </span>
          </p>
        )}
        {habits.repair && habits.repair.remaining > 0 && (
          <p className="text-warning">
            {fillCopy(settings.reminders.streakBroken.body, { remaining: habits.repair.remaining, deadline: formatDayLabel(habits.repair.deadline) })}
          </p>
        )}
      </div>

      <div className="mt-4">
        <div className="flex items-baseline justify-between mb-2">
          <span className="text-xs text-fg-muted">Last 14 days</span>
          <span className="text-xs text-fg-muted">Best {plural(habits.bestStreak, 'day')}</span>
        </div>
        <StreakStrip days={strip} formatDay={(d) => formatDayLabel(d)} legend />
      </div>
    </section>
  );
};

export const DashboardHome: React.FC = () => {
  const { stats, stages, learnerStages, user, activeTrack, activity, todayKey, settings, habits } = useSession();
  const { levelProgress, rankTitle } = useLeveling();
  const location = useLocation();
  // The streak chip links here (#daily-goal): bring the goal card into view
  // on every arrival - a tap on the chip while already here is a new
  // navigation (a new location key) with the same hash.
  useEffect(() => {
    if (location.hash !== '#daily-goal') return;
    document.getElementById('daily-goal')?.scrollIntoView({ block: 'start' });
  }, [location.hash, location.key]);
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

  // The heatmap reads the day log (in the learner's zone), and falls back to
  // the solve times in `attempts` for days before the log began.
  const grid = useMemo(() => {
    const fromAttempts = new Map<string, number>();
    for (const a of Object.values(stats.attempts)) {
      const day = dayOf(a.solvedAt);
      if (day) fromAttempts.set(day, (fromAttempts.get(day) ?? 0) + 1);
    }
    return activityGridFromLog(activity.days, 14, todayKey, (day) => fromAttempts.get(day) ?? 0);
  }, [activity.days, stats.attempts, todayKey]);
  const badgeOptions = useMemo(() => ({ perfectRequiresNoHints: settings.units.perfectRequiresNoHints }), [settings.units.perfectRequiresNoHints]);
  const recent = useMemo(
    () => achievements(stats, stages, settings.badges, badgeOptions).filter((a) => a.earnedAt).slice(0, 3),
    [stats, stages, settings.badges, badgeOptions]
  );
  // The badge family closest to its next tier: "Silver · 7-day streak - 5 / 7".
  const nextUp = useMemo(() => nextBadge(badgeProgress(stats, stages, settings.badges, badgeOptions)), [stats, stages, settings.badges, badgeOptions]);

  // The line under the greeting: the streak as it stands today (freezes
  // applied), at risk this evening, or today's goal already done. What keeps
  // a streak follows the day rule in effect (`habits.dayRule`).
  const streak = habits.streak;
  const goalKeeps = habits.dayRule === 'goal-met' && habits.goal !== null;
  const headline = habits.atRisk
    ? // The admin's words as they are, then the rule as a sentence of its own.
      `${sentence(fillCopy(settings.reminders.atRisk.title, { streak }))} ${goalKeeps ? 'Meet today’s goal to keep it.' : 'One lesson today keeps it.'}`
    : habits.goal?.met
      ? `Today's goal is done.${streak > 0 ? ` ${streak}-day streak.` : ''}`
      : streak > 0
        ? habits.activeToday
          ? `${streak}-day streak. Continue where you left off.`
          : goalKeeps
            ? `${streak}-day streak. Meet today’s goal to keep it going.`
            : `${streak}-day streak. One lesson today keeps it going.`
        : goalKeeps
          ? 'Meet today’s goal to start a streak.'
          : 'Solve one challenge today to start a streak.';

  const stageNo = current ? String(current.index).padStart(2, '0') : null;

  return (
    <div className="page max-w-5xl">
      {/* ------------------------------------------------------------ header */}
      <header className="mb-8">
        <div className="eyebrow">Dashboard</div>
        <h1 className="text-[1.75rem] leading-tight font-semibold tracking-tight text-fg">
          {greeting()}, {name}.
        </h1>
        <p className="text-fg-secondary mt-1.5">{headline}</p>
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
            value={plural(habits.streak, 'day')}
            hint={
              habits.freezesEnabled && habits.freezes > 0
                ? plural(habits.freezes, 'freeze')
                : habits.bestStreak > habits.streak
                  ? `Best ${habits.bestStreak}`
                  : undefined
            }
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
                      title={`${cell.day}: ${cell.count} solved${cell.xp !== undefined ? ` · ${cell.xp} XP` : ''}`}
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
              {nextUp?.next && (
                <li className="py-2.5">
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="w-5 h-5 rounded-xs bg-surface-3 text-fg-muted flex items-center justify-center shrink-0">
                      <Lock size={11} />
                    </span>
                    <span className="flex-1 min-w-0 text-sm text-fg-secondary truncate">
                      Next badge: {nextUp.next.tierName} · {nextUp.next.title}
                    </span>
                    <span className="text-xs font-mono text-fg-muted shrink-0">
                      {nextUp.value.toLocaleString()} / {nextUp.next.n.toLocaleString()}
                    </span>
                  </div>
                  {/* Indented under the text in a wrapper: the bar is full width, so a margin on it would overflow. */}
                  <div className="mt-2 pl-8">
                    <ProgressBar
                      value={nextUp.percent}
                      size="sm"
                      label={`${nextUp.value} of ${nextUp.next.n} towards ${nextUp.next.title}`}
                    />
                  </div>
                </li>
              )}
            </ul>
          </div>
        </section>

        <DailyGoalCard />
      </div>
    </div>
  );
};
