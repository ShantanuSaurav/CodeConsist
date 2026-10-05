import '../styles/achievements.css';
import React, { useMemo } from 'react';
import { Award, Code2, Flame, Layers, Sparkles, Star, Swords } from 'lucide-react';
import { PageHeader, ProgressBar, SectionHeader, Stat, StreakFlame, StreakStrip } from '@/ui';
import type { HabitStatus } from '@/platform/habits';
import { addDays, daysBetween, formatDayLabel } from '@/platform/time/days';
import { BadgeTierChip } from '@/ui/celebrations';
import { useLeveling, useSession } from '@/platform/session';
import { achievements, badgeProgress, relativeDay } from '@/platform/xp-leveling/insights';
import type { AchievementKind, BadgeFamilyProgress } from '@/platform/xp-leveling/insights';

/** Display names for the few languages whose slug does not read well capitalised. */
const LANGUAGE_LABEL: Record<string, string> = { cpp: 'C++', javascript: 'JavaScript', sql: 'SQL', html: 'HTML', css: 'CSS' };

const ICONS: Record<AchievementKind, React.ReactNode> = {
  streak: <Flame size={15} />,
  stage: <Award size={15} />,
  first: <Star size={15} />,
  xp: <Code2 size={15} />,
  test: <Swords size={15} />,
  unit: <Layers size={15} />,
  perfect: <Sparkles size={15} />
};

/** What a family's number counts, for "5 / 7 days to Silver". */
const METRIC_UNIT: Record<string, string> = {
  bestStreak: 'days',
  solvedCount: 'solved',
  unitsCompleted: 'units',
  perfectUnits: 'perfect units',
  xp: 'XP',
  testsPassed: 'tests'
};

const KIND_OF_METRIC: Record<string, AchievementKind> = {
  bestStreak: 'streak',
  solvedCount: 'xp',
  unitsCompleted: 'unit',
  perfectUnits: 'perfect',
  xp: 'xp',
  testsPassed: 'test'
};

const ENDED: Record<string, string> = { missed: 'ended by a missed day', reset: 'ended by a progress reset', admin: 'ended by support' };

const days = (n: number) => `${n} ${n === 1 ? 'day' : 'days'}`;

/**
 * The streak's history: the run going on now, the best one, the runs that
 * ended (when, how long, how) and the last 30 days. Runs are recorded from
 * the day streak history was added, so older streaks show only in the best.
 */
const StreakHistory: React.FC<{ habits: HabitStatus; strip: ReturnType<ReturnType<typeof useSession>['streakStrip']> }> = ({ habits, strip }) => {
  const runs = [...habits.runs].reverse();
  const best = Math.max(habits.bestStreak, habits.streak, ...habits.runs.map((r) => r.length));
  const currentStart = habits.streak > 0 ? habits.runStart ?? (habits.lastActiveDay ? addDays(habits.lastActiveDay, -(habits.streak - 1)) : null) : null;
  return (
    <section className="pb-8 mb-8 border-b border-border-subtle" aria-labelledby="streak-history-heading">
      <SectionHeader title={<span id="streak-history-heading">Streak history</span>} />
      <div className="grid gap-8 lg:grid-cols-[minmax(0,20rem)_1fr]">
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <StreakFlame streak={habits.streak} size={22} label={days(habits.streak)} className="text-xl" />
          </div>
          <p className="text-sm text-fg-secondary">
            {habits.streak > 0 && currentStart
              ? `Current streak since ${formatDayLabel(currentStart, { year: true })}.`
              : 'No streak going right now - one lesson today starts one.'}
            {best > 0 ? ` Your best is ${days(best)}.` : ''}
          </p>
          {habits.freezesEnabled && (
            <p className="text-sm text-fg-secondary">
              {habits.freezes} of {habits.maxFreezes} streak {habits.maxFreezes === 1 ? 'freeze' : 'freezes'} held.
            </p>
          )}
          <div>
            <div className="text-xs text-fg-muted mb-2">Last 30 days</div>
            <StreakStrip days={strip} formatDay={(d) => formatDayLabel(d)} legend />
          </div>
        </div>
        <div className="min-w-0">
          <h3 className="text-sm font-medium text-fg mb-2">Past streaks</h3>
          {runs.length === 0 ? (
            <p className="text-sm text-fg-muted">None yet. A streak that ends is listed here, with how long it ran.</p>
          ) : (
            <ul className="row-list">
              {runs.slice(0, 12).map((run) => (
                <li key={`${run.start}:${run.end}:${run.ended}`} className="row py-2.5">
                  <div className="min-w-0">
                    <div className="text-sm text-fg">{days(run.length)}</div>
                    <div className="text-xs text-fg-muted">
                      {formatDayLabel(run.start, { year: true })} - {formatDayLabel(run.end, { year: true })} · {ENDED[run.ended] ?? 'ended'}
                    </div>
                  </div>
                  <span className="text-xs font-mono text-fg-muted shrink-0">{daysBetween(run.end, habits.day)}d ago</span>
                </li>
              ))}
            </ul>
          )}
          <p className="text-xs text-fg-muted mt-3">Past streaks are recorded from when streak history was added to CodeConsist.</p>
        </div>
      </div>
    </section>
  );
};

