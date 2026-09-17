/**
 * Public API of the challenges module. Everything else in here is private.
 *
 * Owns: the challenge bank, the seven challenge types and their grading, the
 * practice modal and session, the learning path and the library.
 * Emits (via the session): challenge:completed, stage:completed.
 * Listens: practice:open, practice:openTest, progress:reset, auth:signedOut.
 *
 * The bank itself is NOT re-exported here. It lives behind a second entry,
 * `@/modules/challenges/content`, which the app imports dynamically so the
 * ~300 kB of questions never land in the shell chunk (ADR 0006). The boundary
 * check enforces that it is only ever imported that way.
 */
export { PracticeHost } from './components/PracticeHost';
export type { PracticeModalProps } from './components/PracticeModal';
export { LearnPage } from './pages/LearnPage';
export { ChallengesPage } from './pages/ChallengesPage';
export { CHALLENGE_TYPES, definitionFor, checkAnswer, emptyAnswer, isAnswerComplete } from './challenge-types';
