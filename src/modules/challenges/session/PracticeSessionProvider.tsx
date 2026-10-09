import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { AssessmentView, Challenge, LearningMode, ReviewItem, Stage, Unit } from '@/types';
import { assessmentBlockText, describeRetry, useSession } from '@/platform/session';
import type { AssessmentRequest } from '@/platform/session';
import { isPremiumLocked, stageStatus, unitStates } from '@/platform/progress';
import { eventBus, intents, useAppEvent } from '@/platform/events';
import { useToast } from '@/ui';
import { describeNextReview } from '@/platform/review';
import { dropSolved, initialSlots, noteSlotLeft, reachableSlotIndex, requeue, slotKey, solvedThisRun } from './queue';
import type { ItemHistory, Slot } from './queue';

export type PracticeMode = 'lessons' | 'test' | 'review' | 'assessment';

/**
 * Where a test-out or placement is (Phase 5):
 *   intro     its rules, before it starts ("Start the test")
 *   conflict  another one is already running: resume it or end it
 *   running   a stage test on screen
 *   between   a placement test was passed and another follows
 *   result    it is over (passed, not passed, ended early, ran out of time)
 */
export type AssessmentScreen = 'intro' | 'conflict' | 'running' | 'between' | 'result';

/** The test-out or placement open in the modal. */
export interface AssessmentRun {
  request: AssessmentRequest;
  /** The record: running, or as it ended. Null before it starts. */
  view: AssessmentView | null;
  screen: AssessmentScreen;
  /** Another one already running (offered for resuming). */
  running: AssessmentView | null;
  /** The stage test that just ended (between tests, and on the result screen). */
  lastStageId: string | null;
  lastPassed: boolean | null;
  /** XP the passes in this run paid. */
  xp: number;
  /** Why it could not start (shown on the intro). */
  error: string | null;
  /** A request is on its way. */
  busy: boolean;
  /** The learner asked to leave a running test: "Leaving ends this attempt". */
  confirmingLeave: boolean;
}

/** The Practice session (review) open in the modal. */
export interface ActiveReview {
  sessionId: string;
  items: ReviewItem[];
  /** Built in this browser (a guest, or offline): priced here and again on the next sync. */
  local: boolean;
  /** "Practice this stage" - else the whole path. */
  stageId: string | null;
  /** Practice XP still payable today when it started. */
  remainingToday: number;
}

