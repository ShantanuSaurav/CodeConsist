import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState
} from 'react';
import {
  ActivityContext,
  ActivityLog,
  Challenge,
  CodeDraft,
  DailyGoalOption,
  DayRecord,
  ExecutionResult,
  LanguageTrack,
  LearningMode,
  LeaderboardEntry,
  MissEntry,
  Stage,
  SupportedLanguage,
  TestCase,
  UserProfile,
  UserStats
} from '@/types';
import { useToast } from '@/ui';
import { eventBus } from '../events';
import { applyProgressByTrack, stagesForTrack } from '../progress/stages';
import { unitFor } from '../progress/units';
import { loadFromApi, readUnitDefCache, withUnits } from './content';
import type { ContentBundle } from './content';
import { compilerService, ExecuteOptions } from '../execution/compilerService';
import { api, ApiError, OfflineError, getToken, setToken } from '../api-client/api';
import type { OAuthProviders, PreferencesPatch, RuntimeInfo } from '../api-client/api';
import { STORAGE_KEYS, readJson, readString, writeJson, writeString, remove } from '../storage/storage';
import { levelFromXp, scoreSolve, xpForSolve } from '../xp-leveling/leveling';
import { browserTimeZone, msUntilLocalMidnight } from '../time/days';
import { isGoalOptionAvailable, learnerSolve, resetHabit, streakFieldsOf } from '../habits';
import type { HabitStatus, StreakStripCell } from '../habits';
import { MERGE_BODY_MAX_BYTES, dayRow, jsonByteLength, trimActivityForMerge, unsyncedMisses } from '../activity/log';
import type { ActivityView } from '../activity/log';
import { isCodeChallengeType, normalizeMissAnswer, rawAnswerFromMiss, wrongAnswerKeys } from '../grading-engine/misses';
import { gradeAnswer } from '../grading-engine/grading';
import { DEFAULT_SETTINGS } from '../settings/defaults';
import { getCopy } from '../settings/store';
import type { PublicSettings, SfxEvent } from '../settings/types';
import { applyUnitRewards } from '../xp-leveling/rewards';
import { playSfx } from '../sound/sfx';
import { INITIAL_STATS, adoptAccountProgress, hydrateStats, sessionToday, solveWasDeferred, statsAfterSolve } from './stats';
import { useSettingsState } from './useSettingsState';
import { useActivityLog } from './useActivityLog';
import { useHabitState } from './useHabitState';
import type { SolveHabitEvents } from './useHabitState';
import { readLocalPreferences, reconcilePreferences, resolveDailyGoalId, resolveSoundOn, settledLocal, writeLocalPreferences } from './preferences';
import type { LocalPreferences } from './preferences';
import { createCelebrationHold } from './celebrationHold';

/**
 * How long a typed answer may be when it is kept as a miss. The real cap is
 * the admin-only `retention.answerMaxChars`; the server applies it again, so
 * this is only the browser's own bound on what it stores.
 */
const MISS_ANSWER_CHARS = DEFAULT_SETTINGS.retention.answerMaxChars;

export type ServerStatus = 'checking' | 'online' | 'offline';

/**
 * What the editor's little save line is showing for one challenge.
 *   'saving' - a write is queued or in flight
 *   'saved'  - the last write landed
 *   'local'  - the server refused or was unreachable; the code is only here
 */
export type DraftStatus = 'idle' | 'saving' | 'saved' | 'local';

export interface SolveOptions {
  attempts?: number;
  hintsUsed?: number;
  /** The answer as submitted, so the server can verify it before paying XP. */
  answer?: unknown;
  /** The code as submitted, for coding challenges. */
  code?: string;
  /** Where it was answered: a lesson (default), a stage test, the library. */
  context?: ActivityContext;
  /**
   * Inside a unit run (or a stage test): no XP or level-up toast - the end
   * screen celebrates the whole run at once (and the practice modal toasts a
   * level crossed in a run closed before its end screen). Confetti per
   * answer still follows `celebrations.confetti`.
   */
  deferCelebrations?: boolean;
}

/**
 * What a solve paid, as best known: the server's figures when it answered,
 * else the optimistic ones this browser worked out with the same rules.
 */
export interface SolveOutcome {
  /** The solve's own XP (0 on a re-solve). */
  solveXp: number;
  /** A perfect-unit bonus paid on top (0 when none). */
  perfectBonusXp: number;
  /**
   * The daily-goal bonus this solve paid, the first time today's goal was met
   * (0 when none). A signed-in learner's is the server's; a guest's is their own.
   */
  goalBonusXp: number;
  /** This solve met today's daily goal for the first time (the server's word when it answered). */
  goalMet?: boolean;
  /** Everything this solve paid: its XP and both bonuses. */
  totalXp: number;
  /** The unit this solve completed for the first time, or null. */
  unitCompleted: string | null;
  /** That unit was cleared perfectly. */
  perfect: boolean;
  /** The server checked and recorded it (false for a guest, offline, or a solve kept for later). */
  verifiedByServer: boolean;
  /** The server refused it (a wrong submission, a premium lesson) and it was rolled back: nothing was paid. */
  rejected?: boolean;
}

/** Confetti, for the end screens and a correct answer. */
export interface CelebrateOptions {
  /** How many particles; `celebrations.confetti.onCorrectParticles` when omitted. 0 is none. */
  particles?: number;
}

const NO_OUTCOME: SolveOutcome = { solveXp: 0, perfectBonusXp: 0, goalBonusXp: 0, totalXp: 0, unitCompleted: null, perfect: false, verifiedByServer: false };

/** What changing the time zone to this device's did. */
export type TimeZoneResult = 'applied' | 'cooldown' | 'unavailable';

/** A wrong answer as the practice modal saw it: the answer given, or a failed run's pass counts. */
export interface MissSubmission {
  answer?: unknown;
  code?: { passed: number; total: number };
}

/** One language track, with progress computed against the player's own stats. */
export interface LanguageTrackProgress {
  track: LanguageTrack;
  /** This track's stages only, in track order, each with its per-track lock/progress state. */
  stages: Stage[];
  cleared: number;
  total: number;
  totalChallenges: number;
  solvedChallenges: number;
}

export interface SessionContextType {
  /* content - the WHOLE bank, every track, unfiltered. Used by the library,
     the achievements and platform-wide totals. Stage states are computed per
     track, so a C stage is never locked behind Stage 10. */
  /**
   * False until the content bank has arrived. The bank is a separate chunk
   * that loads after the shell paints, so `stages` and `allChallenges` are
   * empty for a moment; screens that need them wait on this (the dashboard
   * layout does it once for every page), the rest degrade to zeros.
   */
  contentReady: boolean;
  stages: Stage[];
  allChallenges: Challenge[];
  challengeById: (id: string) => Challenge | undefined;

  /* content - scoped to the learner's currently selected track. This is
     "your path": the Learn page, the skill tree, "Continue learning" and the
     practice session's auto-target-picking read these. */
  tracks: LanguageTrackProgress[];
  activeTrack: LanguageTrackProgress;
  selectedTrackId: string;
  setSelectedTrack: (trackId: string) => void;
  learnerStages: Stage[];
  learnerChallenges: Challenge[];

  /* preferences */
  /**
   * How the learner reaches a stage's challenges: 'learn' (theory, examples,
   * a try-it and a quick check before each new idea) or 'practice' (straight
   * to the questions). `null` until chosen - the practice modal asks on the
   * first stage opened. Remembered in this browser; changeable any time.
   * Never affects grading, XP or unlocking.
   */
  learningMode: LearningMode | null;
  setLearningMode: (mode: LearningMode) => void;

  /* rules */
  /**
   * The learning rules - XP, levels and ranks, streak - as the server last
   * served them (or the defaults). An admin's change arrives within one
   * health probe. Use `useLeveling()` for levels and rank titles.
   */
  settings: PublicSettings;
  /** The revision `settings` came from; null for the built-in defaults. */
  settingsRevision: number | null;

  /* player */
  stats: UserStats;
  /**
   * Days and wrong answers: a guest's own log, or a signed-in learner's
   * mirror of the account's (the server's rows win when they arrive).
   */
  activity: ActivityLog;
  /** The learner's current day (`yyyy-mm-dd` in their time zone). Rolls over at their midnight. */
  todayKey: string;
  /** Today's row of the activity log: XP actually awarded today, lessons, re-solves, mistakes. */
  today: DayRecord & { day: string };
  /** The zone the learner's days are counted in: the account's, else this device's (null when unknown). */
  timeZone: string | null;

  /* streak and daily goal */
  /**
   * The streak and today's goal as they stand now - freezes applied, a break
   * worked out, the repair on offer, at risk or not. Derived by the habits
   * engine (the server runs the same); `stats.streak` is the RAW stored value
   * and is never what a screen shows.
   */
  habits: HabitStatus;
  /** The goal options a learner can pick now. */
  goalOptions: DailyGoalOption[];
  /** The goal that applies today (the learner's choice, else the default), or null when daily goals are off. */
  dailyGoal: DailyGoalOption | null;
  /** The learner's own choice (an option id), or null when they follow the default. */
  dailyGoalId: string | null;
  /** Choose a daily goal (null: back to the default). Kept here and, signed in, on the account. */
  setDailyGoal: (optionId: string | null) => void;
  /** Count days in this device's time zone from now on (signed in; the server may refuse a change made too recently). */
  adoptDeviceTimeZone: () => Promise<TimeZoneResult>;
  /** The last `count` days of the streak: active, frozen, repaired, missed or today. */
  streakStrip: (count: number) => StreakStripCell[];
  /** A reminder banner (its `key` from pickHabitBanner) dismissed for the day? */
  isHabitBannerDismissed: (key: string) => boolean;
  dismissHabitBanner: (key: string) => void;

  user: UserProfile | null;
  serverStatus: ServerStatus;
  /** Server-verified: is a remote compiler (Judge0) configured for languages beyond JavaScript/Python? Never the credentials. */
  judge0Configured: boolean;
  /**
   * Per-language engines as the server reports them, keyed by language, or `{}`
   * when it has not answered (or is too old to send them). The Playground reads
   * it to say which languages run and what runs them; `judge0Configured` above
   * stays for everything that only needs the yes/no. Never credentials - see
   * RuntimeInfo.
   */
  runtimes: Record<string, RuntimeInfo>;

  /* sound */
  /**
   * Sound effects on or off: the account's choice, else this browser's, else
   * `celebrations.sound.defaultOn`. Survives a reload and a sign-out.
   */
  soundOn: boolean;
  /** Remember the choice here and, signed in, on the account. */
  setSoundOn: (on: boolean) => void;
  /** Play one effect, if sound is on and the admin has not switched that event off. */
  playSound: (event: SfxEvent) => void;

