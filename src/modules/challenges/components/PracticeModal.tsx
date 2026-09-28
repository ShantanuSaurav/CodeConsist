import React, { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Volume2, VolumeX, X } from 'lucide-react';
import { useLeveling, useSession } from '@/platform/session';
import { Challenge, ExecutionResult } from '@/types';
import { Answer, optionOrder } from '@/platform/grading-engine/answers';
import { isRefusedRun } from '@/platform/execution/compilerService';
import { stageStatus, unitStates } from '@/platform/progress';
import { fillCopy, revealCap } from '@/platform/settings';
import { eventBus, useAppEvent } from '@/platform/events';
import type { AppEvents } from '@/platform/events';
import { isPassingSolve, rawScore, scoreSolve, xpForSolve } from '@/platform/xp-leveling/leveling';
import { achievements } from '@/platform/xp-leveling/insights';
import { CodeBlock, GoalMetCard, LearningModeSwitch, useBodyScrollLock, useFocusTrap, useToast } from '@/ui';
import { checkAnswer, definitionFor, emptyAnswer, isAnswerComplete, isCodeChallenge, typeLabel } from '../challenge-types';
import { usePracticeSession } from '../session/PracticeSessionProvider';
import { canRevealSolution, contextForMode, practiceXpLine, revealsAnswers } from '../session/rules';
import { levelToAnnounceOnClose, runSummary, useUnitRun } from '../session/useUnitRun';
import { comesBack, slotDone, slotKey, solveTotals } from '../session/queue';
import { ConceptTeaching, LessonComplete, PracticeExercise } from './lesson';
import { FeedbackBanner } from './lesson/FeedbackBanner';
import { useAttemptFlow } from './lesson/useAttemptFlow';
import { LearningModeChooser } from './LearningModeChooser';

/**
 * The end screen, with the XP count-up and the level-up screen: fetched when
 * a unit (or a stage test) is first finished, never with the shell.
 */
const UnitComplete = React.lazy(() => import('./lesson/UnitComplete'));
/** The end of a Practice session - fetched the same way. */
const ReviewComplete = React.lazy(() => import('./lesson/ReviewComplete'));

const isCodeType = (c: Challenge) => isCodeChallenge(c);

export interface PracticeModalProps {
  /**
   * Optional reading material to show above the prompt - supplied by the app
   * (it lives in the articles module, which this module must not import).
   * `close` shuts the modal before navigating away; `defaultOpen` asks for
   * it to start open (Learn mode, with `feedback.learnOpensReading`).
   */
  readingSlot?: (challenge: Challenge, close: () => void, options: { defaultOpen: boolean }) => React.ReactNode;
}

