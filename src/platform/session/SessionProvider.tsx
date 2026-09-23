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
  Challenge,
  CodeDraft,
  ExecutionResult,
  LanguageTrack,
  LearningMode,
  LeaderboardEntry,
  Stage,
  SupportedLanguage,
  TestCase,
  UserProfile,
  UserStats
} from '@/types';
import { useToast } from '@/ui';
import { eventBus } from '../events';
import { applyProgressByTrack, stagesForTrack } from '../progress/stages';
import { loadFromApi } from './content';
import type { ContentBundle } from './content';
import { compilerService, ExecuteOptions } from '../execution/compilerService';
import { api, ApiError, OfflineError, getToken, setToken } from '../api-client/api';
import type { OAuthProviders, RuntimeInfo } from '../api-client/api';
import { STORAGE_KEYS, readJson, readString, writeJson, writeString, remove } from '../storage/storage';
import { currentStreak, dayKey, levelFromXp, nextStreak, xpForSolve } from '../xp-leveling/leveling';

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

  /* player */
  stats: UserStats;
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

  /* actions */
  completeChallenge: (challenge: Challenge, options?: SolveOptions) => Promise<number>;
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
  resetProgress: () => Promise<void>;

  leaderboard: LeaderboardEntry[];
  refreshLeaderboard: () => Promise<void>;

  celebrate: () => void;
}

const SessionContext = createContext<SessionContextType | undefined>(undefined);

/* Not exported: a non-component export from this file breaks React Fast
   Refresh, which turns every edit here into a full remount. */
const INITIAL_STATS: UserStats = {
  xp: 0,
  level: 1,
  streak: 0,
  bestStreak: 0,
  lastActiveDay: null,
  completedChallenges: [],
  completedStages: [],
  seenConcepts: [],
  attempts: {},
  isPremium: false,
  unlockedStages: []
};

/** Old saves are missing fields added later; fill them in rather than crashing. */
function hydrateStats(raw: unknown): UserStats {
  const saved = (raw ?? {}) as Partial<UserStats>;
  const xp = Number(saved.xp) || 0;
  return {
    ...INITIAL_STATS,
    ...saved,
    xp,
    level: levelFromXp(xp),
    streak: currentStreak(Number(saved.streak) || 0, saved.lastActiveDay ?? null),
    bestStreak: Number(saved.bestStreak) || Number(saved.streak) || 0,
    completedChallenges: Array.isArray(saved.completedChallenges) ? saved.completedChallenges : [],
    completedStages: Array.isArray(saved.completedStages) ? saved.completedStages : [],
    seenConcepts: Array.isArray(saved.seenConcepts) ? saved.seenConcepts : [],
    attempts: saved.attempts && typeof saved.attempts === 'object' ? saved.attempts : {},
    isPremium: Boolean(saved.isPremium),
    // A cached copy of what the server said last time; the next restore overwrites it.
    unlockedStages: Array.isArray(saved.unlockedStages) ? saved.unlockedStages.filter((id) => typeof id === 'string') : []
  };
}