  /* actions */
  /**
   * Record a solve. Resolves with what it paid - the solve's XP, a
   * perfect-unit bonus when it completed a unit - from the server when it
   * answered, else from the same rules run here.
   */
  completeChallenge: (challenge: Challenge, options?: SolveOptions) => Promise<SolveOutcome>;
  /**
   * Record a wrong answer. Fire and forget: a guest's stays in this browser;
   * a signed-in learner's goes to the server, or waits (marked unsynced) for
   * the next merge when the server cannot be reached. A correct answer, or one
   * that does not fit the challenge, is ignored. Never touches XP or attempts.
   */
  recordMiss: (challenge: Challenge, submission: MissSubmission, options?: { context?: ActivityContext; final?: boolean }) => void;
  /** Record that a Concept's teaching sequence has been shown, so it is not repeated. Local only; earns nothing. */
  markConceptSeen: (conceptId: string) => void;
  executeCode: (
    code: string,
    language?: SupportedLanguage,
    entryFunction?: string,
    testCases?: TestCase[],
    options?: Pick<ExecuteOptions, 'onProgress' | 'stdin'>
  ) => Promise<ExecutionResult>;

  /* saved coding sessions - see "drafts" below. Nobody has to start a
     challenge over: the code follows the account, not the tab. */
  /** Every challenge this learner has unfinished code in, keyed by challenge id. */
  drafts: Record<string, CodeDraft>;
  /** The saved code for one challenge, or null when there is none. */
  draftFor: (challengeId: string) => string | null;
  /** Queue a save. At most one write per challenge every 1500 ms (trailing). */
  saveDraft: (challengeId: string, code: string, language?: string) => void;
  /** Write a queued save now - the editor closing, the challenge changing, the page hiding. */
  flushDraft: (challengeId: string) => void;
  /** Forget a draft: the challenge was solved, or the learner asked to start from scratch. */
  clearDraft: (challengeId: string) => void;
  /** What the "Draft saved" line should say for one challenge. */
  draftStatus: (challengeId: string) => DraftStatus;

  /* account */
  loginWithEmail: (email: string, password: string) => Promise<void>;
  signupWithEmail: (email: string, username: string, password: string) => Promise<void>;
  continueAsGuest: () => void;
  logout: () => Promise<void>;
  /**
   * Which third-party sign-ins this server is configured for - booleans only,
   * asked once. `null` until the answer arrives; both false hides the buttons.
   */
  oauthProviders: OAuthProviders | null;
  /**
   * Adopt the token a provider sign-in handed back at /auth/callback: store
   * it, read the profile, reconcile progress and load the saved drafts.
   */
  adoptToken: (token: string) => Promise<void>;
  /**
   * Re-read the account from the server (after a purchase, say) and adopt
   * its entitlements. Nothing unlocks locally: the server's `publicUser` is
   * the only source of `isPremium` / `unlockedStages`.
   */
  refreshAccount: () => Promise<void>;
  /**
   * Fetch the bank again, as this viewer may see it: a premium stage they
   * have not unlocked comes back as `locked` stubs. Runs by itself after
   * every sign-in, sign-out and account refresh; call it when the content
   * and the entitlements disagree. A no-op while the server is unreachable.
   */
  reloadContent: () => Promise<void>;
  resetProgress: () => Promise<void>;

  leaderboard: LeaderboardEntry[];
  refreshLeaderboard: () => Promise<void>;

  /** Confetti (never with reduced motion). */
  celebrate: (options?: CelebrateOptions) => void;

  /**
   * "Celebrations deferred" (./celebrationHold): while a lesson run is on
   * screen its end screen announces what it earned, so other toasts (a badge
   * the moment it is earned) are held. The practice modal holds when a run
   * opens and releases when it closes - `announced: true` when the end
   * screen was reached (the held toasts are dropped), false when it was
   * closed before (they are shown then). Stable identities.
   */
  holdCelebrations: () => void;
  releaseCelebrations: (outcome: { announced: boolean }) => void;
  /** Show a celebration now, or hold it while a run is on screen. */
  celebrateOrHold: (show: () => void) => void;
}

const SessionContext = createContext<SessionContextType | undefined>(undefined);

/* INITIAL_STATS and hydrateStats live in ./stats: a non-component export from
   this file breaks React Fast Refresh, which turns every edit here into a
   full remount. */

/** At most one draft write per challenge in this window, on the trailing edge. */
const DRAFT_DEBOUNCE_MS = 1500;
/** How long a daily-goal choice waits before it goes up (the arrow keys pick each option in turn). */
const GOAL_SEND_DELAY_MS = 600;

/**
 * Own-property lookup only. A challenge id of `__proto__` or `constructor`
 * would otherwise walk into Object.prototype and hand back something that is
 * not a draft at all. (`Object.hasOwn` needs a newer lib target than this
 * project compiles against.)
 */
function ownKey(map: object, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(map, key);
}

function draftAt(map: Record<string, CodeDraft>, challengeId: string): CodeDraft | null {
  return ownKey(map, challengeId) ? map[challengeId] ?? null : null;
}

/** Keep only entries that actually look like drafts, whoever sent them. */
function sanitiseDrafts(raw: unknown): Record<string, CodeDraft> {
  const out: Record<string, CodeDraft> = {};
  if (!raw || typeof raw !== 'object') return out;
  for (const [id, value] of Object.entries(raw as Record<string, unknown>)) {
    // A computed key is an own property even for '__proto__'; the source is
    // still filtered so nothing odd survives a round trip through JSON.
    if (!id || id === '__proto__') continue;
    const draft = value as Partial<CodeDraft> | null;
    if (!draft || typeof draft.code !== 'string') continue;
    out[id] = {
      code: draft.code,
      language: typeof draft.language === 'string' ? draft.language : undefined,
      updatedAt: typeof draft.updatedAt === 'string' ? draft.updatedAt : new Date(0).toISOString()
    };
  }
  return out;
}

/** A learner with no account keeps their code in this browser, in the server's shape. */
function readGuestDrafts(): Record<string, CodeDraft> {
  return sanitiseDrafts(readJson<unknown>(STORAGE_KEYS.drafts, null));
}

/**
 * Where a SIGNED-IN learner's draft waits when the server would not take it.
 * Keyed by account, so it is still there after a refresh and the next person
 * to sign in on this browser can never be handed somebody else's code. The
 * next successful save, or the next sign-in, drains it.
 */
function accountDraftsKey(userId: string): string {
  return `${STORAGE_KEYS.drafts}:${userId}`;
}

function readAccountDrafts(userId: string | null): Record<string, CodeDraft> {
  if (!userId) return {};
  return sanitiseDrafts(readJson<unknown>(accountDraftsKey(userId), null));
}

/** The entitlements half of a server profile, in the shape `stats` keeps them. */
function entitlementsOf(profile: UserProfile): Pick<UserStats, 'isPremium' | 'unlockedStages'> {
  return { isPremium: Boolean(profile.isPremium), unlockedStages: profile.unlockedStages ?? [] };
}

/**
 * The one info toast after a merge that left some solves out: they were in
 * premium stages the account has not unlocked, so the server did not credit
 * them. Null when there were none.
 */
function skippedLockedMessage(skipped: string[] | undefined): string | null {
  const n = Array.isArray(skipped) ? skipped.length : 0;
  if (n === 0) return null;
  return `${n} ${n === 1 ? 'solve was' : 'solves were'} not added to your account: ${n === 1 ? 'it is' : 'they are'} in premium stages this account has not unlocked.`;
}

function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
}

interface SessionProviderProps {
  /**
   * The bundled content bank, or null while the app is still fetching its
   * chunk. The app supplies it; the platform owns no content.
   */
  content: ContentBundle | null;
  children: React.ReactNode;
}

const EMPTY: Challenge[] = [];
const NO_STAGES: Stage[] = [];
const NO_TRACKS: LanguageTrackProgress[] = [];
const EMPTY_TRACK: LanguageTrackProgress = {
  track: { id: 'core', label: 'Developer path', icon: '', tagline: '', description: '', primaryLanguage: 'javascript', stageIds: [] },
  stages: NO_STAGES,
  cleared: 0,
  total: 0,
  totalChallenges: 0,
  solvedChallenges: 0
};


/**
 * The player's session: identity, verified progress, the content bank, code
 * execution and the leaderboard. Everything that happens here is announced on
 * the event bus (challenge:completed, auth:signedIn, ...) so modules can react
 * without depending on each other.
 */
