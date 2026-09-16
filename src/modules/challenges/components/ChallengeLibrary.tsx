import React, { useDeferredValue, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { BookOpen, CheckCircle2, Lock, Search, Swords } from 'lucide-react';
import { useSession } from '@/platform/session';
import { Challenge, Difficulty, ReadingResolver } from '@/types';
import { stageStatus } from '@/platform/progress';
import { intents } from '@/platform/events';
import { usePracticeSession } from '../session/PracticeSessionProvider';

export interface ChallengeLibraryProps {
  /** Reading for a challenge's stage and tags, if the app has any. */
  readingFor?: ReadingResolver;
}

const TYPE_LABELS: Record<Challenge['type'], string> = {
  quiz: 'Quiz',
  output_prediction: 'Output',
  multi_select: 'Multi',
  fill_blank: 'Blanks',
  pseudocode_order: 'Ordering',
  code_runner: 'Code',
  debug: 'Debug'
};

const DIFFICULTY_CLASS: Record<Difficulty, string> = {
  easy: 'bg-[var(--color-primary)]/10 text-[var(--color-primary)] border-[var(--color-primary)]/30',
  medium: 'bg-[var(--color-warning)]/10 text-[#8a5a00] dark:text-[var(--color-warning)] border-[var(--color-warning)]/30',
  hard: 'bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/30'
};

const SELECT =
  'px-3 py-2 rounded-lg text-sm bg-white dark:bg-[#0d1117] border border-black/10 dark:border-white/10 text-gray-800 dark:text-gray-200 focus:outline-none focus:border-[var(--color-primary)]';

type StatusFilter = 'all' | 'todo' | 'solved';
type TypeFilter = Challenge['type'] | 'stage_test' | 'all';

/**
 * Search and filter across the whole bank.
 *
 * The staged path is the guided route; this is for the person who wants to
 * drill one specific thing ("show me every SQL debug challenge I have not done").
 */
export const ChallengeLibrary: React.FC<ChallengeLibraryProps> = ({ readingFor }) => {
  const { allChallenges, stages, stats } = useSession();
  const { openPractice, openStageTest } = usePracticeSession();

  const [query, setQuery] = useState('');
  const [difficulty, setDifficulty] = useState<Difficulty | 'all'>('all');
  const [type, setType] = useState<TypeFilter>('all');
  const [status, setStatus] = useState<StatusFilter>('all');
  const [stageId, setStageId] = useState<string | 'all'>('all');
  const [limit, setLimit] = useState(24);

  const deferredQuery = useDeferredValue(query);

  const stageName = useMemo(() => new Map(stages.map((s) => [s.id, `${s.index} ${s.name}`])), [stages]);
  const lockedStages = useMemo(() => new Set(stages.filter((s) => s.state === 'Locked').map((s) => s.id)), [stages]);
  // Premium locks are a different thing from progression locks: one is solved by
  // upgrading, the other by working through the path.
  const premiumStages = useMemo(
    () => new Set(stages.filter((s) => s.isPremium && !stats.isPremium).map((s) => s.id)),
    [stages, stats.isPremium]
  );

  const filtered = useMemo(() => {
    const needle = deferredQuery.trim().toLowerCase();
    return allChallenges.filter((c) => {
      if (difficulty !== 'all' && c.difficulty !== difficulty) return false;
      if (type === 'stage_test') {
        if (!c.isStageTest) return false;
      } else if (type !== 'all' && (c.type !== type || c.isStageTest)) return false;
      if (stageId !== 'all' && c.stageId !== stageId) return false;

      const solved = stats.completedChallenges.includes(c.id);
      if (status === 'todo' && solved) return false;
      if (status === 'solved' && !solved) return false;

      if (!needle) return true;
      return (
        c.title.toLowerCase().includes(needle) ||
        c.prompt.toLowerCase().includes(needle) ||
        c.language.toLowerCase().includes(needle) ||
        (c.tags ?? []).some((t) => t.toLowerCase().includes(needle))
      );
    });
  }, [allChallenges, deferredQuery, difficulty, type, stageId, status, stats.completedChallenges]);

  const visible = filtered.slice(0, limit);

  const reset = () => {
    setQuery('');
    setDifficulty('all');
    setType('all');
    setStatus('all');
    setStageId('all');
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3">
        <label className="relative block">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="search"
            className="w-full pl-9 pr-3 py-2.5 rounded-lg text-sm bg-white dark:bg-[#0d1117] border border-black/10 dark:border-white/10 text-gray-900 dark:text-white placeholder:text-gray-400 focus:outline-none focus:border-[var(--color-primary)]"
            placeholder="Search titles, prompts, languages and tags…"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setLimit(24);
            }}
            aria-label="Search challenges"
          />
        </label>

        <div className="flex flex-wrap gap-2">
          <select className={SELECT} value={stageId} onChange={(e) => setStageId(e.target.value)} aria-label="Filter by stage">
            <option value="all">All stages</option>
            {stages.map((s) => (
              <option key={s.id} value={s.id}>
                {s.index} · {s.name}
              </option>
            ))}
          </select>

          <select
            className={SELECT}
            value={type}
            onChange={(e) => setType(e.target.value as TypeFilter)}
            aria-label="Filter by challenge type"
          >
            <option value="all">All types</option>
            <option value="stage_test">Stage tests</option>
            {Object.entries(TYPE_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>

          <select
            className={SELECT}
            value={difficulty}
            onChange={(e) => setDifficulty(e.target.value as Difficulty | 'all')}
            aria-label="Filter by difficulty"
          >
            <option value="all">Any difficulty</option>
            <option value="easy">Easy</option>
            <option value="medium">Medium</option>
            <option value="hard">Hard</option>
          </select>

          <div
            className="inline-flex rounded-lg border border-black/10 dark:border-white/10 overflow-hidden text-sm"
            role="group"
            aria-label="Filter by status"
          >
            {(['all', 'todo', 'solved'] as StatusFilter[]).map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => setStatus(value)}
                aria-pressed={status === value}
                className={`px-3 py-2 transition-colors ${
                  status === value
                    ? 'bg-[var(--color-primary)] text-white dark:text-black font-semibold'
                    : 'bg-white dark:bg-[#0d1117] text-gray-700 dark:text-gray-300 hover:bg-black/5 dark:hover:bg-white/5'
                }`}
              >
                {value === 'all' ? 'All' : value === 'todo' ? 'Not done' : 'Solved'}
              </button>
            ))}
          </div>
        </div>
      </div>

      <p className="text-sm text-gray-500 font-mono">
        {filtered.length} {filtered.length === 1 ? 'match' : 'matches'}
      </p>

      {filtered.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-black/10 dark:border-white/10 p-10 text-center">
          <p className="text-gray-600 dark:text-gray-400 mb-4">Nothing matches those filters.</p>
          <button
            type="button"
            onClick={reset}
            className="px-4 py-2 rounded-lg border border-black/10 dark:border-white/10 text-sm font-medium hover:bg-black/5 dark:hover:bg-white/5"
          >
            Clear filters
          </button>
        </div>
      ) : (
        <>
          <ul className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {visible.map((c) => {
              const solved = stats.completedChallenges.includes(c.id);
              const needsPro = premiumStages.has(c.stageId);
              const stage = stages.find((s) => s.id === c.stageId);
              // A stage test is gated on its lessons, not on the previous stage.
              const testLocked = Boolean(c.isStageTest) && stage ? !stageStatus(stage, stats).testUnlocked : false;
              const locked = (lockedStages.has(c.stageId) && !needsPro) || (testLocked && !solved);
              const best = stats.attempts[c.id];
              const reading = readingFor?.(c.stageId, c.tags) ?? null;

              return (
                <li
                  key={c.id}
                  className={`flex flex-col rounded-2xl border p-5 transition-colors ${
                    solved
                      ? 'bg-[var(--color-primary)]/5 border-[var(--color-primary)]/25'
                      : 'bg-gray-50 dark:bg-[#161b22] border-black/5 dark:border-white/5 hover:border-black/15 dark:hover:border-white/15'
                  }`}
                >
                  <div className="flex flex-wrap items-center gap-1.5 mb-3">
                    <span
                      className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border ${DIFFICULTY_CLASS[c.difficulty]}`}
                    >
                      {c.difficulty}
                    </span>
                    {c.isStageTest ? (
                      <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border border-[var(--color-secondary)]/40 text-[var(--color-secondary)] inline-flex items-center gap-1">
                        <Swords size={10} /> Stage test
                      </span>
                    ) : (
                      <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border border-black/10 dark:border-white/10 text-gray-600 dark:text-gray-400">
                        {TYPE_LABELS[c.type]}
                      </span>
                    )}
                    {solved && (
                      <span className="ml-auto text-[var(--color-primary)] inline-flex items-center gap-1 text-xs font-semibold">
                        <CheckCircle2 size={14} /> solved
                      </span>
                    )}
                  </div>

                  <h3 className="font-bold text-gray-900 dark:text-white leading-snug">{c.title}</h3>
                  <p className="text-sm text-gray-600 dark:text-gray-400 mt-1.5 line-clamp-3 flex-1">{c.prompt}</p>

                  <div className="flex items-center justify-between mt-4 text-xs">
                    <span className="text-gray-500 truncate">{stageName.get(c.stageId)}</span>
                    <span className="font-mono font-bold text-[var(--color-warning)] shrink-0">+{c.xpReward} XP</span>
                  </div>
                  {best && <div className="text-xs text-gray-500 mt-1">Best score {best.score}%</div>}
                  {reading && (
                    <Link
                      to={reading.href}
                      className="mt-2 inline-flex items-center gap-1.5 text-xs text-[var(--color-secondary)] hover:underline underline-offset-2"
                      title={reading.label}
                    >
                      <BookOpen size={12} className="shrink-0" />
                      <span className="truncate">{reading.label}</span>
                    </Link>
                  )}

                  <button
                    type="button"
                    className={`mt-4 w-full inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition ${
                      locked
                        ? 'bg-black/5 dark:bg-white/5 text-gray-400 cursor-not-allowed'
                        : needsPro
                          ? 'bg-[var(--color-warning)] text-black hover:brightness-110'
                          : solved
                            ? 'border border-black/10 dark:border-white/15 text-gray-800 dark:text-gray-100 hover:bg-black/5 dark:hover:bg-white/5'
                            : 'bg-[var(--color-primary)] text-white dark:text-black hover:brightness-110'
                    }`}
                    onClick={() =>
                      needsPro ? intents.openPro() : c.isStageTest ? openStageTest(c.stageId) : openPractice(c.stageId, c.id)
                    }
                    disabled={locked}
                    title={
                      locked
                        ? testLocked
                          ? 'Solve every lesson in this stage to unlock its test'
                          : 'Finish the earlier stages to unlock this'
                        : undefined
                    }
                  >
                    {locked && <Lock size={14} />}
                    {locked
                      ? testLocked
                        ? 'Finish the lessons first'
                        : 'Locked'
                      : needsPro
                        ? 'Unlock with Pro'
                        : solved
                          ? 'Practise again'
                          : c.isStageTest
                            ? 'Take the test'
                            : 'Solve'}
                  </button>
                </li>
              );
            })}
          </ul>

          {visible.length < filtered.length && (
            <div className="text-center">
              <button
                type="button"
                onClick={() => setLimit((n) => n + 24)}
                className="px-5 py-2.5 rounded-lg border border-black/10 dark:border-white/10 text-sm font-medium hover:bg-black/5 dark:hover:bg-white/5"
              >
                Show more ({filtered.length - visible.length} remaining)
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
};
