import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState
} from 'react';
import confetti from 'canvas-confetti';
import {
  Challenge,
  ExecutionResult,
  LeaderboardEntry,
  Stage,
  SupportedLanguage,
  TestCase,
  UserProfile,
  UserStats
} from '../types';
import { applyProgress, contentService } from '../services/contentService';
import { compilerService, ExecuteOptions } from '../services/compilerService';
import { api, ApiError, OfflineError, getToken, setToken } from '../lib/api';
import { STORAGE_KEYS, readJson, readString, writeJson, writeString, remove } from '../lib/storage';
import { currentStreak, dayKey, levelFromXp, nextStreak, xpForSolve } from '../lib/leveling';

export type ServerStatus = 'checking' | 'online' | 'offline';

export interface Toast {
  id: number;
  message: string;
  tone: 'info' | 'success' | 'error';
}

export interface SolveOptions {
  attempts?: number;
  hintsUsed?: number;
  /** The answer as submitted, so the server can verify it before paying XP. */
  answer?: unknown;
  /** The code as submitted, for coding challenges. */
  code?: string;
}

export interface GameContextType {
  /* content */
  stages: Stage[];
  allChallenges: Challenge[];
  challengeById: (id: string) => Challenge | undefined;

  /* player */
  stats: UserStats;
  user: UserProfile | null;
  serverStatus: ServerStatus;

  /* chrome */
  theme: 'light' | 'dark';
  toggleTheme: () => void;
  toasts: Toast[];
  notify: (message: string, tone?: Toast['tone']) => void;
  dismissToast: (id: number) => void;

  /* practice session */
  activeStage: Stage | null;
  activeChallengeIndex: number;
  openPractice: (stageId?: string, challengeId?: string) => void;
  closePractice: () => void;
  goToChallenge: (index: number) => void;

  /* modals */
  isAuthModalOpen: boolean;
  openAuthModal: () => void;
  closeAuthModal: () => void;
  isSubModalOpen: boolean;
  openSubModal: () => void;
  closeSubModal: () => void;

  /* actions */
  completeChallenge: (challenge: Challenge, options?: SolveOptions) => Promise<number>;
  executeCode: (
    code: string,
    language?: SupportedLanguage,
    entryFunction?: string,
    testCases?: TestCase[],
    options?: Pick<ExecuteOptions, 'onProgress'>
  ) => Promise<ExecutionResult>;

  /* account */
  loginWithEmail: (email: string, password: string) => Promise<void>;
  signupWithEmail: (email: string, username: string, password: string) => Promise<void>;
  continueAsGuest: () => void;
  logout: () => Promise<void>;
  upgradeToPro: () => Promise<void>;
  resetProgress: () => Promise<void>;

  leaderboard: LeaderboardEntry[];
  refreshLeaderboard: () => Promise<void>;

  celebrate: () => void;
}

const GameContext = createContext<GameContextType | undefined>(undefined);

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
  attempts: {},
  isPremium: false
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
    attempts: saved.attempts && typeof saved.attempts === 'object' ? saved.attempts : {},
    isPremium: Boolean(saved.isPremium)
  };
}

function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
}

