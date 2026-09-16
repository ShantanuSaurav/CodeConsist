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
} from '@/types';
import { useToast } from '@/ui';
import { eventBus } from '../events';
import { applyProgress } from '../progress/stages';
import { loadFromApi } from './content';
import type { ContentBundle } from './content';
import { compilerService, ExecuteOptions } from '../execution/compilerService';
import { api, ApiError, OfflineError, getToken, setToken } from '../api-client/api';
import { STORAGE_KEYS, readJson, writeJson, remove } from '../storage/storage';
import { currentStreak, dayKey, levelFromXp, nextStreak, xpForSolve } from '../xp-leveling/leveling';

export type ServerStatus = 'checking' | 'online' | 'offline';

export interface SolveOptions {
  attempts?: number;
  hintsUsed?: number;
  /** The answer as submitted, so the server can verify it before paying XP. */
  answer?: unknown;
  /** The code as submitted, for coding challenges. */
  code?: string;
}

export interface SessionContextType {
  /* content */
  stages: Stage[];
  allChallenges: Challenge[];
  challengeById: (id: string) => Challenge | undefined;

  /* player */
  stats: UserStats;
  user: UserProfile | null;
  serverStatus: ServerStatus;


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

interface SessionProviderProps {
  /** The bundled content bank. The app supplies it; the platform owns no content. */
  content: ContentBundle;
  children: React.ReactNode;
}

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

  /* -------------------------------------------------------------- content */
  const [bundle, setBundle] = useState<ContentBundle>(content);

  const stages = useMemo(() => applyProgress(bundle.stages, stats), [bundle.stages, stats]);
  const challengeById = useCallback((id: string) => bundle.byId.get(id), [bundle.byId]);

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
          isPremium: me.isPremium,
          ownerId: me.id
        }));
      } catch (err) {
        if (cancelled) return;
        if (err instanceof ApiError && err.status === 401) {
          // The token is expired or revoked. Say so - the old code dropped the
          // token silently and left the nav claiming the user was signed in
          // while every solve quietly stopped reaching the server.
          setToken(null);
          setUser(null);
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
        if (initial) await waitForServer();
        else await api.health();
        if (cancelled) return;
        const recovered = !wasOnline;
        wasOnline = true;
        setServerStatus('online');
        if (recovered) eventBus.emit('server:status', { online: true });

        if (recovered) {
          // Refresh content in case challenges were edited since the last build.
          const fresh = await loadFromApi();
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
    [stats, stages, user, serverStatus, celebrate, notify]
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
        isPremium: profile.isPremium,
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
      eventBus.emit('auth:signedIn', { user: res.user });
      notify(`Welcome back, ${res.user.username}.`, 'success');
    },
    [mergeableGuestProgress, adoptSession, notify]
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
      eventBus.emit('auth:signedIn', { user: res.user });
      notify(`Account created. Welcome, ${res.user.username}.`, 'success');
    },
    [mergeableGuestProgress, adoptSession, notify]
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

    if (!synced) {
      notify('Could not reach the server to save your latest progress. Try again in a moment.', 'error');
      return;
    }

    setToken(null);
    setUser(null);
    // The account's progress lives on the server; the local copy is a cache
    // and must not be left for the next person who signs in on this browser.
    setStats({ ...INITIAL_STATS });
    eventBus.emit('auth:signedOut', {});
    notify('Signed out. Your progress is saved to your account.', 'info');
  }, [user, stats, notify]);

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
  }, [stats.isPremium, user, serverStatus, notify]);

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
      stages,
      allChallenges: bundle.challenges,
      challengeById,
      stats,
      user,
      serverStatus,
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

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
};

export const useSession = (): SessionContextType => {
  const context = useContext(SessionContext);
  if (!context) throw new Error('useSession must be used within a SessionProvider');
  return context;
};