export interface PracticeSessionType {
  /** The stage being walked (a Practice session of one stage has it too; one over the whole path has none). */
  activeStage: Stage | null;
  /** 'lessons' walks one unit's challenges; 'test' holds only the stage test; 'review' a Practice session. */
  activeMode: PracticeMode;
  /** The open Practice session, in 'review' mode. */
  activeReview: ActiveReview | null;
  /** The open test-out or placement, in 'assessment' mode. */
  assessmentRun: AssessmentRun | null;
  /** Offer a test-out of a stage, or a placement on a track: its rules first (the `assessment:open` intent). */
  openAssessment: (request: AssessmentRequest) => void;
  /** "Start the test" on the intro. */
  beginAssessment: () => Promise<void>;
  /** Carry on with the test that was already running. */
  resumeAssessment: () => void;
  /** End the test that was already running (not passed), then back to the intro. */
  endRunningAssessment: () => Promise<void>;
  /** A submit or a fail came back: the next test, or the result. */
  noteAssessmentResult: (view: AssessmentView | null, outcome: { stageId: string; passed: boolean; xp: number }) => void;
  /** "Next test", between two placement tests. */
  continueAssessment: () => void;
  /** "Stop here": end a placement early. */
  finishPlacement: () => Promise<void>;
  /** Leave a running test after confirming: it counts as not passed. `runs` is the runs used on the current test. */
  leaveAssessment: (runs: number) => Promise<void>;
  /** "Keep going": the leave was not confirmed. */
  cancelLeave: () => void;
  /** The modal is showing something (a stage, or a Practice session). */
  isOpen: boolean;
  /** The unit being walked in lesson mode (null for the test, or a stage without units). */
  activeUnit: Unit | null;
  /** Where that unit sits in its stage: "Unit 2 of 4". */
  unitPosition: { index: number; count: number } | null;
  /** The unit after the active one, or null at the end of the stage. */
  nextUnit: Unit | null;
  /**
   * The challenges the open session is walking through: the unit's, or the
   * test - one per slot, so a question that came back after a miss is in it
   * twice (see session/queue.ts).
   */
  activeChallenges: Challenge[];
  activeChallengeIndex: number;
  /** The run's slots, parallel to `activeChallenges`: which question, and which time round. */
  slots: Slot[];
  /** The slot on screen, or null when nothing is open. */
  activeSlot: Slot | null;
  /** Slots moved past after their answer was shown (`slotKey`s). */
  deferred: ReadonlySet<string>;
  /** Per question: the tries and hints of the slots already left, and whether its answer was shown. */
  history: Readonly<Record<string, ItemHistory>>;
  /**
   * The questions answered right in this run: in a Practice session, those
   * answered right in it; in a unit, those solved since it began (a replayed
   * unit's questions were solved on an earlier visit - see `solvedThisRun`).
   */
  solvedInRun: ReadonlySet<string>;
  /**
   * The furthest slot the learner may open: the first unsolved one that was
   * not deferred (every slot before it is solved or was moved past), or the
   * last slot once all are passed. Lessons are taken in order - a later one
   * cannot be opened or skipped to; only a missed one can be stepped over,
   * and it comes back at the end.
   */
  reachableIndex: number;
  /**
   * Leave the slot on screen without solving it: its tries, hints and
   * whether its answer was shown go into the question's history, the slot
   * is deferred, and - with `requeue` and rounds left - the question is
   * added again at the end. Then moves on to the next slot - which the
   * lesson order would not allow yet, as this one is unsolved. `outcome` is
   * 'requeued' when the question comes back, 'kept' when it stays unsolved
   * (no rounds left, or requeue off); `next` is the slot moved to, or null
   * when this was the last one (the run is over).
   */
  deferCurrent: (left: { attempts: number; hints: number; revealed: boolean; requeue: boolean }) => { outcome: 'requeued' | 'kept'; next: number | null };
  /** Start the run over (a replay): no extra slots, nothing deferred, no history. */
  resetRun: () => void;
  /** The learner's Learn/Practice preference (owned by the platform session; re-exposed for the modal). */
  learningMode: LearningMode | null;
  setLearningMode: (mode: LearningMode) => void;
  /** Open a stage's lessons: in the unit a lesson is in, or wherever the learner is. */
  openPractice: (stageId?: string, challengeId?: string, mode?: LearningMode) => void;
  /** Open one unit: premium first, then the stage lock, then the unit lock. */
  openUnit: (stageId: string, unitId: string) => void;
  /** Open a stage's mandatory test. Refuses (with a toast) until every lesson is solved. */
  openStageTest: (stageId: string) => void;
  /**
   * Start a Practice session (mistakes, due questions, weak solves) over the
   * whole path or one stage. Nothing to practice: a toast says when to come
   * back. Resolves once it is open (or refused).
   */
  openReview: (scope?: { stageId?: string }) => Promise<void>;
  /** A question of the Practice session was answered right: a slot of it still to come is dropped. */
  noteReviewResolved: (challengeId: string) => void;
  /** The most times one question comes back in this run (the unit's rule, or the session's). */
  maxRounds: number;
  closePractice: () => void;
  /** Move within the open unit. An index past `reachableIndex` is refused with a toast. */
  goToChallenge: (index: number) => void;
}

/** Index of the first unsolved lesson, or the last index once every lesson is solved. */
export function reachableLessonIndex(challenges: readonly Pick<Challenge, 'id'>[], completed: readonly string[]): number {
  const first = challenges.findIndex((c) => !completed.includes(c.id));
  return first >= 0 ? first : Math.max(0, challenges.length - 1);
}

/** Where opening a stage lands: a unit, a lesson in it, and why it was pulled back (if it was). */
export interface OpenTarget {
  /** Null for a stage without units (every lesson in one run). */
  unitId: string | null;
  /** Index within the unit (or the stage, without units). */
  index: number;
  /** Said to the learner when a deep link was pulled back to where they may be. */
  notice?: string;
}

/**
 * Where "open this stage (at this lesson)" lands. Units are taken in order,
 * like the lessons inside them:
 *   - a lesson in a unit the learner may open (done, or the current one up
 *     to its first unsolved lesson) opens there;
 *   - anything further on is pulled back to the current unit's first
 *     unsolved lesson, with a notice;
 *   - no lesson named (or the stage test, which is in no unit) lands on the
 *     current unit - and a fully completed stage opens Unit 1 for review.
 */
