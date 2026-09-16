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
import type { Challenge, UserProfile } from '@/types';

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
  /** Every lesson and the test of a stage are solved. */
  'stage:completed': { stageId: string };
  'auth:signedIn': { user: UserProfile };
  'auth:signedOut': Record<string, never>;
  'progress:reset': Record<string, never>;
  /** The API went online or offline. */
  'server:status': { online: boolean };

  /* -------------------------------------------------------- intents */
  /** Open a stage's lessons; both ids optional ("wherever I left off"). */
  'practice:open': { stageId?: string; challengeId?: string };
  /** Open a stage's mandatory coding test. */
  'practice:openTest': { stageId: string };
  'account:openAuth': Record<string, never>;
  'account:openPro': Record<string, never>;
};

export const eventBus = createTypedEventBus<AppEvents>();

/** Subscribe to an app event for a component's lifetime. */
export function useAppEvent<K extends keyof AppEvents>(event: K, listener: (payload: AppEvents[K]) => void): void {
  useBusEvent(eventBus, event, listener);
}

export { createTypedEventBus } from './bus';
export type { EventBus, Listener } from './bus';
export { intents } from './intents';
