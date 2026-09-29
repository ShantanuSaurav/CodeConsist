/**
 * Test-out and placement for the session (Phase 5).
 *
 *   - Signed in: the server decides and records everything
 *     (server/assessment-routes.js). What each stage allows is fetched from
 *     `GET /api/assessments/status` for the track on screen, again whenever
 *     the learner's progress or the rules change, and when a wait ends.
 *     Offline, nothing can start: an unlock must reach the account
 *     (`reason: 'offline'`, with the sentence the buttons show).
 *   - A guest: the same rules run here (./assessments.ts), over a log kept in
 *     this browser; a pass is written onto the local stats with the answer
 *     that passed it, which the server checks again at sign-in.
 *
 * A pass is credited like a solve: the day row, the streak and the goal (a
 * guest's goal bonus is paid here; a signed-in learner's only by the
 * server), `challenge:completed` for the stage test - and, when a record
 * ends, `assessment:finished`.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Dispatch, MutableRefObject, SetStateAction } from 'react';
import type { AssessmentRecord, AssessmentView, Challenge, UserProfile, UserStats } from '@/types';
import { ApiError, OfflineError, api, getToken } from '../api-client/api';
import type { AssessmentStatusResponse } from '../api-client/api';
import { dayRow } from '../activity/log';
import { eventBus } from '../events';
import { learnerSolve } from '../habits';
import { activeAssessment as activeRecordOf } from '../progress/access';
import type { PlacementEligibility, TestOutEligibility } from '../progress/access';
import type { PublicSettings } from '../settings/types';
import {
  LOCAL_ASSESSMENT_PREFIX,
  assessmentBlockText,
  finishLocalAssessment,
  localPlacementStatus,
  localTestOutStatus,
  readLocalAssessmentLog,
  recordLocalResult,
  startLocalAssessment,
  viewOf,
  withLocalPass,
  withRecord,
  writeLocalAssessmentLog
} from './assessments';
import type { AssessmentRequest, TrackChain } from './assessments';
import { levelFromXp } from '../xp-leveling/leveling';
import { statsAfterSolve } from './stats';
import type { ActivityLogApi } from './useActivityLog';
import type { HabitStateApi } from './useHabitState';

/** One stage's test-out, as the path shows it. */
export interface TestOutStatus extends TestOutEligibility {
  /** Signed in and the server cannot be reached: nothing can start (`reason: 'offline'`). */
  offline: boolean;
  /** The server's answer has not arrived yet. */
  pending: boolean;
}

/** A placement on one track, as the Learn page and the setup show it. */
export interface PlacementStatus extends PlacementEligibility {
  offline: boolean;
  pending: boolean;
}

export interface AssessmentStartResult {
  /** The record now running, or null when it could not start. */
  assessment: AssessmentView | null;
  /** Another test is already running: this one (offer to resume it). */
  running?: AssessmentView;
  /** Why it could not start, in the learner's words. */
  error?: string;
  reason?: string;
  retryAt?: string | null;
}

export interface AssessmentSubmitResult {
  /** The record after this test (null when nothing could be recorded). */
  assessment: AssessmentView | null;
  passed: boolean;
  /** XP the pass paid (0 otherwise). */
  awardedXp: number;
  /** The server checked the answer and did not accept it ('wrong', 'hints-not-allowed'): not counted, the run goes on. */
  rejected?: string;
  /** Nothing was recorded (offline, the runner busy, an error) - try again. */
  failed?: boolean;
  /** The record is over (it expired, or another tab ended it). */
  ended?: boolean;
  error?: string;
}

export interface AssessmentsApi {
  /** False while a signed-in learner is offline: test-outs cannot start then. */
  assessmentsAvailable: boolean;
  /** The learner's open test-out or placement, if any. */
  activeAssessment: AssessmentView | null;
  testOutStatus: (stageId: string) => TestOutStatus;
  placementStatus: (trackId: string) => PlacementStatus;
  refreshAssessmentStatus: () => Promise<void>;
  startAssessment: (request: AssessmentRequest) => Promise<AssessmentStartResult>;
  submitAssessment: (
    view: AssessmentView,
    challenge: Challenge,
    submission: { attempts: number; hintsUsed: number; answer?: unknown; code?: string }
  ) => Promise<AssessmentSubmitResult>;
  failAssessment: (view: AssessmentView, reason: 'gave-up' | 'out-of-runs', runs?: number) => Promise<AssessmentView | null>;
  finishAssessment: (view: AssessmentView) => Promise<AssessmentView | null>;
  /** Forget this browser's (a guest's) log: an account's progress has replaced the guest's. */
  resetLocalAssessments: () => void;
}