export function resolveOpenTarget(stage: Pick<Stage, 'challenges' | 'units'>, completed: readonly string[], challengeId?: string): OpenTarget {
  const units = stage.units && stage.units.length ? stage.units : null;
  if (!units) {
    const reachable = reachableLessonIndex(stage.challenges, completed);
    if (challengeId) {
      const found = stage.challenges.findIndex((c) => c.id === challengeId);
      if (found > reachable) return { unitId: null, index: reachable, notice: `Solve lesson ${reachable + 1} first - lessons open in order.` };
      if (found >= 0) return { unitId: null, index: found };
    }
    return { unitId: null, index: reachable };
  }

  const states = unitStates(units, completed);
  const current = states.findIndex((s) => s.state === 'current');
  // Everything done: review from the start.
  const home = units[current >= 0 ? current : 0];
  const homeIndex = current >= 0 ? reachableLessonIndex(home.challenges, completed) : 0;

  if (challengeId) {
    const u = units.findIndex((unit) => unit.challengeIds.includes(challengeId));
    if (u >= 0) {
      const unit = units[u];
      const at = unit.challenges.findIndex((c) => c.id === challengeId);
      if (states[u].state === 'done') return { unitId: unit.id, index: Math.max(0, at) };
      if (states[u].state === 'current') {
        const reachable = reachableLessonIndex(unit.challenges, completed);
        if (at <= reachable) return { unitId: unit.id, index: Math.max(0, at) };
        return { unitId: unit.id, index: reachable, notice: `Solve lesson ${reachable + 1} of ${unit.name} first - lessons open in order.` };
      }
      return { unitId: home.id, index: homeIndex, notice: `Finish ${home.name} first - units open in order.` };
    }
  }
  return { unitId: home.id, index: homeIndex };
}

/**
 * Did the server send this stage as stubs (`locked`: a premium stage this
 * viewer has not unlocked)? Then there is nothing in it to open, whatever
 * the cached entitlements say - they may be a step behind a purchase or a
 * revoke, which is why a content reload goes with the unlock prompt.
 */
export function stageIsStubbed(stage: Pick<Stage, 'challenges' | 'test'>): boolean {
  return stage.challenges.some((c) => c.locked) || Boolean(stage.test?.locked);
}

/** What a running record was started as (to resume it under its own name). */
function requestOf(view: AssessmentView): AssessmentRequest {
  return view.kind === 'test-out' ? { kind: 'test-out', stageId: view.stageIds[0] ?? '' } : { kind: 'placement', trackId: view.trackId ?? '' };
}

const PracticeSessionContext = createContext<PracticeSessionType | undefined>(undefined);

/**
 * Which stage, unit and challenge the practice modal is showing.
 *
 * Owned by the challenges module. Other modules never call it directly: a
 * roadmap node or the dashboard emits `practice:open` / `practice:openUnit` /
 * `practice:openTest` and this provider answers - so they need no import
 * from here.
 */
