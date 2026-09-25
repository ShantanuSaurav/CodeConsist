/* ==========================================================================
   The defaults for every setting. The store holds only the keys an
   administrator changed; everything else is what is written here.

   The XP, level and rank numbers are IMPORTED from the functions that use
   them, never retyped, so the defaults cannot drift from what a call with no
   settings does - and they are exactly the constants the app used before
   settings existed.
   ========================================================================== */
import { DEFAULT_LEVEL_CURVE, DEFAULT_XP_RULES } from '../xp-leveling/leveling';
import { DEFAULT_RANKS } from '../xp-leveling/insights';
import type { Settings } from './types';

export const DEFAULT_SETTINGS: Settings = {
  xp: {
    ...DEFAULT_XP_RULES,
    // server/index.js clamped a solve's tries to 1..50 and hints to 0..10.
    maxAttemptsCounted: 50,
    maxHintsCounted: 10
  },
  levels: {
    thresholds: [...DEFAULT_LEVEL_CURVE.thresholds],
    overflowStep: DEFAULT_LEVEL_CURVE.overflowStep,
    ranks: DEFAULT_RANKS.map((rank) => ({ ...rank }))
  },
  streak: {
    // null = the server's own zone, which is how every day was counted before.
    defaultTimeZone: null,
    timeZoneChangeCooldownHours: 20,
    // server/index.js's MAX_PLAUSIBLE_STREAK.
    maxPlausibleMergedStreak: 400
  },
  retention: {
    activityDaysKept: 400,
    missLogPerUser: 300,
    missesPerDay: 300,
    missesPerItemPerDay: 20,
    answerMaxChars: 200,
    mostMissedMinLearners: 3
  }
};