/** One tiered badge family: the tier reached, a pip per tier, and how far to the next. */
const FamilyCard: React.FC<{ family: BadgeFamilyProgress }> = ({ family: f }) => {
  const unit = METRIC_UNIT[f.family.metric] ?? '';
  return (
    <li className="achievement-family" data-earned={Boolean(f.current)}>
      <div className="flex items-center gap-3">
        <div
          className={`achievement-medal flex items-center justify-center shrink-0 ${f.current ? 'bg-success-soft text-success' : 'border border-border text-fg-muted'}`}
          aria-hidden="true"
        >
          {ICONS[KIND_OF_METRIC[f.family.metric] ?? 'xp']}
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium text-fg truncate">{f.current?.title ?? f.next?.title ?? f.family.id}</div>
          <div className="text-xs text-fg-muted truncate">{f.next ? f.next.detail : 'Every tier earned'}</div>
        </div>
        {f.current ? <BadgeTierChip tierName={f.current.tierName} tierIndex={f.current.tier} /> : null}
      </div>
      <div className="mt-3 flex items-center gap-1" aria-hidden="true">
        {f.tiers.map((t) => (
          <span
            key={t.id}
            title={`${t.tierName}: ${t.title}${t.earnedAt ? ' (earned)' : ''}`}
            className={`h-1.5 flex-1 rounded-full ${t.earnedAt ? 'bg-success' : 'bg-surface-3'}`}
          />
        ))}
      </div>
      <ProgressBar
        value={f.percent}
        size="sm"
        className="mt-2"
        label={f.next ? `${f.value} of ${f.next.n} ${unit} to ${f.next.tierName}` : `${f.current?.title ?? 'This badge'}: every tier earned`}
      />
      <div className="mt-1.5 text-[11px] font-mono text-fg-muted">
        {f.next ? `${f.value.toLocaleString()} / ${f.next.n.toLocaleString()} ${unit} to ${f.next.tierName}` : 'Top tier'}
      </div>
    </li>
  );
};

/**
 * Progress, computed from what the player has actually done. Every figure on
 * this page is derived from stats and content - none of it is decorative.
 */
