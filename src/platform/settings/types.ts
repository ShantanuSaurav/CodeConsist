/* ==========================================================================
   The shape of every rule, number and piece of copy an administrator can
   change without a redeploy.

   One interface per section. A key is added in the phase that first reads
   it - there are no placeholder keys - and every key has admin metadata in
   meta.ts (a unit test fails otherwise), so it is editable the day it lands.
   ========================================================================== */
import type { ChallengeType, DailyGoalOption, LearningMode } from '@/types';
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
  /**
   * Last week's league result, shown once the week has closed (Phase 6).
   * `single` when tiers are off; with tiers, the one for what happened.
   */
  leagueResult: {
    enabled: boolean;
    /** `{rank}`, `{xp}` */
    single: string;
    /** `{rank}`, `{xp}`, `{tier}` */
    promoted: string;
    /** `{rank}`, `{xp}`, `{tier}` */
    demoted: string;
    /** `{rank}`, `{xp}`, `{tier}` */
    stayed: string;
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

/** The answer-graded question kinds: the ones with an attempt budget before the answer is shown. */
export type AnswerChallengeType = 'quiz' | 'output_prediction' | 'multi_select' | 'fill_blank' | 'pseudocode_order';

/** Where a wrong-answer note may show: Learn mode, Practice mode, and Practice sessions (review). */
export type FeedbackNoteContext = 'learn' | 'practice' | 'review';

/**
 * Answer feedback & retries: how many wrong answers a question allows before
 * the answer is shown, which wrong-answer notes appear, when a coding
 * lesson's solution is offered, and how a missed question comes back at the
 * end of the unit.
 */
export interface FeedbackSettings {
  attemptsBeforeReveal: {
    /** Practice mode, per kind (a single-choice question never allows more than its options minus one). */
    practice: Record<AnswerChallengeType, number>;
    /** Learn mode: explain straight away. */
    learn: number;
  };
  /** Show an option's or a blank's "why this is wrong" note, by where the question is answered. */
  showWrongAnswerNotes: Record<FeedbackNoteContext, boolean>;
  /** Notes on answer-graded stage tests too (the answer itself is never shown on a test). */
  stageTestWrongAnswerNotes: boolean;
  /** Failed runs before "Show me the solution" is offered on a coding lesson. 0 = never. Never on a test. */
  solutionAfterFailedRuns: number;
  /** Learn mode opens the "Read about this topic" panel by default. */
  learnOpensReading: boolean;
  requeue: {
    /** A question whose answer was shown comes back at the end of the unit. */
    enabled: boolean;
    /** How many times one question may come back in a run. */
    maxRounds: number;
    /** The highest score (and so XP) a question solved after its answer was shown can get, by mode. */
    maxScoreAfterReveal: { learn: number; practice: number };
  };
}

/**
 * Practice sessions (review): the spaced-repetition schedule, what a session
 * is built from, how many tries a question gets there, and the small XP it
 * pays under a daily cap. The UI calls it "Practice"; the code says review.
 */
export interface ReviewSettings {
  /** Off hides every Practice entry point and refuses new sessions. */
  enabled: boolean;
  /** Days until a question is due again, by box (box 0 is the first). */
  intervalsDays: number[];
  /** The box a missed question drops back to. */
  wrongResetsToBox: number;
  /** The box a lesson starts in when it was never reviewed: solved first try (`clean`) or with help (`assisted`). */
  initialBox: { clean: number; assisted: number };
  sessionSize: { min: number; max: number };
  /** The most questions each bucket may take in a session; weak solves fill the rest. */
  mix: { mistakes: number; due: number };
  /** A never-reviewed solve counts as weak with a score below this, or this many hints. */
  weak: { scoreBelow: number; hintsAtLeast: number };
  /** Mistakes older than this many days no longer count as open mistakes. */
  mistakeWindowDays: number;
  /** The question kinds a session may use. */
  itemTypes: string[];
  /** Wrong answers a question allows in a session before its answer is shown. */
  attemptsBeforeReveal: number;
  /** A missed question comes back once at the end of the session. */
  requeueMissed: boolean;
  xp: { correctFirstTry: number; correctAfterMiss: number; sessionBonus: number; dailyCap: number };
  /** A session left open longer than this is gone. */
  sessionTtlHours: number;
  /** A guest's (or an offline) session answer this many days old still pays when it is merged. */
  guestMergeWindowDays: number;
}

/** The steps of the first-run setup, in the order they can be shown. */
export type OnboardingStepId = 'motivation' | 'track' | 'experience' | 'goal' | 'mode';

/** One step of the first-run setup. */
export interface OnboardingStep {
  id: OnboardingStepId;
  enabled: boolean;
  /** The learner may go on without answering. */
  skippable: boolean;
  title: string;
  subtitle: string;
}

/** A "why are you learning?" answer. `icon` is a name from `ONBOARDING_ICONS` (meta.ts). */
export interface MotivationOption {
  id: string;
  label: string;
  description: string;
  icon: string;
}

/** How much a learner says they already know. The ids are fixed. */
export type ExperienceLevel = 'new' | 'some' | 'experienced';

/** What an experience answer leads to: straight in, a placement offered, or a placement. */
export type ExperienceAction = 'start' | 'offer-placement' | 'placement';

export interface ExperienceOption {
  label: string;
  description: string;
  action: ExperienceAction;
  /**
   * The learning mode preselected on the mode step, or 'none'. A word rather
   * than null: in a settings patch null means "back to the default".
   */
  recommendMode: LearningMode | 'none';
}

/** The copy of one learning mode card (moved out of LearningModeChooser.tsx). */
export interface LearningModeCopy {
  title: string;
  flow: string;
  blurb: string;
}

/**
 * The first-run setup: whether it shows, its steps and their answers. The
 * goal step's options are the daily goal's (`goals.options`).
 */
export interface OnboardingSettings {
  enabled: boolean;
  /** "Enter" on the landing page goes to the setup for a learner who has not done it. */
  showAfterEnter: boolean;
  /** The dashboard shows a "Finish setting up" card until it is done or dismissed. */
  dashboardReminder: boolean;
  intro: { title: string; body: string };
  finish: { title: string; body: string; ctaLabel: string; placementCtaLabel: string };
  steps: OnboardingStep[];
  motivation: { options: MotivationOption[] };
  /** Optional per-track text on the track step, by track id. */
  track: { blurbs: Record<string, string> };
  experience: {
    options: Record<ExperienceLevel, ExperienceOption>;
    placementPrompt: { title: string; body: string; startLabel: string; skipLabel: string };
  };
  mode: { options: Record<LearningMode, LearningModeCopy> };
}

/** Placement: a few stage tests in a row, from the first stage a learner has not cleared. */
export interface PlacementSettings {
  enabled: boolean;
  /** The Learn page offers "Find your level" while a placement is possible. */
  offerOnLearnPage: boolean;
  /** The most stage tests one placement holds. */
  maxStages: number;
  /** The first test not passed ends the placement. */
  stopOnFirstFail: boolean;
  /** Raw score (100 minus 10 a run after the first, 10 a hint) a test needs; a multiple of 10. */
  passMark: number;
  hintsAllowed: boolean;
  /** Share of a stage test's XP a pass pays. */
  xpPercent: number;
  /** Days before a finished placement can be taken again. */
  retakeAfterDays: number;
  /** Which stages a placement may use, by track (a track with none listed uses every stage with a test). */
  stagesByTrack: Record<string, string[]>;
  copy: {
    introTitle: string;
    /** `{passMark}`, `{maxRuns}` */
    introBody: string;
    /** `{stage}` */
    passTitle: string;
    /** `{stage}` */
    passBody: string;
    /** `{stage}` */
    failTitle: string;
    /** `{stage}`, `{when}` */
    failBody: string;
    learnPageLink: string;
  };
}

/** Test-out: pass one stage's test to skip its lessons. */
export interface TestOutSettings {
  enabled: boolean;
  /** Also offered on a stage that is already open (its lessons not finished). */
  allowOnOpenStage: boolean;
  /** Any locked stage may be tested out of; off: only the first locked one. */
  allowSkipAhead: boolean;
  /** A passed test-out (or placement test) clears the stage, so the next one opens. */
  countsAsCleared: boolean;
  /** A tested-out stage counts towards a track certificate. */
  countsTowardCertificate: boolean;
  passMark: number;
  hintsAllowed: boolean;
  /** Test-outs of one stage allowed within `attemptWindowHours`. */
  maxAttempts: number;
  attemptWindowHours: number;
  /** Wait after a failed test-out before the next one. */
  cooldownMinutes: number;
  /** How long a test-out (or each test of a placement) stays open. */
  sessionMinutes: number;
  xpPercent: number;
  /** Stages that cannot be tested out of. */
  disabledStages: string[];
  copy: {
    buttonLabel: string;
    /** `{stage}` */
    confirmTitle: string;
    /** `{stage}`, `{passMark}`, `{maxRuns}` */
    confirmBody: string;
    /** `{passMark}`, `{maxRuns}` */
    rulesLine: string;
    /** `{stage}` */
    passTitle: string;
    /** `{stage}` */
    passBody: string;
    /** `{stage}` */
    failTitle: string;
    /** `{stage}`, `{when}` */
    failBody: string;
    /** `{when}` */
    cooldownLabel: string;
  };
}

/** One league tier (Bronze, Silver, ...), lowest first. */
export interface LeagueTier {
  /** Stored on learners' league records - a slug. */
  id: string;
  name: string;
}

/**
 * The weekly league (Phase 6): a race for the XP earned in one week, on each
 * learner's own calendar. Tiers (groups that promote and demote) are off
 * until there are enough weekly learners to fill groups.
 */
export interface LeagueSettings {
  enabled: boolean;
  /** 1 = weeks run Monday to Sunday, 0 = Sunday to Saturday. */
  weekStartsOn: number;
  /** A week's results become final this long after UTC midnight after its last day. */
  finalizeDelayHours: number;
  /** Rows shown on the weekly board and the all-time board. */
  boardSize: number;
  /** XP brought in by a guest or offline merge counts for the week. */
  countMergedXp: boolean;
  /** XP from a solve the server could not check itself counts for the week. */
  countUnverifiedSolves: boolean;
  /** Practice-session XP counts for the week. */
  countReviewXp: boolean;
  tiers: {
    enabled: boolean;
    /** Lowest first. */
    list: LeagueTier[];
    groupSize: number;
    promoteCount: number;
    demoteCount: number;
    /** The least weekly XP a learner needs to move up. */
    minXpToPromote: number;
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
  /** Closed league weeks kept (results and standings); older ones are deleted. */
  leagueWeeksKept: number;
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
    /** `{stages}` - instead of `pathLine` while placement or test-out is on. */
    pathLineWithSkip: string;
    /** Instead of `buildStep` while placement or test-out is on. */
    buildStepWithSkip: string;
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
/** The stage-order gates: off = no check, log = count what would be refused and let it through, enforce = refuse it. */
export type ProgressionGateMode = 'off' | 'log' | 'enforce';

/** Limits & access. Admin only - never sent to learners. */
export interface AccessSettings {
  rateLimit: { mode: RateLimitMode } & Record<RateLimitBucketKey, RateRule>;
  /** The code runner: how many runs at once, how many may wait, and for how long. */
  execution: {
    maxConcurrent: number;
    maxQueued: number;
    queueWaitMs: number;
  };
  largeExecution: {
    maxConcurrent: number;
    maxQueued: number;
    queueWaitMs: number;
    reserveMb: number;
    jobMb: number;
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
  /** A solve in a stage the learner has not opened (or a test before its lessons). */
  solveGate: ProgressionGateMode;
  /** Merged guest solves in stages the account has not opened. */
  mergeGate: ProgressionGateMode;
  /** Test-outs and guest claims need a server-side check of the answer (no "taken on trust"). */
  requireServerVerification: boolean;
  /** A guest's passed test-outs and placement tests are checked and kept at sign-in. */
  acceptGuestClaims: boolean;
}

export interface Settings {
  coding: CodingSettings;
  xp: XpSettings;
  levels: LevelSettings;
  streak: StreakSettings;
  goals: GoalSettings;
  reminders: ReminderSettings;
  units: UnitSettings;
  celebrations: CelebrationSettings;
  badges: BadgeSettings;
  feedback: FeedbackSettings;
  review: ReviewSettings;
  onboarding: OnboardingSettings;
  placement: PlacementSettings;
  testOut: TestOutSettings;
  league: LeagueSettings;
  copy: CopySettings;
  retention: RetentionSettings;
  access: AccessSettings;
}

export interface CodingSettings {
  enabled: boolean;
  languages: Record<'javascript' | 'typescript' | 'python' | 'java' | 'c' | 'cpp' | 'go' | 'sql' | 'html' | 'css', boolean>;
  workflows: Record<'playground' | 'challenges' | 'examples' | 'webPreview' | 'aiAuthoring', boolean>;
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
