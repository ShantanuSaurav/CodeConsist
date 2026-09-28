/**
 * Practice sessions (review) in the browser: what the next session would
 * hold, starting one, and recording its answers.
 *
 *   - `reviewSummary` is worked out with the builder the session itself
 *     uses (src/platform/review), over this learner's solves, schedule and
 *     misses - so the dashboard's "6 to practise" and the session agree.
 *   - Signed in and online, the server builds the session and checks and
 *     prices every answer. A guest's session (or one the server cannot be
 *     reached for) is built and priced here with the same rules, id
 *     `local-<ts>`; each right answer waits in `stats.unsynced.reviewLog`
 *     for the next merge, which prices it again under the daily cap.
 *   - An answer the server checked and found wrong comes back `rejected`;
 *     one it could not take at all (an error, a signed-out session) comes
 *     back `failed`. Neither counts in the session (see stats.ts
 *     `reviewAnswerFailure`).
 *   - A local answer is written onto the stats as they are when it lands (a
 *     functional update, stats.ts `withLocalReviewAnswer`), so an answer the
 *     server priced meanwhile is never overwritten by a slower fallback.
 */
import { useCallback, useMemo, useRef } from 'react';
import type { Dispatch, MutableRefObject, SetStateAction } from 'react';
import type { Challenge, ReviewEvent, ReviewItem, ReviewOutcome, UserProfile, UserStats } from '@/types';
import { OfflineError, api, getToken } from '../api-client/api';
import { dayRow } from '../activity/log';
import { isCodeChallengeType } from '../grading-engine/misses';
import { learnerSolve } from '../habits';
import { answerReview, buildReviewSession, reviewStateOf, reviewSummary as summarizeReview, reviewXpRemaining } from '../review';
import type { ReviewSessionRecord, ReviewSummary } from '../review';
import type { PublicSettings } from '../settings/types';
import { reviewAnswerFailure, statsAfterSolve, withLocalReviewAnswer } from './stats';
import type { ContentBundle } from './content';
import type { ActivityLogApi } from './useActivityLog';
import type { HabitStateApi } from './useHabitState';

/** A Practice session as it starts: its questions, or nothing to practise and when to come back. */
export interface ReviewStart {
  /** Null when there is nothing to practise now (or it could not start - see `error`). */
  sessionId: string | null;
  items: ReviewItem[];
  /** When there is nothing now: the day the next question falls due (null when none will). */
  nextDueDay: string | null;
  /** Practice XP still payable today. */
  remainingToday: number;
  /** Built in this browser (a guest, or the server unreachable): priced here, and again by the server on the next sync. */
  local: boolean;
  /** Why it could not start (switched off, a stage that cannot be practised). */
  error?: string;
}

/** One answer in a Practice session, as the practice modal saw it. */
export interface ReviewAnswerOptions {
  sessionId: string;
  /** This browser's verdict (the server checks it again). */
  correct: boolean;
  /** Checks on this question in the session, across the slots it came back in. */
  attempts: number;
  hintsUsed: number;
  /** Its answer was shown before this one. */
  revealed: boolean;
  answer?: unknown;
  code?: string;
}

/** What one Practice answer did. */
export interface ReviewAnswerOutcome {
  outcome: ReviewOutcome | null;
  awardedXp: number;
  /** The session bonus (paid once, when every question is answered right). */
  bonusXp: number;
  /** The daily-goal bonus this answer paid. */
  goalBonusXp: number;
  totalXp: number;
  /** Practice XP still payable today (not meaningful when `failed`). */
  remainingToday: number;
  sessionComplete: boolean;
  verifiedByServer: boolean;
  /** The session is over on the server (it expired or a newer one replaced it): start a new one. */
  expired?: boolean;
  /** The server checked the answer and found it wrong: nothing was paid, and the question is still open. */
  rejected?: boolean;
  /** The answer could not be recorded at all (an error, a signed-out session): nothing counts. */
  failed?: boolean;
}

const NO_REVIEW_OUTCOME: ReviewAnswerOutcome = {
  outcome: null,
  awardedXp: 0,
  bonusXp: 0,
  goalBonusXp: 0,
  totalXp: 0,
  remainingToday: 0,
  sessionComplete: false,
  verifiedByServer: false
};

