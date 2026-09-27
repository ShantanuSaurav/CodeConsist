import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { Challenge, LearningMode, Stage, Unit } from '@/types';
import { useSession } from '@/platform/session';
import { isPremiumLocked, stageStatus, unitStates } from '@/platform/progress';
import { eventBus, intents, useAppEvent } from '@/platform/events';
import { useToast } from '@/ui';

export type PracticeMode = 'lessons' | 'test';

export interface PracticeSessionType {
  activeStage: Stage | null;
  /** 'lessons' walks one unit's challenges; 'test' holds only the stage test. */
  activeMode: PracticeMode;
  /** The unit being walked in lesson mode (null for the test, or a stage without units). */
  activeUnit: Unit | null;
  /** Where that unit sits in its stage: "Unit 2 of 4". */
  unitPosition: { index: number; count: number } | null;
  /** The unit after the active one, or null at the end of the stage. */
  nextUnit: Unit | null;
  /** The challenges the open session is walking through: the unit's, or the test. */
  activeChallenges: Challenge[];
  activeChallengeIndex: number;
  /**
   * The furthest lesson the learner may open: the first unsolved one (every
   * lesson before it is solved), or the last lesson once all are solved.
   * Lessons are taken in order - a later one cannot be opened or skipped to.
   */
  reachableIndex: number;
  /** The learner's Learn/Practice preference (owned by the platform session; re-exposed for the modal). */
  learningMode: LearningMode | null;
  setLearningMode: (mode: LearningMode) => void;
  /** Open a stage's lessons: in the unit a lesson is in, or wherever the learner is. */
  openPractice: (stageId?: string, challengeId?: string, mode?: LearningMode) => void;
  /** Open one unit: premium first, then the stage lock, then the unit lock. */
  openUnit: (stageId: string, unitId: string) => void;
  /** Open a stage's mandatory test. Refuses (with a toast) until every lesson is solved. */
  openStageTest: (stageId: string) => void;
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
  const { stages, learnerStages, stats, contentReady, learningMode, setLearningMode, reloadContent } = useSession();
  const { notify } = useToast();

  const [activeStageId, setActiveStageId] = useState<string | null>(null);
  const [activeMode, setActiveMode] = useState<PracticeMode>('lessons');
  const [activeUnitId, setActiveUnitId] = useState<string | null>(null);
  const [activeChallengeIndex, setActiveChallengeIndex] = useState(0);

  const activeStage = useMemo(
    () => (activeStageId ? stages.find((s) => s.id === activeStageId) ?? null : null),
    [activeStageId, stages]
  );

  const activeUnit = useMemo<Unit | null>(() => {
    if (!activeStage || activeMode === 'test' || !activeUnitId) return null;
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

  const activeChallenges = useMemo<Challenge[]>(() => {
    if (!activeStage) return [];
    if (activeMode === 'test') return activeStage.test ? [activeStage.test] : [];
    // A unit regrouped away while it was open (an admin's change arrived)
    // falls back to the whole stage rather than an empty lesson.
    return activeUnit?.challenges ?? activeStage.challenges;
  }, [activeStage, activeMode, activeUnit]);

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
      setActiveStageId(target.id);
      setActiveUnitId(landing.unitId);
      setActiveChallengeIndex(landing.index);
    },
    [stages, learnerStages, stats.completedChallenges, notify, contentReady, setLearningMode, refusePremium]
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
      setActiveStageId(target.id);
      setActiveUnitId(unit.id);
      // A finished unit is a replay from its start; otherwise its first unsolved lesson.
      setActiveChallengeIndex(states[at].state === 'done' ? 0 : reachableLessonIndex(unit.challenges, stats.completedChallenges));
    },
    [stages, stats.completedChallenges, notify, contentReady, refusePremium, openPractice]
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
      setActiveStageId(target.id);
      setActiveUnitId(null);
      setActiveChallengeIndex(0);
    },
    [stages, stats, notify, refusePremium]
  );

  const closePractice = useCallback(() => {
    setActiveStageId(null);
    setActiveMode('lessons');
    setActiveUnitId(null);
    setActiveChallengeIndex(0);
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

  // The stage test is a single item, so the rule only applies to lessons.
  const reachableIndex = useMemo(
    () => (activeMode === 'test' ? 0 : reachableLessonIndex(activeChallenges, stats.completedChallenges)),
    [activeMode, activeChallenges, stats.completedChallenges]
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
  useAppEvent('progress:reset', closePractice);

  // Signing out mid-session closes the modal rather than leaving a stale stage open.
  useEffect(() => eventBus.on('auth:signedOut', closePractice), [closePractice]);

  const value = useMemo<PracticeSessionType>(
    () => ({
      activeStage,
      activeMode,
      activeUnit,
      unitPosition,
      nextUnit,
      activeChallenges,
      activeChallengeIndex,
      reachableIndex,
      learningMode,
      setLearningMode,
      openPractice,
      openUnit,
      openStageTest,
      closePractice,
      goToChallenge
    }),
    [
      activeStage,
      activeMode,
      activeUnit,
      unitPosition,
      nextUnit,
      activeChallenges,
      activeChallengeIndex,
      reachableIndex,
      learningMode,
      setLearningMode,
      openPractice,
      openUnit,
      openStageTest,
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
      activeUnit: null,
      unitPosition: null,
      nextUnit: null,
      activeChallenges: [],
      activeChallengeIndex: 0,
      reachableIndex: 0,
      learningMode: null,
      setLearningMode: () => {},
      openPractice: (stageId, challengeId, mode) => intents.openPractice(stageId, challengeId, mode),
      openUnit: (stageId, unitId) => intents.openUnit(stageId, unitId),
      openStageTest: (stageId) => intents.openStageTest(stageId),
      closePractice: () => {},
      goToChallenge: () => {}
    };
  }
  return ctx;
}
