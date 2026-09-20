import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { BookOpen, Check, ChevronDown, Lock, Minus } from 'lucide-react';
import type { ReadingResolver, Stage } from '@/types';
import { useSession } from '@/platform/session';
import { stageStatus } from '@/platform/progress';
import { intents } from '@/platform/events';
import { Badge, Button, ProgressBar } from '@/ui';

export interface LearningPathProps {
  /** Where a stage's reading lives, if the app has any. */
  readingFor?: ReadingResolver;
}

type Visual = 'completed' | 'current' | 'locked' | 'pro';

/**
 * The selected track's stages as one vertical progression. Each stage is a
 * node on a rail: number, name, lesson count, and - expanded - the lessons
 * themselves with their solved/current state, plus the stage test. The stage
 * in progress opens by default; the rest fold to a single line.
 */
export const LearningPath: React.FC<LearningPathProps> = ({ readingFor }) => {
  const { learnerStages: stages, stats, learningMode } = useSession();
  const solved = useMemo(() => new Set(stats.completedChallenges), [stats.completedChallenges]);

  const currentId = useMemo(
    () => (stages.find((s) => s.state === 'Test pending') ?? stages.find((s) => s.state === 'In progress'))?.id ?? null,
    [stages]
  );

  const [open, setOpen] = useState<Set<string>>(() => new Set(currentId ? [currentId] : []));
  // A new track (or a newly opened stage) expands the stage in progress.
  useEffect(() => {
    if (currentId) setOpen((prev) => (prev.has(currentId) ? prev : new Set([...prev, currentId])));
  }, [currentId]);

  const toggle = (id: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <ol className="relative">
      {/* The rail behind the stage markers. */}
      <span className="absolute left-[15px] top-4 bottom-4 w-px bg-border" aria-hidden="true" />

      {stages.map((stage) => {
        const status = stageStatus(stage, stats);
        const premiumLocked = Boolean(stage.isPremium) && !stats.isPremium;
        const locked = stage.state === 'Locked' && !premiumLocked;
        const visual: Visual = premiumLocked ? 'pro' : stage.state === 'Completed' ? 'completed' : locked ? 'locked' : 'current';
        const expanded = open.has(stage.id) && !locked;
        const reading = readingFor?.(stage.id) ?? null;

        return (
          <li key={stage.id} className="relative pl-12 pb-8 last:pb-0">
            <StageMarker visual={visual} index={stage.index} />

            {/* Stage header - the one row that is always visible. */}
            <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-2">
              <button
                type="button"
                className="group text-left min-w-0 flex-1 disabled:cursor-default"
                onClick={() => toggle(stage.id)}
                disabled={locked}
                aria-expanded={expanded}
                aria-controls={`stage-${stage.id}-lessons`}
              >
                <div className="flex items-center gap-2 font-mono text-xs text-fg-muted">
                  <span>Stage {String(stage.index).padStart(2, '0')}</span>
                  {stage.isPremium && <Badge tone="warning">Pro</Badge>}
                  {stage.state === 'Test pending' && <Badge tone="info">Test ready</Badge>}
                </div>
                <h3 className={`mt-0.5 text-[1.0625rem] font-semibold tracking-tight ${locked ? 'text-fg-muted' : 'text-fg'}`}>
                  {stage.name}
                  {!locked && (
                    <ChevronDown
                      size={14}
                      className={`inline-block ml-1.5 -mt-0.5 text-fg-muted transition-transform ${expanded ? 'rotate-180' : ''}`}
                      aria-hidden="true"
                    />
                  )}
                </h3>
                <p className={`text-sm mt-0.5 ${locked ? 'text-fg-muted' : 'text-fg-secondary'}`}>{stage.description}</p>
              </button>

              <div className="shrink-0 text-right">
                <div className="font-mono text-xs text-fg-muted">
                  {status.done} / {status.total} lessons
                </div>
                <ProgressBar
                  value={status.percent}
                  size="sm"
                  tone={visual === 'completed' ? 'success' : 'accent'}
                  className="w-32 mt-1.5"
                  label={`${status.done} of ${status.total} lessons in ${stage.name}`}
                />
              </div>
            </div>

            {/* Actions */}
            {!locked && (
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <StageAction stage={stage} premiumLocked={premiumLocked} testPending={stage.state === 'Test pending'} done={status.done} />
                {!premiumLocked && stage.state !== 'Test pending' && (
                  <div className="flex items-center gap-1 text-xs text-fg-muted ml-1">
                    <button
                      type="button"
                      onClick={() => intents.openPractice(stage.id, undefined, 'learn')}
                      className={`px-1.5 py-1 rounded-xs hover:bg-surface-2 hover:text-fg ${learningMode === 'learn' ? 'text-fg font-medium' : ''}`}
                      title="Theory, examples and a try-it before each new idea"
                    >
                      Learn
                    </button>
                    <span aria-hidden="true">/</span>
                    <button
                      type="button"
                      onClick={() => intents.openPractice(stage.id, undefined, 'practice')}
                      className={`px-1.5 py-1 rounded-xs hover:bg-surface-2 hover:text-fg ${learningMode === 'practice' ? 'text-fg font-medium' : ''}`}
                      title="Jump straight to the questions"
                    >
                      Practice
                    </button>
                  </div>
                )}
                {reading && (
                  <Link to={reading.href} className="ml-auto inline-flex items-center gap-1.5 text-xs text-fg-secondary hover:text-fg">
                    <BookOpen size={13} />
                    {status.done === 0 && stage.state !== 'Completed' ? 'Read first' : 'Read the article'}
                    {reading.minutes ? ` · ${reading.minutes} min` : ''}
                  </Link>
                )}
              </div>
            )}

            {/* Lessons */}
            {expanded && (
              <ol id={`stage-${stage.id}-lessons`} className="mt-4 border-t border-border-subtle">
                {stage.challenges.map((c, i) => {
                  const isDone = solved.has(c.id);
                  const isNext = !isDone && stage.challenges.slice(0, i).every((p) => solved.has(p.id));
                  return (
                    <li key={c.id} className="border-b border-border-subtle">
                      <button
                        type="button"
                        onClick={() => (premiumLocked ? intents.openPro() : intents.openPractice(stage.id, c.id))}
                        className="w-full flex items-center gap-3 py-2 px-1 -mx-1 rounded-xs text-left hover:bg-surface-2 transition-colors"
                      >
                        <LessonMark state={isDone ? 'done' : isNext ? 'next' : 'todo'} />
                        <span className={`flex-1 min-w-0 truncate text-sm ${isDone ? 'text-fg-secondary' : isNext ? 'text-fg font-medium' : 'text-fg-secondary'}`}>
                          {c.title}
                        </span>
                        <span className="hidden sm:inline font-mono text-[11px] text-fg-muted shrink-0">{c.difficulty}</span>
                        <span className="font-mono text-[11px] text-fg-muted shrink-0 w-14 text-right">+{c.xpReward} XP</span>
                      </button>
                    </li>
                  );
                })}
                {stage.test && (
                  <li>
                    <button
                      type="button"
                      onClick={() => (premiumLocked ? intents.openPro() : status.testUnlocked || status.testPassed ? intents.openStageTest(stage.id) : undefined)}
                      disabled={!premiumLocked && !status.testUnlocked && !status.testPassed}
                      className="w-full flex items-center gap-3 py-2.5 px-1 -mx-1 rounded-xs text-left hover:bg-surface-2 transition-colors disabled:hover:bg-transparent disabled:cursor-not-allowed"
                      title={!status.testUnlocked && !status.testPassed ? `Unlocks after ${status.total} lessons` : undefined}
                    >
                      <LessonMark state={status.testPassed && solved.has(stage.test.id) ? 'done' : status.testUnlocked ? 'next' : 'locked'} />
                      <span className="flex-1 min-w-0 truncate text-sm">
                        <span className={`font-medium ${status.testUnlocked || solved.has(stage.test.id) ? 'text-fg' : 'text-fg-muted'}`}>Stage test</span>
                        <span className="text-fg-muted"> — {stage.test.title}</span>
                      </span>
                      <span className="font-mono text-[11px] text-fg-muted shrink-0 w-14 text-right">+{stage.test.xpReward} XP</span>
                    </button>
                  </li>
                )}
              </ol>
            )}
          </li>
        );
      })}
    </ol>
  );
};