/** At most one draft write per challenge in this window, on the trailing edge. */
const DRAFT_DEBOUNCE_MS = 1500;

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

  /* --------------------------------------------------------------- player */
  const [user, setUser] = useState<UserProfile | null>(() =>
    readJson<UserProfile | null>(STORAGE_KEYS.user, null)
  );
  const [stats, setStats] = useState<UserStats>(() => hydrateStats(readJson(STORAGE_KEYS.stats, null)));
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

  const stages = useMemo(
    () => (bundle ? applyProgressByTrack(bundle.stages, visibleTracks, stats) : NO_STAGES),
    [bundle, visibleTracks, stats]
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
        const localIsAhead =
          localBelongsHere &&
          ((local.completedChallenges ?? []).some((id) => !serverSolved.has(id)) ||
            local.xp > (progress.xp ?? 0));

        let reconciled = progress;
        if (localIsAhead) {
          try {
            reconciled = (await api.mergeProgress(local)).progress;
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

        setStats((prev) => ({
          ...prev,
          ...reconciled,
          level: levelFromXp(reconciled.xp),
          streak: currentStreak(reconciled.streak, reconciled.lastActiveDay),
          ...entitlementsOf(me),
          ownerId: me.id
        }));

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

  const celebrate = useCallback(() => {
    if (prefersReducedMotion()) return;
    // Fetched on the first solve, not on page load - nobody celebrates before that.
    import('canvas-confetti').then(({ default: confetti }) =>
      confetti({
        particleCount: 70,
        spread: 68,
        origin: { y: 0.65 },
        disableForReducedMotion: true,
        colors: ['#4839FF', '#FFB020', '#00B873', '#FF5A4E']
      })
    );
  }, []);

  /**
   * Record a solve. Returns the XP actually awarded (0 when re-solving).
   * All side effects live here - never inside a setState updater, which React
   * may run twice.
   */
  const completeChallenge = useCallback(
    async (challenge: Challenge, options: SolveOptions = {}): Promise<number> => {
      const attempts = Math.max(1, options.attempts ?? 1);
      const hintsUsed = Math.max(0, options.hintsUsed ?? 0);
      const alreadySolved = stats.completedChallenges.includes(challenge.id);
      const awarded = alreadySolved ? 0 : xpForSolve(challenge.xpReward, attempts, hintsUsed);

      const today = dayKey();
      const streak = nextStreak(stats.streak, stats.lastActiveDay, today);
      const xp = stats.xp + awarded;

      const optimistic: UserStats = {
        ...stats,
        xp,
        level: levelFromXp(xp),
        streak,
        bestStreak: Math.max(stats.bestStreak, streak),
        lastActiveDay: today,
        completedChallenges: alreadySolved
          ? stats.completedChallenges
          : [...stats.completedChallenges, challenge.id],
        attempts: {
          ...stats.attempts,
          [challenge.id]: {
            challengeId: challenge.id,
            score: Math.max(stats.attempts[challenge.id]?.score ?? 0, Math.max(50, 100 - (attempts - 1) * 10 - hintsUsed * 10)),
            attempts: (stats.attempts[challenge.id]?.attempts ?? 0) + attempts,
            hintsUsed: (stats.attempts[challenge.id]?.hintsUsed ?? 0) + hintsUsed,
            solvedAt: new Date().toISOString()
          }
        }
      };

      const levelledUp = optimistic.level > stats.level;
      setStats(optimistic);
      celebrate();

      eventBus.emit('challenge:completed', {
        challenge,
        xpEarned: awarded,
        attempts,
        hintsUsed,
        firstTime: !alreadySolved
      });
      if (!alreadySolved) {
        const stage = stages.find((s) => s.id === challenge.stageId);
        const solved = new Set(optimistic.completedChallenges);
        const cleared =
          stage &&
          stage.challenges.length > 0 &&
          stage.challenges.every((c) => solved.has(c.id)) &&
          (!stage.test || solved.has(stage.test.id));
        if (cleared) eventBus.emit('stage:completed', { stageId: stage.id });
      }

      if (levelledUp) notify(`Level ${optimistic.level} reached! +${awarded} XP`, 'success');
      else if (awarded > 0) notify(challenge.uiPreview ? `+${awarded} XP · Assessment Completed!` : `+${awarded} XP`, 'success');

      // The server is authoritative when signed in; reconcile after the fact so
      // the UI never waits on the network to feel responsive.
      if (user && user.provider !== 'guest' && serverStatus === 'online' && getToken()) {
        try {
          const { progress } = await api.solve(challenge.id, attempts, hintsUsed, {
            answer: options.answer,
            code: options.code
          });
          setStats((prev) => ({
            ...prev,
            // Union rather than overwrite: anything solved locally while this
            // request was in flight must not be erased by an older snapshot.
            ...progress,
            xp: Math.max(prev.xp, progress.xp),
            completedChallenges: [...new Set([...prev.completedChallenges, ...progress.completedChallenges])],
            level: levelFromXp(Math.max(prev.xp, progress.xp)),
            streak: currentStreak(progress.streak, progress.lastActiveDay),
            // Progress carries no entitlements; keep the ones the profile gave us.
            isPremium: prev.isPremium,
            unlockedStages: prev.unlockedStages
          }));
        } catch (err) {
          if (err instanceof OfflineError) {
            // Kept locally; the next session restore pushes it up.
            notify('Server unreachable - this solve is saved here and will sync later.', 'info');
          } else if (err instanceof ApiError && err.status === 422) {
            // The server re-checked the submission and disagreed. Its verdict
            // wins: take the local award back rather than show XP that does
            // not exist on the leaderboard.
            setStats(stats);
            notify('The server did not accept that answer, so no XP was awarded.', 'error');
            return 0;
          } else {
            notify('Progress saved locally, but the server rejected it.', 'error');
          }
        }
      }

      return awarded;
    },
    [stats, stages, user, serverStatus, celebrate, notify]
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
      setStats((prev) => ({
        ...prev,
        ...progress,
        level: levelFromXp(progress.xp ?? 0),
        streak: currentStreak(progress.streak ?? 0, progress.lastActiveDay ?? null),
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
   */
  const mergeableGuestProgress = useCallback(
    (forUserId: string): UserStats | null => {
      if (stats.completedChallenges.length === 0) return null;
      if (stats.ownerId && stats.ownerId !== forUserId) return null;
      if (stats.ownerId === forUserId) return null;
      return stats;
    },
    [stats]
  );

  const loginWithEmail = useCallback(
    async (email: string, password: string) => {
      const res = await api.login(email, password);
      let progress = res.progress;
      const guest = mergeableGuestProgress(res.user.id);
      if (guest) {
        try {
          progress = (await api.mergeProgress(guest)).progress;
        } catch {
          /* keep the server copy */
        }
      }
      adoptSession(res.user, progress);
      // Not awaited: the modal should close now, and the editor picks the
      // drafts up as soon as they land.
      restoreDrafts(res.user.id);
      eventBus.emit('auth:signedIn', { user: res.user });
      notify(`Welcome back, ${res.user.username}.`, 'success');
    },
    [mergeableGuestProgress, adoptSession, restoreDrafts, notify]
  );

  const signupWithEmail = useCallback(
    async (email: string, username: string, password: string) => {
      const res = await api.register(email, username, password);
      let progress = res.progress;
      const guest = mergeableGuestProgress(res.user.id);
      if (guest) {
        try {
          progress = (await api.mergeProgress(guest)).progress;
        } catch {
          /* keep the server copy */
        }
      }
      adoptSession(res.user, progress);
      restoreDrafts(res.user.id);
      eventBus.emit('auth:signedIn', { user: res.user });
      notify(`Account created. Welcome, ${res.user.username}.`, 'success');
    },
    [mergeableGuestProgress, adoptSession, restoreDrafts, notify]
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

      let progress = res.progress;
      const guest = mergeableGuestProgress(res.user.id);
      if (guest) {
        try {
          progress = (await api.mergeProgress(guest)).progress;
        } catch {
          /* keep the server copy */
        }
      }
      adoptSession(res.user, progress);
      await restoreDrafts(res.user.id);
      eventBus.emit('auth:signedIn', { user: res.user });
      notify(`Signed in as ${res.user.username}.`, 'success');
    },
    [mergeableGuestProgress, adoptSession, restoreDrafts, clearDraftsFromMemory, notify]
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
    let synced = true;
    if (user && user.provider !== 'guest' && getToken() && stats.completedChallenges.length > 0) {
      try {
        await api.mergeProgress(stats);
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
    // The same goes for the code they were writing: it is on the account now.
    clearDraftsFromMemory();
    eventBus.emit('auth:signedOut', {});
    notify('Signed out. Your progress is saved to your account.', 'info');
  }, [user, stats, flushAllDrafts, clearDraftsFromMemory, notify]);

  const refreshAccount = useCallback(async () => {
    // Only a real account has anything to refresh; a guest owns nothing.
    if (!getToken()) return;
    const { user: me } = await api.me();
    setUser(me);
    setStats((prev) => ({ ...prev, ...entitlementsOf(me), ownerId: me.id }));
    await restoreDrafts(me.id);
  }, [restoreDrafts]);

  const resetProgress = useCallback(async () => {
    // Purchases are not progress: keep what the server says is unlocked.
    setStats({ ...INITIAL_STATS, isPremium: stats.isPremium, unlockedStages: stats.unlockedStages ?? [] });
    eventBus.emit('progress:reset', {});
    if (user && user.provider !== 'guest' && serverStatus === 'online' && getToken()) {
      try {
        await api.resetProgress();
      } catch {
        notify('Progress cleared here, but the server copy could not be reset.', 'error');
        return;
      }
    }
    notify('Progress reset. Back to Stage 01.', 'info');
  }, [stats.isPremium, stats.unlockedStages, user, serverStatus, notify]);

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
      stats,
      user,
      serverStatus,
      judge0Configured,
      runtimes,
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
      resetProgress,
      leaderboard,
      refreshLeaderboard,
      celebrate
    }),
    [
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
      resetProgress,
      leaderboard,
      refreshLeaderboard,
      celebrate
    ]
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
};

export const useSession = (): SessionContextType => {
  const context = useContext(SessionContext);
  if (!context) throw new Error('useSession must be used within a SessionProvider');
  return context;
};