export const PracticeModal: React.FC<PracticeModalProps> = ({ readingSlot }) => {
  const {
    learnerStages,
    stages,
    completeChallenge,
    recordMiss,
    markConceptSeen,
    executeCode,
    settings,
    stats,
    user,
    draftFor,
    saveDraft,
    flushDraft,
    clearDraft,
    draftStatus,
    soundOn,
    setSoundOn,
    playSound,
    celebrate,
    holdCelebrations,
    releaseCelebrations,
    habits,
    completeReview,
    reviewSummary
  } = useSession();
  const { notify } = useToast();
  const {
    activeStage,
    activeMode,
    activeReview,
    isOpen,
    openReview,
    noteReviewResolved,
    maxRounds: runMaxRounds,
    activeUnit,
    unitPosition,
    nextUnit,
    activeChallenges,
    activeChallengeIndex,
    slots,
    activeSlot,
    history,
    deferred,
    solvedInRun,
    deferCurrent,
    resetRun,
    reachableIndex,
    learningMode,
    setLearningMode,
    closePractice,
    goToChallenge,
    openStageTest,
    openPractice,
    openUnit
  } = usePracticeSession();
  const { rankTitle, xpForLevel } = useLeveling();
  useBodyScrollLock(isOpen);

  const isTestMode = activeMode === 'test';
  // A Practice session (review): questions the learner solved before - no
  // mode choice, no concept teaching, its own tries and XP (`review` rules).
  const isReviewMode = activeMode === 'review' && activeReview !== null;
  const answerContext = contextForMode(activeMode);
  const challenges = activeChallenges;
  const challenge: Challenge | undefined = challenges[activeChallengeIndex];

  /* ------------------------------------------------------------ learning mode */
  // The stage test is the same in both modes. Lessons ask for a mode once
  // (`learningMode === null`) and then follow it; Learn mode is the only
  // place concept teaching, practice markers and immediate explanations show.
  const choosingMode = !isTestMode && !isReviewMode && learningMode === null;
  // Learn mode works on every lesson: a concept is taught first where the
  // lesson has one, the reading starts open, and a wrong answer is explained
  // straight away (its attempt budget, `feedback.attemptsBeforeReveal.learn`).
  const learnMode = !isTestMode && !isReviewMode && learningMode === 'learn';

  // "Review the concept" re-opens a teaching sequence that was already seen.
  // Reset per challenge, like every other piece of per-challenge state.
  const [reviewingConcept, setReviewingConcept] = useState(false);

  // Computed up here (rather than after the early `return null` below) because
  // the keyboard-shortcut effect further down closes over it.
  const conceptUnseen = Boolean(learnMode && challenge?.concept && !stats.seenConcepts.includes(challenge.concept.id));
  const teaching = Boolean(challenge?.concept) && (conceptUnseen || reviewingConcept);
  // While the chooser or the teaching is on screen, the question is not.
  const questionHidden = choosingMode || teaching;

  /* ------------------------------------------------------------ per-challenge state */
  const [answer, setAnswer] = useState<Answer>(null);
  /**
   * Which challenge `answer` was captured for.
   *
   * Resetting the answer in an effect is one render too late: React paints the
   * NEW challenge with the OLD answer first, and the answer shapes differ per
   * type. Going from a quiz (a number) to a fill_blank (a string[]) meant the
   * blanks renderer did `number.slice()` and crashed the whole app. Tracking
   * ownership lets render fall back to a correctly shaped empty answer, so the
   * mismatched window never exists.
   */
  const [answerFor, setAnswerFor] = useState<string | undefined>(undefined);
  const [checked, setChecked] = useState(false);
  const [isCorrect, setIsCorrect] = useState(false);
  const [attempts, setAttempts] = useState(0);
  const [revealedHints, setRevealedHints] = useState(0);
  const [showSolution, setShowSolution] = useState(false);
  /** Set when the answer was right but the score fell under the pass mark: the lesson is not recorded. */
  const [failedPass, setFailedPass] = useState<number | null>(null);
  /**
   * A right answer that took too much help on its first pass (an
   * answer-graded question): not recorded - it comes back at the end of the
   * unit instead of the dead-end "Retry lesson".
   */
  const [belowPass, setBelowPass] = useState(false);

  const [code, setCode] = useState('');
  /** True when this challenge opened on saved code rather than its starter. */
  const [restoredDraft, setRestoredDraft] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const [progressMessage, setProgressMessage] = useState('');
  const [execResult, setExecResult] = useState<ExecutionResult | null>(null);

  const [finished, setFinished] = useState(false);
  const [sessionXp, setSessionXp] = useState(0);
  const [sessionSolved, setSessionSolved] = useState<string[]>([]);
  const [lastAwarded, setLastAwarded] = useState<{
    xp: number;
    score: number;
    challengeId: string;
    firstTime: boolean;
  } | null>(null);

  const dialogRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);

  /**
   * "Daily goal met - one more?": shown under the answer the moment a solve
   * in this lesson meets today's goal (the session announces it once a day).
   * "One more" puts it away; "Done for today" closes the lesson.
   */
  const [goalCard, setGoalCard] = useState<AppEvents['habit:goalMet'] | null>(null);
  const goalCardAllowed = useRef(false);
  goalCardAllowed.current = isOpen && settings.goals.oneMorePrompt;
  useAppEvent(
    'habit:goalMet',
    useCallback((met: AppEvents['habit:goalMet']) => {
      if (met.source === 'solve' && goalCardAllowed.current) setGoalCard(met);
    }, [])
  );

  /**
   * Which challenge the in-flight code run belongs to, or null when there is
   * none. A run can take seconds (the first Python run downloads a runtime),
   * and the learner is free to move to another challenge meanwhile. Its
   * result must then be dropped, not written onto whatever challenge is now on
   * screen - which used to mark a quiz "Correct" before it had been read.
   */
  const runOwner = useRef<string | null>(null);

  /**
   * Read through a ref, so restoring a challenge does not depend on the draft
   * store. `draftFor` changes identity on every save, and taking it as a
   * dependency would re-run the reset effect mid-typing and throw away the
   * attempt count.
   */
  const draftForRef = useRef(draftFor);
  useEffect(() => {
    draftForRef.current = draftFor;
  }, [draftFor]);

  /** Wipe everything that belongs to a single challenge. */
  const resetForChallenge = useCallback((next: Challenge | undefined) => {
    runOwner.current = null;
    setAnswer(next ? emptyAnswer(next) : null);
    setAnswerFor(next?.id);
    setChecked(false);
    setIsCorrect(false);
    setAttempts(0);
    setRevealedHints(0);
    setShowSolution(false);
    setFailedPass(null);
    setBelowPass(false);
    setExecResult(null);
    setIsRunning(false);
    setProgressMessage('');
    setReviewingConcept(false);
    setLastAwarded(null);
    setGoalCard(null);
    // Saved code wins over the starter: the learner picks up exactly where
    // they stopped, whether that was a minute or a month ago.
    const saved = next && isCodeType(next) ? draftForRef.current(next.id) : null;
    setRestoredDraft(saved !== null);
    setCode(next && isCodeType(next) ? saved ?? next.starterCode ?? '' : '');
  }, []);

  // Keyed on the slot - its index and the id, never the object: a new stage
  // array must not wipe answers, and a question requeued right after its own
  // slot (the same id twice in a row) must still start fresh.
  const challengeId = challenge?.id;
  const currentSlotKey = challenge ? `${activeChallengeIndex}:${challenge.id}` : null;
  /** The slot on screen, for answers that land after the learner may have moved on. */
  const slotOnScreen = useRef<string | null>(null);
  slotOnScreen.current = currentSlotKey;
  useEffect(() => {
    resetForChallenge(challenge);
    bodyRef.current?.scrollTo({ top: 0 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentSlotKey, resetForChallenge]);

  /* ------------------------------------------------ tries before the answer */
  // Kept per slot of the run (question and round), so a slot gone back to is as it was left.
  const flow = useAttemptFlow({ challenge, slotKey: activeSlot ? slotKey(activeSlot) : null, context: answerContext, learningMode, settings });
  /** Missed questions come back at the end of the unit (never on the stage test) - or once at the end of a Practice session. */
  const requeueAllowed = isReviewMode ? settings.review.requeueMissed : settings.feedback.requeue.enabled && !isTestMode;
  const maxRounds = runMaxRounds;
  /** A Practice session: today's Practice XP limit reached, or the session over on the server. */
  const [reviewCapped, setReviewCapped] = useState(false);
  /** A Practice session: the Practice XP still payable today, as last heard (null outside one). */
  const [reviewRemaining, setReviewRemaining] = useState<number | null>(null);
  const [reviewExpired, setReviewExpired] = useState(false);
  /** The session bonus, once every question was answered right. */
  const [reviewBonus, setReviewBonus] = useState(0);
  /** Questions moved past unsolved with no round left - "still to get right" on the end screen. */
  const [leftUnsolved, setLeftUnsolved] = useState<string[]>([]);

  /**
   * Leaving this challenge - for the next one, or by closing the modal -
   * writes whatever is still queued immediately, instead of losing the last
   * second and a half of typing to the debounce.
   */
  useEffect(() => {
    if (!challengeId) return;
    return () => flushDraft(challengeId);
  }, [challengeId, flushDraft]);

  /**
   * A draft can arrive after the modal is already open (a slow session
   * restore, a sign-in from the auth modal). Adopt it only while the editor
   * is untouched - never over something the learner has started typing.
   */
  useEffect(() => {
    if (!challenge || !isCodeType(challenge) || restoredDraft || attempts > 0 || checked) return;
    const saved = draftFor(challenge.id);
    if (saved === null || saved === code || code !== (challenge.starterCode ?? '')) return;
    setCode(saved);
    setRestoredDraft(true);
  }, [challenge, draftFor, restoredDraft, attempts, checked, code]);

  /** Every keystroke in a code editor, debounced into a save by the session. */
  const handleCodeChange = useCallback(
    (next: string) => {
      setCode(next);
      if (!challenge || !isCodeType(challenge)) return;
      // Untouched starter code with nothing saved yet is not worth a draft.
      if (next === (challenge.starterCode ?? '') && draftForRef.current(challenge.id) === null) return;
      saveDraft(challenge.id, next, challenge.language);
    },
    [challenge, saveDraft]
  );

  /** Back to the starter code, and the saved copy goes with it. */
  const startFromScratch = useCallback(() => {
    if (!challenge) return;
    setCode(challenge.starterCode ?? '');
    setExecResult(null);
    setRestoredDraft(false);
    clearDraft(challenge.id);
  }, [challenge, clearDraft]);

  /**
   * The answer to actually render and grade. Falls back to a correctly shaped
   * empty answer during the single render where `answer` still belongs to the
   * challenge we just navigated away from.
   */
  const currentAnswer = useMemo<Answer>(
    () => (challenge && answerFor === challenge.id ? answer : challenge ? emptyAnswer(challenge) : null),
    [challenge, answerFor, answer]
  );

  /* ------------------------------------------------------------------ the run */
  // One run is one unit (or the stage test), from open to end screen. A new
  // unit - or "Replay unit" - starts a fresh summary and a fresh snapshot.
  const [restartToken, setRestartToken] = useState(0);
  // The same badge rules the toaster and the Achievements page use.
  const badgeOptions = useMemo(() => ({ perfectRequiresNoHints: settings.units.perfectRequiresNoHints }), [settings.units.perfectRequiresNoHints]);
  const runKey = isReviewMode
    ? `review:${activeReview?.sessionId}`
    : activeStage
      ? `${activeStage.id}:${isTestMode ? 'test' : activeUnit?.id ?? 'lessons'}`
      : null;
  const run = useUnitRun(
    runKey,
    () => ({
      xp: stats.xp,
      level: stats.level,
      streak: habits.streak,
      earnedBadgeIds: achievements(stats, stages, settings.badges, badgeOptions).filter((a) => a.earnedAt).map((a) => a.id),
      unitsCompleted: Object.keys(stats.unitsCompleted ?? {})
    }),
    restartToken
  );
  /** The level-up screen is up: the lesson's own focus trap and shortcuts step aside. */
  const [overlayOpen, setOverlayOpen] = useState(false);

  const resetFlow = flow.reset;
  const startedRemaining = activeReview ? activeReview.remainingToday : null;
  useEffect(() => {
    setFinished(false);
    setSessionXp(0);
    setSessionSolved([]);
    setOverlayOpen(false);
    setLeftUnsolved([]);
    // A session started with today's Practice XP already used up says so from the start.
    setReviewRemaining(startedRemaining);
    setReviewCapped(startedRemaining !== null && startedRemaining <= 0);
    setReviewExpired(false);
    setReviewBonus(0);
    // A new run starts with fresh tries on every slot.
    resetFlow();
    // Per run: `startedRemaining` belongs to the session `runKey` names.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runKey, restartToken, resetFlow]);

  /**
   * Solves still waiting on the server (`completeChallenge` re-runs code
   * there, which can take seconds). The run's XP, counts and bonus land only
   * when they resolve, so the end screen - which decides its confetti and its
   * perfect line on arrival - is not shown until they have.
   */
  const [pendingAwards, setPendingAwards] = useState(0);

  /**
   * While a run is on screen other celebrations are held (a badge toast
   * waits: the end screen lists it). When the run closes - for another unit,
   * a replay, or the modal shutting - the hold is released: dropped when the
   * end screen was reached, shown when it was not. A level crossed in a run
   * closed before its end screen would otherwise go unannounced (the solve
   * toasts are deferred to the end screen), so it is toasted here.
   * Read through a ref: the cleanup runs after the render that closed the run.
   */
  const runEndRef = useRef({ finished: false, levelBefore: null as number | null, level: stats.level });
  runEndRef.current = { finished, levelBefore: run.snapshot?.level ?? null, level: stats.level };
  useEffect(() => {
    if (!runKey) return;
    holdCelebrations();
    return () => {
      const end = runEndRef.current;
      const level = levelToAnnounceOnClose(end);
      if (level !== null) notify(`Level ${level} reached!`, 'success');
      releaseCelebrations({ announced: end.finished });
    };
  }, [runKey, restartToken, holdCelebrations, releaseCelebrations, notify]);

  /* ------------------------------------------------------------------ actions */

  const { stop: stopRunClock, noteCheck, noteSolve } = run;
  const isLastQuestion = activeChallengeIndex + 1 >= challenges.length;
  /** Finishing waits for every solve still with the server (see `pendingAwards`). */
  const finishBlocked = isLastQuestion && pendingAwards > 0;
  const advance = useCallback(() => {
    if (activeChallengeIndex + 1 < challenges.length) goToChallenge(activeChallengeIndex + 1);
    else if (pendingAwards === 0) {
      stopRunClock();
      setFinished(true);
    }
  }, [activeChallengeIndex, challenges.length, goToChallenge, stopRunClock, pendingAwards]);

  const award = useCallback(
    async (target: Challenge, usedAttempts: number, submission: { answer?: unknown; code?: string }) => {
      const wasAlreadySolved = stats.completedChallenges.includes(target.id);
      // Every try and hint this question took in the run, across the slots
      // it came back in - and whether its answer was shown before this solve.
      const totals = solveTotals(history[target.id], activeSlot, { attempts: usedAttempts, hints: revealedHints });
      // A Practice session: the question was solved long ago, so there is no
      // pass mark - the server decides how it went and what it pays.
      if (isReviewMode && activeReview) {
        const owner = slotOnScreen.current;
        setPendingAwards((n) => n + 1);
        try {
          const result = await completeReview(target, {
            sessionId: activeReview.sessionId,
            correct: true,
            attempts: totals.attempts,
            hintsUsed: totals.hints,
            revealed: totals.revealed,
            ...submission
          });
          if (result.expired) {
            setReviewExpired(true);
            return;
          }
          // Not recorded (an error, a session that ended - a toast said
          // why): not part of the run, and it says nothing about the cap.
          if (result.failed) return;
          // The server checked it and found it wrong: its word wins - the
          // question is still open (answer it again, or it comes back).
          if (result.rejected) {
            if (slotOnScreen.current === owner) setIsCorrect(false);
            return;
          }
          noteReviewResolved(target.id);
          const paid = result.awardedXp + result.bonusXp;
          setLastAwarded({ xp: paid, score: 100, challengeId: target.id, firstTime: false });
          setReviewRemaining(result.remainingToday);
          if (result.remainingToday <= 0) setReviewCapped(true);
          if (result.bonusXp > 0) setReviewBonus(result.bonusXp);
          setSessionXp((prev) => prev + result.totalXp);
          setSessionSolved((prev) => (prev.includes(target.id) ? prev : [...prev, target.id]));
          noteSolve({
            attempts: totals.attempts,
            hints: totals.hints,
            requeued: totals.requeued,
            outcome: {
              solveXp: paid,
              perfectBonusXp: 0,
              goalBonusXp: result.goalBonusXp,
              goalMet: result.goalBonusXp > 0,
              totalXp: result.totalXp,
              unitCompleted: null,
              perfect: false,
              verifiedByServer: result.verifiedByServer
            }
          });
          if (isCodeType(target)) setRestoredDraft(false);
        } finally {
          setPendingAwards((n) => Math.max(0, n - 1));
        }
        return;
      }
      // Right answer, but too many retries or hints on its first pass: the
      // lesson is not completed (nothing is recorded). An answer-graded
      // question comes back at the end of the unit; a code lesson is taken
      // again fresh. A lesson solved on an earlier visit keeps its credit
      // regardless, and one back after a miss completes (the score says how).
      if (!wasAlreadySolved && !totals.requeued && !isPassingSolve(totals.attempts, totals.hints, settings.xp)) {
        if (!isCodeType(target) && requeueAllowed && comesBack(slots, target.id, maxRounds, activeChallengeIndex)) setBelowPass(true);
        else setFailedPass(rawScore(totals.attempts, totals.hints, settings.xp));
        return;
      }
      // Finishing the run waits until this has landed (see `pendingAwards`).
      setPendingAwards((n) => n + 1);
      try {
        // The end screen celebrates the run as a whole, so no toast per answer.
        const outcome = await completeChallenge(target, {
          attempts: totals.attempts,
          hintsUsed: totals.hints,
          context: answerContext,
          deferCelebrations: true,
          requeued: totals.requeued,
          revealed: totals.revealed,
          learningMode,
          ...submission
        });
        // The same cap the server applies after a reveal.
        const cap = totals.revealed ? revealCap(learningMode, settings.feedback) : 100;
        const score = scoreSolve(totals.attempts, totals.hints, settings.xp, cap);
        setLastAwarded({
          xp: wasAlreadySolved ? 0 : outcome.solveXp,
          score,
          challengeId: target.id,
          firstTime: !wasAlreadySolved
        });
        // The server turned it down (and the session rolled it back): not part of the run.
        if (outcome.rejected) return;
        setSessionXp((prev) => prev + outcome.totalXp);
        setSessionSolved((prev) => (prev.includes(target.id) ? prev : [...prev, target.id]));
        noteSolve({ attempts: totals.attempts, hints: totals.hints, outcome, requeued: totals.requeued });
        // Solved: the saved copy has done its job. A cleared lesson reopens at
        // its starter code, not at the learner's last keystroke. (The server
        // drops its own copy on the same solve.)
        if (isCodeType(target)) {
          setRestoredDraft(false);
          clearDraft(target.id);
        }
      } finally {
        setPendingAwards((n) => Math.max(0, n - 1));
      }
    },
    [
      completeChallenge,
      completeReview,
      isReviewMode,
      activeReview,
      noteReviewResolved,
      revealedHints,
      stats.completedChallenges,
      clearDraft,
      settings.xp,
      settings.feedback,
      answerContext,
      noteSolve,
      history,
      activeSlot,
      requeueAllowed,
      learningMode,
      slots,
      maxRounds,
      activeChallengeIndex
    ]
  );

  const handleCheck = useCallback(async () => {
    if (!challenge || checked) return;
    const nextAttempts = attempts + 1;
    setAttempts(nextAttempts);

    const correct = checkAnswer(challenge, currentAnswer);
    setIsCorrect(correct);
    setChecked(true);
    noteCheck();
    // Never the only signal: the banner below says the same thing.
    playSound(correct ? 'correct' : 'wrong');
    if (correct) {
      await award(challenge, nextAttempts, { answer: currentAnswer });
      return;
    }
    // A wrong answer counts against the tries before the answer is shown;
    // the last one shows it (`final`). It is kept (as indices and short
    // text) so the admin can see which questions trip people up - never
    // touching XP or attempts.
    const { final } = flow.noteWrong(currentAnswer);
    recordMiss(challenge, { answer: currentAnswer }, { context: answerContext, final });
  }, [challenge, checked, attempts, currentAnswer, award, recordMiss, answerContext, noteCheck, playSound, flow]);

  const handleRun = useCallback(async () => {
    if (!challenge || isRunning) return;
    const owner = challenge.id;
    runOwner.current = owner;
    const stillMine = () => runOwner.current === owner;

    setIsRunning(true);
    setProgressMessage('');
    setExecResult(null);

    const nextAttempts = attempts + 1;
    setAttempts(nextAttempts);

    try {
      const result = await executeCode(
        code,
        challenge.language,
        challenge.entryFunction,
        challenge.testCases ?? [],
        { onProgress: (message) => stillMine() && setProgressMessage(message) }
      );
      // The server refused the run without running it (too many runs in a
      // row, or every code-runner slot taken). Nothing of theirs was tested,
      // so it is not a try: the attempt goes back - no retry penalty on the
      // XP, no step towards "Show me the solution" - and there is no verdict
      // and no miss. The console shows the server's sentence; "Run tests"
      // stays where it was.
      if (isRefusedRun(result)) {
        if (stillMine()) {
          setAttempts((n) => Math.max(0, n - 1));
          setExecResult(result);
        }
        return;
      }
      const passed = result.status === 'passed';
      // Only the on-screen verdict belongs to whichever challenge is showing.
      // A pass is a pass: the XP goes to the challenge that was actually run,
      // whether or not the learner is still looking at it.
      if (stillMine()) {
        setExecResult(result);
        setIsCorrect(passed);
        setChecked(true);
        noteCheck();
        // A verdict, not a run that could not happen at all.
        if (passed || result.engine !== 'none') playSound(passed ? 'correct' : 'wrong');
      }
      if (passed) await award(challenge, nextAttempts, { code });
      else if (result.engine !== 'none') {
        // A failed run is a miss - kept as its pass count, never the code. A
        // run that could not happen at all (no engine for the language) is not
        // the learner's mistake, and neither is an error with nothing tested.
        const results = result.testResults ?? [];
        if (result.status === 'failed' || (result.status === 'error' && results.length > 0)) {
          recordMiss(
            challenge,
            { code: { passed: results.filter((t) => t.passed).length, total: results.length } },
            { context: answerContext }
          );
        }
      }
    } catch (err: any) {
      if (!stillMine()) return;
      setExecResult({
        status: 'error',
        stderr: err?.message ?? String(err),
        testResults: []
      });
      setChecked(true);
      setIsCorrect(false);
    } finally {
      if (stillMine()) {
        setIsRunning(false);
        setProgressMessage('');
      }
    }
  }, [challenge, isRunning, attempts, code, executeCode, award, recordMiss, answerContext, noteCheck, playSound]);

  /**
   * Changing an answer after a wrong check clears the red highlighting, so the
   * feedback on screen always describes the answer currently selected.
   */
  const handleAnswer = useCallback(
    (next: Answer) => {
      setAnswer(next);
      // Claim ownership, so the value the learner just entered is the one
      // rendered and graded rather than being treated as leftover state.
      setAnswerFor(challenge?.id);
      if (checked && !isCorrect) {
        setChecked(false);
      }
    },
    [challenge?.id, checked, isCorrect]
  );

  const handleTryAgain = useCallback(() => {
    setChecked(false);
    setIsCorrect(false);
    // Keep what they typed for code and blanks; clear a wrong single choice so
    // the highlighted answer does not linger (it stays struck through).
    if (challenge && (challenge.type === 'quiz' || challenge.type === 'output_prediction')) {
      setAnswer(null);
    }
  }, [challenge]);

  /**
   * "Continue" once the answer was shown (or a right answer took too much
   * help): move on, with the question added again at the end of the unit
   * while it has rounds left. Its tries and hints go with it, so the solve
   * that finally lands is scored on all of them.
   */
  const handleContinue = useCallback(() => {
    // On the last slot, wait (like the button, and like "Finish") until every
    // solve of the run has landed - Enter must not get past a disabled button.
    if (!challenge || finishBlocked) return;
    // A slot moved past before and gone back to: it is already noted (and
    // back at the end, rules allowing) - just move on.
    if (activeSlot && deferred.has(slotKey(activeSlot))) {
      advance();
      return;
    }
    // The wrong checks in this slot count even when it was left and come
    // back to (the modal's own counter starts again on each visit).
    const { outcome, next } = deferCurrent({ attempts: Math.max(attempts, flow.wrong), hints: revealedHints, revealed: flow.revealed, requeue: requeueAllowed });
    if (outcome === 'kept') setLeftUnsolved((prev) => (prev.includes(challenge.id) ? prev : [...prev, challenge.id]));
    if (next === null) {
      stopRunClock();
      setFinished(true);
    }
  }, [challenge, finishBlocked, activeSlot, deferred, advance, deferCurrent, attempts, revealedHints, flow.wrong, flow.revealed, requeueAllowed, stopRunClock]);

  /** "Replay unit": back to its first question, with a fresh run. */
  const restartRun = useCallback(() => {
    setRestartToken((n) => n + 1);
    resetRun();
    goToChallenge(0);
  }, [goToChallenge, resetRun]);

  /* -------------------------------------------------------------- keyboard */

  useEffect(() => {
    // While the level-up screen is up, its own Enter/Esc apply - not these.
    if (!isOpen || overlayOpen) return;

    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const typing =
        target &&
        (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT');

      if (e.key === 'Escape') {
        closePractice();
        return;
      }

      if (typing) return;
      // The mode chooser and the concept walk-through have their own buttons;
      // number keys and Enter belong to the question, which is not on screen.
      if (questionHidden) return;

      // A focused control owns its own Enter. Intercepting it here used to
      // turn Enter on "Skip" into Try again, Enter on "Show a hint" into
      // grading the answer, and Enter on the close button into a run - every
      // button in the dialog was hijacked for keyboard users. The shortcut
      // only applies when nothing interactive has focus.
      const onControl =
        target &&
        (target.tagName === 'BUTTON' ||
          target.tagName === 'A' ||
          target.getAttribute('role') === 'button' ||
          target.isContentEditable ||
          (target.tabIndex >= 0 && target !== dialogRef.current));
      if (onControl && e.key === 'Enter') return;

      // Number keys pick an option on choice-style challenges. They address the
      // option in the position the learner SEES, so they must go through the
      // same display permutation the list is rendered with.
      const def = challenge ? definitionFor(challenge) : null;
      if (!checked && !flow.revealed && challenge && def?.kind === 'answer' && def.supportsNumberKeys && /^[1-9]$/.test(e.key)) {
        const position = Number(e.key) - 1;
        const index = optionOrder(challenge)[position];
        if (challenge.options && index !== undefined && index < challenge.options.length) {
          e.preventDefault();
          // An option already tried (and struck through) cannot be picked again.
          if (flow.ruledOut.includes(index) && challenge.type !== 'multi_select') return;
          if (challenge.type === 'multi_select') {
            const current = new Set((currentAnswer as number[]) ?? []);
            if (current.has(index)) current.delete(index);
            else current.add(index);
            handleAnswer([...current].sort((a, b) => a - b));
          } else {
            handleAnswer(index);
          }
        }
        return;
      }

      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        if (finished) return;
        if (checked && isCorrect && failedPass !== null) resetForChallenge(challenge);
        else if (checked && isCorrect && belowPass) handleContinue();
        else if (checked && isCorrect) advance();
        // The answer is shown - just now, or on a slot gone back to: Continue.
        else if (flow.revealed) handleContinue();
        else if (checked) handleTryAgain();
        else if (challenge && isCodeType(challenge)) handleRun();
        else if (challenge && isAnswerComplete(challenge, currentAnswer)) handleCheck();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [
    isOpen,
    overlayOpen,
    challenge,
    questionHidden,
    answer,
    checked,
    isCorrect,
    finished,
    failedPass,
    belowPass,
    flow.revealed,
    flow.ruledOut,
    closePractice,
    advance,
    resetForChallenge,
    handleCheck,
    handleRun,
    handleTryAgain,
    handleContinue
  ]);

  // Trap Tab inside the dialog while open, restore focus to the opener on close,
  // and recover focus when the control that had it is replaced (Check answer
  // becoming Next challenge used to drop focus to <body>).
  // The level-up screen traps focus itself while it is up.
  useFocusTrap(dialogRef, isOpen && !overlayOpen);

  // A Practice session reached its end screen: say so once (the goal and
  // streak code may react; nothing here depends on who listens).
  const reviewAnnounced = useRef<string | null>(null);
  useEffect(() => {
    if (!finished || !isReviewMode || !runKey || reviewAnnounced.current === runKey) return;
    reviewAnnounced.current = runKey;
    eventBus.emit('review:completed', { correct: sessionSolved.length, total: new Set(challenges.map((c) => c.id)).size, xp: sessionXp });
  }, [finished, isReviewMode, runKey, sessionSolved.length, challenges, sessionXp]);

  /* ----------------------------------------------------------------- render */

  if (!isOpen || !challenge) return null;

  // This challenge counts as "practice" when an earlier challenge in this
  // same list taught a concept the learner has now seen, and this one shares
  // a tag with it - i.e. it is applying the same idea again rather than
  // introducing something new and unexplained. Learn mode only.
  const practiceConcept = (() => {
    if (!learnMode || teaching) return null;
    for (let i = activeChallengeIndex - 1; i >= 0; i--) {
      const earlier = challenges[i];
      if (earlier?.concept) {
        if (!stats.seenConcepts.includes(earlier.concept.id)) return null;
        const shared = (challenge.tags ?? []).some((t) => (earlier.tags ?? []).includes(t));
        return shared ? earlier.concept : null;
      }
    }
    return null;
  })();

  const selectedOptionText =
    (challenge.type === 'quiz' || challenge.type === 'output_prediction') && typeof currentAnswer === 'number'
      ? (challenge.options?.[currentAnswer] ?? null)
      : null;
  // What a solve here would count: every try and hint of the run, capped once the answer was shown.
  const totals = solveTotals(history[challenge.id], activeSlot, { attempts: Math.max(1, attempts), hints: revealedHints });
  const previewXp = xpForSolve(challenge.xpReward, totals.attempts, totals.hints, settings.xp, totals.revealed ? revealCap(learningMode, settings.feedback) : 100);
  // Where a revealed question goes next: back at the end of the unit (the
  // same rule "Continue" applies), or - no round left - next time, unless it
  // was solved on an earlier visit and so is not waiting for anything.
  const revealedNext = !flow.revealed
    ? null
    : requeueAllowed && comesBack(slots, challenge.id, maxRounds, activeChallengeIndex)
      ? 'requeue'
      : stats.completedChallenges.includes(challenge.id)
        ? null
        : 'later';

  const hints = challenge.hints ?? [];
  // "Next stage" means the next one on THIS track - the C track's only stage
  // is not followed by Stage 2 of the core path.
  const trackStages = !activeStage ? [] : learnerStages.some((s) => s.id === activeStage.id) ? learnerStages : [activeStage];
  const nextStage = activeStage ? trackStages[trackStages.findIndex((s) => s.id === activeStage.id) + 1] : undefined;
  const canCheck = isAnswerComplete(challenge, currentAnswer);
  const alreadySolved = stats.completedChallenges.includes(challenge.id);
  // A stage test (or anything taken as a test) never shows its answer: no
  // expected blanks, no correct option, no explanation after a wrong try and
  // no worked solution. Otherwise one wrong check hands over the answer and
  // the retry passes.
  const reveal = revealsAnswers(answerContext, challenge);
  const solutionOffered =
    isCodeType(challenge) &&
    canRevealSolution({ challenge, context: answerContext, isCorrect, attempts, afterFailedRuns: settings.feedback.solutionAfterFailedRuns });

  // One quiet line under the editor, so nobody has to wonder whether their
  // work is safe. Empty until there is something true to say.
  const draftLine = (() => {
    const status = draftStatus(challenge.id);
    if (status === 'saving') return 'Saving…';
    if (status === 'local') return 'Saved on this device - the server could not be reached.';
    if (status === 'saved' || draftFor(challenge.id) !== null) return 'Draft saved';
    return '';
  })();
  const percent = Math.round(((activeChallengeIndex + (checked && isCorrect ? 1 : 0)) / challenges.length) * 100);

  /* ------------------------------------------------------------ end screen */
  const celebrationRules = settings.celebrations;
  const endScreen = (() => {
    if (!finished || isReviewMode || !activeStage) {
      return { heading: '', body: null, retryLine: null, accuracy: null, perfectLine: null, flawlessLine: null, newBadges: [], pendingSync: false, levelUp: null, actions: null };
    }
    const { accuracy, flawless } = runSummary(run.counts);
    const snapshot = run.snapshot;
    const status = stageStatus(activeStage, stats);
    const testPending = Boolean(activeStage.test) && status.lessonsDone && !status.testPassed;
    const states = activeStage.units ? unitStates(activeStage.units, stats.completedChallenges) : [];
    const nextOpen = nextUnit ? states.find((s) => s.unitId === nextUnit.id)?.state !== 'locked' : false;

    // Questions moved past with no round left are still unsolved: the unit is not complete.
    const stillToGet = leftUnsolved.filter((id) => !stats.completedChallenges.includes(id)).length;
    const heading = isTestMode
      ? `${activeStage.name} cleared`
      : stillToGet > 0
        ? 'Nearly there'
        : activeUnit
          ? celebrationRules.copy.unitComplete
          : status.testPassed
            ? `${activeStage.name} complete`
            : 'Lessons complete';

    let body: React.ReactNode = null;
    if (isTestMode) {
      body = (
        <p>
          You passed the stage test.
          {nextStage ? ` Stage ${nextStage.index} - ${nextStage.name} - is now open.` : ' That was the last stage.'}
        </p>
      );
    } else if (testPending && !(nextUnit && nextOpen)) {
      body = (
        <p>
          {activeUnit ? `That was the last unit of ${activeStage.name}. ` : ''}
          One more step: the {activeStage.name} stage test. It is a single coding problem on what you just learned, and passing it is what unlocks the next stage.
        </p>
      );
    } else if (!activeUnit && status.testPassed) {
      body = <p>Every lesson and the stage test are done.</p>;
    }
    if (!isTestMode && stillToGet > 0) {
      body = (
        <p>
          {stillToGet === 1 ? 'One question is' : `${stillToGet} questions are`} still to get right - {stillToGet === 1 ? 'it' : 'they'} will be waiting when you
          come back.
        </p>
      );
    }

    // What this run changed: new badges, a level crossed, a new rank.
    const seen = new Set(snapshot?.earnedBadgeIds ?? []);
    const newBadges = achievements(stats, stages, settings.badges, badgeOptions)
      .filter((a) => a.earnedAt && !seen.has(a.id))
      .map((a) => ({ id: a.id, title: a.title, tierName: a.tierName, tier: a.tier }));
    const levelBefore = snapshot?.level ?? stats.level;
    // Always worked out: with `levelUpOverlay` off the end screen shows it as a line instead.
    const levelUp =
      stats.level > levelBefore
        ? {
            title: fillCopy(celebrationRules.copy.levelUp, { level: stats.level }),
            newRankLine:
              rankTitle(stats.level) !== rankTitle(levelBefore) ? fillCopy(celebrationRules.copy.newRank, { title: rankTitle(stats.level) }) : null,
            detail: `${Math.max(0, xpForLevel(stats.level + 1) - stats.xp).toLocaleString()} XP to level ${stats.level + 1}`
          }
        : null;

    const signedIn = Boolean(user && user.provider !== 'guest');
    const actions = isTestMode ? (
      nextStage && nextStage.state !== 'Locked' ? (
        <>
          <button type="button" className="btn btn-line btn-lg" onClick={closePractice}>
            Back to the path
          </button>
          <button type="button" className="btn btn-solid btn-lg" onClick={() => openPractice(nextStage.id)}>
            Start Stage {nextStage.index}
          </button>
        </>
      ) : (
        <button type="button" className="btn btn-solid btn-lg" onClick={closePractice}>
          Back to the path
        </button>
      )
    ) : nextUnit && nextOpen ? (
      <>
        <button type="button" className="btn btn-line btn-lg" onClick={closePractice}>
          Back to the path
        </button>
        <button type="button" className="btn btn-solid btn-lg" onClick={() => openUnit(activeStage.id, nextUnit.id)}>
          Continue: {nextUnit.name}
        </button>
      </>
    ) : testPending ? (
      <>
        <button type="button" className="btn btn-line btn-lg" onClick={closePractice}>
          Later
        </button>
        <button type="button" className="btn btn-solid btn-lg" onClick={() => openStageTest(activeStage.id)}>
          Take the stage test
        </button>
      </>
    ) : (
      <>
        <button type="button" className="btn btn-line btn-lg" onClick={restartRun}>
          {activeUnit ? 'Replay unit' : 'Replay stage'}
        </button>
        <button type="button" className="btn btn-solid btn-lg" onClick={closePractice}>
          Back to the path
        </button>
      </>
    );

    const perfectLine = run.counts.perfectBonusXp > 0 ? fillCopy(celebrationRules.copy.perfect, { xp: run.counts.perfectBonusXp }) : null;
    // "4 first try · 1 fixed on retry": how the run went, once something came back.
    const retryLine =
      !isTestMode && run.counts.fixedOnRetry > 0 ? `${run.counts.firstTry} first try · ${run.counts.fixedOnRetry} fixed on retry` : null;
    return {
      heading,
      body,
      retryLine,
      accuracy,
      perfectLine,
      // A replay (or a run with no bonus to pay) answered right first time throughout.
      flawlessLine: !perfectLine && flawless && !isTestMode ? celebrationRules.copy.flawless : null,
      newBadges,
      pendingSync: signedIn && run.counts.unverified > 0,
      levelUp,
      actions
    };
  })();

  return (
    <div className="modal-overlay" onMouseDown={closePractice}>
      <div
        className={`modal-card practice-card ${definitionFor(challenge).wide ? 'is-wide' : ''} ${challenge.uiPreview || challenge.language === 'html' ? 'is-ui' : ''}`.trim()}
        onMouseDown={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={`${isReviewMode || !activeStage ? 'Practice' : activeStage.name}: ${challenge.title}`}
        ref={dialogRef}
        tabIndex={-1}
      >
        {/* ------------------------------------------------------------ head */}
        <div className="modal-header">
          <div className="modal-header-main">
            <div className="modal-stage-badge">
              {isReviewMode || !activeStage ? (
                <>Practice{activeStage ? ` · ${activeStage.name}` : ''}</>
              ) : (
                <>
                  Stage {String(activeStage.index).padStart(2, '0')} · {activeStage.name}
                  {unitPosition ? ` · Unit ${unitPosition.index + 1} of ${unitPosition.count}` : ''}
                  {isTestMode ? ' · Stage test' : ''}
                </>
              )}
              {!finished && !choosingMode ? ` · ${challenge.language} · ${typeLabel(challenge)}` : ''}
            </div>
            <h3 className="modal-title">
              {finished
                ? isReviewMode
                  ? 'Practice'
                  : isTestMode
                    ? 'Stage cleared'
                    : activeUnit
                      ? activeUnit.name
                      : 'Lessons complete'
                : choosingMode
                  ? activeUnit?.name ?? activeStage?.name ?? ''
                  : challenge.title}
            </h3>
            {!finished && !choosingMode && (
              <div className="modal-meta">
                <span className={`pill pill-${challenge.difficulty}`}>{challenge.difficulty}</span>
                {alreadySolved && !isReviewMode && <span className="pill pill-done">solved before</span>}
                {isReviewMode && <span className="pill pill-done">practice</span>}
                {!isTestMode && !isReviewMode && <LearningModeSwitch size="sm" value={learningMode} onChange={setLearningMode} />}
              </div>
            )}
          </div>
          <div className="modal-header-actions">
            {/* Sound effects on or off, for this learner (kept on the account when signed in).
                A toggle: a fixed name, and the state in aria-pressed ("Sound effects, pressed" = on). */}
            <button
              type="button"
              className="modal-close-btn"
              onClick={() => setSoundOn(!soundOn)}
              aria-label="Sound effects"
              aria-pressed={soundOn}
              title={soundOn ? 'Sound effects on' : 'Sound effects off'}
            >
              {soundOn ? <Volume2 size={16} /> : <VolumeX size={16} />}
            </button>
            <button type="button" className="modal-close-btn" onClick={closePractice} aria-label="Close">
              <X size={16} />
            </button>
          </div>
        </div>

        {/* -------------------------------------------------------- progress */}
        <div className="modal-progress" role="progressbar" aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100}>
          <div className="modal-progress-bar" style={{ width: `${percent}%` }} />
        </div>

        {!finished && !isTestMode && !questionHidden && (
          <nav className="challenge-dots" aria-label={isReviewMode ? 'Questions in this Practice session' : activeUnit ? 'Questions in this unit' : 'Challenges in this stage'}>
            {challenges.map((c, i) => {
              const slot = slots[i];
              // Answered right in this run - or, for a question's own place in a unit, solved at all.
              const done = slotDone(slot, { review: isReviewMode, completed: stats.completedChallenges, solvedInRun });
              // Lessons open in order: anything past the first unsolved one is locked.
              const locked = i > reachableIndex;
              // Questions that came back after a miss follow a divider.
              const retry = Boolean(slot && slot.round > 0);
              const firstRetry = retry && (slots[i - 1]?.round ?? 0) === 0;
              return (
                <React.Fragment key={slot ? slotKey(slot) : `${c.id}:${i}`}>
                  {firstRetry && <span className="dot-divider" aria-hidden="true" />}
                  <button
                    type="button"
                    className={`dot ${i === activeChallengeIndex ? 'is-active' : ''} ${done ? 'is-done' : ''} ${locked ? 'is-locked' : ''} ${retry ? 'is-retry' : ''}`.replace(/\s+/g, ' ').trim()}
                    onClick={() => goToChallenge(i)}
                    aria-disabled={locked || undefined}
                    title={`${i + 1}. ${c.title}${retry ? ' (again)' : ''}${done ? (isReviewMode ? ' (answered)' : ' (solved)') : locked ? ` (solve lesson ${reachableIndex + 1} first)` : ''}`}
                    aria-label={`${locked ? 'Locked' : 'Go to'} challenge ${i + 1}${retry ? ', again' : ''}: ${c.title}`}
                    aria-current={i === activeChallengeIndex}
                  />
                </React.Fragment>
              );
            })}
          </nav>
        )}

        {/* ------------------------------------------------------------ body */}
        <div className="modal-body" ref={bodyRef}>
          {finished && isReviewMode ? (
            <Suspense
              fallback={
                <div className="celebration-view">
                  <h2 className="celebration-title">Practice complete</h2>
                </div>
              }
            >
              <ReviewComplete
                key={runKey ?? 'review'}
                xp={sessionXp}
                correct={sessionSolved.length}
                total={new Set(challenges.map((c) => c.id)).size}
                firstTry={run.counts.firstTry}
                capped={reviewCapped}
                bonusXp={reviewBonus}
                streak={{ before: run.snapshot?.streak ?? habits.streak, after: habits.streak }}
                streakLine={fillCopy(celebrationRules.copy.streakUp, { n: habits.streak })}
                goalLine={
                  run.counts.goalMet
                    ? `${settings.reminders.goalMet.cardTitle}${run.counts.goalBonusXp > 0 ? ` +${run.counts.goalBonusXp} XP` : ''}`
                    : null
                }
                pendingSync={run.counts.unverified > 0 && Boolean(user && user.provider !== 'guest')}
                onEnter={() => {
                  if (sessionXp > 0 && celebrationRules.confetti.onUnitEnd) celebrate({ particles: celebrationRules.confetti.unitEndParticles });
                  playSound('unitComplete');
                }}
                actions={
                  <>
                    <button type="button" className="btn btn-line btn-lg" onClick={closePractice}>
                      Back to the path
                    </button>
                    {reviewSummary.total > 0 && (
                      <button type="button" className="btn btn-solid btn-lg" onClick={() => void openReview({ stageId: activeReview?.stageId ?? undefined })}>
                        Practice again
                      </button>
                    )}
                  </>
                }
              />
            </Suspense>
          ) : finished ? (
            <Suspense
              fallback={
                <div className="celebration-view">
                  <h2 className="celebration-title">{endScreen.heading}</h2>
                  <div className="celebration-actions">{endScreen.actions}</div>
                </div>
              }
            >
              <UnitComplete
                key={`${runKey}:${restartToken}`}
                variant={isTestMode ? 'test' : 'unit'}
                heading={endScreen.heading}
                body={endScreen.body}
                xp={sessionXp}
                countUpMs={celebrationRules.countUpMs}
                accuracy={endScreen.accuracy}
                retryLine={endScreen.retryLine}
                timeMs={run.elapsedMs()}
                streak={{ before: run.snapshot?.streak ?? habits.streak, after: habits.streak }}
                streakLine={fillCopy(celebrationRules.copy.streakUp, { n: habits.streak })}
                perfectLine={endScreen.perfectLine}
                flawlessLine={endScreen.flawlessLine}
                goal={habits.goal ? { done: habits.goal.done, target: habits.goal.target, met: habits.goal.met, percent: habits.goal.percent, label: habits.goal.label } : null}
                goalLine={
                  run.counts.goalMet
                    ? `${settings.reminders.goalMet.cardTitle}${run.counts.goalBonusXp > 0 ? ` +${run.counts.goalBonusXp} XP` : ''}`
                    : null
                }
                newBadges={endScreen.newBadges}
                pendingSync={endScreen.pendingSync}
                levelUp={endScreen.levelUp}
                levelUpOverlay={celebrationRules.levelUpOverlay}
                onEnter={() => {
                  // Confetti only for a run that paid something; the sound regardless.
                  if (sessionXp > 0 && celebrationRules.confetti.onUnitEnd) celebrate({ particles: celebrationRules.confetti.unitEndParticles });
                  playSound('unitComplete');
                }}
                onLevelUp={() => playSound('levelUp')}
                onOverlayChange={setOverlayOpen}
                actions={endScreen.actions}
              />
            </Suspense>
          ) : choosingMode ? (
            <LearningModeChooser
              stageName={activeStage?.name ?? ''}
              recommended={stats.completedChallenges.length === 0 ? 'learn' : undefined}
              onChoose={setLearningMode}
            />
          ) : teaching && challenge.concept ? (
            <ConceptTeaching
              key={`${challenge.id}:${reviewingConcept ? 'review' : 'first'}`}
              concept={challenge.concept}
              onDone={() => {
                markConceptSeen(challenge.concept!.id);
                setReviewingConcept(false);
                bodyRef.current?.scrollTo({ top: 0 });
              }}
            />
          ) : (
            <>
              {practiceConcept && <PracticeExercise conceptTitle={practiceConcept.title} />}
              {isReviewMode && reviewExpired && (
                <div className="feedback-banner incorrect" role="status">
                  <div className="feedback-content">
                    <strong>This Practice session has ended.</strong>{' '}
                    <span>Sessions close after a while. Your answers so far are saved.</span>{' '}
                    <button type="button" className="link-btn" onClick={() => void openReview({ stageId: activeReview?.stageId ?? undefined })}>
                      Start a new session
                    </button>
                  </div>
                </div>
              )}
              {readingSlot?.(challenge, closePractice, { defaultOpen: learnMode && settings.feedback.learnOpensReading })}
              <p className="challenge-prompt">{challenge.prompt}</p>
              {learnMode && challenge.concept && !teaching && (
                <button
                  type="button"
                  className="btn btn-ghost btn-sm concept-review-btn"
                  onClick={() => {
                    setReviewingConcept(true);
                    bodyRef.current?.scrollTo({ top: 0 });
                  }}
                >
                  Review the concept: {challenge.concept.title}
                </button>
              )}

              {challenge.isStageTest && (challenge.examples?.length || challenge.constraints?.length) ? (
                <div className="problem-panel">
                  {challenge.examples?.map((ex, i) => (
                    <div className="problem-example" key={i}>
                      <div className="problem-head">Example {i + 1}</div>
                      <dl>
                        <dt>Input</dt>
                        <dd>
                          <code>{ex.input}</code>
                        </dd>
                        <dt>Output</dt>
                        <dd>
                          <code>{ex.output}</code>
                        </dd>
                        {ex.explanation && (
                          <>
                            <dt>Why</dt>
                            <dd>{ex.explanation}</dd>
                          </>
                        )}
                      </dl>
                    </div>
                  ))}
                  {challenge.constraints?.length ? (
                    <div className="problem-constraints">
                      <div className="problem-head">Constraints</div>
                      <ul>
                        {challenge.constraints.map((c, i) => (
                          <li key={i}>{c}</li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                </div>
              ) : null}

              {/* The snippet, always in full - unless the type's renderer draws it
                  itself (fill_blank puts the inputs inside it). */}
              {challenge.codeSnippet && !definitionFor(challenge).rendersSnippet && (
                <CodeBlock code={challenge.codeSnippet} language={challenge.language} />
              )}

              {(() => {
                const def = definitionFor(challenge);
                if (def.kind === 'answer') {
                  const Renderer = def.Renderer;
                  return (
                    <Renderer
                      challenge={challenge}
                      answer={currentAnswer}
                      onAnswer={handleAnswer}
                      checked={checked}
                      // Once the answer is shown there is nothing left to answer here: Continue.
                      locked={(checked && isCorrect) || flow.revealed || belowPass}
                      reveal={flow.revealed}
                      notes={flow.notesFor(currentAnswer, checked, isCorrect)}
                      ruledOut={flow.ruledOut}
                    />
                  );
                }
                const CodeRenderer = def.Renderer;
                return (
                  <>
                    {/* Kept mounted, so the save status is a live region that
                        actually announces rather than appearing from nowhere. */}
                    <div className={`draft-bar ${restoredDraft ? 'is-restored' : ''}`.trim()}>
                      {restoredDraft && (
                        <>
                          <span>Your saved code was restored.</span>
                          <button type="button" className="link-btn" onClick={startFromScratch}>
                            Start from scratch
                          </button>
                        </>
                      )}
                      <span className="draft-status" role="status">
                        {draftLine}
                      </span>
                    </div>
                    <CodeRenderer
                      challenge={challenge}
                      code={code}
                      onCodeChange={handleCodeChange}
                      onRun={handleRun}
                      isRunning={isRunning}
                      progressMessage={progressMessage}
                      result={execResult}
                      locked={checked && isCorrect}
                      showSolution={showSolution && reveal}
                      onReset={startFromScratch}
                    />
                  </>
                );
              })()}

              {/* ------------------------------------------------------ hints */}
              {hints.length > 0 && (
                <div className="hint-area">
                  {hints.slice(0, revealedHints).map((hint, i) => (
                    <div className="hint-card" key={i}>
                      <span className="hint-index">Hint {i + 1}</span>
                      <span>{hint}</span>
                    </div>
                  ))}
                  {revealedHints < hints.length &&
                    !(checked && isCorrect) &&
                    !flow.revealed &&
                    (!challenge.isStageTest || attempts >= 1) && (
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      onClick={() => setRevealedHints((n) => n + 1)}
                    >
                      Show a hint · {hints.length - revealedHints} left · costs {settings.xp.hintPenalty}% XP
                    </button>
                  )}
                </div>
              )}

              {/* --------------------------------------------------- feedback */}
              {learnMode && checked && isCorrect && challenge.concept && sessionSolved.includes(challenge.id) && (
                <LessonComplete conceptTitle={challenge.concept.title} />
              )}

              {/*
                A wrong answer before the last try says only that (the note
                under the learner's own pick says why that one is wrong); the
                last one shows the answer and the explanation - straight away
                in Learn mode, whose budget is one. A stage test never
                explains a wrong answer: the explanation is the answer.
              */}
              {checked && (
                <FeedbackBanner
                  isCorrect={isCorrect}
                  failedPassScore={failedPass}
                  passScore={settings.xp.passScore}
                  belowPassRequeue={belowPass}
                  firstTry={totals.attempts === 1 && totals.hints === 0}
                  awarded={lastAwarded?.challengeId === challenge.id ? { xp: lastAwarded.xp, score: lastAwarded.score } : null}
                  alreadySolved={alreadySolved && !isReviewMode}
                  xpReward={previewXp}
                  runLabel={isReviewMode ? 'session' : 'unit'}
                  practice={
                    isReviewMode
                      ? lastAwarded?.challengeId === challenge.id
                        ? { xp: lastAwarded.xp, capped: reviewCapped }
                        : { xp: 0, capped: false, pending: true }
                      : null
                  }
                  uiPreview={Boolean(challenge.uiPreview)}
                  revealed={flow.revealed}
                  revealedNext={revealedNext}
                  triesLeft={flow.left}
                  mayExplain={reveal}
                  explainCodeFailure={isCodeType(challenge) && (learnMode || attempts >= 2)}
                  learnMode={learnMode}
                  pickedText={selectedOptionText}
                  explanation={challenge.explanation}
                />
              )}

              {goalCard && (
                <GoalMetCard
                  title={settings.reminders.goalMet.cardTitle}
                  body={fillCopy(settings.reminders.goalMet.cardBody, { streak: goalCard.streak, bonusXp: goalCard.bonusXp })}
                  bonusXp={goalCard.bonusXp}
                  moreLabel={settings.reminders.goalMet.moreLabel}
                  doneLabel={settings.reminders.goalMet.doneLabel}
                  onMore={() => setGoalCard(null)}
                  onDone={() => {
                    setGoalCard(null);
                    closePractice();
                  }}
                />
              )}

              {/* Only offered once they have genuinely tried - and never on a stage test. */}
              {solutionOffered && (
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={() => setShowSolution((s) => !s)}
                >
                  {showSolution ? 'Hide the solution' : 'Show me the solution'}
                </button>
              )}
            </>
          )}
        </div>

        {/* ---------------------------------------------------------- footer */}
        {!finished && !questionHidden && (
          <div className="modal-footer">
            <div className="footer-left">
              <span className="challenge-xp-reward">
                {isReviewMode ? practiceXpLine(settings.review.xp.correctFirstTry, reviewRemaining) : `+${challenge.xpReward} XP`}
              </span>
              <span className="footer-count">
                {activeChallengeIndex + 1} / {challenges.length}
              </span>
            </div>

            <div className="footer-actions">
              {activeChallengeIndex > 0 && (
                <button
                  type="button"
                  className="btn btn-line"
                  onClick={() => goToChallenge(activeChallengeIndex - 1)}
                >
                  Back
                </button>
              )}

              {checked && isCorrect && failedPass !== null ? (
                <button type="button" className="btn btn-solid" onClick={() => resetForChallenge(challenge)}>
                  Retry lesson
                </button>
              ) : (checked && isCorrect && belowPass) || (!isCorrect && flow.revealed) ? (
                // The question comes back at the end of the unit (rounds allowing).
                // Also on a slot gone back to after its answer was shown: there
                // is nothing left to answer there, so this moves on.
                <button type="button" className="btn btn-solid" onClick={handleContinue} disabled={finishBlocked}>
                  {finishBlocked ? 'Saving…' : 'Continue'}
                </button>
              ) : checked && isCorrect ? (
                // On the last question, disabled until every solve of the run
                // has landed - the end screen's XP, confetti and perfect line
                // are decided when it appears.
                <button type="button" className="btn btn-solid" onClick={advance} disabled={finishBlocked}>
                  {!isLastQuestion ? 'Next' : finishBlocked ? 'Saving…' : isTestMode || isReviewMode ? 'Finish' : activeUnit ? 'Finish unit' : 'Finish stage'}
                </button>
              ) : checked ? (
                <>
                  {/* Skipping is only for a lesson already solved on an earlier visit; an unsolved one gates everything after it. */}
                  {!isTestMode && stats.completedChallenges.includes(challenge.id) && (
                    <button type="button" className="btn btn-line" onClick={advance} disabled={finishBlocked}>
                      Skip
                    </button>
                  )}
                  <button type="button" className="btn btn-solid" onClick={handleTryAgain}>
                    {Number.isFinite(flow.left) && flow.left > 0 && reveal ? `Try again · ${flow.left} left` : 'Try again'}
                  </button>
                </>
              ) : isCodeType(challenge) ? (
                <button type="button" className="btn btn-solid" disabled={isRunning} onClick={handleRun}>
                  {isRunning ? 'Running…' : 'Run tests'}
                </button>
              ) : (
                <button type="button" className="btn btn-solid" disabled={!canCheck} onClick={handleCheck}>
                  Check answer
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
