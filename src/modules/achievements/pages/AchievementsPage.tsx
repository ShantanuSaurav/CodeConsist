import React, { useMemo } from 'react';
import { Award, Code2, Flame, Lock, Star, Swords } from 'lucide-react';
import { PageHeader, ProgressBar, SectionHeader, Stat } from '@/ui';
import { useSession } from '@/platform/session';
import { levelProgress, xpForLevel } from '@/platform/xp-leveling/leveling';
import { achievements, rankTitle, relativeDay } from '@/platform/xp-leveling/insights';

/** Display names for the few languages whose slug does not read well capitalised. */
const LANGUAGE_LABEL: Record<string, string> = { cpp: 'C++', javascript: 'JavaScript', sql: 'SQL', html: 'HTML', css: 'CSS' };

const ICONS = {
  streak: <Flame size={15} />,
  stage: <Award size={15} />,
  first: <Star size={15} />,
  xp: <Code2 size={15} />,
  test: <Swords size={15} />
};

/**
 * Progress, computed from what the player has actually done. Every figure on
 * this page is derived from stats and content - none of it is decorative.
 */
export const AchievementsPage: React.FC = () => {
  const { stats, stages, allChallenges } = useSession();
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

  const badges = useMemo(() => achievements(stats, stages), [stats, stages]);
  const earned = badges.filter((b) => b.earnedAt);
  const stagesCleared = stages.filter((s) => s.state === 'Completed').length;
  const testsPassed = stages.filter((s) => s.test && solved.has(s.test.id)).length;

  return (
    <div className="page max-w-5xl">
      <PageHeader eyebrow="Achievements" title="Progress" description="Every figure on this page is derived from what you have actually solved." />

      {/* ------------------------------------------------------------- level */}
      <section className="pb-8 mb-8 border-b border-border-subtle" aria-labelledby="level-heading">
        <div className="grid gap-8 lg:grid-cols-[minmax(0,20rem)_1fr]">
          <div>
            <h2 id="level-heading" className="eyebrow">
              Developer level
            </h2>
            <div className="flex items-baseline gap-3">
              <span className="text-4xl font-semibold font-mono text-fg tabular-nums leading-none">{String(level.level).padStart(2, '0')}</span>
              <span className="text-sm text-fg-secondary">{rankTitle(level.level)}</span>
            </div>
            <ProgressBar value={level.percent} className="mt-4" label={`${level.into} of ${level.needed} XP to level ${level.level + 1}`} />
            <div className="mt-2 text-xs font-mono text-fg-muted">
              {level.into} / {level.needed} XP to level {level.level + 1} · next at {xpForLevel(level.level + 1).toLocaleString()} XP
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-5">
            <Stat label="Total XP" value={stats.xp.toLocaleString()} />
            <Stat label="Solved" value={solved.size} hint={`of ${allChallenges.length}`} />
            <Stat label="Stages cleared" value={stagesCleared} hint={`of ${stages.length}`} />
            <Stat label="Tests passed" value={testsPassed} hint={`of ${stages.filter((s) => s.test).length}`} />
            <Stat label="Streak" value={`${stats.streak}d`} hint={stats.bestStreak > stats.streak ? `best ${stats.bestStreak}d` : undefined} />
            <Stat label="Avg. score" value={accuracy === null ? '—' : `${accuracy}%`} />
          </div>
        </div>
      </section>

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
        <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 border-t border-l border-border-subtle">
          {badges.map((b) => (
            <li key={b.id} className={`flex items-center gap-3 p-4 border-r border-b border-border-subtle ${b.earnedAt ? '' : 'opacity-60'}`}>
              <div
                className={`w-8 h-8 rounded-sm flex items-center justify-center shrink-0 ${
                  b.earnedAt ? 'bg-accent-soft text-accent' : 'bg-surface-2 text-fg-muted'
                }`}
                aria-hidden="true"
              >
                {b.earnedAt ? ICONS[b.kind] : <Lock size={13} />}
              </div>
              <div className="min-w-0">
                <div className="text-sm font-medium text-fg truncate">{b.title}</div>
                <div className="text-xs text-fg-muted truncate">{b.earnedAt ? `Earned ${relativeDay(b.earnedAt)}` : b.detail}</div>
              </div>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
};
