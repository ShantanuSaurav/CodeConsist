import React, { useDeferredValue, useMemo, useState } from 'react';
import { useGame } from '../context/GameContext';
import { Challenge, Difficulty } from '../types';
import { stageStatus } from '../services/contentService';

const TYPE_LABELS: Record<Challenge['type'], string> = {
  quiz: 'Quiz',
  output_prediction: 'Output',
  multi_select: 'Multi',
  fill_blank: 'Blanks',
  pseudocode_order: 'Ordering',
  code_runner: 'Code',
  debug: 'Debug'
};

type StatusFilter = 'all' | 'todo' | 'solved';
type TypeFilter = Challenge['type'] | 'stage_test' | 'all';

/**
 * Search and filter across the whole bank.
 *
 * The staged path is the guided route; this is for the person who wants to
 * drill one specific thing ("show me every SQL debug challenge I have not done").
 */
export const ChallengeLibrary: React.FC = () => {
  const { allChallenges, stages, stats, openPractice, openStageTest, openSubModal } = useGame();

  const [query, setQuery] = useState('');
  const [difficulty, setDifficulty] = useState<Difficulty | 'all'>('all');
  const [type, setType] = useState<TypeFilter>('all');
  const [status, setStatus] = useState<StatusFilter>('all');
  const [stageId, setStageId] = useState<string | 'all'>('all');
  const [limit, setLimit] = useState(24);

  const deferredQuery = useDeferredValue(query);

  const stageName = useMemo(
    () => new Map(stages.map((s) => [s.id, `${s.index} ${s.name}`])),
    [stages]
  );
  const lockedStages = useMemo(
    () => new Set(stages.filter((s) => s.state === 'Locked').map((s) => s.id)),
    [stages]
  );
  // Premium locks are a different thing from progression locks: one is solved by
  // upgrading, the other by working through the path. Saying "finish the earlier
  // stages" to someone who just needs Pro is unhelpful.
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
  const solvedCount = stats.completedChallenges.length;

  return (
    <section className="library" id="library">
      <div className="section-head">
        <div>
          <h2 className="section-title">Every challenge</h2>
          <p className="section-sub">
            {allChallenges.filter((c) => !c.isStageTest).length} lessons and{' '}
            {allChallenges.filter((c) => c.isStageTest).length} stage tests across {stages.length} stages. You have
            solved {solvedCount}.
          </p>
        </div>
      </div>

      <div className="library-controls">
        <input
          type="search"
          className="library-search"
          placeholder="Search titles, prompts, languages and tags…"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setLimit(24);
          }}
          aria-label="Search challenges"
        />

        <select value={stageId} onChange={(e) => setStageId(e.target.value)} aria-label="Filter by stage">
          <option value="all">All stages</option>
          {stages.map((s) => (
            <option key={s.id} value={s.id}>
              {s.index} · {s.name}
            </option>
          ))}
        </select>

        <select
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
          value={difficulty}
          onChange={(e) => setDifficulty(e.target.value as Difficulty | 'all')}
          aria-label="Filter by difficulty"
        >
          <option value="all">Any difficulty</option>
          <option value="easy">Easy</option>
          <option value="medium">Medium</option>
          <option value="hard">Hard</option>
        </select>

        <div className="segmented" role="group" aria-label="Filter by status">
          {(['all', 'todo', 'solved'] as StatusFilter[]).map((value) => (
            <button
              key={value}
              type="button"
              className={status === value ? 'is-active' : ''}
              onClick={() => setStatus(value)}
            >
              {value === 'all' ? 'All' : value === 'todo' ? 'Not done' : 'Solved'}
            </button>
          ))}
        </div>
      </div>

      <p className="library-count">
        {filtered.length} {filtered.length === 1 ? 'match' : 'matches'}
      </p>

      {filtered.length === 0 ? (
        <div className="library-empty">
          <p>Nothing matches those filters.</p>
          <button
            type="button"
            className="btn btn-line"
            onClick={() => {
              setQuery('');
              setDifficulty('all');
              setType('all');
              setStatus('all');
              setStageId('all');
            }}
          >
            Clear filters
          </button>
        </div>
      ) : (
        <>
          <ul className="library-grid">
            {visible.map((c) => {
              const solved = stats.completedChallenges.includes(c.id);
              const needsPro = premiumStages.has(c.stageId);
              const stage = stages.find((s) => s.id === c.stageId);
              // A stage test is gated on its lessons, not on the previous stage.
              const testLocked = Boolean(c.isStageTest) && stage ? !stageStatus(stage, stats).testUnlocked : false;
              const locked = (lockedStages.has(c.stageId) && !needsPro) || (testLocked && !solved);
              const best = stats.attempts[c.id];

              return (
                <li key={c.id} className={`library-card ${solved ? 'is-solved' : ''}`.trim()}>
                  <div className="library-card-head">
                    <span className={`pill pill-${c.difficulty}`}>{c.difficulty}</span>
                    {c.isStageTest ? (
                      <span className="pill pill-test">Stage test</span>
                    ) : (
                      <span className="pill pill-type">{TYPE_LABELS[c.type]}</span>
                    )}
                    {solved && <span className="pill pill-done">solved</span>}
                  </div>

                  <h3>{c.title}</h3>
                  <p>{c.prompt}</p>

                  <div className="library-card-foot">
                    <span className="library-stage">{stageName.get(c.stageId)}</span>
                    <span className="library-xp">+{c.xpReward} XP</span>
                  </div>

                  {best && <div className="library-best">Best score {best.score}%</div>}

                  <button
                    type="button"
                    className="btn btn-line btn-sm"
                    onClick={() =>
                      needsPro ? openSubModal() : c.isStageTest ? openStageTest(c.stageId) : openPractice(c.stageId, c.id)
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
            <div className="library-more">
              <button type="button" className="btn btn-line" onClick={() => setLimit((n) => n + 24)}>
                Show more ({filtered.length - visible.length} remaining)
              </button>
            </div>
          )}
        </>
      )}
    </section>
  );
};
