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

/**
 * Site copy: the sentences a visitor reads when something is unavailable,
 * the landing page's claims and the page-level messages. Plain text with the
 * `{tokens}` meta.ts allows per key; the defaults are what the app said
 * before copy was editable.
 */
export interface CopySettings {
  offline: {
    auth: string;
    leaderboard: string;
    banner: string;
    generic: string;
    checkout: string;
    verify: string;
    playgroundJs: string;
    /** `{language}` */
    playgroundCompiled: string;
  };
  runtime: {
    /** `{language}` */
    unavailable: string;
  };
  sync: {
    online: string;
    offline: string;
    guest: string;
  };
  playground: {
    description: string;
  };
  landing: {
    /** `{freeStages}`, `{premiumStages}` */
    heroFootnote: string;
    footerBlurb: string;
    howLessons: string;
    finalCta: string;
    /** `{stages}` */
    pathLine: string;
    buildStep: string;
  };
  meta: {
    /** `{lessons}`, `{tests}`, `{stages}`, `{tracks}` */
    description: string;
  };
  limits: {
    /** `{minutes}` */
    tooMany: string;
    busy: string;
  };
  premium: {
    lockedSolve: string;
  };
  notFound: {
    title: string;
    body: string;
  };
  error: {
    title: string;
    body: string;
  };
}

/** One rate limit: at most `limit` requests per `windowSeconds`, per key. */
export interface RateRule {
  limit: number;
  windowSeconds: number;
}

/** The rate-limit buckets, as settings keys (`access.rateLimit.<bucket>`). */
export type RateLimitBucketKey =
  | 'loginIp'
  | 'loginAccount'
  | 'registerIp'
  | 'registerGlobal'
  | 'executeAccount'
  | 'executeIp'
  | 'solveAccount'
  | 'writeAccount'
  | 'passwordChangeAccount'
  | 'passwordResetIp';

/** off = no checks, log = count and log only, enforce = answer 429. */
export type RateLimitMode = 'off' | 'log' | 'enforce';
/** open = every origin, report = record foreign writes and let them through, enforce = refuse them. */
export type CorsMode = 'open' | 'report' | 'enforce';
/** log = record what would be blocked, enforce = block it. */
export type GateMode = 'log' | 'enforce';

/** Limits & access. Admin only - never sent to learners. */
export interface AccessSettings {
  rateLimit: { mode: RateLimitMode } & Record<RateLimitBucketKey, RateRule>;
  /** The code runner: how many runs at once, how many may wait, and for how long. */
  execution: {
    maxConcurrent: number;
    maxQueued: number;
    queueWaitMs: number;
  };
  network: {
    /** How many proxies in front of the server to trust for the client's address. */
    trustProxyHops: number;
  };
  cors: {
    mode: CorsMode;
    /** Exact origins (`https://example.com`) allowed besides APP_ORIGIN, CORS_ORIGINS and localhost. */
    extraOrigins: string[];
  };
  /** Server-side premium lock: block, or only log what would have been blocked. */
  premiumGate: GateMode;
  /** How long an admin-issued password reset link stays valid. */
  passwordResetTtlMinutes: number;
}

export interface Settings {
  xp: XpSettings;
  levels: LevelSettings;
  streak: StreakSettings;
  copy: CopySettings;
  retention: RetentionSettings;
  access: AccessSettings;
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