export const AchievementsPage: React.FC = () => {
  const { stats, stages, allChallenges, settings, habits, streakStrip } = useSession();
  const strip = useMemo(() => streakStrip(30), [streakStrip]);
  const { levelProgress, xpForLevel, rankTitle } = useLeveling();
  const level = levelProgress(stats.xp);
  const solved = useMemo(() => new Set(stats.completedChallenges), [stats.completedChallenges]);

  const byLanguage = useMemo(() => {
    const totals = new Map<string, { done: number; total: number }>();
    for (const c of allChallenges) {
      const entry = totals.get(c.language) ?? { done: 0, total: 0 };
      entry.total += 1;
      if (solved.has(c.id)) entry.done += 1;
      totals.set(c.language, entry);
    }
    return [...totals.entries()]
      .filter(([, v]) => v.total >= 5)
      .map(([name, v]) => ({ name, ...v, percent: Math.round((v.done / v.total) * 100) }))
      .sort((a, b) => b.total - a.total);
  }, [allChallenges, solved]);

  const accuracy = useMemo(() => {
    const entries = Object.values(stats.attempts);
    if (!entries.length) return null;
    return Math.round(entries.reduce((sum, a) => sum + a.score, 0) / entries.length);
  }, [stats.attempts]);

  // The badge rules the admin set (settings.badges): families, tier names, stage badges.
  const badgeOptions = useMemo(() => ({ perfectRequiresNoHints: settings.units.perfectRequiresNoHints }), [settings.units.perfectRequiresNoHints]);
  const badges = useMemo(() => achievements(stats, stages, settings.badges, badgeOptions), [stats, stages, settings.badges, badgeOptions]);
  const families = useMemo(() => badgeProgress(stats, stages, settings.badges, badgeOptions), [stats, stages, settings.badges, badgeOptions]);
  // Stage badges and the first solve; the tiers are shown by family above them.
  const singles = useMemo(() => {
    const order = (id: string) => (id === 'first-solve' ? -1 : stages.findIndex((s) => `stage-${s.id}` === id));
    return badges.filter((b) => !b.family).sort((a, b) => order(a.id) - order(b.id));
  }, [badges, stages]);
  const earned = badges.filter((b) => b.earnedAt);
  const stagesCleared = stages.filter((s) => s.state === 'Completed').length;
  const testsPassed = stages.filter((s) => s.test && solved.has(s.test.id)).length;

  return (
    <div className="page achievements-page">
      <PageHeader eyebrow="Achievements" title="Made of small wins." description="Every figure on this page is derived from what you have actually solved." />

      {/* ------------------------------------------------------------- level */}
      <section className="pb-8 mb-8 border-b border-border-subtle" aria-labelledby="level-heading">
        <div className="grid gap-8 lg:grid-cols-[minmax(0,20rem)_1fr]">
          <div>
            <h2 id="level-heading" className="eyebrow">
              Developer level
            </h2>
            <div className="flex items-baseline gap-3">
              <span className="achievement-level font-mono text-fg tabular-nums leading-none">{String(level.level).padStart(2, '0')}</span>
              <span className="text-sm text-fg-secondary">{rankTitle(level.level)}</span>
            </div>
            <ProgressBar value={level.percent} className="mt-4" label={`${level.into} of ${level.needed} XP to level ${level.level + 1}`} />
            <div className="mt-2 text-xs font-mono text-fg-muted">
              {level.into} / {level.needed} XP to level {String(level.level + 1).padStart(2, '0')} · {xpForLevel(level.level + 1).toLocaleString()} XP total
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-5">
            <Stat label="Total XP" value={stats.xp.toLocaleString()} />
            <Stat label="Solved" value={solved.size} hint={`of ${allChallenges.length}`} />
            <Stat label="Stages cleared" value={stagesCleared} hint={`of ${stages.length}`} />
            <Stat label="Tests passed" value={testsPassed} hint={`of ${stages.filter((s) => s.test).length}`} />
            <Stat label="Streak" value={`${habits.streak}d`} hint={habits.bestStreak > habits.streak ? `best ${habits.bestStreak}d` : undefined} />
            <Stat label="Avg. score" value={accuracy === null ? '—' : `${accuracy}%`} />
          </div>
        </div>
      </section>

      {/* ---------------------------------------------------- streak history */}
      <StreakHistory habits={habits} strip={strip} />

      {/* ---------------------------------------------------------- coverage */}
      <section className="pb-8 mb-8 border-b border-border-subtle" aria-labelledby="coverage-heading">
        <SectionHeader title={<span id="coverage-heading">Coverage by language</span>} />
        {solved.size === 0 && <p className="text-sm text-fg-muted mb-4">Nothing solved yet. Every bar here fills in as you work through the path.</p>}
        <div className="grid gap-3 sm:grid-cols-2 sm:gap-x-12">
          {byLanguage.map((lang) => (
            <div key={lang.name} className="flex items-center gap-4">
              <span className="w-24 shrink-0 text-sm text-fg-secondary capitalize">{LANGUAGE_LABEL[lang.name] ?? lang.name}</span>
              <ProgressBar value={lang.percent} size="sm" tone="neutral" className="flex-1" label={`${lang.done} of ${lang.total} ${lang.name} challenges`} />
              <span className="w-16 text-right font-mono text-xs text-fg-muted tabular-nums">
                {lang.done}/{lang.total}
              </span>
            </div>
          ))}
        </div>
      </section>

      {/* ------------------------------------------------------------ badges */}
      <section aria-labelledby="badges-heading">
        <SectionHeader
          title={<span id="badges-heading">Badges</span>}
          aside={
            <span className="text-xs text-fg-muted font-mono">
              {earned.length} / {badges.length} earned
            </span>
          }
        />
        {/* Tiered families: the tier reached and how far to the next one. */}
        {families.length > 0 && (
          <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 border-t border-l border-border-subtle mb-6" aria-label="Badge families">
            {families.map((f) => (
              <FamilyCard key={f.family.id} family={f} />
            ))}
          </ul>
        )}

        {/* The single badges: the first solve and one per stage. */}
        <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 border-t border-l border-border-subtle" aria-label="Stage badges">
          {singles.map((b) => (
            <li key={b.id} className="achievement-single flex items-center gap-3 p-4 border-r border-b border-border-subtle" data-earned={Boolean(b.earnedAt)}>
              <div
                className={`achievement-medal flex items-center justify-center shrink-0 ${
                  b.earnedAt ? 'bg-success-soft text-success' : 'border border-border'
                }`}
                aria-hidden="true"
              >
                {b.earnedAt ? ICONS[b.kind] : null}
              </div>
              <div className="min-w-0">
                <div className="text-sm font-medium text-fg truncate">{b.title}</div>
                <div className="text-xs text-fg-muted truncate">{b.earnedAt ? `Earned ${relativeDay(b.earnedAt)}` : b.detail}</div>
              </div>
            </li>
          ))}
        </ul>
      </section>
      <section className="achievement-timeline" aria-labelledby="achievement-timeline-title">
        <SectionHeader title={<span id="achievement-timeline-title">Your milestones</span>} />
        {earned.length ? <ol>{[...earned].sort((first, second) => String(second.earnedAt).localeCompare(String(first.earnedAt))).slice(0, 12).map((badge) => <li key={badge.id}><span>{badge.title}</span><time dateTime={badge.earnedAt!}>{relativeDay(badge.earnedAt!)}</time></li>)}</ol> : <p className="text-fg-muted">Your first completed challenge starts the story.</p>}
      </section>
    </div>
  );
};
