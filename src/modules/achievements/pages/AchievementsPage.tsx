import React, { useMemo } from 'react';
import { Award, Code2, Flame, Lock, Star, Swords } from 'lucide-react';
import { PageHeader } from '@/ui/primitives/PageHeader';
import { useSession } from '@/platform/session';
import { levelProgress, xpForLevel } from '@/platform/xp-leveling/leveling';
import { achievements, rankTitle, relativeDay } from '@/platform/xp-leveling/insights';

const CARD = 'bg-gray-50 dark:bg-[#161b22] border border-black/5 dark:border-white/5 rounded-2xl';

const ICONS = {
  streak: <Flame size={20} className="text-[var(--color-warning)]" />,
  stage: <Award size={20} className="text-[var(--color-secondary)]" />,
  first: <Star size={20} className="text-[var(--color-primary)]" />,
  xp: <Code2 size={20} className="text-[#a855f7]" />,
  test: <Swords size={20} className="text-[var(--color-secondary)]" />
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

  const figures = [
    ['Total XP', stats.xp.toLocaleString()],
    ['Solved', `${solved.size} / ${allChallenges.length}`],
    ['Stages cleared', `${stagesCleared} / ${stages.length}`],
    ['Stage tests passed', `${testsPassed} / ${stages.filter((s) => s.test).length}`],
    ['Streak', `${stats.streak}d${stats.bestStreak > stats.streak ? ` · best ${stats.bestStreak}d` : ''}`],
    ['Avg. score', accuracy === null ? '—' : `${accuracy}%`]
  ];

  return (
    <div className="p-6 sm:p-8 max-w-6xl mx-auto space-y-8">
      <PageHeader
        eyebrow="Achievements"
        title="Every lesson moves a bar"
        description="Your numbers, not a mock-up."
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Level */}
        <div className={`${CARD} p-6 lg:col-span-1`}>
          <div className="text-xs font-mono uppercase tracking-wider text-gray-500 mb-3">Developer level</div>
          <div className="flex items-end gap-3 mb-4">
            <span className="text-5xl font-bold font-mono text-gray-900 dark:text-white leading-none">{level.level}</span>
            <span className="text-sm text-gray-600 dark:text-gray-400 pb-1">{rankTitle(level.level)}</span>
          </div>
          <div className="w-full h-2 bg-black/5 dark:bg-white/10 rounded-full overflow-hidden mb-2">
            <div className="h-full bg-[var(--color-primary)] transition-all" style={{ width: `${level.percent}%` }} />
          </div>
          <div className="text-xs text-gray-500 font-mono">
            {level.into} / {level.needed} XP to level {level.level + 1} · next at {xpForLevel(level.level + 1)} XP
          </div>

          <dl className="grid grid-cols-2 gap-4 mt-6">
            {figures.map(([label, value]) => (
              <div key={label}>
                <dt className="text-xs text-gray-500">{label}</dt>
                <dd className="font-mono font-bold text-gray-900 dark:text-white">{value}</dd>
              </div>
            ))}
          </dl>
        </div>

        {/* Coverage by language */}
        <div className={`${CARD} p-6 lg:col-span-2`}>
          <div className="text-xs font-mono uppercase tracking-wider text-gray-500 mb-4">Coverage by language</div>
          {solved.size === 0 && (
            <p className="text-sm text-gray-500 mb-4">Nothing solved yet. Every bar here fills in as you work through the path.</p>
          )}
          <div className="space-y-3">
            {byLanguage.map((lang) => (
              <div key={lang.name} className="flex items-center gap-4">
                <span className="w-28 shrink-0 text-sm text-gray-700 dark:text-gray-300 capitalize">{lang.name}</span>
                <div className="flex-1 h-1.5 bg-black/5 dark:bg-white/10 rounded-full overflow-hidden">
                  <div className="h-full bg-[var(--color-secondary)] transition-all" style={{ width: `${lang.percent}%` }} />
                </div>
                <span className="w-16 text-right font-mono text-xs text-gray-500">
                  {lang.done}/{lang.total}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Badges */}
      <section>
        <div className="flex items-baseline justify-between mb-4">
          <h2 className="text-lg font-bold text-gray-900 dark:text-white">Badges</h2>
          <span className="text-xs text-gray-500 font-mono">
            {earned.length} / {badges.length} earned
          </span>
        </div>
        <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {badges.map((b) => (
            <li
              key={b.id}
              className={`flex items-center gap-3 p-4 rounded-xl border ${
                b.earnedAt
                  ? 'bg-gray-50 dark:bg-[#161b22] border-black/5 dark:border-white/5'
                  : 'border-dashed border-black/10 dark:border-white/10 opacity-70'
              }`}
            >
              <div
                className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${
                  b.earnedAt ? 'bg-black/5 dark:bg-white/5' : 'bg-black/5 dark:bg-white/5'
                }`}
              >
                {b.earnedAt ? ICONS[b.kind] : <Lock size={16} className="text-gray-400" />}
              </div>
              <div className="min-w-0">
                <div className="text-sm font-medium text-gray-900 dark:text-white truncate">{b.title}</div>
                <div className="text-xs text-gray-500 truncate">
                  {b.earnedAt ? `Earned ${relativeDay(b.earnedAt)}` : b.detail}
                </div>
              </div>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
};
