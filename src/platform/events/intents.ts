/**
 * Convenience emitters for the "open something" intents. Any module may call
 * these; the module that owns the screen answers. Nobody imports anybody.
 */
import type { LearningMode } from '@/types';
import { eventBus } from './index';
import type { AppEvents } from './index';

export const intents = {
  /** Open a stage's lessons (or wherever the player left off when both are omitted). */
  openPractice: (stageId?: string, challengeId?: string, mode?: LearningMode) =>
    eventBus.emit('practice:open', { stageId, challengeId, mode }),
  /** Open one unit of a stage (the practice session checks premium, the stage lock and the unit lock). */
  openUnit: (stageId: string, unitId: string) => eventBus.emit('practice:openUnit', { stageId, unitId }),
  /** Open a stage's mandatory coding test. */
  openStageTest: (stageId: string) => eventBus.emit('practice:openTest', { stageId }),
  /** Start a Practice session (review) over the whole path, or one stage. */
  openReview: (scope: AppEvents['review:open'] = {}) => eventBus.emit('review:open', scope),
  openAuth: () => eventBus.emit('account:openAuth', {}),
  /** Open the unlock modal, optionally pointed at the stage/track that was locked or at the certificates tab. */
  openPro: (opts: AppEvents['account:openPro'] = {}) => eventBus.emit('account:openPro', opts)
};
