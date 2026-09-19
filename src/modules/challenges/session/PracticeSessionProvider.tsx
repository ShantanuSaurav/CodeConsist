import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { Challenge, LearningMode, Stage } from '@/types';
import { useSession } from '@/platform/session';
import { stageStatus } from '@/platform/progress';
import { eventBus, intents, useAppEvent } from '@/platform/events';
import { useToast } from '@/ui';

export type PracticeMode = 'lessons' | 'test';

export interface PracticeSessionType {
  activeStage: Stage | null;
  /** 'lessons' walks the stage's challenges; 'test' holds only the stage test. */
  activeMode: PracticeMode;
  /** The challenges the open session is walking through. */
  activeChallenges: Challenge[];
  activeChallengeIndex: number;
  /** The learner's Learn/Practice preference (owned by the platform session; re-exposed for the modal). */
  learningMode: LearningMode | null;
  setLearningMode: (mode: LearningMode) => void;
  openPractice: (stageId?: string, challengeId?: string, mode?: LearningMode) => void;
  /** Open a stage's mandatory test. Refuses (with a toast) until every lesson is solved. */
  openStageTest: (stageId: string) => void;
  closePractice: () => void;
  goToChallenge: (index: number) => void;
}

const PracticeSessionContext = createContext<PracticeSessionType | undefined>(undefined);

/**
 * Which stage and challenge the practice modal is showing.
 *
 * Owned by the challenges module. Other modules never call it directly: a
 * roadmap node or the dashboard emits `practice:open` / `practice:openTest`
 * and this provider answers - so they need no import from here.
 */
export const PracticeSessionProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { stages, learnerStages, stats, contentReady, learningMode, setLearningMode } = useSession();
  const { notify } = useToast();

  const [activeStageId, setActiveStageId] = useState<string | null>(null);
  const [activeMode, setActiveMode] = useState<PracticeMode>('lessons');
  const [activeChallengeIndex, setActiveChallengeIndex] = useState(0);

  const activeStage = useMemo(
    () => (activeStageId ? stages.find((s) => s.id === activeStageId) ?? null : null),
    [activeStageId, stages]
  );

  const activeChallenges = useMemo<Challenge[]>(() => {
    if (!activeStage) return [];
    if (activeMode === 'test') return activeStage.test ? [activeStage.test] : [];
    return activeStage.challenges;
  }, [activeStage, activeMode]);

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
      if (target.isPremium && !stats.isPremium) {
        eventBus.emit('account:openPro', {});
        return;
      }
      if (target.challenges.length === 0) {
        notify(`${target.name} has no challenges yet.`, 'error');
        return;
      }

      let index = 0;
      if (challengeId) {
        const found = target.challenges.findIndex((c) => c.id === challengeId);
        if (found >= 0) index = found;
      } else {
        // Drop the player at the first thing they have not solved.
        const firstUnsolved = target.challenges.findIndex((c) => !stats.completedChallenges.includes(c.id));
        index = firstUnsolved >= 0 ? firstUnsolved : 0;
      }

      setActiveMode('lessons');
      setActiveStageId(target.id);
      setActiveChallengeIndex(index);
    },
    [stages, learnerStages, stats.isPremium, stats.completedChallenges, notify, contentReady, setLearningMode]
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
      if (target.isPremium && !stats.isPremium) {
        eventBus.emit('account:openPro', {});
        return;
      }
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
      setActiveChallengeIndex(0);
    },
    [stages, stats, notify]
  );

  const closePractice = useCallback(() => {
    setActiveStageId(null);
    setActiveMode('lessons');
    setActiveChallengeIndex(0);
  }, []);

  const goToChallenge = useCallback((index: number) => {
    setActiveChallengeIndex(Math.max(0, index));
  }, []);

  // Intents from anywhere in the app.
  useAppEvent('practice:open', useCallback((p) => openPractice(p.stageId, p.challengeId, p.mode), [openPractice]));
  useAppEvent('practice:openTest', useCallback((p) => openStageTest(p.stageId), [openStageTest]));
  useAppEvent('progress:reset', closePractice);

  // Signing out mid-session closes the modal rather than leaving a stale stage open.
  useEffect(() => eventBus.on('auth:signedOut', closePractice), [closePractice]);

  const value = useMemo<PracticeSessionType>(
    () => ({
      activeStage,
      activeMode,
      activeChallenges,
      activeChallengeIndex,
      learningMode,
      setLearningMode,
      openPractice,
      openStageTest,
      closePractice,
      goToChallenge
    }),
    [activeStage, activeMode, activeChallenges, activeChallengeIndex, learningMode, setLearningMode, openPractice, openStageTest, closePractice, goToChallenge]
  );

  return <PracticeSessionContext.Provider value={value}>{children}</PracticeSessionContext.Provider>;
};

export function usePracticeSession(): PracticeSessionType {
  const ctx = useContext(PracticeSessionContext);
  if (!ctx) {
    return {
      activeStage: null,
      activeMode: 'lessons',
      activeChallenges: [],
      activeChallengeIndex: 0,
      learningMode: null,
      setLearningMode: () => {},
      openPractice: (stageId, challengeId, mode) => intents.openPractice(stageId, challengeId, mode),
      openStageTest: (stageId) => intents.openStageTest(stageId),
      closePractice: () => {},
      goToChallenge: () => {}
    };
  }
  return ctx;
}