export const GameProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  /* ---------------------------------------------------------------- theme */
  const [theme, setTheme] = useState<'light' | 'dark'>(() =>
    readString(STORAGE_KEYS.theme) === 'dark' ? 'dark' : 'light'
  );

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    writeString(STORAGE_KEYS.theme, theme);
  }, [theme]);

  /* --------------------------------------------------------------- player */
  const [user, setUser] = useState<UserProfile | null>(() =>
    readJson<UserProfile | null>(STORAGE_KEYS.user, null)
  );
  const [stats, setStats] = useState<UserStats>(() => hydrateStats(readJson(STORAGE_KEYS.stats, null)));
  const [serverStatus, setServerStatus] = useState<ServerStatus>('checking');
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

  /* -------------------------------------------------------------- content */
  const [bundle, setBundle] = useState(() => contentService.load());

  const stages = useMemo(() => applyProgress(bundle.stages, stats), [bundle.stages, stats]);
  const challengeById = useCallback((id: string) => bundle.byId.get(id), [bundle.byId]);

  /* --------------------------------------------------------------- toasts */
  const [toasts, setToasts] = useState<Toast[]>([]);
  const toastId = useRef(0);

  const dismissToast = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const notify = useCallback(
    (message: string, tone: Toast['tone'] = 'info') => {
      const id = ++toastId.current;
      setToasts((prev) => [...prev.slice(-3), { id, message, tone }]);
      window.setTimeout(() => dismissToast(id), tone === 'error' ? 7000 : 4000);
    },
    [dismissToast]
  );

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

    (async () => {
      try {
        await waitForServer();
        if (cancelled) return;
        setServerStatus('online');

        // Refresh content in case challenges were edited since the last build.
        const fresh = await contentService.loadFromApi();
        if (!cancelled && fresh) setBundle(fresh);

        // Restore the session if a token survived a reload.
        if (getToken()) {
          try {
            const { user: me, progress } = await api.me();
            if (cancelled) return;
            setUser(me);

            // Anything solved while the API was unreachable lives only in this
            // browser, and the server's copy is behind. Spreading the server
            // response over local state would delete that work on the next
            // load, so push the local copy up first and adopt the union.
            const local = statsRef.current;
            const serverSolved = new Set(progress.completedChallenges ?? []);
            const localIsAhead =
              (local.completedChallenges ?? []).some((id) => !serverSolved.has(id)) ||
              local.xp > (progress.xp ?? 0);

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
              isPremium: me.isPremium
            }));
          } catch {
            setToken(null);
          }
        }
      } catch {
        if (!cancelled) setServerStatus('offline');
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  /* ------------------------------------------------------- practice session */
  const [activeStageId, setActiveStageId] = useState<string | null>(null);
  const [activeChallengeIndex, setActiveChallengeIndex] = useState(0);
  const [isAuthModalOpen, setAuthModalOpen] = useState(false);
  const [isSubModalOpen, setSubModalOpen] = useState(false);

  const activeStage = useMemo(
    () => (activeStageId ? stages.find((s) => s.id === activeStageId) ?? null : null),
    [activeStageId, stages]
  );

  const openPractice = useCallback(
    (stageId?: string, challengeId?: string) => {
      const target =
        (stageId && stages.find((s) => s.id === stageId)) ||
        stages.find((s) => s.state === 'In progress') ||
        stages.find((s) => s.challenges.length > 0);

      if (!target) {
        notify('No challenges are available yet.', 'error');
        return;
      }
      if (target.isPremium && !stats.isPremium) {
        setSubModalOpen(true);
        return;
      }
      if (target.challenges.length === 0) {
        notify(`${target.name} has no challenges yet.`, 'error');
        return;
      }

      let index = 0;
      if (challengeId) {
        const found = target.challenges.findIndex((c) => c.id === challengeId);
        if (found >= 0) index = found;
      } else {
        // Drop the player at the first thing they have not solved.
        const firstUnsolved = target.challenges.findIndex(
          (c) => !stats.completedChallenges.includes(c.id)
        );
        index = firstUnsolved >= 0 ? firstUnsolved : 0;
      }

      setActiveStageId(target.id);
      setActiveChallengeIndex(index);
    },
    [stages, stats.isPremium, stats.completedChallenges, notify]
  );

  const closePractice = useCallback(() => {
    setActiveStageId(null);
    setActiveChallengeIndex(0);
  }, []);

  const goToChallenge = useCallback((index: number) => {
    setActiveChallengeIndex(Math.max(0, index));
  }, []);

  // Body scroll lock while any modal is open.
  const anyModalOpen = Boolean(activeStageId) || isAuthModalOpen || isSubModalOpen;
  useEffect(() => {
    if (!anyModalOpen) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, [anyModalOpen]);

  /* -------------------------------------------------------------- actions */

  const celebrate = useCallback(() => {
    if (prefersReducedMotion()) return;
    confetti({
      particleCount: 70,
      spread: 68,
      origin: { y: 0.65 },
      disableForReducedMotion: true,
      colors: ['#4839FF', '#FFB020', '#00B873', '#FF5A4E']
    });
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

      if (levelledUp) notify(`Level ${optimistic.level} reached.`, 'success');
      else if (awarded > 0) notify(`+${awarded} XP`, 'success');

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
            isPremium: prev.isPremium
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
    [stats, user, serverStatus, celebrate, notify]
  );

  const executeCode = useCallback(
    (
      code: string,
      language: SupportedLanguage = 'javascript',
      entryFunction?: string,
      testCases: TestCase[] = [],
      options: Pick<ExecuteOptions, 'onProgress'> = {}
    ) =>
      compilerService.executeCode(code, language, {
        entryFunction,
        testCases,
        onProgress: options.onProgress,
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
        isPremium: profile.isPremium
      }));
    },
    []
  );

  const loginWithEmail = useCallback(
    async (email: string, password: string) => {
      const res = await api.login(email, password);
      // Carry anything solved as a guest into the account.
      let progress = res.progress;
      if (stats.completedChallenges.length > 0) {
        try {
          progress = (await api.mergeProgress(stats)).progress;
        } catch {
          /* keep the server copy */
        }
      }
      adoptSession(res.user, progress);
      notify(`Welcome back, ${res.user.username}.`, 'success');
    },
    [stats, adoptSession, notify]
  );

  const signupWithEmail = useCallback(
    async (email: string, username: string, password: string) => {
      const res = await api.register(email, username, password);
      let progress = res.progress;
      if (stats.completedChallenges.length > 0) {
        try {
          progress = (await api.mergeProgress(stats)).progress;
        } catch {
          /* keep the server copy */
        }
      }
      adoptSession(res.user, progress);
      notify(`Account created. Welcome, ${res.user.username}.`, 'success');
    },
    [stats, adoptSession, notify]
  );

  const continueAsGuest = useCallback(() => {
    setUser({
      id: 'guest',
      email: '',
      username: 'Guest',
      isPremium: stats.isPremium ?? false,
      provider: 'guest'
    });
    notify('Playing as a guest. Progress is saved in this browser only.', 'info');
  }, [stats.isPremium, notify]);

  const logout = useCallback(async () => {
    setToken(null);
    setUser(null);
    notify('Signed out. Your local progress is still here.', 'info');
  }, [notify]);

  const upgradeToPro = useCallback(async () => {
    if (user && user.provider !== 'guest' && serverStatus === 'online' && getToken()) {
      try {
        const { user: updated } = await api.upgradePro();
        setUser(updated);
        setStats((prev) => ({ ...prev, isPremium: true }));
        celebrate();
        notify('Pro unlocked. Stages 09 and 10 are open.', 'success');
        return;
      } catch {
        /* fall through to the local unlock */
      }
    }
    setStats((prev) => ({ ...prev, isPremium: true }));
    setUser((prev) => (prev ? { ...prev, isPremium: true } : prev));
    celebrate();
    notify('Pro unlocked locally. No payment processor is wired up in this build.', 'success');
  }, [user, serverStatus, celebrate, notify]);

  const resetProgress = useCallback(async () => {
    setStats({ ...INITIAL_STATS, isPremium: stats.isPremium });
    closePractice();
    if (user && user.provider !== 'guest' && serverStatus === 'online' && getToken()) {
      try {
        await api.resetProgress();
      } catch {
        notify('Progress cleared here, but the server copy could not be reset.', 'error');
        return;
      }
    }
    notify('Progress reset. Back to Stage 01.', 'info');
  }, [stats.isPremium, user, serverStatus, closePractice, notify]);

  const refreshLeaderboard = useCallback(async () => {
    try {
      const { leaderboard: rows } = await api.leaderboard();
      setLeaderboard(rows);
    } catch {
      setLeaderboard([]);
    }
  }, []);

  useEffect(() => {
    if (serverStatus === 'online') refreshLeaderboard();
  }, [serverStatus, refreshLeaderboard]);

  const value = useMemo<GameContextType>(
    () => ({
      stages,
      allChallenges: bundle.challenges,
      challengeById,
      stats,
      user,
      serverStatus,
      theme,
      toggleTheme: () => setTheme((t) => (t === 'light' ? 'dark' : 'light')),
      toasts,
      notify,
      dismissToast,
      activeStage,
      activeChallengeIndex,
      openPractice,
      closePractice,
      goToChallenge,
      isAuthModalOpen,
      openAuthModal: () => setAuthModalOpen(true),
      closeAuthModal: () => setAuthModalOpen(false),
      isSubModalOpen,
      openSubModal: () => setSubModalOpen(true),
      closeSubModal: () => setSubModalOpen(false),
      completeChallenge,
      executeCode,
      loginWithEmail,
      signupWithEmail,
      continueAsGuest,
      logout,
      upgradeToPro,
      resetProgress,
      leaderboard,
      refreshLeaderboard,
      celebrate
    }),
    [
      stages,
      bundle.challenges,
      challengeById,
      stats,
      user,
      serverStatus,
      theme,
      toasts,
      notify,
      dismissToast,
      activeStage,
      activeChallengeIndex,
      openPractice,
      closePractice,
      goToChallenge,
      isAuthModalOpen,
      isSubModalOpen,
      completeChallenge,
      executeCode,
      loginWithEmail,
      signupWithEmail,
      continueAsGuest,
      logout,
      upgradeToPro,
      resetProgress,
      leaderboard,
      refreshLeaderboard,
      celebrate
    ]
  );

  return <GameContext.Provider value={value}>{children}</GameContext.Provider>;
};

export const useGame = (): GameContextType => {
  const context = useContext(GameContext);
  if (!context) throw new Error('useGame must be used within a GameProvider');
  return context;
};