export interface ReviewStateInput {
  user: UserProfile | null;
  /** The server answered the last health check. */
  online: boolean;
  stats: UserStats;
  /** Always the latest stats, for callbacks that must not wait for a render. */
  statsRef: MutableRefObject<UserStats>;
  setStats: Dispatch<SetStateAction<UserStats>>;
  settings: PublicSettings;
  settingsRef: MutableRefObject<PublicSettings>;
  activityLog: ActivityLogApi;
  habitState: HabitStateApi;
  /** Every lesson this learner sees (the summary's bank). */
  allChallenges: Challenge[];
  bundleRef: MutableRefObject<ContentBundle | null>;
  todayKey: string;
  /** The learner's zone (null: this browser's). */
  zone: string | null;
  dailyGoalId: string | null;
  noteRevision: (revision: number | null | undefined) => void;
  /** The account's session ended under this tab (a 401): sign out here and say so. */
  onSignedOut: () => void;
  notify: (message: string, kind?: 'success' | 'error' | 'info') => void;
}

export interface ReviewApi {
  reviewSummary: ReviewSummary;
  startReview: (scope?: { stageId?: string }) => Promise<ReviewStart>;
  completeReview: (challenge: Challenge, options: ReviewAnswerOptions) => Promise<ReviewAnswerOutcome>;
}