export const PracticeSessionProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const {
    stages,
    learnerStages,
    stats,
    contentReady,
    learningMode,
    setLearningMode,
    reloadContent,
    settings,
    startReview,
    challengeById,
    todayKey,
    assessmentsAvailable,
    activeAssessment,
    startAssessment,
    failAssessment,
    finishAssessment
  } = useSession();
  const { notify } = useToast();

  const [activeStageId, setActiveStageId] = useState<string | null>(null);
  const [activeMode, setActiveMode] = useState<PracticeMode>('lessons');
  const [activeUnitId, setActiveUnitId] = useState<string | null>(null);
  const [activeChallengeIndex, setActiveChallengeIndex] = useState(0);
  // The run's requeue state (session/queue.ts), in memory only: the slots
  // added after a miss, the slots moved past, and what each question took.
  const [extraSlots, setExtraSlots] = useState<Slot[]>([]);
  const [deferred, setDeferred] = useState<ReadonlySet<string>>(() => new Set());
  const [history, setHistory] = useState<Record<string, ItemHistory>>({});
  // What was solved when the run began: a replayed unit's questions were
  // solved long ago, so only a solve made in this run drops a requeued slot.
  const [solvedBefore, setSolvedBefore] = useState<ReadonlySet<string>>(() => new Set());
  // The Practice session, and the questions answered right in it (they were
  // all solved long ago, so "solved in this run" is tracked here instead).
  const [activeReview, setActiveReview] = useState<ActiveReview | null>(null);
  const [reviewResolved, setReviewResolved] = useState<ReadonlySet<string>>(() => new Set());
  // The test-out or placement (Phase 5), in memory: the record lives on the
  // server (or in a guest's log), so a reload finds it again as `activeAssessment`.
  const [assessmentRun, setAssessmentRun] = useState<AssessmentRun | null>(null);
  const assessmentRef = useRef(assessmentRun);
  assessmentRef.current = assessmentRun;
  const completedRef = useRef(stats.completedChallenges);
  completedRef.current = stats.completedChallenges;

  const resetRun = useCallback(() => {
    setExtraSlots([]);
    setDeferred(new Set());
    setHistory({});
    setSolvedBefore(new Set(completedRef.current));
    setReviewResolved(new Set());
  }, []);

  const activeStage = useMemo(
    () => (activeStageId ? stages.find((s) => s.id === activeStageId) ?? null : null),
    [activeStageId, stages]
  );
  const isReview = activeMode === 'review' && activeReview !== null;
  const isAssessment = activeMode === 'assessment' && assessmentRun !== null;

  const activeUnit = useMemo<Unit | null>(() => {
    if (!activeStage || activeMode === 'test' || activeMode === 'assessment' || !activeUnitId) return null;
    return activeStage.units?.find((u) => u.id === activeUnitId) ?? null;
  }, [activeStage, activeMode, activeUnitId]);

  const unitPosition = useMemo(
    () => (activeStage && activeUnit ? { index: activeUnit.index, count: activeStage.units?.length ?? 1 } : null),
    [activeStage, activeUnit]
  );
  const nextUnit = useMemo(
    () => (activeStage && activeUnit ? activeStage.units?.[activeUnit.index + 1] ?? null : null),
    [activeStage, activeUnit]
  );

  /** The questions of the run, once each, in order. */
  const baseChallenges = useMemo<Challenge[]>(() => {
    // A Practice session: its questions, as far as this bank still has them
    // (a question hidden since, or now behind a lock, is left out).
    if (isReview && activeReview) {
      return activeReview.items.map((item) => challengeById(item.challengeId)).filter((c): c is Challenge => Boolean(c && !c.locked));
    }
    if (!activeStage) return [];
    if (activeMode === 'test') return activeStage.test ? [activeStage.test] : [];
    // A test-out or placement: the stage test it is on, only while one is on screen.
    if (activeMode === 'assessment') return assessmentRun?.screen === 'running' && activeStage.test && !activeStage.test.locked ? [activeStage.test] : [];
    // A unit regrouped away while it was open (an admin's change arrived)
    // falls back to the whole stage rather than an empty lesson.
    return activeUnit?.challenges ?? activeStage.challenges;
  }, [activeStage, activeMode, activeUnit, isReview, activeReview, challengeById, assessmentRun?.screen]);

  /**
   * One slot per question, then the questions that came back after a miss.
   * A slot still to come for a question solved in this run since - in its
   * own place, or after going back to it - is left out (`dropSolved`). An
   * extra slot for a question no longer in the run (regrouped away) is left
   * out too.
   */
  const solvedInRun = useMemo<ReadonlySet<string>>(
    () => (isReview ? reviewResolved : new Set(solvedThisRun(stats.completedChallenges, solvedBefore))),
    [isReview, reviewResolved, stats.completedChallenges, solvedBefore]
  );
  const slots = useMemo<Slot[]>(() => {
    const ids = new Set(baseChallenges.map((c) => c.id));
    const all = [...initialSlots(baseChallenges), ...extraSlots.filter((s) => ids.has(s.challengeId))];
    return dropSolved(all, activeChallengeIndex, [...solvedInRun]);
  }, [baseChallenges, extraSlots, activeChallengeIndex, solvedInRun]);

  const activeChallenges = useMemo<Challenge[]>(() => {
    const byId = new Map(baseChallenges.map((c) => [c.id, c]));
    return slots.map((s) => byId.get(s.challengeId)).filter((c): c is Challenge => Boolean(c));
  }, [baseChallenges, slots]);
  const activeSlot = slots[activeChallengeIndex] ?? null;

  /** Premium or stubbed: offer the unlock (and fetch the bank again when the two disagree). Returns true when it did. */
  const refusePremium = useCallback(
    (target: Stage) => {
      if (!isPremiumLocked(target, stats) && !stageIsStubbed(target)) return false;
      // Stubs the entitlements disagree with: fetch the bank again, so a
      // purchase that raced the last fetch opens on the next click.
      if (stageIsStubbed(target) && !isPremiumLocked(target, stats)) void reloadContent();
      eventBus.emit('account:openPro', { stageId: target.id });
      return true;
    },
    [stats, reloadContent]
  );

  const openPractice = useCallback(
    (stageId?: string, challengeId?: string, mode?: LearningMode) => {
      if (mode) setLearningMode(mode);
      // An explicit stage may belong to any track (the library and the
      // achievements list span every language); "wherever I left off" stays
      // inside the track the learner is following.
      const target =
        (stageId && stages.find((s) => s.id === stageId)) ||
        learnerStages.find((s) => s.state === 'In progress') ||
        learnerStages.find((s) => s.challenges.length > 0) ||
        stages.find((s) => s.challenges.length > 0);

      if (!target) {
        notify(contentReady ? 'No challenges are available yet.' : 'Still loading the lessons - one moment.', 'error');
        return;
      }
      if (refusePremium(target)) return;
      if (target.challenges.length === 0) {
        notify(`${target.name} has no challenges yet.`, 'error');
        return;
      }

      // Units and lessons are taken in order: an explicit lesson past where
      // the learner may be is pulled back, with a notice.
      const landing = resolveOpenTarget(target, stats.completedChallenges, challengeId);
      if (landing.notice) notify(landing.notice, 'info');

      setActiveMode('lessons');
      setActiveReview(null);
      setAssessmentRun(null);
      setActiveStageId(target.id);
      setActiveUnitId(landing.unitId);
      setActiveChallengeIndex(landing.index);
      resetRun();
    },
    [stages, learnerStages, stats.completedChallenges, notify, contentReady, setLearningMode, refusePremium, resetRun]
  );

  const openUnit = useCallback(
    (stageId: string, unitId: string) => {
      const target = stages.find((s) => s.id === stageId);
      if (!target) {
        notify(contentReady ? 'That stage is not available.' : 'Still loading the lessons - one moment.', 'error');
        return;
      }
      if (refusePremium(target)) return;
      if (target.state === 'Locked') {
        notify('Finish the earlier stages first.', 'error');
        return;
      }
      const units = target.units ?? [];
      const at = units.findIndex((u) => u.id === unitId);
      if (at < 0) {
        openPractice(stageId);
        return;
      }
      const states = unitStates(units, stats.completedChallenges);
      if (states[at].state === 'locked') {
        const current = units[states.findIndex((s) => s.state === 'current')];
        notify(`Finish ${current?.name ?? 'the unit before'} first.`, 'info');
        return;
      }
      const unit = units[at];
      setActiveMode('lessons');
      setActiveReview(null);
      setAssessmentRun(null);
      setActiveStageId(target.id);
      setActiveUnitId(unit.id);
      // A finished unit is a replay from its start; otherwise its first unsolved lesson.
      setActiveChallengeIndex(states[at].state === 'done' ? 0 : reachableLessonIndex(unit.challenges, stats.completedChallenges));
      resetRun();
    },
    [stages, stats.completedChallenges, notify, contentReady, refusePremium, openPractice, resetRun]
  );

  /**
   * The stage test is mandatory and gated: it opens only once every lesson in
   * the stage is solved, and the next stage does not open until it is passed.
   */
  const openStageTest = useCallback(
    (stageId: string) => {
      const target = stages.find((s) => s.id === stageId);
      if (!target || !target.test) {
        notify('This stage has no test.', 'error');
        return;
      }
      if (refusePremium(target)) return;
      if (target.state === 'Locked') {
        notify('Finish the earlier stages first.', 'error');
        return;
      }
      const status = stageStatus(target, stats);
      if (!status.lessonsDone) {
        notify(`Solve all ${status.total} lessons in ${target.name} to unlock its test (${status.done} done).`, 'info');
        return;
      }
      setActiveMode('test');
      setActiveReview(null);
      setAssessmentRun(null);
      setActiveStageId(target.id);
      setActiveUnitId(null);
      setActiveChallengeIndex(0);
      resetRun();
    },
    [stages, stats, notify, refusePremium, resetRun]
  );

  /**
   * A Practice session: built by the server (signed in) or here (a guest,
   * offline). No lesson order and no unit - the questions were all solved.
   */
  const openingReview = useRef(false);
  const openReview = useCallback(
    async (scope: { stageId?: string } = {}) => {
      if (openingReview.current) return;
      if (!contentReady) {
        notify('Still loading the lessons - one moment.', 'info');
        return;
      }
      openingReview.current = true;
      try {
        const started = await startReview(scope);
        if (started.error) {
          notify(started.error, 'info');
          return;
        }
        // Only the questions this bank can show (a stale copy may lack one).
        const items = started.items.filter((item) => {
          const c = challengeById(item.challengeId);
          return Boolean(c && !c.locked);
        });
        if (!started.sessionId || items.length === 0) {
          const when = describeNextReview(started.nextDueDay, todayKey);
          notify(when ? `Nothing to practice right now. Your next review is ${when}.` : 'Nothing to practice right now. Solve a few lessons first, then come back.', 'info');
          return;
        }
        setActiveReview({ sessionId: started.sessionId, items, local: started.local, stageId: scope.stageId ?? null, remainingToday: started.remainingToday });
        setAssessmentRun(null);
        setActiveMode('review');
        setActiveStageId(scope.stageId ?? null);
        setActiveUnitId(null);
        setActiveChallengeIndex(0);
        resetRun();
      } finally {
        openingReview.current = false;
      }
    },
    [contentReady, startReview, challengeById, todayKey, notify, resetRun]
  );

  const noteReviewResolved = useCallback((challengeId: string) => {
    setReviewResolved((prev) => (prev.has(challengeId) ? prev : new Set([...prev, challengeId])));
  }, []);

  /** Close whatever is open, at once. */
  const closeAll = useCallback(() => {
    setActiveStageId(null);
    setActiveReview(null);
    setAssessmentRun(null);
    setActiveMode('lessons');
    setActiveUnitId(null);
    setActiveChallengeIndex(0);
    resetRun();
  }, [resetRun]);

  /**
   * Close the modal. A test-out or placement test on screen is not closed
   * straight away: leaving ends the attempt, so the learner is asked first
   * (`confirmingLeave`; `leaveAssessment` / `cancelLeave` answer).
   */
  const closePractice = useCallback(() => {
    const run = assessmentRef.current;
    if (run && run.screen === 'running' && run.view && run.view.status === 'active') {
      setAssessmentRun({ ...run, confirmingLeave: true });
      return;
    }
    closeAll();
  }, [closeAll]);

  /* ------------------------------------------------ test-out and placement */

  /** Show a test on screen: its stage, a fresh run. */
  const showAssessment = useCallback(
    (view: AssessmentView, patch: Partial<AssessmentRun>) => {
      setAssessmentRun((prev) =>
        prev ? { ...prev, ...patch, view, screen: 'running', running: null, error: null, busy: false, confirmingLeave: false } : prev
      );
      setActiveStageId(view.current);
      setActiveChallengeIndex(0);
      resetRun();
    },
    [resetRun]
  );

  const openAssessment = useCallback(
    (request: AssessmentRequest) => {
      if (!contentReady) {
        notify('Still loading the lessons - one moment.', 'info');
        return;
      }
      if (!assessmentsAvailable) {
        notify(assessmentBlockText('offline'), 'info');
        return;
      }
      let stageId: string | null = null;
      if (request.kind === 'test-out') {
        const target = stages.find((s) => s.id === request.stageId);
        if (!target || !target.test) {
          notify(assessmentBlockText('no-test'), 'error');
          return;
        }
        if (refusePremium(target)) return;
        stageId = target.id;
      }
      // One test at a time: the one already running is offered first -
      // straight back into it when it is the very one asked for.
      const running = activeAssessment && activeAssessment.status === 'active' && activeAssessment.current ? activeAssessment : null;
      const same =
        running &&
        running.kind === request.kind &&
        (request.kind === 'test-out' ? running.stageIds[0] === request.stageId : running.trackId === request.trackId);
      setActiveMode('assessment');
      setActiveReview(null);
      setActiveUnitId(null);
      setActiveChallengeIndex(0);
      resetRun();
      const base: AssessmentRun = {
        request,
        view: null,
        screen: 'intro',
        running: null,
        lastStageId: null,
        lastPassed: null,
        xp: 0,
        error: null,
        busy: false,
        confirmingLeave: false
      };
      if (running && same) {
        setAssessmentRun({ ...base, view: running, screen: 'running' });
        setActiveStageId(running.current);
        return;
      }
      setAssessmentRun(running ? { ...base, screen: 'conflict', running } : base);
      setActiveStageId(stageId);
    },
    [contentReady, assessmentsAvailable, stages, refusePremium, activeAssessment, notify, resetRun]
  );

  const beginAssessment = useCallback(async () => {
    const run = assessmentRef.current;
    if (!run || run.busy) return;
    setAssessmentRun({ ...run, busy: true, error: null });
    const res = await startAssessment(run.request);
    if (assessmentRef.current?.request !== run.request) return; // closed meanwhile
    if (res.assessment && res.assessment.current) {
      showAssessment(res.assessment, {});
      return;
    }
    if (res.running) {
      setAssessmentRun((prev) => (prev ? { ...prev, screen: 'conflict', running: res.running ?? null, busy: false } : prev));
      return;
    }
    const when = describeRetry(res.retryAt ?? null);
    const reason = res.reason && res.reason !== 'offline' && res.reason !== 'signed-out' ? assessmentBlockText(res.reason, when) : null;
    setAssessmentRun((prev) => (prev ? { ...prev, busy: false, error: reason ?? res.error ?? 'The test could not start.' } : prev));
  }, [startAssessment, showAssessment]);

  const resumeAssessment = useCallback(() => {
    const run = assessmentRef.current;
    if (!run?.running) return;
    showAssessment(run.running, { request: requestOf(run.running) });
  }, [showAssessment]);

  const endRunningAssessment = useCallback(async () => {
    const run = assessmentRef.current;
    if (!run?.running || run.busy) return;
    setAssessmentRun({ ...run, busy: true });
    await failAssessment(run.running, 'gave-up', 0);
    setAssessmentRun((prev) => (prev ? { ...prev, screen: 'intro', running: null, busy: false, error: null } : prev));
    setActiveStageId(run.request.kind === 'test-out' ? run.request.stageId : null);
  }, [failAssessment]);

  const noteAssessmentResult = useCallback<PracticeSessionType['noteAssessmentResult']>((view, outcome) => {
    setAssessmentRun((prev) => {
      if (!prev) return prev;
      const next = view ?? prev.view;
      // Only a placement goes on, and only to another stage's test: a record
      // still on the test just taken was not moved on (nothing was recorded),
      // so it is never offered again as "the next test".
      const going = Boolean(next && next.kind === 'placement' && next.status === 'active' && next.current && next.current !== outcome.stageId);
      return {
        ...prev,
        view: next,
        screen: going ? 'between' : 'result',
        lastStageId: outcome.stageId,
        lastPassed: outcome.passed,
        xp: prev.xp + Math.max(0, outcome.xp),
        busy: false,
        confirmingLeave: false
      };
    });
    setActiveStageId(outcome.stageId);
  }, []);

  const continueAssessment = useCallback(() => {
    const run = assessmentRef.current;
    if (!run?.view?.current) return;
    showAssessment(run.view, { lastPassed: run.lastPassed, lastStageId: run.lastStageId });
  }, [showAssessment]);

  const finishPlacement = useCallback(async () => {
    const run = assessmentRef.current;
    if (!run?.view || run.busy) return;
    setAssessmentRun({ ...run, busy: true });
    const ended = await finishAssessment(run.view);
    setAssessmentRun((prev) => (prev ? { ...prev, view: ended ?? prev.view, screen: 'result', busy: false } : prev));
  }, [finishAssessment]);

  const leaveAssessment = useCallback(
    async (runs: number) => {
      const run = assessmentRef.current;
      if (!run?.view || run.busy) return;
      const stageId = run.view.current;
      setAssessmentRun({ ...run, busy: true, confirmingLeave: false });
      let ended = await failAssessment(run.view, 'gave-up', runs);
      if (!ended) {
        // Nothing was recorded (the server could not be reached): the learner
        // still leaves, and the test runs out on the server by itself.
        notify('Could not reach the server to end the test. It ends by itself when its time runs out.', 'error');
        return closeAll();
      }
      // Leaving ends the whole attempt: a placement that would go on to its
      // next test (it does not stop at the first failure) is ended too.
      if (ended && ended.status === 'active' && ended.kind === 'placement') ended = (await finishAssessment(ended)) ?? ended;
      if (!stageId) return closeAll();
      noteAssessmentResult(ended, { stageId, passed: false, xp: 0 });
    },
    [failAssessment, finishAssessment, noteAssessmentResult, closeAll, notify]
  );

  const cancelLeave = useCallback(() => {
    setAssessmentRun((prev) => (prev ? { ...prev, confirmingLeave: false } : prev));
  }, []);

  // The bank was fetched again while a stage was open (a sign-out, a revoked
  // purchase) and it is stubs now: there is nothing left to show, so close
  // and offer the unlock instead of rendering an empty lesson.
  useEffect(() => {
    if (activeStage && activeChallenges[activeChallengeIndex]?.locked) {
      closePractice();
      eventBus.emit('account:openPro', { stageId: activeStage.id });
    }
  }, [activeStage, activeChallenges, activeChallengeIndex, closePractice]);

  // The stage test is a single item, so the rule only applies to lessons. A
  // Practice session goes over solved questions: any of them, in any order.
  const reachableIndex = useMemo(
    () =>
      activeMode === 'test' || activeMode === 'assessment'
        ? 0
        : isReview
          ? Math.max(0, slots.length - 1)
          : reachableSlotIndex(slots, stats.completedChallenges, deferred),
    [activeMode, isReview, slots, stats.completedChallenges, deferred]
  );

  // A missed question comes back once in a Practice session (review.requeueMissed).
  const maxRounds = isReview ? (settings.review.requeueMissed ? 1 : 0) : settings.feedback.requeue.maxRounds;
  const deferCurrent = useCallback<PracticeSessionType['deferCurrent']>(
    (left) => {
      const slot = slots[activeChallengeIndex];
      if (!slot) return { outcome: 'kept', next: null };
      const id = slot.challengeId;
      const again = left.requeue ? requeue(slots, id, maxRounds, activeChallengeIndex) : null;
      setHistory((prev) => {
        const next = noteSlotLeft(prev[id], left);
        return { ...prev, [id]: again ? { ...next, rounds: next.rounds + 1 } : next };
      });
      setDeferred((prev) => new Set([...prev, slotKey(slot)]));
      // The slots beyond the first pass, as the requeue left them.
      if (again) setExtraSlots(again.filter((s) => s.round > 0));
      const after = again ?? slots;
      const next = activeChallengeIndex + 1 < after.length ? activeChallengeIndex + 1 : null;
      if (next !== null) setActiveChallengeIndex(next);
      return { outcome: again ? 'requeued' : 'kept', next };
    },
    [slots, activeChallengeIndex, maxRounds]
  );

  const goToChallenge = useCallback(
    (index: number) => {
      if (index > reachableIndex) {
        notify(`Solve lesson ${reachableIndex + 1} first - lessons open in order.`, 'info');
        return;
      }
      setActiveChallengeIndex(Math.max(0, index));
    },
    [reachableIndex, notify]
  );

  // Intents from anywhere in the app.
  useAppEvent('practice:open', useCallback((p) => openPractice(p.stageId, p.challengeId, p.mode), [openPractice]));
  useAppEvent('practice:openUnit', useCallback((p) => openUnit(p.stageId, p.unitId), [openUnit]));
  useAppEvent('practice:openTest', useCallback((p) => openStageTest(p.stageId), [openStageTest]));
  useAppEvent('review:open', useCallback((p) => void openReview(p ?? {}), [openReview]));
  useAppEvent(
    'assessment:open',
    useCallback(
      (p) => {
        if (p.kind === 'test-out' && p.stageId) openAssessment({ kind: 'test-out', stageId: p.stageId });
        else if (p.kind === 'placement' && p.trackId) openAssessment({ kind: 'placement', trackId: p.trackId });
      },
      [openAssessment]
    )
  );
  useAppEvent('progress:reset', closeAll);

  // Signing out mid-session closes the modal rather than leaving a stale stage open.
  useEffect(() => eventBus.on('auth:signedOut', closeAll), [closeAll]);

  const isOpen = Boolean(activeStage) || isReview || isAssessment;
  const value = useMemo<PracticeSessionType>(
    () => ({
      activeStage,
      activeMode,
      activeReview: isReview ? activeReview : null,
      assessmentRun: isAssessment ? assessmentRun : null,
      openAssessment,
      beginAssessment,
      resumeAssessment,
      endRunningAssessment,
      noteAssessmentResult,
      continueAssessment,
      finishPlacement,
      leaveAssessment,
      cancelLeave,
      isOpen,
      activeUnit,
      unitPosition,
      nextUnit,
      activeChallenges,
      activeChallengeIndex,
      slots,
      activeSlot,
      deferred,
      history,
      solvedInRun,
      reachableIndex,
      deferCurrent,
      resetRun,
      learningMode,
      setLearningMode,
      openPractice,
      openUnit,
      openStageTest,
      openReview,
      noteReviewResolved,
      maxRounds,
      closePractice,
      goToChallenge
    }),
    [
      activeStage,
      activeMode,
      isReview,
      activeReview,
      isAssessment,
      assessmentRun,
      openAssessment,
      beginAssessment,
      resumeAssessment,
      endRunningAssessment,
      noteAssessmentResult,
      continueAssessment,
      finishPlacement,
      leaveAssessment,
      cancelLeave,
      isOpen,
      activeUnit,
      unitPosition,
      nextUnit,
      activeChallenges,
      activeChallengeIndex,
      slots,
      activeSlot,
      deferred,
      history,
      solvedInRun,
      reachableIndex,
      deferCurrent,
      resetRun,
      learningMode,
      setLearningMode,
      openPractice,
      openUnit,
      openStageTest,
      openReview,
      noteReviewResolved,
      maxRounds,
      closePractice,
      goToChallenge
    ]
  );

  return <PracticeSessionContext.Provider value={value}>{children}</PracticeSessionContext.Provider>;
};

