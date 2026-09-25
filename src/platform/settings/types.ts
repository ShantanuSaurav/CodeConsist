/* ==========================================================================
   The shape of every rule, number and piece of copy an administrator can
   change without a redeploy.

   One interface per section. A key is added in the phase that first reads
   it - there are no placeholder keys - and every key has admin metadata in
   meta.ts (a unit test fails otherwise), so it is editable the day it lands.
   ========================================================================== */
import type { LevelCurve, XpRules } from '../xp-leveling/leveling';
import type { RankRow } from '../xp-leveling/insights';

/** XP & scoring. A superset of `XpRules`, so `settings.xp` goes straight into the scoring functions. */
export interface XpSettings extends XpRules {
  /** Tries beyond this are not counted against the score (the request is clamped). */
  maxAttemptsCounted: number;
  /** Hints beyond this are not counted against the score. */
  maxHintsCounted: number;
}

/** Levels & ranks. A superset of `LevelCurve`, so `settings.levels` goes straight into the level functions. */
export interface LevelSettings extends LevelCurve {
  ranks: RankRow[];
}

/** Streaks, time zones and the guest merge. */
export interface StreakSettings {
  /** The zone a learner's days are counted in until their browser reports one. null = the server's own zone. */
  defaultTimeZone: string | null;
  /** How long a learner's stored zone is kept before a different reported zone may replace it. */
  timeZoneChangeCooldownHours: number;
  /** A guest streak longer than this is not believed when it is merged into an account. */
  maxPlausibleMergedStreak: number;
}

/** Data limits. Admin only - never sent to learners. */
export interface RetentionSettings {
  activityDaysKept: number;
  missLogPerUser: number;
  missesPerDay: number;
  missesPerItemPerDay: number;
  answerMaxChars: number;
  mostMissedMinLearners: number;
}

export interface Settings {
  xp: XpSettings;
  levels: LevelSettings;
  streak: StreakSettings;
  retention: RetentionSettings;
}

export type SettingsSectionId = keyof Settings;

/** What learners (and guests) receive from `GET /api/settings`. */
export type PublicSettings = Omit<Settings, 'retention' | 'access'>;

/** A sparse, nested set of overrides, e.g. `{ xp: { passScore: 70 } }`. */
export type SettingsOverrides = Record<string, unknown>;

/** One problem with a settings value, tied to its dot path (`levels.ranks.2.title`). */
export interface SettingsIssue {
  path: string;
  message: string;
}