export interface AssessmentsInput {
  user: UserProfile | null;
  online: boolean;
  /**
   * The first check of the server has not answered yet: not online, but not
   * known to be offline either - the buttons wait (`pending`) rather than
   * saying there is no connection.
   */
  connecting?: boolean;
  stats: UserStats;
  statsRef: MutableRefObject<UserStats>;
  setStats: Dispatch<SetStateAction<UserStats>>;
  settings: PublicSettings;
  settingsRef: MutableRefObject<PublicSettings>;
  settingsRevision: number | null;
  /** The visible tracks, each with its stages in order and their states. */
  chains: TrackChain[];
  /** The track on screen: the one whose status is fetched. */
  trackId: string;
  activityLog: ActivityLogApi;
  habitState: HabitStateApi;
  todayKey: string;
  dailyGoalId: string | null;
  noteRevision: (revision: number | null | undefined) => void;
  onSignedOut: () => void;
}

const OFFLINE_TEST_OUT: TestOutStatus = { allowed: false, reason: 'offline' as never, retryAt: null, attemptsLeft: 0, offline: true, pending: false };
const PENDING_TEST_OUT: TestOutStatus = { allowed: false, reason: null, retryAt: null, attemptsLeft: 0, offline: false, pending: true };
const UNKNOWN_TEST_OUT: TestOutStatus = { allowed: false, reason: 'disabled', retryAt: null, attemptsLeft: 0, offline: false, pending: false };
const OFFLINE_PLACEMENT: PlacementStatus = { eligible: false, reason: 'offline' as never, retryAt: null, queue: [], offline: true, pending: false };
const PENDING_PLACEMENT: PlacementStatus = { eligible: false, reason: null, retryAt: null, queue: [], offline: false, pending: true };
const UNKNOWN_PLACEMENT: PlacementStatus = { eligible: false, reason: 'disabled', retryAt: null, queue: [], offline: false, pending: false };

/** The longest a "try again at" wait is watched for before the status is fetched again. */
const MAX_WAIT_WATCH_MS = 6 * 60 * 60 * 1000;

function passedStageIds(view: Pick<AssessmentRecord, 'results'>): string[] {
  return Object.entries(view.results ?? {})
    .filter(([, r]) => r?.outcome === 'passed')
    .map(([id]) => id);
}