export function useReview({
  user,
  online,
  stats,
  statsRef,
  setStats,
  settings,
  settingsRef,
  activityLog,
  habitState,
  allChallenges,
  bundleRef,
  todayKey,
  zone,
  dailyGoalId,
  noteRevision,
  onSignedOut,
  notify
}: ReviewStateInput): ReviewApi {
  const { activity } = activityLog;

  /**
   * What the next Practice session would hold, for the dashboard card and the
   * path's Practice row - the builder the session itself uses, over this
   * learner's solves, schedule and misses (locked stubs are left out by it).
   */
  const reviewSummary = useMemo<ReviewSummary>(
    () => summarizeReview({ progress: stats, misses: activity.misses, bank: allChallenges, settings: settings.review, today: todayKey, zone }),
    [stats, activity.misses, allChallenges, settings.review, todayKey, zone]
  );

  /**
   * Every session started in this tab, server-built or local, by id: what
   * each question's first answer was and whether it is answered right (a
   * local session is priced from it; a server one falls back to it offline).
   * Memory only - a reload starts a new session.
   */
  const sessionsRef = useRef(new Map<string, ReviewSessionRecord>());

  const remember = useCallback((id: string, items: ReviewItem[], stageId: string | null) => {
    sessionsRef.current.set(id, { id, createdAt: new Date().toISOString(), stageId, items, answered: {}, bonusPaid: false });
  }, []);

  /** A session built here with the shared rules (a guest, or the server unreachable). */
  const startLocalReview = useCallback(
    (scope: { stageId?: string }): ReviewStart => {
      const now = new Date();
      const log = activityLog.activityRef.current;
      const rules = settingsRef.current.review;
      const plan = buildReviewSession({
        progress: statsRef.current,
        misses: log.misses,
        bank: bundleRef.current?.challenges ?? [],
        settings: rules,
        today: todayKey,
        seed: now.getTime(),
        zone,
        stageId: scope.stageId ?? null
      });
      const remainingToday = reviewXpRemaining(dayRow(log, todayKey).reviewXp, rules.xp);
      if (plan.items.length === 0) return { sessionId: null, items: [], nextDueDay: plan.nextDueDay, remainingToday, local: true };
      const id = `local-${now.getTime()}`;
      remember(id, plan.items, scope.stageId ?? null);
      return { sessionId: id, items: plan.items, nextDueDay: plan.nextDueDay, remainingToday, local: true };
    },
    [todayKey, zone, activityLog.activityRef, settingsRef, statsRef, bundleRef, remember]
  );

  const startReview = useCallback<ReviewApi['startReview']>(
    async (scope = {}) => {
      if (!settingsRef.current.review.enabled) {
        return { sessionId: null, items: [], nextDueDay: null, remainingToday: 0, local: true, error: 'Practice sessions are switched off right now.' };
      }
      const signedIn = Boolean(user && user.provider !== 'guest' && getToken());
      if (signedIn && online) {
        try {
          const res = await api.reviewSession(scope);
          const items = Array.isArray(res.items) ? res.items : [];
          if (res.sessionId) remember(res.sessionId, items, scope.stageId ?? null);
          return {
            sessionId: res.sessionId ?? null,
            items: res.sessionId ? items : [],
            nextDueDay: res.nextDueDay ?? null,
            remainingToday: typeof res.xp?.remainingToday === 'number' ? res.xp.remainingToday : 0,
            local: false
          };
        } catch (err) {
          // Refused (switched off meanwhile, a stage that cannot be
          // practised, too many requests): say why. Unreachable: build it here.
          if (!(err instanceof OfflineError)) {
            return { sessionId: null, items: [], nextDueDay: null, remainingToday: 0, local: false, error: err instanceof Error ? err.message : 'Could not start a Practice session.' };
          }
        }
      }
      return startLocalReview(scope);
    },
    [user, online, settingsRef, remember, startLocalReview]
  );

  /**
   * Price one Practice answer here, with the rules the server runs: the
   * first answer decides the schedule, XP once per question per day under
   * the daily cap, the session bonus once. A right answer counts for the
   * streak and the goal (a guest's goal bonus is paid here; a signed-in
   * learner's only by the server). It is kept for the next sync, which
   * prices it again.
   */
  const completeLocalReview = useCallback(
    (challenge: Challenge, options: ReviewAnswerOptions, signedIn: boolean): ReviewAnswerOutcome => {
      const current = settingsRef.current;
      const rules = current.review;
      const day = todayKey;
      const at = new Date().toISOString();
      // The stats as they are now - not as they were when this answer was
      // sent (a fallback runs after a request that failed).
      const base = statsRef.current;
      const record =
        sessionsRef.current.get(options.sessionId) ??
        ({ id: options.sessionId, createdAt: at, stageId: null, items: [{ challengeId: challenge.id, reason: 'due' }], answered: {}, bonusPaid: false } as ReviewSessionRecord);
      // An answer for a question the session does not hold (it came back after an expiry): it joins it.
      const session = record.items.some((i) => i.challengeId === challenge.id)
        ? record
        : { ...record, items: [...record.items, { challengeId: challenge.id, reason: 'due' as const }] };
      const state = reviewStateOf(base, challenge.id, rules, { zone, today: day });
      const before = dayRow(activityLog.activityRef.current, day);
      const result = answerReview(
        session,
        { challengeId: challenge.id, correct: options.correct, attempts: options.attempts, hintsUsed: options.hintsUsed, revealed: options.revealed },
        { state, dayReviewXp: before.reviewXp, today: day, at, settings: rules }
      );
      sessionsRef.current.set(options.sessionId, result.session);
      if (result.replay) {
        return { ...NO_REVIEW_OUTCOME, outcome: result.outcome, remainingToday: reviewXpRemaining(before.reviewXp, rules.xp), sessionComplete: result.complete };
      }

      const paid = result.awardedXp + result.bonusXp;
      if (options.correct || result.awardedXp > 0) {
        activityLog.applyEvent({ type: 'review', challengeId: challenge.id, answered: options.correct, xp: result.awardedXp, clean: result.closesMistake }, { day, at });
      }
      if (result.bonusXp > 0) activityLog.applyEvent({ type: 'review', challengeId: null, answered: false, xp: result.bonusXp }, { day, at });

      let goalBonusXp = 0;
      let event: ReviewEvent | null = null;
      // The day as the streak judges it: after this answer, before any goal snapshot.
      const row = dayRow(activityLog.activityRef.current, day);
      const habitContext = { settings: current, dailyGoalId, today: day, day: row, at };
      if (options.correct) {
        const habitRun = learnerSolve(base, habitContext);
        goalBonusXp = habitRun.events.goalMet && !signedIn ? habitRun.events.bonusXp : 0;
        if (habitRun.events.goalMet && habitRun.events.goal) {
          activityLog.applyEvent({ type: 'goal', goal: habitRun.events.goal, bonusXp: goalBonusXp }, { day, at });
        }
        habitState.announceSolve(
          day,
          {
            goalMet: habitRun.events.goalMet,
            bonusXp: goalBonusXp,
            freezeEarned: habitRun.events.freezeEarned,
            repaired: habitRun.events.repaired,
            streakDay: habitRun.events.streakDay,
            frozenDays: habitRun.events.frozenDays
          },
          { streak: habitRun.fields.streak, freezes: habitRun.fields.habit.freezes }
        );
        // Kept for the next sync, which prices it again on the server.
        event = { challengeId: challenge.id, sessionId: options.sessionId, at, day, outcome: result.outcome, correct: true };
      }
      setStats((prev) => {
        const next = withLocalReviewAnswer(prev, { challengeId: challenge.id, state: result.state, xp: paid + goalBonusXp, event }, current.levels);
        if (!options.correct) return next;
        // The streak fields from the stats as they are now (the same day row).
        const fields = learnerSolve(next, habitContext).fields;
        return { ...next, streak: fields.streak, bestStreak: fields.bestStreak, lastActiveDay: fields.lastActiveDay, habit: fields.habit };
      });
      return {
        outcome: result.outcome,
        awardedXp: result.awardedXp,
        bonusXp: result.bonusXp,
        goalBonusXp,
        totalXp: paid + goalBonusXp,
        remainingToday: reviewXpRemaining(before.reviewXp + paid, rules.xp),
        sessionComplete: result.complete,
        verifiedByServer: false
      };
    },
    [settingsRef, statsRef, setStats, todayKey, zone, dailyGoalId, activityLog, habitState]
  );

  const completeReview = useCallback<ReviewApi['completeReview']>(
    async (challenge, options) => {
      const signedIn = Boolean(user && user.provider !== 'guest' && getToken());
      const local = options.sessionId.startsWith('local-');
      if (local || !signedIn || !online) return completeLocalReview(challenge, options, signedIn);

      const release = habitState.holdAnnouncements();
      try {
        const res = await api.reviewAnswer({
          sessionId: options.sessionId,
          challengeId: challenge.id,
          ...(isCodeChallengeType(challenge.type) ? { code: options.code } : { answer: options.answer }),
          attempts: options.attempts,
          hintsUsed: options.hintsUsed,
          ...(options.revealed ? { revealed: true } : {})
        });
        noteRevision(res.settingsRevision);
        const correct = res.correct === true;
        // The session record here follows the server's, for an offline fallback later.
        const record = sessionsRef.current.get(options.sessionId);
        if (record) {
          const prev = record.answered[challenge.id];
          sessionsRef.current.set(options.sessionId, {
            ...record,
            answered: { ...record.answered, [challenge.id]: { outcome: res.outcome, resolved: Boolean(prev?.resolved || correct), xp: (prev?.xp ?? 0) + (res.awardedXp ?? 0) } },
            bonusPaid: record.bonusPaid || (res.bonusXp ?? 0) > 0
          });
        }
        // A clean answer closed the open mistake on the server; this copy follows.
        if (correct && res.outcome === 'clean' && !res.replay) {
          activityLog.applyEvent({ type: 'review', challengeId: challenge.id, answered: false, xp: 0, clean: true }, { day: todayKey, at: new Date().toISOString() });
        }
        activityLog.adoptDay(res.today);
        if (res.progress) setStats((prev) => statsAfterSolve(prev, res.progress, { rulesChanged: false, curve: settingsRef.current.levels }));
        const remainingToday = Math.max(0, Number(res.xpRemainingToday) || 0);
        if (!correct) {
          // The server checked it and found it wrong (the question changed
          // since the session started, or the code failed its run there):
          // its word wins - nothing paid, and the question stays open.
          notify('The server did not accept that answer, so it did not count. Try it again.', 'error');
          return { ...NO_REVIEW_OUTCOME, outcome: res.outcome ?? null, remainingToday, verifiedByServer: true, rejected: true };
        }
        const goalBonusXp = Math.max(0, Number(res.goalBonusXp) || 0);
        const events = res.habitEvents;
        if (events) {
          habitState.announceSolve(
            res.today?.day ?? todayKey,
            {
              goalMet: Boolean(events.goalMet),
              bonusXp: goalBonusXp,
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
        const awardedXp = Math.max(0, Number(res.awardedXp) || 0);
        const bonusXp = Math.max(0, Number(res.bonusXp) || 0);
        return {
          outcome: res.outcome ?? null,
          awardedXp,
          bonusXp,
          goalBonusXp,
          totalXp: awardedXp + bonusXp + goalBonusXp,
          remainingToday,
          sessionComplete: Boolean(res.sessionComplete),
          verifiedByServer: true
        };
      } catch (err) {
        const failure = reviewAnswerFailure(err);
        // Unreachable, or turned away without a verdict (too many requests,
        // the code runner busy): priced here, sent with the next sync.
        if (failure === 'local') return completeLocalReview(challenge, options, signedIn);
        if (failure === 'expired') return { ...NO_REVIEW_OUTCOME, expired: true };
        if (failure === 'signed-out') onSignedOut();
        else notify(err instanceof Error ? err.message : 'That answer could not be saved.', 'error');
        return { ...NO_REVIEW_OUTCOME, failed: true };
      } finally {
        release();
      }
    },
    [user, online, todayKey, activityLog, habitState, settingsRef, setStats, noteRevision, completeLocalReview, onSignedOut, notify]
  );

  return { reviewSummary, startReview, completeReview };
}
