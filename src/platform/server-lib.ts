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
export * from './settings/copy';
export * from './settings/schema';
export * from './time/days';
export * from './activity/log';
export * from './grading-engine/misses';
export { gradeAnswer } from './grading-engine/grading';
export * from './xp-leveling/leveling';
export { DEFAULT_RANKS, rankTitle, nextRankLevel } from './xp-leveling/insights';
// Units and the perfect-unit bonus (Phase 2): the server groups a stage's
// lessons and pays for a completed unit with the same code the browser runs.
export * from './progress/units';
export * from './xp-leveling/rewards';
// Daily goal, streak, freezes and repair (Phase 3): the server settles and
// counts a learner's streak with the same engine the browser runs.
export * from './habits';
