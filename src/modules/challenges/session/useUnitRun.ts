/**
 * One run through a unit (or a stage test), from open to end screen: what
 * the learner had when it started, and what happened during it.
 *
 * At open it snapshots XP, level, the day streak and the badges already
 * earned, so the end screen can say what CHANGED (a level crossed, a streak
 * that went up, badges new this run). During the run it counts checks,
 * questions solved, those solved on the first check, hints, XP paid, and
 * active time - which pauses while the tab is hidden.
 *
 * The counting rules are pure (`runSummary`) so they can be tested without
 * React; the hook is the thin stateful wrapper.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import type { SolveOutcome } from '@/platform/session';

export interface RunSnapshot {
  xp: number;
  level: number;
  streak: number;
  /** Badge ids already earned when the run began. */
  earnedBadgeIds: string[];
  /** Units whose completion was already recorded (a completion this run is new). */
  unitsCompleted: string[];
}

export interface RunCounts {
  /** Every Check / Run tests. */
  checks: number;
  /** Questions solved in this run. */
  questions: number;
  /** Of those, solved on their first check with no hint. */
  firstTry: number;
  /** Of those, solved after coming back at the end of the unit (a miss, then right). */
  fixedOnRetry: number;
  hints: number;
  /** XP paid during the run: solve XP plus any perfect-unit and daily-goal bonus. */
  xp: number;
  perfectBonusXp: number;
  /** The daily-goal bonus a solve in this run paid (the goal met during it). */
  goalBonusXp: number;
  /** A solve in this run met today's daily goal. */
  goalMet: boolean;
  /** The unit a solve in this run completed for the first time, if any. */
  unitCompleted: string | null;
  perfect: boolean;
  /** A solve the server did not confirm (offline, or a guest) - "saved on this device". */
  unverified: number;
}

export const EMPTY_COUNTS: RunCounts = {
  checks: 0,
  questions: 0,
  firstTry: 0,
  fixedOnRetry: 0,
  hints: 0,
  xp: 0,
  perfectBonusXp: 0,
  goalBonusXp: 0,
  goalMet: false,
  unitCompleted: null,
  perfect: false,
  unverified: 0
};

/** One solve's contribution to the run. `attempts` and `hints` are the question's totals across the run. */
export function countSolve(counts: RunCounts, solve: { attempts: number; hints: number; outcome: SolveOutcome; requeued?: boolean }): RunCounts {
  const { outcome } = solve;
  return {
    ...counts,
    questions: counts.questions + 1,
    firstTry: counts.firstTry + (solve.attempts === 1 && solve.hints === 0 ? 1 : 0),
    fixedOnRetry: counts.fixedOnRetry + (solve.requeued ? 1 : 0),
    hints: counts.hints + Math.max(0, solve.hints),
    xp: counts.xp + outcome.totalXp,
    perfectBonusXp: counts.perfectBonusXp + outcome.perfectBonusXp,
    goalBonusXp: counts.goalBonusXp + (outcome.goalBonusXp ?? 0),
    goalMet: counts.goalMet || Boolean(outcome.goalMet),
    unitCompleted: outcome.unitCompleted ?? counts.unitCompleted,
    perfect: outcome.unitCompleted ? outcome.perfect : counts.perfect,
    unverified: counts.unverified + (outcome.verifiedByServer ? 0 : 1)
  };
}

/** Accuracy (first-try share of the questions solved) and whether the run was flawless. */
export function runSummary(counts: RunCounts): { accuracy: number | null; flawless: boolean } {
  if (counts.questions === 0) return { accuracy: null, flawless: false };
  const accuracy = Math.round((counts.firstTry / counts.questions) * 100);
  return { accuracy, flawless: accuracy === 100 && counts.hints === 0 };
}

/**
 * The level to toast as a run closes, or null. A run's solves do not toast
 * (`deferCelebrations`) - its end screen says what it earned - so a level
 * crossed in a run closed BEFORE its end screen would otherwise never be
 * announced at all.
 */
export function levelToAnnounceOnClose(end: { finished: boolean; levelBefore: number | null; level: number }): number | null {
  return !end.finished && end.levelBefore !== null && end.level > end.levelBefore ? end.level : null;
}

export interface UnitRun {
  snapshot: RunSnapshot | null;
  counts: RunCounts;
  /** A check (or a run of the tests) happened. */
  noteCheck: () => void;
  noteSolve: (solve: { attempts: number; hints: number; outcome: SolveOutcome; requeued?: boolean }) => void;
  /** Active milliseconds so far (hidden-tab time left out). */
  elapsedMs: () => number;
  /** Stop the clock (the end screen is showing). */
  stop: () => void;
}

/**
 * @param key  identifies the run (`stageId:unitId`, `stageId:test`); a new
 *             key - or `restartToken` changing, for a replay - starts afresh.
 * @param takeSnapshot  what the learner has right now; called once per run.
 */
export function useUnitRun(key: string | null, takeSnapshot: () => RunSnapshot, restartToken = 0): UnitRun {
  const [snapshot, setSnapshot] = useState<RunSnapshot | null>(null);
  const [counts, setCounts] = useState<RunCounts>(EMPTY_COUNTS);
  const clock = useRef({ total: 0, since: null as number | null, stopped: false });
  const takeRef = useRef(takeSnapshot);
  takeRef.current = takeSnapshot;

  useEffect(() => {
    if (!key) {
      setSnapshot(null);
      return;
    }
    setSnapshot(takeRef.current());
    setCounts(EMPTY_COUNTS);
    const visible = typeof document === 'undefined' || document.visibilityState !== 'hidden';
    clock.current = { total: 0, since: visible ? Date.now() : null, stopped: false };
  }, [key, restartToken]);

  // Time pauses while the tab is hidden.
  useEffect(() => {
    if (!key || typeof document === 'undefined') return;
    const onVisibility = () => {
      const c = clock.current;
      if (c.stopped) return;
      if (document.visibilityState === 'hidden') {
        if (c.since !== null) c.total += Date.now() - c.since;
        c.since = null;
      } else if (c.since === null) {
        c.since = Date.now();
      }
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, [key]);

  const noteCheck = useCallback(() => setCounts((c) => ({ ...c, checks: c.checks + 1 })), []);
  const noteSolve = useCallback<UnitRun['noteSolve']>((solve) => setCounts((c) => countSolve(c, solve)), []);
  const elapsedMs = useCallback(() => {
    const c = clock.current;
    return c.total + (c.since !== null ? Date.now() - c.since : 0);
  }, []);
  const stop = useCallback(() => {
    const c = clock.current;
    if (c.stopped) return;
    if (c.since !== null) c.total += Date.now() - c.since;
    c.since = null;
    c.stopped = true;
  }, []);

  return { snapshot, counts, noteCheck, noteSolve, elapsedMs, stop };
}
