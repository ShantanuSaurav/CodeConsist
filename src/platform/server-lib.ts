/**
 * The learning-loop rules the API server runs, as one bundle.
 *
 * server/index.js compiles this file to server/generated/learning.mjs at
 * boot (server/build.js) and hands it around as `learningDeps.lib`, so the
 * server applies exactly the same settings, day, XP and activity rules as
 * the browser - one implementation, two runtimes. Unlike the settings barrel
 * this includes the zod schema: the server validates every admin edit.
 */
export * from './settings/types';
export * from './settings/defaults';
export * from './settings/meta';
export * from './settings/merge';
export * from './settings/env';
export * from './settings/copy';
export * from './settings/schema';
export * from './settings/budget';
export * from './time/days';
export * from './activity/log';
export * from './grading-engine/misses';
export { gradeAnswer } from './grading-engine/grading';
// Wrong-answer notes and the attempt budget (Phase 4): the admin's leak
// warnings, and the score cap after a reveal, use the rules the practice
// modal and the content lint use.
export {
  blankNoteKey,
  blankNotes,
  blankNoteLeaks,
  feedbackCoverage,
  feedbackLeaks,
  normalizeForLeak,
  optionNoteKey,
  optionNoteLeaks,
  optionNotes
} from './grading-engine/feedback';
export * from './xp-leveling/leveling';
export { DEFAULT_RANKS, rankTitle, nextRankLevel } from './xp-leveling/insights';
// Units and the perfect-unit bonus (Phase 2): the server groups a stage's
// lessons and pays for a completed unit with the same code the browser runs.
export * from './progress/units';
export * from './xp-leveling/rewards';
// Daily goal, streak, freezes and repair (Phase 3): the server settles and
// counts a learner's streak with the same engine the browser runs.
export * from './habits';
// Practice sessions (Phase 4): the review schedule, the session builder and
// what an answer pays - the same code a guest's session runs in the browser.
export * from './review';
// Stage locks, test-out and placement (Phase 5): the server builds a
// learner's stages and decides what they may solve, test out of and merge
// with the same rules the path is drawn with.
export * from './progress/stages';
export * from './progress/access';
// The weekly league (Phase 6): weeks, ranking, groups and what a closed week
// does - server/leagues.js runs them over the store.
export * from './league/league';