/* ------------------------------------------------------------------ pieces */

const StageMarker: React.FC<{ visual: Visual; index: string }> = ({ visual, index }) => {
  const base = 'absolute left-0 top-0.5 w-8 h-8 rounded-sm border flex items-center justify-center font-mono text-xs bg-surface';
  if (visual === 'completed')
    return (
      <span className={`${base} border-success/40 text-success`} aria-hidden="true">
        <Check size={14} strokeWidth={2.5} />
      </span>
    );
  if (visual === 'current')
    return (
      <span className={`${base} border-accent text-accent font-semibold`} aria-hidden="true">
        {String(index).padStart(2, '0')}
      </span>
    );
  return (
    <span className={`${base} border-border text-fg-muted`} aria-hidden="true">
      <Lock size={12} />
    </span>
  );
};

const LessonMark: React.FC<{ state: 'done' | 'next' | 'todo' | 'locked' }> = ({ state }) => {
  if (state === 'done')
    return (
      <span className="w-4 h-4 rounded-xs bg-success-soft text-success flex items-center justify-center shrink-0" aria-label="Solved">
        <Check size={10} strokeWidth={3} />
      </span>
    );
  if (state === 'next')
    return <span className="w-4 h-4 rounded-xs border-[1.5px] border-accent shrink-0" aria-label="Up next" />;
  if (state === 'locked')
    return (
      <span className="w-4 h-4 flex items-center justify-center text-fg-muted shrink-0" aria-label="Locked">
        <Lock size={10} />
      </span>
    );
  return (
    <span className="w-4 h-4 flex items-center justify-center text-fg-disabled shrink-0" aria-label="Not started">
      <Minus size={10} />
    </span>
  );
};

const StageAction: React.FC<{ stage: Stage; premiumLocked: boolean; testPending: boolean; done: number }> = ({
  stage,
  premiumLocked,
  testPending,
  done
}) => {
  const completed = stage.state === 'Completed';
  const onClick = () => {
    if (premiumLocked) intents.openPro();
    else if (testPending) intents.openStageTest(stage.id);
    else intents.openPractice(stage.id);
  };
  const label = premiumLocked ? 'Unlock with Pro' : testPending ? 'Take the test' : completed ? 'Review' : done > 0 ? 'Continue' : 'Start';
  return (
    <>
      <Button size="sm" variant={completed || premiumLocked ? 'secondary' : 'primary'} onClick={onClick}>
        {label}
      </Button>
      {testPending && (
        <Button size="sm" variant="secondary" onClick={() => intents.openPractice(stage.id)}>
          Review lessons
        </Button>
      )}
    </>
  );
};
