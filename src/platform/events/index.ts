/**
 * The app-wide event contract.
 *
 * Two families:
 * - Facts about what happened (`challenge:completed`, `auth:signedIn`) -
 *   emitted by the session, consumed by whoever cares.
 * - Intents to open something owned by another module (`practice:open`,
 *   `account:openAuth`) - emitted from anywhere, handled by the module that
 *   owns that screen. This is how a roadmap node starts a stage's lessons
 *   without importing the challenges module.
 */
import { createTypedEventBus, useBusEvent } from './bus';
import type { ActivityContext, Challenge, LearningMode, UserProfile } from '@/types';

export type AppEvents = {
  /* ---------------------------------------------------------- facts */
  'challenge:completed': {
    challenge: Challenge;
    /** XP actually awarded (0 on a re-solve). */
    xpEarned: number;
    attempts: number;
    hintsUsed: number;
    firstTime: boolean;
  };
  /**
   * A wrong answer was recorded (never a correct one). `final`: the answer
   * was shown after it - the question goes back on the Practice schedule.
   */
  'challenge:missed': { challenge: Challenge; context: ActivityContext; final: boolean };
  /**
   * A Practice session reached its end screen: `correct` of its `total`
   * questions answered right, and the review XP it paid (bonus included).
   */
  'review:completed': { correct: number; total: number; xp: number };
  /** Every lesson and the test of a stage are solved. */
  'stage:completed': { stageId: string };
  /**
   * A first solve completed a unit (every lesson in it solved) for the first
   * time. `xpEarned` is the perfect-unit bonus it paid (0 when not perfect).
   */
  'unit:completed': { stageId: string; unitId: string; perfect: boolean; xpEarned: number };
  /**
   * Today's daily goal was met (announced once per day in this browser).
   * `source: 'solve'` - a lesson on screen just met it; `'sync'` - it was met
   * elsewhere (offline, another device) and this browser learned it later.
   */
  'habit:goalMet': { day: string; source: 'solve' | 'sync'; label: string; bonusXp: number; streak: number };
  /** A streak freeze was earned (`freezes` held now, of `maxFreezes`). */
  'habit:freezeEarned': { freezes: number; maxFreezes: number };
  /** A streak freeze covered missed days: the streak lives on. */
  'habit:freezeUsed': { days: string[]; streak: number };
  /** An open repair was completed: the lost streak is back. */
  'habit:streakRepaired': { streak: number };
  /** The streak reached one of the admin's milestones (`streak.milestones`). */
  'habit:milestone': { streak: number };
  'auth:signedIn': { user: UserProfile };
  'auth:signedOut': Record<string, never>;
  'progress:reset': Record<string, never>;
  /** The API went online or offline. */
  'server:status': { online: boolean };

  /* -------------------------------------------------------- intents */
  /** Open a stage's lessons; both ids optional ("wherever I left off"). `mode` switches Learn/Practice for this and later sessions. */
  'practice:open': { stageId?: string; challengeId?: string; mode?: LearningMode };
  /** Open one unit of a stage (at its first unsolved lesson, or its start for a replay). */
  'practice:openUnit': { stageId: string; unitId: string };
  /** Open a stage's mandatory coding test. */
  'practice:openTest': { stageId: string };
  /** Start a Practice session: mistakes, due questions and weak solves - of one stage, or all. */
  'review:open': { stageId?: string };
  'account:openAuth': Record<string, never>;
  /**
   * Open the unlock modal. `stageId` highlights the stage that was locked
   * (and its track); `trackId` picks a track without a stage; `tab` lands on
   * the certificates tab instead of the unlocks.
   */
  'account:openPro': { stageId?: string; trackId?: string; tab?: 'unlock' | 'certificates' };
};

export const eventBus = createTypedEventBus<AppEvents>();

/** Subscribe to an app event for a component's lifetime. */
export function useAppEvent<K extends keyof AppEvents>(event: K, listener: (payload: AppEvents[K]) => void): void {
  useBusEvent(eventBus, event, listener);
}

export { createTypedEventBus } from './bus';
export type { EventBus, Listener } from './bus';
export { intents } from './intents';
