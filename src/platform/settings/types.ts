/* ==========================================================================
   The shape of every rule, number and piece of copy an administrator can
   change without a redeploy.

   One interface per section. A key is added in the phase that first reads
   it - there are no placeholder keys - and every key has admin metadata in
   meta.ts (a unit test fails otherwise), so it is editable the day it lands.
   ========================================================================== */
import type { ChallengeType, DailyGoalOption } from '@/types';
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

/**
 * What makes a day a streak day: any passing solve, a solve that paid XP
 * (a re-solve pays none), or meeting the daily goal.
 */
export type DayRule = 'any-solve' | 'xp-earned' | 'goal-met';

/** Streaks, freezes and repair, time zones and the guest merge. */
export interface StreakSettings {
  /** The zone a learner's days are counted in until their browser reports one. null = the server's own zone. */
  defaultTimeZone: string | null;
  /** How long a learner's stored zone is kept before a different reported zone may replace it. */
  timeZoneChangeCooldownHours: number;
  /** A guest streak longer than this is not believed when it is merged into an account. */
  maxPlausibleMergedStreak: number;
  dayRule: DayRule;
  /** A freeze covers one missed day; one is earned every N days the goal is met. */
  freeze: {
    enabled: boolean;
    earnEveryGoalDays: number;
    maxHeld: number;
    /** Freezes a learner starts with (at most `maxHeld`). */
    startingCount: number;
  };
  /** After a break, the streak can be won back by doing extra lessons within a few days. */
  repair: {
    enabled: boolean;
    windowDays: number;
    lessonsPerMissedDay: number;
  };
  /** Streak lengths that are celebrated. */
  milestones: number[];
  /** Past runs kept in each learner's streak history. */
  runsKept: number;
  /** How many recent days of a signed-in learner's offline activity a merge replays for their streak and goal. */
  mergeReplayDays: number;
}

/** The daily goal a learner picks, and what meeting it pays. */
export interface GoalSettings {
  /** Off hides the goal ring, the picker and the goal card (and pays no goal bonus). */
  enabled: boolean;
  options: DailyGoalOption[];
  /** For guests and learners who have not chosen; must be an enabled option. */
  defaultOptionId: string;
  /** Show the "goal met - one more?" card in a lesson. */
  oneMorePrompt: boolean;
}

/** One "welcome back" message, for learners away at least `minDays`. */
export interface WelcomeBackTier {
  minDays: number;
  /** `{name}`, `{days}`, `{bestStreak}` */
  title: string;
  /** `{name}`, `{days}`, `{bestStreak}` */
  body: string;
}

/** In-app reminders: the banners and toasts about streaks and goals. Plain text with `{tokens}`. */
export interface ReminderSettings {
  atRisk: {
    enabled: boolean;
    /** Not shown before this local hour (0-23). */
    fromLocalHour: number;
    /** `{streak}` */
    title: string;
    /** `{streak}`, `{hoursLeft}` */
    body: string;
    /** `{freezes}` - instead of `body` when a freeze would cover today. */
    bodyWithFreeze: string;
    cta: string;
  };
  goalMet: {
    /** `{goal}`, `{bonusXp}` */
    toast: string;
    cardTitle: string;
    /** `{streak}`, `{bonusXp}` */
    cardBody: string;
    moreLabel: string;
    doneLabel: string;
  };
  /** `{freezes}`, `{maxFreezes}` */
  freezeEarned: string;
  /** `{streak}`, `{days}` */
  freezeUsed: string;
  streakBroken: {
    /** `{lostStreak}` */
    title: string;
    /** `{remaining}`, `{deadline}` */
    body: string;
    cta: string;
  };
  /** `{streak}` */
  streakRepaired: string;
  welcomeBack: {
    enabled: boolean;
    cta: string;
    tiers: WelcomeBackTier[];
  };
}

/**
 * Units: how a stage's lessons are grouped into short runs by default, how
 * long each kind of question is expected to take, and the perfect-unit bonus.
 * An admin's own grouping for a stage lives in `contentOverrides.units`.
 */
export interface UnitSettings {
  /** The size a default unit aims for. */
  targetSize: number;
  /** A default unit smaller than this joins the one before it (when that stays within `maxSize`). */
  minSize: number;
  /** No default unit is larger than this. */
  maxSize: number;
  /** The time a unit should take; the admin editor warns past it. */
  targetMinutes: number;
  /** Expected minutes per question, by kind - the "~6 min" on the path. */
  minutesByType: Record<ChallengeType, number>;
  /** Paid once, when a first solve completes a unit cleared first try throughout. */
  perfectBonusXp: number;
  /** "Perfect" also means no hint was shown anywhere in the unit. */
  perfectRequiresNoHints: boolean;
}

/** The sounds the app can play. Each can be switched off on its own. */
export type SfxEvent = 'correct' | 'wrong' | 'unitComplete' | 'levelUp' | 'badge';

/** Celebrations & sound: what happens on screen (and in the ears) after a solve, a unit and a level. */
export interface CelebrationSettings {
  sound: {
    /** Sound for a learner who has not chosen. */
    defaultOn: boolean;
    /** 0-1. */
    volume: number;
    events: Record<SfxEvent, boolean>;
  };
  confetti: {
    onCorrect: boolean;
    onCorrectParticles: number;
    /** Also after a re-solve that paid nothing. */
    onReSolve: boolean;
    onUnitEnd: boolean;
    unitEndParticles: number;
  };
  /** The full-screen "Level N" after a unit or stage test that crossed a level. */
  levelUpOverlay: boolean;
  /** How long the XP count-up runs. 0 shows the number at once. */
  countUpMs: number;
  copy: {
    unitComplete: string;
    /** `{xp}` */
    perfect: string;
    flawless: string;
    /** `{level}` */
    levelUp: string;
    /** `{title}` */
    newRank: string;
    /** `{n}` */
    streakUp: string;
  };
}

/** What a badge family counts. The list is fixed in code; an admin picks from it. */
export type BadgeMetric = 'bestStreak' | 'solvedCount' | 'unitsCompleted' | 'perfectUnits' | 'xp' | 'testsPassed';

/** One family of tiered badges: `${id}-${n}` for every `n` in `tiers`. */
export interface BadgeFamily {
  id: string;
  metric: BadgeMetric;
  enabled: boolean;
  /** `{n}` */
  title: string;
  /** `{n}` */
  detail: string;
  /** Strictly ascending thresholds; tier i is named `tierNames[i]`. */
  tiers: number[];
}

export interface BadgeSettings {
  tierNames: string[];
  families: BadgeFamily[];
  stageBadges: {
    enabled: boolean;
    /** `{index}` - a core stage, by number. */
    coreTitle: string;
    /** `{name}` - a track stage (C, C++), by name. */
    trackTitle: string;
  };
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
  goals: GoalSettings;
  reminders: ReminderSettings;
  units: UnitSettings;
  celebrations: CelebrationSettings;
  badges: BadgeSettings;
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
