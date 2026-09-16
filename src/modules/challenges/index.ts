/**
 * Public API of the challenges module. Everything else in here is private.
 *
 * Owns: the challenge bank, the seven challenge types and their grading, the
 * practice modal and session, the learning path and the library.
 * Emits (via the session): challenge:completed, stage:completed.
 * Listens: practice:open, practice:openTest, progress:reset, auth:signedOut.
 */
export { PracticeHost } from './components/PracticeHost';
export type { PracticeModalProps } from './components/PracticeModal';
export { LearnPage } from './pages/LearnPage';
export { ChallengesPage } from './pages/ChallengesPage';
export { ALL_CHALLENGES, CHALLENGE_BY_ID, buildStages, STAGE_META } from './content';
export { CHALLENGE_TYPES, definitionFor, checkAnswer, emptyAnswer, isAnswerComplete } from './challenge-types';
export { ChallengeSchema, StageMetaSchema } from './schema';