export const SessionProvider: React.FC<SessionProviderProps> = ({ content, children }) => {
  const { notify } = useToast();

  /* ---------------------------------------------------------------- rules */
  // The admin's learning rules, cached, refetched when the server reports a
  // new revision (see useSettingsState). Read through a ref in the long-lived
  // handshake closures below.
  const { settings, settingsRevision, noteRevision } = useSettingsState();
  const settingsRef = useRef(settings);
  useEffect(() => {
    settingsRef.current = settings;
  }, [settings]);

  /* --------------------------------------------------------------- player */
  const [user, setUser] = useState<UserProfile | null>(() =>
    readJson<UserProfile | null>(STORAGE_KEYS.user, null)
  );

  /* ------------------------------------------------------------- activity */
  // The learner's days: today's row feeds the daily goal, and the log's last
  // day is part of what "today" is.
  const activityLog = useActivityLog();
  const { activity, activityRef } = activityLog;

  // The learner's own zone: the account's once the server has one, else this browser's.
  const zone = user?.preferences?.timeZone ?? browserTimeZone();

  // The streak is kept RAW (./stats): the habits engine below derives what
  // screens show, so a missed day is still there for freezes and repair.
  const [stats, setStats] = useState<UserStats>(() => hydrateStats(readJson<Partial<UserStats> | null>(STORAGE_KEYS.stats, null), settings.levels));

  // A new level curve re-derives the level silently: the level-up toast only
  // ever fires from a solve, so an admin's curve change never announces one.
  const levelsRef = useRef(settings.levels);
  useEffect(() => {
    if (levelsRef.current === settings.levels) return;
    levelsRef.current = settings.levels;
    setStats((prev) => {
      const level = levelFromXp(prev.xp, settings.levels);
      return level === prev.level ? prev : { ...prev, level };
    });
  }, [settings.levels]);

  // The learner's day, counted exactly as the server counts it: local in
  // their zone, but never before their last active day or the log's last
  // day (see sessionToday) - so after a flight west the browser does not
  // judge the streak on a day the server has already left behind.
  // Re-evaluated at their local midnight.
  const [midnightTick, setMidnightTick] = useState(0);
  const todayKey = useMemo(
    () => sessionToday(zone, { lastActiveDay: stats.lastActiveDay }, { lastDay: activity.lastDay }),
    // midnightTick is only there to re-evaluate at local midnight.
    [zone, midnightTick, stats.lastActiveDay, activity.lastDay]
  );
  useEffect(() => {
    const timer = window.setTimeout(() => setMidnightTick((n) => n + 1), msUntilLocalMidnight(new Date(), zone) + 500);
    return () => window.clearTimeout(timer);
  }, [zone, midnightTick]);
  const today = useMemo(() => dayRow(activity, todayKey), [activity, todayKey]);
  const [serverStatus, setServerStatus] = useState<ServerStatus>('checking');
  const [judge0Configured, setJudge0Configured] = useState(false);
  const [runtimes, setRuntimes] = useState<Record<string, RuntimeInfo>>({});
  const [oauthProviders, setOauthProviders] = useState<OAuthProviders | null>(null);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);

  useEffect(() => {
    writeJson(STORAGE_KEYS.stats, stats);
  }, [stats]);

  // The session handshake runs once on mount and needs to read progress without
  // taking it as a dependency, so keep a live handle to it.
  const statsRef = useRef(stats);
  useEffect(() => {
    statsRef.current = stats;
  }, [stats]);

  useEffect(() => {
    if (user) writeJson(STORAGE_KEYS.user, user);
    else remove(STORAGE_KEYS.user);
  }, [user]);

  // Read inside the handshake effect without making it a dependency.
  const userRef = useRef(user);
  useEffect(() => {
    userRef.current = user;
  }, [user]);

  /* ---------------------------------------------------------------- sound */
  // This browser's own choice (a guest's, or the last one seen here); the
  // account's wins once there is one. See ./preferences.
  const [localPrefs, setLocalPrefsState] = useState<LocalPreferences>(readLocalPreferences);
  const setLocalPrefs = useCallback((next: LocalPreferences) => {
    setLocalPrefsState(next);
    writeLocalPreferences(next);
  }, []);
  const signedInUser = user && user.provider !== 'guest' ? user : null;
  const soundOn = resolveSoundOn(signedInUser?.preferences, localPrefs, settings.celebrations.sound.defaultOn);
  const soundRef = useRef({ soundOn, sound: settings.celebrations.sound });
  useEffect(() => {
    soundRef.current = { soundOn, sound: settings.celebrations.sound };
  }, [soundOn, settings.celebrations.sound]);

  const playSound = useCallback((event: SfxEvent) => {
    const { soundOn: on, sound } = soundRef.current;
    playSfx(event, { volume: sound.volume, enabled: on && sound.events[event] !== false });
  }, []);

  const setSoundOn = useCallback(
    (on: boolean) => {
      const account = userRef.current && userRef.current.provider !== 'guest' && getToken() ? userRef.current : null;
      // Remembered here either way, so it survives a reload and a sign-out;
      // pending until an account has it.
      setLocalPrefs({ ...readLocalPreferences(), soundOn: on, pendingSync: account ? account.id : 'guest' });
      if (!account) return;
      setUser((prev) => (prev ? { ...prev, preferences: { ...prev.preferences, soundOn: on } } : prev));
      api
        .updatePreferences({ soundOn: on })
        .then((res) => {
          if (res?.user) setUser((prev) => (prev && prev.id === res.user.id ? { ...prev, ...res.user } : prev));
          setLocalPrefs(settledLocal({ ...readLocalPreferences(), soundOn: on }, { soundOn: on }));
        })
        .catch(() => {
          /* offline, or an older server: it stays pending and goes up on the next sign-in */
        });
    },
    [setLocalPrefs]
  );

  /* ------------------------------------------------------------ daily goal */
  // The goal the learner chose: the account's, else this browser's (a
  // guest's, or one made offline and still on its way up). See ./preferences.
  const dailyGoalId = resolveDailyGoalId(signedInUser?.id ?? null, signedInUser?.preferences, localPrefs);

  // A goal choice goes up once the learner has settled on one: browsing the
  // options with the arrow keys picks each in turn, and only the last is sent.
  const goalSendTimer = useRef<number | null>(null);
  useEffect(
    () => () => {
      if (goalSendTimer.current !== null) window.clearTimeout(goalSendTimer.current);
    },
    []
  );
  const setDailyGoal = useCallback(
    (optionId: string | null) => {
      const account = userRef.current && userRef.current.provider !== 'guest' && getToken() ? userRef.current : null;
      // Remembered here either way (so it is in use at once); pending until
      // an account has it - a send that never happens goes up on the next
      // sign-in or restore.
      setLocalPrefs({ ...readLocalPreferences(), dailyGoalId: optionId, goalPendingSync: account ? account.id : 'guest' });
      if (goalSendTimer.current !== null) window.clearTimeout(goalSendTimer.current);
      goalSendTimer.current = null;
      if (!account) return;
      setUser((prev) => (prev ? { ...prev, preferences: { ...prev.preferences, dailyGoalId: optionId } } : prev));
      // No longer pending - unless another choice was made while this one was on its way.
      const landed = () => {
        const local = readLocalPreferences();
        if ((local.dailyGoalId ?? null) === optionId) setLocalPrefs(settledLocal(local, { dailyGoalId: optionId }));
      };
      goalSendTimer.current = window.setTimeout(() => {
        goalSendTimer.current = null;
        api
          .updatePreferences({ dailyGoalId: optionId })
          .then((res) => {
            if (res?.user) setUser((prev) => (prev && prev.id === res.user.id ? { ...prev, ...res.user } : prev));
            landed();
          })
          .catch((err) => {
            // Refused outright (the option was switched off meanwhile): nothing
            // to retry. Offline: it stays pending and goes up on the next sign-in.
            if (err instanceof ApiError && err.status === 400) {
              landed();
              void refreshAccountRef.current().catch(() => {});
            }
          });
      }, GOAL_SEND_DELAY_MS);
    },
    [setLocalPrefs]
  );

  /**
   * Bring this browser's choices and the account's together once the account
   * is known (sign-in, a restored session): a choice still pending goes up
   * (a guest's only where the account has none), otherwise the account's is
   * remembered here. This device's time zone goes up when it differs from
   * the account's (the server keeps the old one within its cooldown).
   */
  const reconcileAccountPreferences = useCallback(
    async (profile: UserProfile) => {
      const local = readLocalPreferences();
      // A goal choice made here for an option switched off since is dropped
      // rather than sent (the server would refuse the whole patch with it).
      const goals = settingsRef.current.goals;
      const { patch, local: next } = reconcilePreferences(profile.id, profile.preferences, local, {
        zone: browserTimeZone(),
        isGoalAvailable: (id) => isGoalOptionAvailable(id, goals)
      });
      if (!patch) {
        setLocalPrefs(next);
        return;
      }
      const send = async (body: PreferencesPatch) => {
        const res = await api.updatePreferences(body);
        if (res?.user) setUser((prev) => (prev && prev.id === res.user.id ? { ...prev, ...res.user } : prev));
      };
      try {
        await send(patch);
        setLocalPrefs(settledLocal(next, patch));
      } catch (err) {
        // Unreachable: everything stays pending for next time.
        if (!(err instanceof ApiError && err.status === 400)) return setLocalPrefs(local);
        // Refused outright, with no goal in it: nothing it carried can ever land.
        if (!('dailyGoalId' in patch)) return setLocalPrefs(settledLocal(next, patch));
        // Refused with a goal in it. The goal is the one choice the server may
        // no longer take (its options are the admin's, and may have changed
        // since this tab read them): it is dropped - the account's is the one
        // in use - and the rest goes up once more without it.
        const accountGoal = typeof profile.preferences?.dailyGoalId === 'string' ? profile.preferences.dailyGoalId : null;
        const dropped = settledLocal({ ...next, dailyGoalId: accountGoal }, { dailyGoalId: accountGoal });
        const rest: PreferencesPatch = { ...patch };
        delete rest.dailyGoalId;
        if (Object.keys(rest).length === 0) return setLocalPrefs(dropped);
        try {
          await send(rest);
          setLocalPrefs(settledLocal(dropped, rest));
        } catch (retryErr) {
          setLocalPrefs(retryErr instanceof ApiError && retryErr.status === 400 ? settledLocal(dropped, rest) : dropped);
        }
      }
    },
    [setLocalPrefs]
  );

  /** A guest's own choices, to go up with a merge (the server adopts them only where the account has none). */
  const guestPreferences = useCallback(() => {
    const local = readLocalPreferences();
    const prefs: { soundOn?: boolean; dailyGoalId?: string } = {};
    if (local.pendingSync === 'guest' && typeof local.soundOn === 'boolean') prefs.soundOn = local.soundOn;
    if (local.goalPendingSync === 'guest' && typeof local.dailyGoalId === 'string') prefs.dailyGoalId = local.dailyGoalId;
    return Object.keys(prefs).length > 0 ? prefs : null;
  }, []);

  /* ------------------------------------------------------- streak and goal */
  // Derived from the raw streak fields and today's row with the same engine
  // the server runs; announces goal met, freezes, repairs and milestones once.
  // Whose streak it is: the account the stats mirror, else a guest's own.
  const habitState = useHabitState({ owner: stats.ownerId ?? null, stats, settings, dailyGoalId, today: todayKey, todayRow: today, zone });
  const { habits, goalOptions, dailyGoal } = habitState;

  /** Count days in this device's zone from now on. Guests always do. */
  const adoptDeviceTimeZone = useCallback(async (): Promise<TimeZoneResult> => {
    const device = browserTimeZone();
    const account = userRef.current && userRef.current.provider !== 'guest' && getToken() ? userRef.current : null;
    if (!device || !account) return 'unavailable';
    try {
      const res = await api.updatePreferences({ timeZone: device });
      if (res?.user) setUser((prev) => (prev && prev.id === res.user.id ? { ...prev, ...res.user } : prev));
      return res?.applied?.timeZone ? 'applied' : 'cooldown';
    } catch {
      return 'unavailable';
    }
  }, []);

  const streakStripFor = useCallback((count: number) => habitState.strip(activity.days, count), [habitState, activity.days]);

  /* --------------------------------------------------------------- drafts */
  /**
   * The learner's unfinished code, per challenge.
   *
   * Signed in, this is a mirror of the account's `/api/drafts`; as a guest it
   * is a mirror of localStorage. Either way the editor reads it on open, so
   * closing the modal, refreshing, or coming back on another machine never
   * costs anyone the code they had typed.
   */
  const [drafts, setDrafts] = useState<Record<string, CodeDraft>>(() => readGuestDrafts());
  const draftsRef = useRef(drafts);

  /** Queued writes: one timer per challenge, holding the newest code not yet sent. */
  const draftTimers = useRef(new Map<string, number>());
  const draftPending = useRef(new Map<string, { code: string; language?: string }>());
  const [draftState, setDraftState] = useState<Record<string, DraftStatus>>({});

  /** Adopt a new set of drafts everywhere at once (state, the live handle, this browser). */
  const applyDrafts = useCallback((next: Record<string, CodeDraft>, persistLocally: boolean) => {
    draftsRef.current = next;
    setDrafts(next);
    if (persistLocally) writeJson(STORAGE_KEYS.drafts, next);
  }, []);

  const cancelQueuedDraft = useCallback((challengeId: string) => {
    const timer = draftTimers.current.get(challengeId);
    if (timer !== undefined) window.clearTimeout(timer);
    draftTimers.current.delete(challengeId);
    draftPending.current.delete(challengeId);
  }, []);

  /** Which account these drafts belong to, for the account-scoped fallback below. */
  const draftOwnerId = useCallback(() => userRef.current?.id ?? statsRef.current.ownerId ?? null, []);

  /** Keep a draft the server refused, so "the server could not be reached" does not mean "gone". */
  const stashUnsavedDraft = useCallback(
    (challengeId: string, draft: CodeDraft) => {
      const userId = draftOwnerId();
      if (!userId) return;
      const key = accountDraftsKey(userId);
      writeJson(key, { ...sanitiseDrafts(readJson<unknown>(key, null)), [challengeId]: draft });
    },
    [draftOwnerId]
  );

  /** It landed on the account: the local copy is no longer the only one. */
  const dropStashedDraft = useCallback(
    (challengeId: string) => {
      const userId = draftOwnerId();
      if (!userId) return;
      const key = accountDraftsKey(userId);
      const stashed = sanitiseDrafts(readJson<unknown>(key, null));
      if (!ownKey(stashed, challengeId)) return;
      delete stashed[challengeId];
      if (Object.keys(stashed).length === 0) remove(key);
      else writeJson(key, stashed);
    },
    [draftOwnerId]
  );

  /** Write one queued draft straight away. `keepalive` is for a page on its way out. */
  const writeDraft = useCallback(
    (challengeId: string, options: { keepalive?: boolean } = {}) => {
      const pending = draftPending.current.get(challengeId);
      if (!pending) return;
      cancelQueuedDraft(challengeId);

      const draft: CodeDraft = { ...pending, updatedAt: new Date().toISOString() };
      const signedIn = Boolean(getToken());
      applyDrafts({ ...draftsRef.current, [challengeId]: draft }, !signedIn);

      if (!signedIn) {
        setDraftState((prev) => ({ ...prev, [challengeId]: 'saved' }));
        return;
      }
      setDraftState((prev) => ({ ...prev, [challengeId]: 'saving' }));

      // Only report on a draft that still exists. A request that lands after
      // the learner solved the challenge, pressed "start from scratch" or
      // signed out must not resurrect a status line for it.
      const report = (status: DraftStatus) =>
        setDraftState((prev) => (ownKey(draftsRef.current, challengeId) ? { ...prev, [challengeId]: status } : prev));

      api
        .saveDraft(challengeId, draft.code, draft.language, { keepalive: options.keepalive })
        .then(() => {
          dropStashedDraft(challengeId);
          report('saved');
        })
        // Say so rather than claim a save that did not happen - and put the
        // code somewhere it survives a refresh, because the learner who reads
        // "saved on this device" is about to close the tab. The next
        // successful save, or the next sign-in, sends it on.
        .catch(() => {
          stashUnsavedDraft(challengeId, draft);
          report('local');
        });
    },
    [applyDrafts, cancelQueuedDraft, dropStashedDraft, stashUnsavedDraft]
  );

  const saveDraft = useCallback(
    (challengeId: string, code: string, language?: string) => {
      if (!challengeId) return;
      const existing = draftAt(draftsRef.current, challengeId);
      // Identical to what is already saved: no write, and no "Saving…" flicker.
      // Undoing back to the saved text lands here with a timer already
      // running, so cancel it and finish the status - otherwise the line sat
      // on "Saving…" forever for a challenge that was fully saved.
      if (existing && existing.code === code) {
        cancelQueuedDraft(challengeId);
        setDraftState((prev) =>
          ownKey(prev, challengeId) && prev[challengeId] === 'saving' ? { ...prev, [challengeId]: 'saved' } : prev
        );
        return;
      }
      draftPending.current.set(challengeId, { code, language });
      setDraftState((prev) => (prev[challengeId] === 'saving' ? prev : { ...prev, [challengeId]: 'saving' }));
      // One timer per challenge: the burst of keystrokes that follows rides
      // the timer already running, so a write happens at most once per window.
      if (draftTimers.current.has(challengeId)) return;
      const timer = window.setTimeout(() => {
        draftTimers.current.delete(challengeId);
        writeDraft(challengeId);
      }, DRAFT_DEBOUNCE_MS);
      draftTimers.current.set(challengeId, timer);
    },
    [writeDraft, cancelQueuedDraft]
  );

  const flushDraft = useCallback((challengeId: string) => writeDraft(challengeId), [writeDraft]);

  /** Everything still queued, now - the tab is going away. */
  const flushAllDrafts = useCallback(
    (keepalive = false) => {
      for (const id of [...draftPending.current.keys()]) writeDraft(id, { keepalive });
    },
    [writeDraft]
  );

  const clearDraft = useCallback(
    (challengeId: string) => {
      const had = ownKey(draftsRef.current, challengeId);
      const queued = draftPending.current.has(challengeId);
      cancelQueuedDraft(challengeId);
      if (!had && !queued) return;

      if (had) {
        const next = { ...draftsRef.current };
        delete next[challengeId];
        applyDrafts(next, !getToken());
      }
      setDraftState((prev) => {
        if (!ownKey(prev, challengeId)) return prev;
        const next = { ...prev };
        delete next[challengeId];
        return next;
      });
      if (getToken()) api.deleteDraft(challengeId).catch(() => { /* the solve path drops it server-side too */ });
    },
    [applyDrafts, cancelQueuedDraft]
  );

  const draftFor = useCallback((challengeId: string) => draftAt(drafts, challengeId)?.code ?? null, [drafts]);
  const draftStatus = useCallback(
    (challengeId: string): DraftStatus => (ownKey(draftState, challengeId) ? draftState[challengeId] : 'idle'),
    [draftState]
  );

  /**
   * Load the account's drafts, carrying over anything typed before signing in
   * and anything a failed save left behind. A local copy is pushed up only
   * where the account has nothing newer - code written on another device is
   * not overwritten by this browser's leftovers.
   */
  const restoreDrafts = useCallback(async (ownerId?: string) => {
    if (!getToken()) return;
    // The caller usually just learned who this is; `userRef` only catches up
    // on the next render, which is too late for an account-scoped key.
    const userId = ownerId ?? draftOwnerId();
    const local = { ...readGuestDrafts(), ...readAccountDrafts(userId) };
    let server: Record<string, CodeDraft>;
    try {
      server = sanitiseDrafts((await api.drafts()).drafts);
    } catch {
      return; // Offline, or an older server without the route: keep what is on screen.
    }

    const merged: Record<string, CodeDraft> = { ...server };
    const stillLocal: Record<string, CodeDraft> = {};
    const pushes: Promise<void>[] = [];
    for (const [id, draft] of Object.entries(local)) {
      const theirs = draftAt(server, id);
      if (theirs && theirs.updatedAt >= draft.updatedAt) continue;
      merged[id] = draft;
      // Wait for these: clearing the local copy first meant a rejected upload
      // - offline, over the size cap, a lesson this server does not serve -
      // threw the learner's code away for good.
      pushes.push(api.saveDraft(id, draft.code, draft.language).then(
        () => {},
        () => {
          stillLocal[id] = draft;
        }
      ));
    }
    await Promise.all(pushes);

    // What landed belongs to the account now, not to this browser. What did
    // not is kept under this account's own key, where the next save or the
    // next sign-in retries it and no other account can reach it.
    if (userId) {
      remove(STORAGE_KEYS.drafts);
      if (Object.keys(stillLocal).length > 0) writeJson(accountDraftsKey(userId), stillLocal);
      else remove(accountDraftsKey(userId));
    }
    applyDrafts(merged, false);
    if (Object.keys(stillLocal).length > 0) {
      setDraftState((prev) => {
        const next = { ...prev };
        for (const id of Object.keys(stillLocal)) next[id] = 'local';
        return next;
      });
    }
  }, [applyDrafts, draftOwnerId]);

  /**
   * Forget the account's code: timers, queued writes, status lines and the
   * in-memory set. Losing a session has to mean this too - a token that
   * expired used to leave the previous learner's drafts on screen, where the
   * next keystroke wrote the whole lot into this browser's guest storage and
   * the next person to sign in uploaded it into THEIR account.
   *
   * The account-scoped fallback key is deliberately left alone: it is that
   * account's only copy of code the server never took, and only that account
   * can read it back.
   */
  const clearDraftsFromMemory = useCallback(() => {
    for (const timer of draftTimers.current.values()) window.clearTimeout(timer);
    draftTimers.current.clear();
    draftPending.current.clear();
    setDraftState({});
    applyDrafts({}, false);
    remove(STORAGE_KEYS.drafts);
  }, [applyDrafts]);

  // A draft typed seconds before the tab closes still has to land, so flush
  // on the way out. `keepalive` is what lets the request outlive the page.
  useEffect(() => {
    const onPageHide = () => flushAllDrafts(true);
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') flushAllDrafts(true);
    };
    window.addEventListener('pagehide', onPageHide);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('pagehide', onPageHide);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [flushAllDrafts]);

  /* -------------------------------------------------------------- content */
  const [bundle, setBundle] = useState<ContentBundle | null>(content);
  const bundleRef = useRef(bundle);
  useEffect(() => {
    bundleRef.current = bundle;
  }, [bundle]);

  // Adopt the app's bundle when it lands - unless the API already handed us a
  // fresher copy in the meantime, which the bundled files cannot beat.
  useEffect(() => {
    if (content) setBundle((current) => (current?.source === 'api' ? current : content));
  }, [content]);

  const contentReady = bundle !== null;

  /**
   * The server's bank depends on who asks - a premium stage this account has
   * not unlocked is served as stubs - so it is fetched again whenever that
   * changes: sign-in, sign-out, a purchase. Unreachable leaves what is there.
   */
  const reloadContent = useCallback(async () => {
    const fresh = await loadFromApi(bundleRef.current?.tracks ?? []);
    if (fresh) setBundle(fresh);
  }, []);

  /** `refreshAccount`, for callbacks declared before it (it is assigned below). */
  const refreshAccountRef = useRef<() => Promise<void>>(async () => {});

  /* ------------------------------------------------- activity: bookkeeping */

  // The log is tagged with the account it mirrors, exactly like the stats. A
  // cache from before the log existed starts untagged; it takes the stats' tag.
  const { setOwner, backfillOnce, adoptView, resetActivity } = activityLog;
  useEffect(() => {
    if (!activityRef.current.ownerId && stats.ownerId) setOwner(stats.ownerId);
  }, [stats.ownerId, activityRef, setOwner]);

  // History from before the log existed is rebuilt once from `attempts` in
  // this browser's zone (the server does the same for accounts), as soon as
  // the content bank is here to say which solves were stage tests.
  useEffect(() => {
    if (!bundle || activity.backfilledAt) return;
    const byId = bundle.byId;
    backfillOnce(
      statsRef.current,
      (id) => {
        const c = byId.get(id);
        return c ? { isStageTest: Boolean(c.isStageTest), xpReward: c.xpReward } : null;
      },
      zone,
      settingsRef.current.xp,
      todayKey
    );
  }, [bundle, activity.backfilledAt, backfillOnce, zone, todayKey]);

  /**
   * Make the browser's log the account's. `view` is what a merge returned
   * (everything local was just sent, so nothing is pending any more); without
   * one the server's view is fetched. A log that belongs to anyone else is
   * dropped first - it must never be shown under, or sent into, this account.
   */
  const adoptAccountActivity = useCallback(
    async (ownerId: string, view?: ActivityView | null) => {
      if (activityRef.current.ownerId && activityRef.current.ownerId !== ownerId) resetActivity();
      let fresh: ActivityView | null | undefined = view;
      if (!fresh) {
        try {
          fresh = await api.activity();
        } catch {
          fresh = null; // offline, or an older server without the route
        }
      }
      if (fresh) adoptView(fresh, { ownerId, synced: Boolean(view) });
      else setOwner(ownerId);
    },
    [activityRef, adoptView, resetActivity, setOwner]
  );

  /**
   * What goes up with a merge next to `progress`: this log, trimmed so the
   * whole body stays well under the server's 256 kB limit. A signed-in
   * learner's own log only sends what the server has not taken yet
   * (`pendingOnly`); a guest's goes whole, its oldest entries first to go.
   */
  const activityForMerge = useCallback(
    (progress: unknown, options: { pendingOnly?: boolean } = {}) => {
      const log = activityRef.current;
      const day = sessionToday(userRef.current?.preferences?.timeZone ?? browserTimeZone(), statsRef.current, log);
      return trimActivityForMerge(log, day, undefined, {
        pendingOnly: options.pendingOnly,
        maxBytes: MERGE_BODY_MAX_BYTES - jsonByteLength(progress)
      });
    },
    [activityRef]
  );

  /* -------------------------------------------------------- language track */
  /**
   * Which track the learner is currently following. A client-side viewing
   * preference (like the theme): it decides which slice of the one shared
   * bank is shown as "your path", not a second progress system. Progress
   * itself is still just `stats.completedChallenges` / `completedStages`;
   * a stage belongs to one track, so per-track progress falls out of
   * filtering, not a new store.
   */
  const [selectedTrackId, setSelectedTrackId] = useState<string>(() => readString(STORAGE_KEYS.track) ?? 'core');
  useEffect(() => {
    writeString(STORAGE_KEYS.track, selectedTrackId);
  }, [selectedTrackId]);

  // Tracks an admin unpublished disappear from the picker; a saved preference
  // for one of them falls back to the first visible track.
  const visibleTracks = useMemo(
    () => (bundle ? bundle.tracks.filter((t) => !bundle.hiddenTracks.includes(t.id)) : []),
    [bundle]
  );

  // Each stage's lessons in units: the server's grouping (on content from the
  // API), else the one it sent last time, else the default - resolved with
  // the current unit settings, so an admin's change to them applies here too.
  const unitDefCache = useMemo(() => (bundle && bundle.source !== 'api' ? readUnitDefCache() : null), [bundle]);
  const unitStages = useMemo(
    () => (bundle ? withUnits(bundle.stages, settings.units, unitDefCache) : NO_STAGES),
    [bundle, settings.units, unitDefCache]
  );
  const stages = useMemo(
    () => (bundle ? applyProgressByTrack(unitStages, visibleTracks, stats) : NO_STAGES),
    [bundle, unitStages, visibleTracks, stats]
  );
  const allChallenges = bundle?.challenges ?? EMPTY;
  const challengeById = useCallback((id: string) => bundle?.byId.get(id), [bundle]);

  const tracks = useMemo<LanguageTrackProgress[]>(() => {
    if (!bundle) return NO_TRACKS;
    const solved = new Set(stats.completedChallenges);
    return visibleTracks.map((track) => {
      const trackStages = stagesForTrack(stages, track);
      let totalChallenges = 0;
      let solvedChallenges = 0;
      for (const s of trackStages) {
        totalChallenges += s.challenges.length + (s.test ? 1 : 0);
        solvedChallenges += s.challenges.filter((c) => solved.has(c.id)).length;
        if (s.test && solved.has(s.test.id)) solvedChallenges += 1;
      }
      return {
        track,
        stages: trackStages,
        cleared: trackStages.filter((s) => s.state === 'Completed').length,
        total: trackStages.length,
        totalChallenges,
        solvedChallenges
      };
    });
  }, [bundle, visibleTracks, stages, stats.completedChallenges]);

  const activeTrack = useMemo(
    () => tracks.find((t) => t.track.id === selectedTrackId) ?? tracks[0] ?? EMPTY_TRACK,
    [tracks, selectedTrackId]
  );
  const setSelectedTrack = useCallback(
    (trackId: string) => {
      // Only a track that exists (and is visible) can be selected; anything else is ignored.
      if (visibleTracks.some((t) => t.id === trackId)) setSelectedTrackId(trackId);
    },
    [visibleTracks]
  );

  /* ---------------------------------------------------------- learning mode */
  const [learningMode, setLearningModeState] = useState<LearningMode | null>(() => {
    const raw = readString(STORAGE_KEYS.learningMode);
    return raw === 'learn' || raw === 'practice' ? raw : null;
  });
  const setLearningMode = useCallback((mode: LearningMode) => {
    setLearningModeState(mode);
    writeString(STORAGE_KEYS.learningMode, mode);
  }, []);

  const learnerStages = activeTrack.stages;
  const learnerChallenges = useMemo(() => {
    const ids = new Set(learnerStages.map((s) => s.id));
    return allChallenges.filter((c) => ids.has(c.stageId));
  }, [allChallenges, learnerStages]);

  /* ------------------------------------------------------- server handshake */
  useEffect(() => {
    let cancelled = false;

    /**
     * Vite is serving in well under a second while the API is still compiling
     * the challenge bank, so the very first /api/health of a cold `npm run dev`
     * loses the race. Retry with backoff instead of declaring the server dead
     * and making the user reload by hand.
     */
    const waitForServer = async () => {
      const delays = [0, 600, 1200, 2400, 4000];
      for (let attempt = 0; attempt < delays.length; attempt++) {
        if (cancelled) throw new Error('cancelled');
        if (delays[attempt] > 0) {
          await new Promise((resolve) => setTimeout(resolve, delays[attempt]));
          if (cancelled) throw new Error('cancelled');
        }
        try {
          return await api.health();
        } catch (err) {
          // A real HTTP error (4xx/5xx) still means something is listening, so
          // only a transport failure is worth waiting out. The dev proxy reports
          // "no upstream" as a 500, which is why this retries on both.
          if (attempt === delays.length - 1) throw err;
        }
      }
      throw new Error('unreachable');
    };

    /** Restore the account behind a saved token, reconciling local progress. */
    const restoreSession = async () => {
      if (!getToken()) return;
      try {
        const { user: me, progress } = await api.me();
        if (cancelled) return;
        setUser(me);

        // Anything solved while the API was unreachable lives only in this
        // browser, and the server's copy is behind. Spreading the server
        // response over local state would delete that work on the next
        // load, so push the local copy up first and adopt the union.
        //
        // Only if the local copy is THIS account's (or a guest's). A copy
        // tagged with someone else's id is a previous user's, and must not
        // be pushed into this account.
        const local = statsRef.current;
        const localBelongsHere = !local.ownerId || local.ownerId === me.id;
        const serverSolved = new Set(progress.completedChallenges ?? []);
        // Wrong answers recorded while the server was unreachable are waiting
        // too, even when there is no solve to carry.
        const localLog = activityRef.current;
        const logBelongsHere = !localLog.ownerId || localLog.ownerId === me.id;
        const pendingMisses = logBelongsHere && unsyncedMisses(localLog).length > 0;
        const localIsAhead =
          localBelongsHere &&
          ((local.completedChallenges ?? []).some((id) => !serverSolved.has(id)) ||
            local.xp > (progress.xp ?? 0) ||
            pendingMisses);

        let reconciled = progress;
        let mergedActivity: ActivityView | null = null;
        if (localIsAhead) {
          try {
            // This account's own log: only what the server has not taken yet.
            const pendingOnly = Boolean(localLog.ownerId);
            const merged = await api.mergeProgress(local, logBelongsHere ? activityForMerge(local, { pendingOnly }) : undefined);
            reconciled = merged.progress;
            mergedActivity = merged.activity ?? null;
            const skipped = skippedLockedMessage(merged.skippedLocked);
            if (skipped && !cancelled) notify(skipped, 'info');
          } catch {
            // Could not reach the server after all - keep the local copy
            // rather than discarding work.
            reconciled = {
              ...progress,
              xp: Math.max(local.xp, progress.xp ?? 0),
              completedChallenges: [
                ...new Set([...(progress.completedChallenges ?? []), ...(local.completedChallenges ?? [])])
              ]
            };
          }
        }
        if (cancelled) return;

        // The streak as the server worked it out on the learner's own day
        // (/auth/me and the merge both recalculate it) - never judged again
        // against this browser's day, which can differ after a zone flip.
        setStats((prev) => ({
          ...adoptAccountProgress(prev, reconciled, settingsRef.current.levels),
          ...entitlementsOf(me),
          ownerId: me.id
        }));

        // The account's days and misses, as the server has them. A log that
        // was just merged is adopted from the merge; otherwise it is fetched
        // (and a pending one that could not be sent stays pending).
        await adoptAccountActivity(me.id, mergedActivity);

        // Sound on or off: a choice made offline goes up now.
        void reconcileAccountPreferences(me);

        // Unfinished code is part of "where I left off", so it is restored in
        // the same breath as the progress - not when an editor happens to open.
        await restoreDrafts(me.id);
      } catch (err) {
        if (cancelled) return;
        if (err instanceof ApiError && err.status === 401) {
          // The token is expired or revoked. Say so - the old code dropped the
          // token silently and left the nav claiming the user was signed in
          // while every solve quietly stopped reaching the server.
          setToken(null);
          setUser(null);
          // Dropping the session and keeping their code would hand it to
          // whoever signs in on this browser next.
          clearDraftsFromMemory();
          notify('Your session has expired. Sign in again to keep syncing.', 'info');
        }
        // Any other failure (server hiccup) keeps the token and tries again
        // shortly, rather than waiting for the 30s probe.
        window.setTimeout(() => {
          if (!cancelled && getToken() && !userRef.current) restoreSession();
        }, 2500);
      }
    };

    let wasOnline = false;

    /** One health probe; flips serverStatus either way and restores on recovery. */
    const probe = async (initial: boolean) => {
      try {
        let health: any;
        if (initial) {
          health = await waitForServer();
        } else {
          try {
            health = await api.health();
          } catch {
            // One retry before declaring offline to absorb tunnel jitter or TLS renegotiation
            await new Promise((r) => setTimeout(r, 1000));
            if (cancelled) return;
            health = await api.health();
          }
        }
        if (cancelled) return;
        // The non-secret half of the Judge0 story: whether the server can
        // run compiled languages at all, so the UI can say so up front.
        const configured = Boolean(health?.judge0?.configured);
        setJudge0Configured(configured);
        compilerService.setRemoteCompilerStatus(configured, health?.judge0?.languages ?? []);
        // One level finer, and only from a server new enough to send it: which
        // engine each language gets and what to call it. A server that sends
        // nothing leaves this `{}`, and everything falls back to the flag
        // above rather than claiming a language is missing.
        const reportedRuntimes: Record<string, RuntimeInfo> = health?.runtimes ?? {};
        setRuntimes(reportedRuntimes);
        compilerService.setServerRuntimes(reportedRuntimes);
        // An admin changed the rules: fetch them. An older server that sends
        // no revision means the defaults.
        noteRevision(typeof health?.settingsRevision === 'number' ? health.settingsRevision : undefined);
        const recovered = !wasOnline;
        wasOnline = true;
        setServerStatus('online');
        if (recovered) eventBus.emit('server:status', { online: true });

        if (recovered) {
          // Refresh content in case challenges were edited since the last build.
          const fresh = await loadFromApi(bundleRef.current?.tracks ?? []);
          if (!cancelled && fresh) setBundle(fresh);
        }

        // Restore on recovery, and ALSO on any later probe that finds a saved
        // token with no signed-in user. A transient failure during the first
        // attempt (the API restarting under --watch, say) used to leave the
        // page signed out until a manual reload, because restore only ran on
        // the offline -> online transition.
        const needsRestore = getToken() && (recovered || !userRef.current || userRef.current.provider === 'guest');
        if (needsRestore) await restoreSession();
      } catch {
        if (cancelled) return;
        if (wasOnline) eventBus.emit('server:status', { online: false });
        wasOnline = false;
        setServerStatus('offline');
      }
    };

    probe(true);

    // The verdict used to be decided once at mount and never revisited, so an
    // API started AFTER the page loaded stayed "offline" (with the sign-in form
    // disabled, telling the user to start the very server that was running),
    // and an API that died stayed "connected". Re-probe on a slow cadence and
    // whenever the browser says connectivity changed.
    const interval = window.setInterval(() => probe(false), 30_000);
    const onOnline = () => probe(false);
    const onFocus = () => probe(false);
    window.addEventListener('online', onOnline);
    window.addEventListener('focus', onFocus);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
      window.removeEventListener('online', onOnline);
      window.removeEventListener('focus', onFocus);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /**
   * Which sign-in buttons to offer. Asked once, and only booleans come back -
   * a server with no Google/GitHub credentials answers false for both and the
   * buttons never appear, leaving email and password exactly as they were.
   */
  useEffect(() => {
    if (serverStatus !== 'online' || oauthProviders) return;
    let cancelled = false;
    api
      .oauthProviders()
      .then((res) => {
        if (!cancelled) setOauthProviders({ google: Boolean(res?.google), github: Boolean(res?.github) });
      })
      .catch(() => {
        // No route, or it failed: treat it as "not configured" rather than
        // showing a button that cannot work.
        if (!cancelled) setOauthProviders({ google: false, github: false });
      });
    return () => {
      cancelled = true;
    };
  }, [serverStatus, oauthProviders]);

  /* -------------------------------------------------------------- actions */

  // One hold per provider; its functions never change identity.
  const [celebrationHold] = useState(createCelebrationHold);

  const celebrate = useCallback((options: CelebrateOptions = {}) => {
    if (prefersReducedMotion()) return;
    const particles = Math.max(0, Math.round(options.particles ?? settingsRef.current.celebrations.confetti.onCorrectParticles));
    if (particles === 0) return;
    // Fetched on the first celebration, not on page load - nobody celebrates before that.
    import('canvas-confetti').then(({ default: confetti }) =>
      confetti({
        particleCount: particles,
        spread: 68,
        origin: { y: 0.65 },
        disableForReducedMotion: true,
        colors: ['#4839FF', '#FFB020', '#00B873', '#FF5A4E']
      })
    );
  }, []);

  /**
   * Record a solve. Resolves with what it paid (SolveOutcome): the solve's
   * XP (0 when re-solving), the perfect-unit bonus when this first solve
   * completed a unit, and the daily-goal bonus the first time today's goal
   * is met - worked out here with the same rules the server runs
   * (src/platform/xp-leveling/rewards.ts, src/platform/habits), then replaced
   * by the server's figures when it answers. A signed-in learner's goal bonus
   * comes only from the server; a guest's is paid here. All side effects live
   * here - never inside a setState updater, which React may run twice.
   */
  const completeChallenge = useCallback(
    async (challenge: Challenge, options: SolveOptions = {}): Promise<SolveOutcome> => {
      const attempts = Math.max(1, options.attempts ?? 1);
      const hintsUsed = Math.max(0, options.hintsUsed ?? 0);
      const alreadySolved = stats.completedChallenges.includes(challenge.id);
      // The same rules the server prices with (settings.xp); its answer wins
      // when signed in, this is the instant preview.
      const awarded = alreadySolved ? 0 : xpForSolve(challenge.xpReward, attempts, hintsUsed, settings.xp);
      // Which revision of the rules that preview was priced with.
      const pricedWith = settingsRevision;

      const day = todayKey;
      const at = new Date().toISOString();
      const xp = stats.xp + awarded;
      const previous = stats.attempts[challenge.id];
      const signedIn = Boolean(user && user.provider !== 'guest' && getToken());
      const toServer = signedIn && serverStatus === 'online';

      // The streak fields are left as they are here: the habits engine below
      // counts the day once today's row has this solve in it.
      const solved: UserStats = {
        ...stats,
        xp,
        level: levelFromXp(xp, settings.levels),
        completedChallenges: alreadySolved
          ? stats.completedChallenges
          : [...stats.completedChallenges, challenge.id],
        attempts: {
          ...stats.attempts,
          [challenge.id]: {
            challengeId: challenge.id,
            score: Math.max(previous?.score ?? 0, scoreSolve(attempts, hintsUsed, settings.xp)),
            attempts: (previous?.attempts ?? 0) + attempts,
            hintsUsed: (previous?.hintsUsed ?? 0) + hintsUsed,
            // The FIRST solve's time - a re-solve used to overwrite it, which
            // moved old lessons onto today in the heatmap and the badges.
            solvedAt: previous?.solvedAt || at,
            lastSolvedAt: at,
            solves: (typeof previous?.solves === 'number' ? previous.solves : previous ? 1 : 0) + 1
          }
        }
      };

      // A first solve that completes a unit: its record, and the perfect-unit
      // bonus when every lesson in it was clean - the rule the server applies.
      const stage = stages.find((s) => s.id === challenge.stageId);
      const { progress: rewarded, reward } = applyUnitRewards(
        stats,
        solved,
        { challengeId: challenge.id, firstSolve: !alreadySolved, now: at },
        { cfg: settings.units, unitFor: (id) => unitFor(stage?.units, id) }
      );
      let optimistic: UserStats = reward ? { ...rewarded, level: levelFromXp(rewarded.xp, settings.levels) } : solved;
      const localBonus = reward?.bonusXp ?? 0;

      // Today's row, optimistically: a re-solve counts as one and pays nothing.
      const activityBefore = activityLog.applyEvent(
        {
          type: 'solve',
          challengeId: challenge.id,
          isTest: Boolean(challenge.isStageTest),
          firstSolve: !alreadySolved,
          awardedXp: awarded,
          unitCompleted: Boolean(reward),
          perfectBonusXp: localBonus
        },
        { day, at }
      );

      // The streak and the daily goal, on today's row WITH this solve: missed
      // days worked out (freezes, a break, a repair offer), an open repair
      // counted, today counted under the day rule, and the goal snapshotted
      // the first time it is met - the engine the server runs.
      const habitRun = learnerSolve(optimistic, {
        settings,
        dailyGoalId,
        today: day,
        day: dayRow(activityLog.activityRef.current, day),
        at
      });
      // The goal bonus: a guest's is paid here; a signed-in learner's only
      // ever by the server (its figure arrives with the answer, or the merge).
      const localGoalBonus = habitRun.events.goalMet && !signedIn ? habitRun.events.bonusXp : 0;
      if (habitRun.events.goalMet && habitRun.events.goal) {
        activityLog.applyEvent({ type: 'goal', goal: habitRun.events.goal, bonusXp: localGoalBonus }, { day, at });
      }
      const withXp = optimistic.xp + localGoalBonus;
      optimistic = {
        ...optimistic,
        streak: habitRun.fields.streak,
        bestStreak: habitRun.fields.bestStreak,
        lastActiveDay: habitRun.fields.lastActiveDay,
        habit: habitRun.fields.habit,
        xp: withXp,
        level: levelFromXp(withXp, settings.levels)
      };
      const localHabitEvents: SolveHabitEvents = {
        goalMet: habitRun.events.goalMet,
        bonusXp: localGoalBonus,
        freezeEarned: habitRun.events.freezeEarned,
        repaired: habitRun.events.repaired,
        streakDay: habitRun.events.streakDay,
        frozenDays: habitRun.events.frozenDays
      };
      const localAfter = { streak: habitRun.fields.streak, freezes: habitRun.fields.habit.freezes };

      let outcome: SolveOutcome = {
        solveXp: awarded,
        perfectBonusXp: localBonus,
        goalBonusXp: localGoalBonus,
        goalMet: habitRun.events.goalMet,
        totalXp: awarded + localBonus + localGoalBonus,
        unitCompleted: reward?.unitId ?? null,
        perfect: Boolean(reward?.perfect),
        verifiedByServer: false
      };

      const levelledUp = optimistic.level > stats.level;
      setStats(optimistic);

      // Confetti only for a solve that paid something - a 0-XP re-solve gets
      // none unless the admin asked for it (`celebrations.confetti`).
      const confetti = settings.celebrations.confetti;
      if (confetti.onCorrect && (outcome.totalXp > 0 || confetti.onReSolve)) celebrate({ particles: confetti.onCorrectParticles });

      eventBus.emit('challenge:completed', {
        challenge,
        xpEarned: awarded,
        attempts,
        hintsUsed,
        firstTime: !alreadySolved
      });
      if (reward) {
        eventBus.emit('unit:completed', { stageId: challenge.stageId, unitId: reward.unitId, perfect: reward.perfect, xpEarned: reward.bonusXp });
      }
      if (!alreadySolved) {
        const solvedIds = new Set(optimistic.completedChallenges);
        const cleared =
          stage &&
          stage.challenges.length > 0 &&
          stage.challenges.every((c) => solvedIds.has(c.id)) &&
          (!stage.test || solvedIds.has(stage.test.id));
        if (cleared) eventBus.emit('stage:completed', { stageId: stage.id });
      }

      // Inside a unit run the end screen celebrates the whole run instead.
      if (!options.deferCelebrations) {
        if (levelledUp) notify(`Level ${optimistic.level} reached! +${outcome.totalXp} XP`, 'success');
        else if (outcome.totalXp > 0) notify(challenge.uiPreview ? `+${outcome.totalXp} XP · Assessment Completed!` : `+${outcome.totalXp} XP`, 'success');
      }

      // A guest's (or an account's while the server is unreachable) streak and
      // goal news is this browser's own; a signed-in learner's waits for the
      // server's word below.
      if (!toServer) habitState.announceSolve(day, localHabitEvents, localAfter);

      // The server is authoritative when signed in; reconcile after the fact so
      // the UI never waits on the network to feel responsive.
      if (toServer) {
        // The optimistic day row must not pass for a goal met elsewhere.
        const release = habitState.holdAnnouncements();
        try {
          const res = await api.solve(challenge.id, attempts, hintsUsed, {
            answer: options.answer,
            code: options.code,
            context: options.context
          });
          const { progress } = res;
          // The bonuses the server paid: the perfect unit's, and the daily
          // goal's (`bonusXp` counts both; an older server knows no goal).
          const serverGoalBonus = res.habitEvents ? Math.max(0, Number(res.habitEvents.bonusXp) || 0) : 0;
          const serverUnitBonus = Array.isArray(res.bonuses)
            ? res.bonuses.reduce((sum, b) => sum + (b.kind === 'perfect-unit' ? Number(b.xp) || 0 : 0), 0)
            : typeof res.bonusXp === 'number'
              ? res.bonusXp - serverGoalBonus
              : localBonus;
          // Priced with other rules than the server's (an admin changed them
          // since this tab fetched its copy), or the server grouped the unit
          // differently: the server's XP is the truth, not the larger of the two.
          const rulesChanged =
            (typeof res.settingsRevision === 'number' && res.settingsRevision !== pricedWith) || serverUnitBonus !== localBonus;
          // The rules changed since this tab last looked: fetch them.
          noteRevision(res.settingsRevision);
          // The server's day row wins over the optimistic one (its goal snapshot and bonus too).
          activityLog.adoptDay(res.today);
          // Union rather than overwrite: anything solved locally while this
          // request was in flight must not be erased by an older snapshot.
          // `unitsCompleted` and the streak fields are the server's.
          setStats((prev) => statsAfterSolve(prev, progress, { rulesChanged, curve: settingsRef.current.levels }));
          const solveXp = typeof res.awardedXp === 'number' ? res.awardedXp : awarded;
          outcome = {
            solveXp,
            perfectBonusXp: serverUnitBonus,
            goalBonusXp: serverGoalBonus,
            goalMet: res.habitEvents ? Boolean(res.habitEvents.goalMet) : habitRun.events.goalMet,
            totalXp: solveXp + serverUnitBonus + serverGoalBonus,
            unitCompleted: res.unitCompleted !== undefined ? res.unitCompleted : outcome.unitCompleted,
            perfect: typeof res.unitPerfect === 'boolean' ? res.unitPerfect : outcome.perfect,
            verifiedByServer: true
          };
          // What the server says this solve did to the streak and the goal
          // (an older server says nothing: this browser's own reading then).
          const events = res.habitEvents;
          habitState.announceSolve(
            res.today?.day ?? day,
            events
              ? {
                  goalMet: Boolean(events.goalMet),
                  bonusXp: serverGoalBonus,
                  freezeEarned: Boolean(events.freezeEarned),
                  repaired: Boolean(events.repaired),
                  streakDay: Boolean(events.streakDay),
                  frozenDays: Array.isArray(events.frozenDays) ? events.frozenDays : []
                }
              : localHabitEvents,
            {
              streak: typeof res.habits?.streak === 'number' ? res.habits.streak : Number(progress.streak) || 0,
              freezes: typeof res.habits?.freezes === 'number' ? res.habits.freezes : progress.habit?.freezes ?? localAfter.freezes
            }
          );
        } catch (err) {
          if (err instanceof OfflineError) {
            // Kept locally; the next session restore pushes it up (and the
            // server pays any goal bonus then).
            habitState.announceSolve(day, localHabitEvents, localAfter);
            notify('Server unreachable - this solve is saved here and will sync later.', 'info');
          } else if (err instanceof ApiError && err.status === 422) {
            // The server re-checked the submission and disagreed. Its verdict
            // wins: take the local award back rather than show XP that does
            // not exist on the leaderboard - and the day row with it.
            setStats(stats);
            activityLog.replaceActivity(activityBefore);
            notify('The server did not accept that answer, so no XP was awarded.', 'error');
            return { ...NO_OUTCOME, rejected: true };
          } else if (err instanceof ApiError && err.status === 403 && err.reason === 'premium-locked') {
            // A premium lesson this account has not unlocked: the server
            // credits nothing, so neither does this tab - rolled back exactly
            // like a 422. The entitlements here were out of date (a revoke,
            // another device): fetch them, and the bank, again.
            setStats(stats);
            activityLog.replaceActivity(activityBefore);
            notify(getCopy('premium.lockedSolve') || err.message, 'error');
            void refreshAccountRef.current().catch(() => {});
            return { ...NO_OUTCOME, rejected: true };
          } else if (solveWasDeferred(err)) {
            // Too many solves in a row, or every code-runner slot busy while
            // the server re-ran the code: not a verdict on the answer, and
            // nothing was recorded. It is kept here and goes up with the next
            // sync, like an offline solve.
            habitState.announceSolve(day, localHabitEvents, localAfter);
            notify(`${err.message} This solve is saved on this device and will sync later.`, 'info');
          } else if (err instanceof ApiError && err.status === 401) {
            // The session ended under this tab - a password reset from a link
            // signs out every other session. Say so now, the way a restore
            // does, rather than failing every solve quietly.
            setToken(null);
            setUser(null);
            clearDraftsFromMemory();
            notify('Your session has ended. Sign in again to keep syncing.', 'info');
          } else {
            notify('Progress saved locally, but the server rejected it.', 'error');
          }
        } finally {
          release();
        }
      }

      return outcome;
    },
    [
      stats,
      stages,
      user,
      serverStatus,
      celebrate,
      notify,
      settings,
      settingsRevision,
      todayKey,
      dailyGoalId,
      activityLog,
      habitState,
      noteRevision,
      clearDraftsFromMemory
    ]
  );

  /**
   * Record a wrong answer (see SessionContextType.recordMiss). What a miss is
   * reduced to comes from the shared code the server re-runs:
   * normalizeMissAnswer, wrongAnswerKeys and gradeAnswer.
   */
  const recordMiss = useCallback<SessionContextType['recordMiss']>(
    (challenge, submission, options = {}) => {
      const isCode = isCodeChallengeType(challenge.type);
      const raw = isCode ? (submission.code ? { kind: 'code', ...submission.code } : undefined) : submission.answer;
      if (raw === undefined) return;
      const answer = normalizeMissAnswer(challenge, raw, MISS_ANSWER_CHARS);
      // Not a miss at all: malformed, or - for anything but code - correct,
      // graded as given and as it would be stored (the server does both).
      if (!answer) return;
      if (!isCode && (gradeAnswer(challenge, submission.answer) || gradeAnswer(challenge, rawAnswerFromMiss(challenge, answer)))) return;

      const context = options.context ?? 'lesson';
      const at = new Date().toISOString();
      const signedIn = Boolean(user && user.provider !== 'guest' && getToken());
      activityLog.applyEvent(
        {
          type: 'miss',
          challengeId: challenge.id,
          context,
          answer,
          final: options.final === true,
          keys: wrongAnswerKeys(challenge, answer),
          // A signed-in learner's miss is pending until the server has it.
          synced: signedIn ? false : undefined
        },
        { day: todayKey, at }
      );
      // A guest's log lives here; an offline learner's waits for the next merge.
      if (!signedIn || serverStatus !== 'online') return;

      const isThis = (entry: MissEntry) => entry.challengeId === challenge.id && entry.at === at;
      api
        .recordMisses([
          {
            challengeId: challenge.id,
            ...(isCode ? { code: submission.code } : { answer: submission.answer }),
            context,
            final: options.final === true,
            at
          }
        ])
        .then((res) => {
          activityLog.markSynced(isThis);
          activityLog.adoptDay(res.today);
          activityLog.adoptMisses(res.misses);
        })
        .catch((err) => {
          // Unreachable: it stays pending and goes up with the next merge.
          // Refused (a cap, an unknown lesson): there is nothing to retry.
          if (!(err instanceof OfflineError)) activityLog.markSynced(isThis);
        });
    },
    [user, serverStatus, todayKey, activityLog]
  );

  /**
   * Beginner teaching is a purely local, per-browser UI affordance ("have I
   * seen this explanation before") - it does not earn XP and is never
   * verified by the server, so it stays out of the reconciliation path above.
   */
  const markConceptSeen = useCallback((conceptId: string) => {
    setStats((prev) =>
      prev.seenConcepts.includes(conceptId) ? prev : { ...prev, seenConcepts: [...prev.seenConcepts, conceptId] }
    );
  }, []);

  const executeCode = useCallback(
    (
      code: string,
      language: SupportedLanguage = 'javascript',
      entryFunction?: string,
      testCases: TestCase[] = [],
      options: Pick<ExecuteOptions, 'onProgress' | 'stdin'> = {}
    ) =>
      compilerService.executeCode(code, language, {
        entryFunction,
        testCases,
        onProgress: options.onProgress,
        stdin: options.stdin,
        preferLocal: serverStatus !== 'online'
      }),
    [serverStatus]
  );

  /* -------------------------------------------------------------- account */

  const adoptSession = useCallback(
    (profile: UserProfile, progress: any) => {
      setUser(profile);
      // Login, /auth/me and a merge all hand over the streak already worked
      // out on the learner's own day: taken as it is.
      setStats((prev) => ({
        ...adoptAccountProgress(prev, progress, settingsRef.current.levels),
        ...entitlementsOf(profile),
        ownerId: profile.id
      }));
    },
    []
  );

  /**
   * What local progress may be carried into an account on sign-in.
   *
   * Only GUEST progress (no owner) is merged. Anything tagged with a different
   * account's id belongs to whoever used this browser before - on a shared or
   * lab machine, signing in used to hand the next user all of the previous
   * user's solves. Progress already tagged with THIS account is the server's
   * own cache and needs no merge (the session-restore path reconciles it).
   *
   * A guest who only got answers wrong (no solves yet) still has something to
   * carry: their misses. The activity log goes along only when it is a
   * guest's too.
   */
  const mergeableGuestProgress = useCallback((): { stats: UserStats; activity?: ReturnType<typeof trimActivityForMerge> } | null => {
    if (stats.ownerId) return null;
    const log = activityRef.current;
    const guestLog = !log.ownerId;
    const hasMisses = guestLog && (Object.keys(log.misses).length > 0 || log.missLog.length > 0);
    if (stats.completedChallenges.length === 0 && !hasMisses) return null;
    return { stats, activity: guestLog ? activityForMerge(stats) : undefined };
  }, [stats, activityRef, activityForMerge]);

  /**
   * Everything after a successful sign-in: carry the guest's progress and
   * activity into the account (the server re-prices it and merges the log
   * idempotently), then adopt the account's progress and activity.
   * Resolves once the activity is in; callers that want the modal to close
   * sooner need not wait for it.
   */
  const enterAccount = useCallback(
    async (profile: UserProfile, serverProgress: any): Promise<void> => {
      let progress = serverProgress;
      let account = profile;
      let mergedActivity: ActivityView | null = null;
      const guest = mergeableGuestProgress();
      if (guest) {
        try {
          const merged = await api.mergeProgress(guest.stats, guest.activity, guestPreferences());
          progress = merged.progress;
          mergedActivity = merged.activity ?? null;
          // The guest's sound choice, where the account had none.
          if (merged.preferences) account = { ...profile, preferences: { ...profile.preferences, ...merged.preferences } };
          const skipped = skippedLockedMessage(merged.skippedLocked);
          if (skipped) notify(skipped, 'info');
        } catch {
          /* keep the server copy */
        }
      }
      adoptSession(account, progress);
      await adoptAccountActivity(profile.id, mergedActivity);
      // Sound on or off: a choice made here goes up, else the account's is remembered here.
      void reconcileAccountPreferences(account);
      // The bank as this account may see it: a premium stage it has unlocked
      // arrives in full, one it has not as stubs. Not awaited - the sign-in
      // window closes now and the lessons swap in when they land.
      void reloadContent();
    },
    [mergeableGuestProgress, guestPreferences, adoptSession, adoptAccountActivity, reconcileAccountPreferences, reloadContent, notify]
  );

  const loginWithEmail = useCallback(
    async (email: string, password: string) => {
      const res = await api.login(email, password);
      await enterAccount(res.user, res.progress);
      // Not awaited: the modal should close now, and the editor picks the
      // drafts up as soon as they land.
      restoreDrafts(res.user.id);
      eventBus.emit('auth:signedIn', { user: res.user });
      notify(`Welcome back, ${res.user.username}.`, 'success');
    },
    [enterAccount, restoreDrafts, notify]
  );

  const signupWithEmail = useCallback(
    async (email: string, username: string, password: string) => {
      const res = await api.register(email, username, password);
      await enterAccount(res.user, res.progress);
      restoreDrafts(res.user.id);
      eventBus.emit('auth:signedIn', { user: res.user });
      notify(`Account created. Welcome, ${res.user.username}.`, 'success');
    },
    [enterAccount, restoreDrafts, notify]
  );

  /**
   * The other way in: Google or GitHub. The provider exchange happened
   * entirely on the server, and /auth/callback hands us nothing but a
   * CodeQuest token - no provider token, no email, nothing to verify here.
   */
  const adoptToken = useCallback(
    async (token: string) => {
      if (!token) throw new Error('That sign-in link did not carry a token.');
      setToken(token);
      let res: { user: UserProfile; progress: any };
      try {
        res = await api.me();
      } catch (err) {
        // A token the server will not accept is worse than none: drop it
        // rather than leave the app half signed in - and with it whatever
        // account's code was still in memory.
        setToken(null);
        clearDraftsFromMemory();
        throw err;
      }

      await enterAccount(res.user, res.progress);
      await restoreDrafts(res.user.id);
      eventBus.emit('auth:signedIn', { user: res.user });
      notify(`Signed in as ${res.user.username}.`, 'success');
    },
    [enterAccount, restoreDrafts, clearDraftsFromMemory, notify]
  );

  const continueAsGuest = useCallback(() => {
    // A guest has no account, so nothing to buy against: no entitlements.
    setUser({
      id: 'guest',
      email: '',
      username: 'Guest',
      isPremium: false,
      unlockedStages: [],
      provider: 'guest'
    });
    setStats((prev) => ({ ...prev, isPremium: false, unlockedStages: [] }));
    notify('Playing as a guest. Progress is saved in this browser only.', 'info');
  }, [notify]);

  const logout = useCallback(async () => {
    // Anything solved while the server was unreachable exists only here. Push
    // it up before clearing, or signing out would be the one action that
    // loses work.
    // Wrong answers recorded while it was unreachable are waiting too.
    let synced = true;
    const log = activityRef.current;
    const logIsTheirs = Boolean(user) && (!log.ownerId || log.ownerId === user?.id);
    const pendingMisses = logIsTheirs && unsyncedMisses(log).length > 0;
    if (user && user.provider !== 'guest' && getToken() && (stats.completedChallenges.length > 0 || pendingMisses)) {
      try {
        // Their own log sends only what the server has not taken yet - small
        // enough that signing out never trips the body limit.
        const merged = await api.mergeProgress(stats, logIsTheirs ? activityForMerge(stats, { pendingOnly: Boolean(log.ownerId) }) : undefined);
        const skipped = skippedLockedMessage(merged?.skippedLocked);
        if (skipped) notify(skipped, 'info');
      } catch {
        synced = false;
      }
    }

    // Same reasoning for code that has not been written up yet.
    flushAllDrafts();

    if (!synced) {
      notify('Could not reach the server to save your latest progress. Try again in a moment.', 'error');
      return;
    }

    setToken(null);
    setUser(null);
    // The account's progress lives on the server; the local copy is a cache
    // and must not be left for the next person who signs in on this browser.
    setStats({ ...INITIAL_STATS });
    // So is their activity log - days and wrong answers.
    resetActivity();
    // The same goes for the code they were writing: it is on the account now.
    clearDraftsFromMemory();
    eventBus.emit('auth:signedOut', {});
    notify('Signed out. Your progress is saved to your account.', 'info');
    // Back to the bank a visitor sees: premium stages as stubs again.
    void reloadContent();
  }, [user, stats, activityRef, activityForMerge, resetActivity, flushAllDrafts, clearDraftsFromMemory, notify, reloadContent]);

  const refreshAccount = useCallback(async () => {
    // Only a real account has anything to refresh; a guest owns nothing.
    if (!getToken()) return;
    const { user: me } = await api.me();
    // Content first, then the entitlements: a stage just bought must not
    // show as unlocked while its lessons are still the stubs from before.
    await reloadContent();
    setUser(me);
    setStats((prev) => ({ ...prev, ...entitlementsOf(me), ownerId: me.id }));
    await restoreDrafts(me.id);
  }, [restoreDrafts, reloadContent]);
  // For completeChallenge, which is declared above and must not depend on it.
  refreshAccountRef.current = refreshAccount;

  const { clearMisses } = activityLog;
  const habitRules = habitState.rules;
  const resetProgress = useCallback(async () => {
    // Purchases are not progress: keep what the server says is unlocked. The
    // streak history is kept too: the current run is closed into it as
    // ended by a reset, and freezes go back to the starting number (the
    // server does the same).
    const streak = resetHabit(streakFieldsOf(stats, habitRules), todayKey, habitRules);
    setStats({ ...INITIAL_STATS, ...streak, isPremium: stats.isPremium, unlockedStages: stats.unlockedStages ?? [] });
    // The wrong answers go with the progress; the days are history and stay
    // (the server does the same).
    clearMisses();
    eventBus.emit('progress:reset', {});
    if (user && user.provider !== 'guest' && serverStatus === 'online' && getToken()) {
      try {
        const res = await api.resetProgress();
        // The server's own record of the history it kept.
        const habit = res?.progress?.habit;
        if (habit && typeof habit === 'object') setStats((prev) => ({ ...prev, habit }));
      } catch {
        notify('Progress cleared here, but the server copy could not be reset.', 'error');
        return;
      }
    }
    notify('Progress reset. Back to Stage 01.', 'info');
  }, [stats, habitRules, todayKey, clearMisses, user, serverStatus, notify]);

  const refreshLeaderboard = useCallback(async () => {
    try {
      const { leaderboard: rows } = await api.leaderboard();
      setLeaderboard(rows);
    } catch {
      // Keep whatever was on screen. Clearing to [] made a failed request
      // indistinguishable from an empty board, and the dashboard then told a
      // user with accounts on it "No accounts yet - sign up and you will be first".
    }
  }, []);

  useEffect(() => {
    if (serverStatus === 'online') refreshLeaderboard();
  }, [serverStatus, refreshLeaderboard]);

  const value = useMemo<SessionContextType>(
    () => ({
      contentReady,
      stages,
      allChallenges,
      challengeById,
      tracks,
      activeTrack,
      selectedTrackId,
      setSelectedTrack,
      learnerStages,
      learnerChallenges,
      learningMode,
      setLearningMode,
      settings,
      settingsRevision,
      stats,
      activity,
      todayKey,
      today,
      timeZone: zone,
      habits,
      goalOptions,
      dailyGoal,
      dailyGoalId,
      setDailyGoal,
      adoptDeviceTimeZone,
      streakStrip: streakStripFor,
      isHabitBannerDismissed: habitState.isDismissed,
      dismissHabitBanner: habitState.dismiss,
      user,
      serverStatus,
      judge0Configured,
      runtimes,
      soundOn,
      setSoundOn,
      playSound,
      completeChallenge,
      recordMiss,
      markConceptSeen,
      executeCode,
      drafts,
      draftFor,
      saveDraft,
      flushDraft,
      clearDraft,
      draftStatus,
      loginWithEmail,
      signupWithEmail,
      continueAsGuest,
      logout,
      oauthProviders,
      adoptToken,
      refreshAccount,
      reloadContent,
      resetProgress,
      leaderboard,
      refreshLeaderboard,
      celebrate,
      holdCelebrations: celebrationHold.hold,
      releaseCelebrations: celebrationHold.release,
      celebrateOrHold: celebrationHold.celebrateOrHold
    }),
    [
      settings,
      settingsRevision,
      activity,
      todayKey,
      today,
      zone,
      habits,
      goalOptions,
      dailyGoal,
      dailyGoalId,
      setDailyGoal,
      adoptDeviceTimeZone,
      streakStripFor,
      habitState.isDismissed,
      habitState.dismiss,
      recordMiss,
      contentReady,
      stages,
      allChallenges,
      challengeById,
      tracks,
      activeTrack,
      selectedTrackId,
      setSelectedTrack,
      learnerStages,
      learnerChallenges,
      learningMode,
      setLearningMode,
      stats,
      user,
      serverStatus,
      judge0Configured,
      runtimes,
      soundOn,
      setSoundOn,
      playSound,
      completeChallenge,
      markConceptSeen,
      executeCode,
      drafts,
      draftFor,
      saveDraft,
      flushDraft,
      clearDraft,
      draftStatus,
      loginWithEmail,
      signupWithEmail,
      continueAsGuest,
      logout,
      oauthProviders,
      adoptToken,
      refreshAccount,
      reloadContent,
      resetProgress,
      leaderboard,
      refreshLeaderboard,
      celebrate,
      celebrationHold
    ]
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
};

export const useSession = (): SessionContextType => {
  const context = useContext(SessionContext);
  if (!context) throw new Error('useSession must be used within a SessionProvider');
  return context;
};
