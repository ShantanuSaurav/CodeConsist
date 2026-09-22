import React, { useDeferredValue, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { BookOpen, Check, Lock, Search } from 'lucide-react';
import { useSession } from '@/platform/session';
import { Challenge, Difficulty, ReadingResolver } from '@/types';
import { isPremiumLocked, stageStatus } from '@/platform/progress';
import { intents } from '@/platform/events';
import { Badge, Button, Dropdown, EmptyState, Segmented } from '@/ui';

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

const DIFFICULTY_TONE: Record<Difficulty, 'success' | 'warning' | 'error'> = {
  easy: 'success',
  medium: 'warning',
  hard: 'error'
};

type StatusFilter = 'all' | 'todo' | 'solved';
type TypeFilter = Challenge['type'] | 'stage_test' | 'all';

/**
 * Search and filter across the whole bank - every track, every language.
 *
 * The staged path is the guided route; this is for the person who wants to
 * drill one specific thing ("show me every SQL debug challenge I have not done").
 * A track filter narrows to one language path; the stage list follows it.
 */
export const ChallengeLibrary: React.FC<ChallengeLibraryProps> = ({ readingFor }) => {
  const { allChallenges, stages, tracks, selectedTrackId, stats } = useSession();

  // Follows the track chosen in the sidebar / Learn page, so switching tracks
  // narrows the library too; "All tracks" is one click away.
  const [trackId, setTrackId] = useState<string | 'all'>(selectedTrackId);
  useEffect(() => {
    setTrackId(selectedTrackId);
    setStageId('all');
    setLimit(30);
  }, [selectedTrackId]);
  const [query, setQuery] = useState('');
  const [difficulty, setDifficulty] = useState<Difficulty | 'all'>('all');
  const [type, setType] = useState<TypeFilter>('all');
  const [status, setStatus] = useState<StatusFilter>('all');
  const [stageId, setStageId] = useState<string | 'all'>('all');
  const [limit, setLimit] = useState(30);

  const deferredQuery = useDeferredValue(query);

  const stageName = useMemo(() => new Map(stages.map((s) => [s.id, `${String(s.index).padStart(2, '0')} · ${s.name}`])), [stages]);
  const trackStageIds = useMemo(() => {
    if (trackId === 'all') return null;
    return new Set(tracks.find((t) => t.track.id === trackId)?.track.stageIds ?? []);
  }, [tracks, trackId]);
  const stageOptions = useMemo(() => (trackStageIds ? stages.filter((s) => trackStageIds.has(s.id)) : stages), [stages, trackStageIds]);
  const lockedStages = useMemo(() => new Set(stages.filter((s) => s.state === 'Locked').map((s) => s.id)), [stages]);
  // Premium locks are a different thing from progression locks: one is solved by
  // buying the stage (or its track, or a lifetime licence), the other by
  // working through the path.
  const { isPremium, unlockedStages } = stats;
  const premiumStages = useMemo(
    () => new Set(stages.filter((s) => isPremiumLocked(s, { isPremium, unlockedStages })).map((s) => s.id)),
    [stages, isPremium, unlockedStages]
  );

  const filtered = useMemo(() => {
    const needle = deferredQuery.trim().toLowerCase();
    return allChallenges.filter((c) => {
      if (difficulty !== 'all' && c.difficulty !== difficulty) return false;
      if (type === 'stage_test') {
        if (!c.isStageTest) return false;
      } else if (type !== 'all' && (c.type !== type || c.isStageTest)) return false;
      if (stageId !== 'all' && c.stageId !== stageId) return false;
      if (trackStageIds && !trackStageIds.has(c.stageId)) return false;

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
  }, [allChallenges, deferredQuery, difficulty, type, stageId, trackStageIds, status, stats.completedChallenges]);

  const visible = filtered.slice(0, limit);

  const reset = () => {
    setQuery('');
    setDifficulty('all');
    setType('all');
    setStatus('all');
    setStageId('all');
    setTrackId(selectedTrackId);
  };

  return (
    <div>
      {/* ------------------------------------------------------------ filters */}
      <div className="flex flex-col gap-3">
        <label className="relative block">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-fg-muted pointer-events-none" />
          <input
            type="search"
            className="w-full !pl-9"
            placeholder="Search titles, prompts, languages and tags"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setLimit(30);
            }}
            aria-label="Search challenges"
          />
        </label>

        <div className="flex flex-wrap items-center gap-2">
          {tracks.length > 1 && (
            <Dropdown
              value={trackId}
              onChange={(val) => {
                setTrackId(val);
                setStageId('all');
              }}
              options={[{ value: 'all', label: 'All tracks' }, ...tracks.map(({ track }) => ({ value: track.id, label: track.label }))]}
              ariaLabel="Filter by track"
            />
          )}

          <Dropdown
            value={stageId}
            onChange={setStageId}
            options={[{ value: 'all', label: 'All stages' }, ...stageOptions.map((s) => ({ value: s.id, label: `${String(s.index).padStart(2, '0')} · ${s.name}` }))]}
            ariaLabel="Filter by stage"
          />

          <Dropdown
            value={type}
            onChange={(val) => setType(val as TypeFilter)}
            options={[
              { value: 'all', label: 'All types' },
              { value: 'stage_test', label: 'Stage tests' },
              ...Object.entries(TYPE_LABELS).map(([val, label]) => ({ value: val, label }))
            ]}
            ariaLabel="Filter by challenge type"
          />

          <Dropdown
            value={difficulty}
            onChange={(val) => setDifficulty(val as Difficulty | 'all')}
            options={[
              { value: 'all', label: 'Any difficulty' },
              { value: 'easy', label: 'Easy' },
              { value: 'medium', label: 'Medium' },
              { value: 'hard', label: 'Hard' }
            ]}
            ariaLabel="Filter by difficulty"
          />

          <Segmented<StatusFilter>
            value={status}
            onChange={setStatus}
            ariaLabel="Filter by status"
            options={[
              { value: 'all', label: 'All' },
              { value: 'todo', label: 'Not done' },
              { value: 'solved', label: 'Solved' }
            ]}
          />

          <span className="ml-auto text-xs font-mono text-fg-muted">
            {filtered.length} {filtered.length === 1 ? 'match' : 'matches'}
          </span>
        </div>
      </div>

      {/* ------------------------------------------------------------- results */}
      {filtered.length === 0 ? (
        <EmptyState className="mt-6" title="Nothing matches those filters." action={<Button onClick={reset}>Clear filters</Button>} />
      ) : (
        <>
          <ul className="mt-6 border-t border-border">
            {visible.map((c) => {
              const solved = stats.completedChallenges.includes(c.id);
              const needsUnlock = premiumStages.has(c.stageId);
              const stage = stages.find((s) => s.id === c.stageId);
              // A stage test is gated on its lessons, not on the previous stage.
              const testLocked = Boolean(c.isStageTest) && stage ? !stageStatus(stage, stats).testUnlocked : false;
              const locked = (lockedStages.has(c.stageId) && !needsUnlock && !c.uiPreview) || (testLocked && !solved);
              const best = stats.attempts[c.id];
              const reading = readingFor?.(c.stageId, c.tags) ?? null;

              const open = () =>
                needsUnlock ? intents.openPro({ stageId: c.stageId }) : c.isStageTest ? intents.openStageTest(c.stageId) : intents.openPractice(c.stageId, c.id);

              return (
                <li key={c.id} className="border-b border-border-subtle">
                  <div className="grid grid-cols-[1.25rem_1fr_auto] items-start gap-3 py-3.5">
                    {/* status mark */}
                    <span className="pt-0.5 flex justify-center">
                      {solved ? (
                        <span className="w-4 h-4 rounded-xs bg-success-soft text-success flex items-center justify-center" aria-label="Solved">
                          <Check size={10} strokeWidth={3} />
                        </span>
                      ) : locked ? (
                        <span className="w-4 h-4 flex items-center justify-center text-fg-muted" aria-label="Locked">
                          <Lock size={11} />
                        </span>
                      ) : (
                        <span className="w-4 h-4 rounded-xs border border-border-strong" aria-label="Not solved" />
                      )}
                    </span>

                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <button
                          type="button"
                          onClick={open}
                          disabled={locked}
                          className={`text-left text-sm font-medium truncate hover:underline underline-offset-2 disabled:no-underline disabled:cursor-not-allowed ${
                            locked ? 'text-fg-muted' : 'text-fg'
                          }`}
                        >
                          {c.title}
                        </button>
                        <span className="font-mono text-[11px] text-fg-muted truncate">{stageName.get(c.stageId)}</span>
                      </div>
                      <p className="text-sm text-fg-secondary mt-0.5 line-clamp-1">{c.prompt}</p>
                      <div className="mt-2 flex flex-wrap items-center gap-1.5">
                        <Badge mono>{c.language}</Badge>
                        {c.isStageTest ? <Badge tone="info">Stage test</Badge> : <Badge>{TYPE_LABELS[c.type]}</Badge>}
                        <Badge tone={DIFFICULTY_TONE[c.difficulty]}>{c.difficulty}</Badge>
                        {c.uiPreview && <Badge>Assessment</Badge>}
                        {best && (
                          <span className="text-[11px] font-mono text-fg-muted ml-1">
                            best {best.score}%
                          </span>
                        )}
                        {reading && (
                          <Link
                            to={reading.href}
                            className="ml-1 inline-flex items-center gap-1 text-[11px] text-fg-muted hover:text-fg"
                            title={reading.label}
                          >
                            <BookOpen size={11} className="shrink-0" />
                            <span className="truncate max-w-[16rem]">{reading.label}</span>
                          </Link>
                        )}
                      </div>
                    </div>

                    <div className="flex flex-col items-end gap-2 shrink-0">
                      <span className="font-mono text-xs text-fg-muted">+{c.xpReward} XP</span>
                      <Button
                        size="sm"
                        variant={needsUnlock ? 'secondary' : solved ? 'secondary' : 'primary'}
                        onClick={open}
                        disabled={locked}
                        title={
                          locked
                            ? testLocked
                              ? 'Solve every lesson in this stage to unlock its test'
                              : 'Finish the earlier stages to unlock this'
                            : undefined
                        }
                      >
                        {locked
                          ? testLocked
                            ? 'Lessons first'
                            : 'Locked'
                          : needsUnlock
                            ? 'Unlock'
                            : solved
                              ? 'Practise again'
                              : c.isStageTest
                                ? 'Take the test'
                                : 'Solve'}
                      </Button>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>

          {visible.length < filtered.length && (
            <div className="mt-6 flex justify-center">
              <Button onClick={() => setLimit((n) => n + 30)}>Show more ({filtered.length - visible.length} remaining)</Button>
            </div>
          )}
        </>
      )}
    </div>
  );
};
