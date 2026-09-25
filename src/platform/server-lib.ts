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
