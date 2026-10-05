import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { BookOpen, Check, ChevronDown, Dumbbell, Lock, Minus, Star } from 'lucide-react';
import type { Challenge, ReadingResolver, Stage, Unit, UserStats } from '@/types';
import { assessmentBlockText, describeRetry, useSession } from '@/platform/session';
import type { TestOutStatus } from '@/platform/session';
import { fillCopy } from '@/platform/settings';
import { isPremiumLocked, stageStatus, unitStates } from '@/platform/progress';
import type { UnitGate } from '@/platform/progress';
import { isPerfectUnit } from '@/platform/xp-leveling/rewards';
import { intents } from '@/platform/events';
import { describeNextReview, describeReviewSummary } from '@/platform/review';
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
  const { learnerStages: stages, stats, learningMode, settings, reviewSummary, todayKey, testOutStatus } = useSession();
  // Test-out (Phase 5): what each stage allows, and the words for it.
  const testOut = settings.testOut;
  const offerTestOut = (stage: Stage, premiumLocked: boolean): TestOutStatus | null =>
    testOut.enabled && stage.test && !premiumLocked && !testOut.disabledStages.includes(stage.id) && (stage.state === 'Locked' || stage.state === 'In progress')
      ? testOutStatus(stage.id)
      : null;
  // Offline, the explanation is said once, on the first stage it applies to.
  let offlineExplained = false;
  const practiceLine = describeReviewSummary(reviewSummary);
  const nextReview = describeNextReview(reviewSummary.nextDueDay, todayKey);
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
    <>
    {/* Practice (review): mistakes and questions due for another look, across the path. */}
    {reviewSummary.enabled && (
      <div className="mb-8 flex flex-wrap items-center justify-between gap-3 rounded-sm border border-border-subtle px-4 py-3">
        <div className="flex items-center gap-3 min-w-0">
          <Dumbbell size={16} className="text-accent shrink-0" aria-hidden="true" />
          <div className="min-w-0">
            <div className="text-sm font-medium text-fg">Practice</div>
            <div className="text-xs text-fg-secondary">
              {practiceLine ?? (nextReview ? `All caught up - next review ${nextReview}.` : 'Nothing to practise yet - solve a few lessons first.')}
            </div>
          </div>
        </div>
        {practiceLine && (
          <Button size="sm" variant="secondary" onClick={() => intents.openReview()}>
            Practise now
          </Button>
        )}
      </div>
    )}
    <ol className="learning-path relative">

      {stages.map((stage) => {
        const status = stageStatus(stage, stats);
        const premiumLocked = isPremiumLocked(stage, stats);
        const locked = stage.state === 'Locked' && !premiumLocked;
        const visual: Visual = premiumLocked ? 'pro' : stage.state === 'Completed' ? 'completed' : locked ? 'locked' : 'current';
        const expanded = open.has(stage.id) && !locked;
        const reading = readingFor?.(stage.id) ?? null;
        const testOutState = offerTestOut(stage, premiumLocked);
        // A started stage offers a test-out only while the admin allows that.
        const quietTestOut = Boolean(
          testOutState && stage.state === 'In progress' && (testOutState.allowed || testOutState.retryAt || (testOutState.offline && testOut.allowOnOpenStage))
        );
        const explainOffline = Boolean(testOutState?.offline && (locked || quietTestOut) && !offlineExplained);
        if (explainOffline) offlineExplained = true;

        return (
          <li key={stage.id} className={`learning-stage is-${visual}`} data-expanded={expanded}>
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
                  {stage.isPremium && <Badge tone="warning">{premiumLocked ? 'Premium' : 'Unlocked'}</Badge>}
                  {stage.state === 'Test pending' && <Badge tone="info">Test ready</Badge>}
                  {stage.testedOut && <Badge tone="success">Tested out</Badge>}
                </div>
                <h3 className={`learning-stage-title ${locked ? 'text-fg-muted' : 'text-fg'}`}>
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
                {!locked && (
                  <ProgressBar
                    value={status.percent}
                    size="sm"
                    tone={visual === 'completed' ? 'success' : 'accent'}
                    className="w-32 mt-1.5"
                    label={`${status.done} of ${status.total} lessons in ${stage.name}`}
                  />
                )}
              </div>
            </div>

            {/* A locked stage can be tested out of (Phase 5): pass its test to skip its lessons. */}
            {locked && testOutState && (
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <TestOutAction stage={stage} status={testOutState} buttonLabel={testOut.copy.buttonLabel} cooldownLabel={testOut.copy.cooldownLabel} explainOffline={explainOffline} />
              </div>
            )}

            {/* Actions */}
            {!locked && (
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <StageAction stage={stage} premiumLocked={premiumLocked} testPending={stage.state === 'Test pending'} done={status.done} />
                {!premiumLocked && stage.state !== 'Test pending' && (
                  <div className="flex items-center gap-1 text-xs text-fg-muted ml-1">
                    <button
                      type="button"
                      onClick={() => intents.openPractice(stage.id, undefined, 'learn')}
                      className={`inline-flex items-center min-h-[44px] px-2.5 rounded-xs hover:bg-surface-2 hover:text-fg ${learningMode === 'learn' ? 'text-fg font-medium' : ''}`}
                      title="Theory, examples and a try-it before each new idea"
                    >
                      Learn
                    </button>
                    <span aria-hidden="true">/</span>
                    <button
                      type="button"
                      onClick={() => intents.openPractice(stage.id, undefined, 'practice')}
                      className={`inline-flex items-center min-h-[44px] px-2.5 rounded-xs hover:bg-surface-2 hover:text-fg ${learningMode === 'practice' ? 'text-fg font-medium' : ''}`}
                      title="Jump straight to the questions"
                    >
                      Practice
                    </button>
                  </div>
                )}
                {stage.state === 'Completed' && !premiumLocked && reviewSummary.enabled && (
                  <button
                    type="button"
                    onClick={() => intents.openReview({ stageId: stage.id })}
                    className="inline-flex items-center gap-1.5 min-h-[44px] px-3 rounded-xs text-xs text-fg-secondary hover:bg-surface-2 hover:text-fg"
                    title="A short session over this stage's questions you missed or that are due for another look"
                  >
                    <Dumbbell size={13} aria-hidden="true" />
                    Practice this stage
                  </button>
                )}
                {/* An open stage whose lessons are not finished: a quieter Test out. */}
                {quietTestOut && testOutState && (
                  <TestOutAction
                    stage={stage}
                    status={testOutState}
                    buttonLabel={testOut.copy.buttonLabel}
                    cooldownLabel={testOut.copy.cooldownLabel}
                    explainOffline={explainOffline}
                    quiet
                  />
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

            {/* Units (each a node with its questions behind a disclosure), or the lessons for a stage without units */}
            {expanded && (
              <ol id={`stage-${stage.id}-lessons`} className="mt-4 border-t border-border-subtle">
                {stage.units && stage.units.length > 0 ? (
                  <UnitRail
                    stage={stage}
                    units={stage.units}
                    stats={stats}
                    premiumLocked={premiumLocked}
                    perfectRequiresNoHints={settings.units.perfectRequiresNoHints}
                  />
                ) : (
                  stage.challenges.map((c, i) => {
                    const isDone = solved.has(c.id);
                    const isNext = !isDone && stage.challenges.slice(0, i).every((p) => solved.has(p.id));
                    return (
                      <li key={c.id} className="border-b border-border-subtle">
                        <LessonRow
                          challenge={c}
                          state={isDone ? 'done' : isNext ? 'next' : 'todo'}
                          onClick={() => (premiumLocked ? intents.openPro({ stageId: stage.id }) : intents.openPractice(stage.id, c.id))}
                        />
                      </li>
                    );
                  })
                )}
                {stage.test && (
                  <li>
                    <button
                      type="button"
                      onClick={() => (premiumLocked ? intents.openPro({ stageId: stage.id }) : status.testUnlocked || status.testPassed ? intents.openStageTest(stage.id) : undefined)}
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
    </>
  );
};

/* ------------------------------------------------------------------ pieces */

/** One question on the path: its mark, title, difficulty and XP. */
const LessonRow: React.FC<{ challenge: Challenge; state: 'done' | 'next' | 'todo' | 'locked'; onClick: () => void }> = ({ challenge: c, state, onClick }) => (
  <button
    type="button"
    onClick={onClick}
    className="w-full flex items-center gap-3 py-2 px-1 -mx-1 rounded-xs text-left hover:bg-surface-2 transition-colors"
  >
    <LessonMark state={state} />
    <span className={`flex-1 min-w-0 truncate text-sm ${state === 'next' ? 'text-fg font-medium' : 'text-fg-secondary'}`}>{c.title}</span>
    <span className="hidden sm:inline font-mono text-[11px] text-fg-muted shrink-0">{c.difficulty}</span>
    <span className="font-mono text-[11px] text-fg-muted shrink-0 w-14 text-right">+{c.xpReward} XP</span>
  </button>
);

/** A stage's units in order: each a node that opens it, with its questions behind a disclosure. */
const UnitRail: React.FC<{
  stage: Stage;
  units: Unit[];
  stats: UserStats;
  premiumLocked: boolean;
  perfectRequiresNoHints: boolean;
}> = ({ stage, units, stats, premiumLocked, perfectRequiresNoHints }) => {
  const states = useMemo(() => unitStates(units, stats.completedChallenges), [units, stats.completedChallenges]);
  const solved = useMemo(() => new Set(stats.completedChallenges), [stats.completedChallenges]);
  const [shown, setShown] = useState<Set<string>>(() => new Set());
  const toggle = (id: string) =>
    setShown((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <>
      {units.map((unit, i) => {
        const state = states[i];
        // A recorded perfect completion, or one perfect by its attempts.
        const perfect =
          state.state === 'done' && (stats.unitsCompleted?.[unit.id]?.perfect === true || isPerfectUnit(unit, stats.attempts, { perfectRequiresNoHints }));
        const open = shown.has(unit.id);
        const reachable = state.state !== 'locked';
        const firstOpen = unit.challenges.findIndex((c) => !solved.has(c.id));
        return (
          <li key={unit.id} className="border-b border-border-subtle">
            <div className="flex items-center gap-3 py-2.5">
              <UnitNode
                unit={unit}
                gate={state.state}
                perfect={perfect}
                done={state.done}
                total={state.total}
                onOpen={() => (premiumLocked ? intents.openPro({ stageId: stage.id }) : intents.openUnit(stage.id, unit.id))}
              />
              <button
                type="button"
                className="shrink-0 p-1 rounded-xs text-fg-muted hover:text-fg hover:bg-surface-2"
                onClick={() => toggle(unit.id)}
                aria-expanded={open}
                aria-controls={`unit-${unit.id}-questions`}
                aria-label={`${open ? 'Hide' : 'Show'} the questions in ${unit.name}`}
              >
                <ChevronDown size={14} className={`transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden="true" />
              </button>
            </div>
            {open && (
              <ol id={`unit-${unit.id}-questions`} className="ml-9 mb-2">
                {unit.challenges.map((c, j) => {
                  const isDone = solved.has(c.id);
                  const lessonState = isDone ? 'done' : reachable && j === firstOpen ? 'next' : reachable ? 'todo' : 'locked';
                  return (
                    <li key={c.id}>
                      <LessonRow
                        challenge={c}
                        state={lessonState}
                        onClick={() => (premiumLocked ? intents.openPro({ stageId: stage.id }) : intents.openPractice(stage.id, c.id))}
                      />
                    </li>
                  );
                })}
              </ol>
            )}
          </li>
        );
      })}
    </>
  );
};

/** One unit on the rail: a check (a star when perfect), its number when it is next, or a lock. */
const UnitNode: React.FC<{ unit: Unit; gate: UnitGate; perfect: boolean; done: number; total: number; onOpen: () => void }> = ({
  unit,
  gate,
  perfect,
  done,
  total,
  onOpen
}) => {
  const base = 'w-7 h-7 rounded-full border flex items-center justify-center shrink-0 font-mono text-xs';
  const marker =
    gate === 'done' ? (
      perfect ? (
        <span className={`${base} border-warning/50 text-warning bg-warning-soft`} aria-hidden="true">
          <Star size={13} strokeWidth={2.5} />
        </span>
      ) : (
        <span className={`${base} border-success/40 text-success bg-success-soft`} aria-hidden="true">
          <Check size={13} strokeWidth={2.5} />
        </span>
      )
    ) : gate === 'current' ? (
      <span className={`${base} border-accent text-accent-text font-semibold`} aria-hidden="true">
        {unit.index + 1}
      </span>
    ) : (
      <span className={`${base} border-border text-fg-muted`} aria-hidden="true">
        <Lock size={11} />
      </span>
    );
  const status = gate === 'done' ? (perfect ? 'perfect' : 'complete') : gate === 'current' ? 'up next' : 'locked';
  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex-1 min-w-0 flex items-center gap-3 text-left rounded-xs px-1 -mx-1 py-1 hover:bg-surface-2 transition-colors"
      aria-label={`${unit.name}, ${status}, ${done} of ${total} questions solved`}
    >
      {marker}
      <span className="flex-1 min-w-0">
        <span className={`block truncate text-sm ${gate === 'locked' ? 'text-fg-muted' : 'text-fg font-medium'}`}>{unit.name}</span>
        <span className="block truncate font-mono text-[11px] text-fg-muted">
          {total} {total === 1 ? 'question' : 'questions'} · ~{unit.estMinutes} min · +{unit.xp} XP
        </span>
      </span>
      <span className="font-mono text-[11px] text-fg-muted shrink-0 tabular-nums">
        {done}/{total}
      </span>
    </button>
  );
};

const StageMarker: React.FC<{ visual: Visual; index: string }> = ({ visual, index }) => {
  const base = 'learning-stage-marker absolute border flex items-center justify-center font-mono text-xs bg-surface';
  if (visual === 'completed')
    return (
      <span className={`${base} border-success/40 text-success`} aria-hidden="true">
        <Check size={14} strokeWidth={2.5} />
      </span>
    );
  if (visual === 'current')
    return (
      <span className={`${base} border-accent text-accent-text font-semibold`} aria-hidden="true">
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

/**
 * Test out of a stage (Phase 5): the button when it may start now; "Try
 * again in 40 minutes" (the admin's `cooldownLabel`) while the learner must
 * wait; disabled with the reason while a signed-in learner is offline (an
 * unlock must reach the account). `quiet` is the small link on an open stage.
 * Every one is at least 44px tall, for a finger at phone width.
 */
const TestOutAction: React.FC<{
  stage: Stage;
  status: TestOutStatus;
  buttonLabel: string;
  cooldownLabel: string;
  quiet?: boolean;
  explainOffline?: boolean;
}> = ({ stage, status, buttonLabel, cooldownLabel, quiet = false, explainOffline = false }) => {
  const open = () => intents.openAssessment({ kind: 'test-out', stageId: stage.id });
  const waitText = status.retryAt ? fillCopy(cooldownLabel, { when: describeRetry(status.retryAt) ?? 'later' }) : null;
  const waiting = !status.allowed && (status.reason === 'cooldown' || status.reason === 'limit') && waitText;
  if (quiet) {
    if (status.offline) {
      return (
        <>
          <button
            type="button"
            disabled
            className="inline-flex items-center min-h-[44px] px-2.5 rounded-xs text-xs text-fg-muted cursor-not-allowed"
            title={assessmentBlockText('offline')}
          >
            {buttonLabel}
          </button>
          {explainOffline && <span className="text-xs text-fg-muted">{assessmentBlockText('offline')}</span>}
        </>
      );
    }
    if (status.allowed) {
      return (
        <button
          type="button"
          onClick={open}
          className="inline-flex items-center min-h-[44px] px-2.5 rounded-xs text-xs text-fg-secondary hover:bg-surface-2 hover:text-fg"
          title="Already know this stage? Pass its test to skip the lessons."
        >
          {buttonLabel}
        </button>
      );
    }
    return waiting ? <span className="text-xs text-fg-muted px-2.5">{waitText}</span> : null;
  }
  if (status.offline) {
    return (
      <>
        <Button size="sm" variant="secondary" className="min-h-[44px]" disabled title={assessmentBlockText('offline')}>
          {buttonLabel}
        </Button>
        {explainOffline && <span className="text-xs text-fg-muted">{assessmentBlockText('offline')}</span>}
      </>
    );
  }
  if (status.allowed) {
    return (
      <Button size="sm" variant="secondary" className="min-h-[44px]" onClick={open} title="Already know this stage? Pass its test to skip the lessons.">
        {buttonLabel}
      </Button>
    );
  }
  if (waiting) {
    return (
      <Button size="sm" variant="secondary" className="min-h-[44px]" disabled title={assessmentBlockText(status.reason, describeRetry(status.retryAt))}>
        {waitText}
      </Button>
    );
  }
  return null;
};

const StageAction: React.FC<{ stage: Stage; premiumLocked: boolean; testPending: boolean; done: number }> = ({
  stage,
  premiumLocked,
  testPending,
  done
}) => {
  const completed = stage.state === 'Completed';
  const onClick = () => {
    if (premiumLocked) intents.openPro({ stageId: stage.id });
    else if (testPending) intents.openStageTest(stage.id);
    else intents.openPractice(stage.id);
  };
  const label = premiumLocked ? 'Unlock this stage' : testPending ? 'Take the test' : completed ? 'Review' : done > 0 ? 'Continue' : 'Start';
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