export function usePracticeSession(): PracticeSessionType {
  const ctx = useContext(PracticeSessionContext);
  if (!ctx) {
    return {
      activeStage: null,
      activeMode: 'lessons',
      activeReview: null,
      assessmentRun: null,
      openAssessment: (request) => intents.openAssessment(request),
      beginAssessment: async () => {},
      resumeAssessment: () => {},
      endRunningAssessment: async () => {},
      noteAssessmentResult: () => {},
      continueAssessment: () => {},
      finishPlacement: async () => {},
      leaveAssessment: async () => {},
      cancelLeave: () => {},
      isOpen: false,
      activeUnit: null,
      unitPosition: null,
      nextUnit: null,
      activeChallenges: [],
      activeChallengeIndex: 0,
      slots: [],
      activeSlot: null,
      deferred: new Set(),
      history: {},
      solvedInRun: new Set(),
      reachableIndex: 0,
      deferCurrent: () => ({ outcome: 'kept', next: null }),
      resetRun: () => {},
      learningMode: null,
      setLearningMode: () => {},
      openPractice: (stageId, challengeId, mode) => intents.openPractice(stageId, challengeId, mode),
      openUnit: (stageId, unitId) => intents.openUnit(stageId, unitId),
      openStageTest: (stageId) => intents.openStageTest(stageId),
      openReview: async (scope) => intents.openReview(scope ?? {}),
      noteReviewResolved: () => {},
      maxRounds: 0,
      closePractice: () => {},
      goToChallenge: () => {}
    };
  }
  return ctx;
}