export function useAssessments(input: AssessmentsInput): AssessmentsApi {
  const { user, online, connecting = false, stats, statsRef, setStats, settings, settingsRef, settingsRevision, chains, trackId, activityLog, habitState, todayKey, dailyGoalId, noteRevision, onSignedOut } =
    input;
  const signedIn = Boolean(user && user.provider !== 'guest' && getToken());
  const accountId = signedIn ? user?.id ?? null : null;

  /* ------------------------------------------------------ signed in */
  const [serverView, setServerView] = useState<{ owner: string; trackId: string; status: AssessmentStatusResponse } | null>(null);
  const fetching = useRef(0);

  const refreshAssessmentStatus = useCallback(async () => {
    if (!accountId || !online) return;
    const ticket = ++fetching.current;
    try {
      const status = await api.assessmentStatus(trackId);
      if (ticket === fetching.current) setServerView({ owner: accountId, trackId, status });
    } catch {
      /* offline, or an older server without the routes: the buttons stay as they were */
    }
  }, [accountId, online, trackId]);

  // Fetched again whenever what it depends on changes: the learner, the
  // track, their progress, the rules.
  const testedOutCount = Object.keys(stats.testedOut ?? {}).length;
  const solvedCount = stats.completedChallenges.length;
  useEffect(() => {
    if (!accountId || !online) return;
    const timer = window.setTimeout(() => void refreshAssessmentStatus(), 250);
    return () => window.clearTimeout(timer);
  }, [accountId, online, trackId, solvedCount, testedOutCount, settingsRevision, refreshAssessmentStatus]);

  /* ----------------------------------------------------------- guest */
  const [localLog, setLocalLog] = useState(readLocalAssessmentLog);
  const localLogRef = useRef(localLog);
  const saveLocalLog = useCallback((next: typeof localLog) => {
    localLogRef.current = next;
    setLocalLog(next);
    writeLocalAssessmentLog(next);
  }, []);

  // A wait that ends ("try again in 40 minutes") is shown ending: a guest's
  // status is worked out again, a signed-in learner's fetched again.
  const [clock, setClock] = useState(() => Date.now());
  const soonestWait = useMemo(() => {
    const now = Date.now();
    const times: number[] = [];
    if (serverView && accountId && serverView.owner === accountId) {
      for (const s of Object.values(serverView.status.testOut ?? {})) if (s?.retryAt) times.push(Date.parse(s.retryAt));
      if (serverView.status.placement?.retryAt) times.push(Date.parse(serverView.status.placement.retryAt));
      if (serverView.status.active?.expiresAt) times.push(Date.parse(serverView.status.active.expiresAt));
    } else if (!accountId) {
      for (const r of localLog.records) if (r.status === 'active') times.push(Date.parse(r.expiresAt));
    }
    const future = times.filter((t) => Number.isFinite(t) && t > now);
    return future.length ? Math.min(...future) : null;
  }, [serverView, accountId, localLog, clock]);
  useEffect(() => {
    if (soonestWait === null) return;
    const delay = soonestWait - Date.now() + 1000;
    if (delay > MAX_WAIT_WATCH_MS) return;
    const timer = window.setTimeout(() => {
      setClock(Date.now());
      void refreshAssessmentStatus();
    }, Math.max(1000, delay));
    return () => window.clearTimeout(timer);
  }, [soonestWait, refreshAssessmentStatus]);

  const stageStats = useMemo(
    () => ({ completedChallenges: stats.completedChallenges, testedOut: stats.testedOut, isPremium: stats.isPremium, unlockedStages: stats.unlockedStages }),
    [stats.completedChallenges, stats.testedOut, stats.isPremium, stats.unlockedStages]
  );

  const testOutStatus = useCallback(
    (stageId: string): TestOutStatus => {
      if (accountId) {
        if (!online) return connecting ? PENDING_TEST_OUT : OFFLINE_TEST_OUT;
        if (!serverView || serverView.owner !== accountId) return PENDING_TEST_OUT;
        const s = serverView.status.testOut?.[stageId];
        if (!s) return serverView.trackId === trackId ? UNKNOWN_TEST_OUT : PENDING_TEST_OUT;
        return { allowed: Boolean(s.allowed), reason: (s.reason ?? null) as TestOutStatus['reason'], retryAt: s.retryAt ?? null, attemptsLeft: Number(s.attemptsLeft) || 0, offline: false, pending: false };
      }
      const local = localTestOutStatus({ stageId, chains, log: localLog, rules: settings.testOut, stats: stageStats, now: new Date(clock) });
      return local ? { ...local, offline: false, pending: false } : UNKNOWN_TEST_OUT;
    },
    [accountId, online, connecting, serverView, trackId, chains, localLog, settings.testOut, stageStats, clock]
  );

  const placementStatus = useCallback(
    (wanted: string): PlacementStatus => {
      if (accountId) {
        if (!online) return connecting ? PENDING_PLACEMENT : OFFLINE_PLACEMENT;
        if (!serverView || serverView.owner !== accountId || serverView.trackId !== wanted || !serverView.status.placement) return PENDING_PLACEMENT;
        const p = serverView.status.placement;
        return { eligible: Boolean(p.eligible), reason: (p.reason ?? null) as PlacementStatus['reason'], retryAt: p.retryAt ?? null, queue: p.queue ?? [], offline: false, pending: false };
      }
      const local = localPlacementStatus({ trackId: wanted, chains, log: localLog, rules: settings.placement, stats: stageStats, now: new Date(clock) });
      return local ? { ...local, offline: false, pending: false } : UNKNOWN_PLACEMENT;
    },
    [accountId, online, connecting, serverView, chains, localLog, settings.placement, stageStats, clock]
  );

  const activeAssessment = useMemo<AssessmentView | null>(() => {
    if (accountId) return serverView && serverView.owner === accountId ? serverView.status.active ?? null : null;
    const record = activeRecordOf(localLog, new Date(clock));
    return record ? viewOf(record, new Date(clock)) : null;
  }, [accountId, serverView, localLog, clock]);

  /** Say a record is over, once: which stages it passed. */
  const announced = useRef(new Set<string>());
  const announceIfOver = useCallback((view: AssessmentView | null | undefined) => {
    if (!view || view.status === 'active' || announced.current.has(view.id)) return;
    announced.current.add(view.id);
    eventBus.emit('assessment:finished', { kind: view.kind, passedStageIds: passedStageIds(view) });
  }, []);

  /* ------------------------------------------------------------ start */
  const startAssessment = useCallback<AssessmentsApi['startAssessment']>(
    async (request) => {
      if (accountId) {
        if (!online) {
          return connecting
            ? { assessment: null, reason: 'connecting', error: 'Still connecting to the server - try again in a moment.' }
            : { assessment: null, reason: 'offline', error: assessmentBlockText('offline') };
        }
        try {
          const res = await api.startAssessment(request);
          void refreshAssessmentStatus();
          return { assessment: res.assessment };
        } catch (err) {
          if (err instanceof OfflineError) return { assessment: null, reason: 'offline', error: assessmentBlockText('offline') };
          if (err instanceof ApiError) {
            if (err.status === 401) {
              onSignedOut();
              return { assessment: null, reason: 'signed-out', error: err.message };
            }
            const payload = (err.payload ?? {}) as { assessment?: AssessmentView; retryAt?: string | null };
            if (err.reason === 'active-exists' && payload.assessment) return { assessment: null, running: payload.assessment, reason: 'active-exists', error: err.message };
            void refreshAssessmentStatus();
            return { assessment: null, reason: err.reason, retryAt: payload.retryAt ?? null, error: err.message };
          }
          return { assessment: null, error: err instanceof Error ? err.message : 'The test could not start.' };
        }
      }
      const now = new Date();
      const started = startLocalAssessment({
        request,
        chains,
        log: localLogRef.current,
        settings: { testOut: settingsRef.current.testOut, placement: settingsRef.current.placement, xp: settingsRef.current.xp },
        stats: statsRef.current,
        now
      });
      if (!started.ok) {
        if (started.active) return { assessment: null, running: viewOf(started.active, now), reason: 'active-exists', error: assessmentBlockText('active-exists') };
        return { assessment: null, reason: started.reason, retryAt: started.retryAt, error: assessmentBlockText(started.reason) };
      }
      saveLocalLog(started.log);
      return { assessment: viewOf(started.record, now) };
    },
    [accountId, online, connecting, refreshAssessmentStatus, onSignedOut, chains, settingsRef, statsRef, saveLocalLog]
  );

  /* ----------------------------------------------------------- submit */

  /** A guest's pass: the stats, the day row, the streak and the goal, as a local solve credits them. */
  const creditLocalPass = useCallback(
    (challenge: Challenge, stageId: string, record: AssessmentRecord, submission: { attempts: number; hintsUsed: number; answer?: unknown; code?: string }) => {
      const current = settingsRef.current;
      const at = new Date().toISOString();
      const day = todayKey;
      const pass = {
        challenge,
        stageId,
        record,
        attempts: submission.attempts,
        hintsUsed: submission.hintsUsed,
        submission: { code: submission.code, answer: submission.answer },
        xp: current.xp,
        levels: current.levels,
        at
      };
      const passed = withLocalPass(statsRef.current, pass);
      activityLog.applyEvent(
        { type: 'solve', challengeId: challenge.id, isTest: true, firstSolve: passed.firstSolve, awardedXp: passed.awarded, unitCompleted: false, perfectBonusXp: 0 },
        { day, at }
      );
      // The streak and the goal on today's row WITH this pass (the engine a solve runs).
      const habitContext = { settings: current, dailyGoalId, today: day, day: dayRow(activityLog.activityRef.current, day), at };
      const run = learnerSolve(passed.stats, habitContext);
      const goalBonus = run.events.goalMet ? run.events.bonusXp : 0;
      if (run.events.goalMet && run.events.goal) activityLog.applyEvent({ type: 'goal', goal: run.events.goal, bonusXp: goalBonus }, { day, at });
      habitState.announceSolve(
        day,
        {
          goalMet: run.events.goalMet,
          bonusXp: goalBonus,
          freezeEarned: run.events.freezeEarned,
          repaired: run.events.repaired,
          streakDay: run.events.streakDay,
          frozenDays: run.events.frozenDays
        },
        { streak: run.fields.streak, freezes: run.fields.habit.freezes }
      );
      // Written onto the stats as they are when it lands (pure, like a local Practice answer).
      setStats((prev) => {
        const next = withLocalPass(prev, pass).stats;
        const fields = learnerSolve(next, habitContext).fields;
        const total = next.xp + goalBonus;
        return {
          ...next,
          xp: total,
          level: levelFromXp(total, current.levels),
          streak: fields.streak,
          bestStreak: fields.bestStreak,
          lastActiveDay: fields.lastActiveDay,
          habit: fields.habit
        };
      });
      eventBus.emit('challenge:completed', { challenge, xpEarned: passed.awarded, attempts: submission.attempts, hintsUsed: submission.hintsUsed, firstTime: passed.firstSolve });
      return passed.awarded;
    },
    [settingsRef, statsRef, setStats, todayKey, dailyGoalId, activityLog, habitState]
  );

  const submitAssessment = useCallback<AssessmentsApi['submitAssessment']>(
    async (view, challenge, submission) => {
      const stageId = view.current;
      if (!stageId) return { assessment: view, passed: false, awardedXp: 0, ended: true };
      const local = view.id.startsWith(LOCAL_ASSESSMENT_PREFIX);

      if (!local) {
        if (!accountId || !online) return { assessment: view, passed: false, awardedXp: 0, failed: true, error: assessmentBlockText('offline') };
        const release = habitState.holdAnnouncements();
        try {
          const res = await api.submitAssessment(view.id, {
            stageId,
            attempts: submission.attempts,
            hintsUsed: submission.hintsUsed,
            ...(submission.code !== undefined ? { code: submission.code } : { answer: submission.answer })
          });
          noteRevision(res.settingsRevision);
          if (res.passed) {
            activityLog.adoptDay(res.today);
            if (res.progress) setStats((prev) => statsAfterSolve(prev, res.progress, { rulesChanged: false, curve: settingsRef.current.levels }));
            const events = res.habitEvents;
            if (events) {
              habitState.announceSolve(
                res.today?.day ?? todayKey,
                {
                  goalMet: Boolean(events.goalMet),
                  bonusXp: Math.max(0, Number(events.bonusXp) || 0),
                  freezeEarned: Boolean(events.freezeEarned),
                  repaired: Boolean(events.repaired),
                  streakDay: Boolean(events.streakDay),
                  frozenDays: Array.isArray(events.frozenDays) ? events.frozenDays : []
                },
                {
                  streak: typeof res.habits?.streak === 'number' ? res.habits.streak : Number(res.progress?.streak) || 0,
                  freezes: typeof res.habits?.freezes === 'number' ? res.habits.freezes : res.progress?.habit?.freezes ?? 0
                }
              );
            }
            eventBus.emit('challenge:completed', {
              challenge,
              xpEarned: Math.max(0, Number(res.awardedXp) || 0),
              attempts: submission.attempts,
              hintsUsed: submission.hintsUsed,
              firstTime: true
            });
          }
          announceIfOver(res.assessment);
          void refreshAssessmentStatus();
          return { assessment: res.assessment, passed: Boolean(res.passed), awardedXp: Math.max(0, Number(res.awardedXp) || 0) };
        } catch (err) {
          if (err instanceof OfflineError) return { assessment: view, passed: false, awardedXp: 0, failed: true, error: assessmentBlockText('offline') };
          if (err instanceof ApiError) {
            if (err.status === 401) {
              onSignedOut();
              return { assessment: view, passed: false, awardedXp: 0, failed: true, error: err.message };
            }
            if (err.status === 422) return { assessment: view, passed: false, awardedXp: 0, rejected: err.reason ?? 'wrong', error: err.message };
            const payload = (err.payload ?? {}) as { assessment?: AssessmentView };
            if (err.status === 409 && payload.assessment) {
              announceIfOver(payload.assessment);
              void refreshAssessmentStatus();
              return { assessment: payload.assessment, passed: false, awardedXp: 0, ended: true, error: err.message };
            }
            return { assessment: view, passed: false, awardedXp: 0, failed: true, error: err.message };
          }
          return { assessment: view, passed: false, awardedXp: 0, failed: true, error: err instanceof Error ? err.message : 'That could not be saved.' };
        } finally {
          release();
        }
      }

      // A guest's: judged here, by the record's own rules.
      const now = new Date();
      const record = localLogRef.current.records.find((r) => r.id === view.id);
      const live = record ? viewOf(record, now) : null;
      if (!record || !live || live.status !== 'active' || live.current !== stageId) {
        if (live) {
          saveLocalLog(withRecord(localLogRef.current, { ...record!, status: live.status, finishedAt: live.finishedAt }));
          announceIfOver(live);
        }
        return { assessment: live, passed: false, awardedXp: 0, ended: true, error: 'The time for this test ran out.' };
      }
      const result = recordLocalResult(record, {
        stageId,
        correct: true,
        attempts: submission.attempts,
        hintsUsed: submission.hintsUsed,
        xp: settingsRef.current.xp,
        at: now.toISOString()
      });
      const awarded = result.passed ? creditLocalPass(challenge, stageId, record, submission) : 0;
      saveLocalLog(withRecord(localLogRef.current, result.record));
      const after = viewOf(result.record, now);
      announceIfOver(after);
      return { assessment: after, passed: result.passed, awardedXp: awarded };
    },
    [accountId, online, habitState, noteRevision, activityLog, setStats, settingsRef, todayKey, announceIfOver, refreshAssessmentStatus, onSignedOut, saveLocalLog, creditLocalPass]
  );

  /* ------------------------------------------------------ fail, finish */
  const failAssessment = useCallback<AssessmentsApi['failAssessment']>(
    async (view, reason, runs = 0) => {
      const stageId = view.current;
      if (!stageId) return view;
      if (!view.id.startsWith(LOCAL_ASSESSMENT_PREFIX)) {
        if (!accountId) return null;
        try {
          const res = await api.failAssessment(view.id, { stageId, reason, runs });
          announceIfOver(res.assessment);
          void refreshAssessmentStatus();
          return res.assessment;
        } catch (err) {
          const payload = err instanceof ApiError ? ((err.payload ?? {}) as { assessment?: AssessmentView }) : {};
          if (payload.assessment) {
            announceIfOver(payload.assessment);
            return payload.assessment;
          }
          // Unreachable: the record runs out on the server by itself.
          return null;
        }
      }
      const now = new Date();
      const record = localLogRef.current.records.find((r) => r.id === view.id);
      if (!record || record.status !== 'active') return record ? viewOf(record, now) : null;
      const result = recordLocalResult(record, { stageId, correct: false, attempts: runs, hintsUsed: 0, xp: settingsRef.current.xp, at: now.toISOString() });
      saveLocalLog(withRecord(localLogRef.current, result.record));
      const after = viewOf(result.record, now);
      announceIfOver(after);
      return after;
    },
    [accountId, announceIfOver, refreshAssessmentStatus, settingsRef, saveLocalLog]
  );

  const finishAssessment = useCallback<AssessmentsApi['finishAssessment']>(
    async (view) => {
      if (!view.id.startsWith(LOCAL_ASSESSMENT_PREFIX)) {
        if (!accountId) return null;
        try {
          const res = await api.finishAssessment(view.id);
          announceIfOver(res.assessment);
          void refreshAssessmentStatus();
          return res.assessment;
        } catch (err) {
          const payload = err instanceof ApiError ? ((err.payload ?? {}) as { assessment?: AssessmentView }) : {};
          if (payload.assessment) announceIfOver(payload.assessment);
          return payload.assessment ?? null;
        }
      }
      const now = new Date();
      const record = localLogRef.current.records.find((r) => r.id === view.id);
      if (!record) return null;
      const finished = finishLocalAssessment(record, now.toISOString());
      saveLocalLog(withRecord(localLogRef.current, finished));
      const after = viewOf(finished, now);
      announceIfOver(after);
      return after;
    },
    [accountId, announceIfOver, refreshAssessmentStatus, saveLocalLog]
  );

  const resetLocalAssessments = useCallback(() => {
    saveLocalLog({ records: [], cooldownClearedAt: {} });
  }, [saveLocalLog]);

  return {
    assessmentsAvailable: !accountId || online,
    activeAssessment,
    testOutStatus,
    placementStatus,
    refreshAssessmentStatus,
    startAssessment,
    submitAssessment,
    failAssessment,
    finishAssessment,
    resetLocalAssessments
  };
}
