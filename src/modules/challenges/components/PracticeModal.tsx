import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Check, ClipboardList, Trophy, X, Zap } from 'lucide-react';
import { useSession } from '@/platform/session';
import { Challenge, ExecutionResult } from '@/types';
import { Answer, optionOrder } from '@/platform/grading-engine/answers';
import { stageStatus } from '@/platform/progress';
import { PASS_SCORE, isPassingSolve, rawScore } from '@/platform/xp-leveling/leveling';
import { CodeBlock, LearningModeSwitch, useBodyScrollLock, useFocusTrap } from '@/ui';
import { checkAnswer, definitionFor, emptyAnswer, isAnswerComplete, isCodeChallenge, typeLabel } from '../challenge-types';
import { usePracticeSession } from '../session/PracticeSessionProvider';
import { ConceptTeaching, LessonComplete, PracticeExercise } from './lesson';
import { LearningModeChooser } from './LearningModeChooser';

const isCodeType = (c: Challenge) => isCodeChallenge(c);

export interface PracticeModalProps {
  /**
   * Optional reading material to show above the prompt - supplied by the app
   * (it lives in the articles module, which this module must not import).
   * `close` shuts the modal before navigating away.
   */
  readingSlot?: (challenge: Challenge, close: () => void) => React.ReactNode;
}

export const PracticeModal: React.FC<PracticeModalProps> = ({ readingSlot }) => {
  const {
    learnerStages,
    completeChallenge,
    markConceptSeen,
    executeCode,
    stats,
    draftFor,
    saveDraft,
    flushDraft,
    clearDraft,
    draftStatus
  } = useSession();
  const {
    activeStage,
    activeMode,
    activeChallenges,
    activeChallengeIndex,
    reachableIndex,
    learningMode,
    setLearningMode,
    closePractice,
    goToChallenge,
    openStageTest,
    openPractice
  } = usePracticeSession();
  useBodyScrollLock(Boolean(activeStage));

  const isTestMode = activeMode === 'test';
  const challenges = activeChallenges;
  const challenge: Challenge | undefined = challenges[activeChallengeIndex];

  /* ------------------------------------------------------------ learning mode */
  // The stage test is the same in both modes. Lessons ask for a mode once
  // (`learningMode === null`) and then follow it; Learn mode is the only
  // place concept teaching, practice markers and immediate explanations show.
  const choosingMode = !isTestMode && learningMode === null;
  // Learn mode only exists where there is something to learn: a lesson with
  // no concept teaching is plain practice whatever the preference says, and
  // the header shows "Practice" rather than a toggle that would do nothing.
  const hasLearnContent = Boolean(challenge?.concept);
  const learnMode = !isTestMode && learningMode === 'learn' && hasLearnContent;

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
    setExecResult(null);
    setIsRunning(false);
    setProgressMessage('');
    setReviewingConcept(false);
    setLastAwarded(null);
    // Saved code wins over the starter: the learner picks up exactly where
    // they stopped, whether that was a minute or a month ago.
    const saved = next && isCodeType(next) ? draftForRef.current(next.id) : null;
    setRestoredDraft(saved !== null);
    setCode(next && isCodeType(next) ? saved ?? next.starterCode ?? '' : '');
  }, []);

  // Keyed on the id, not the object: a new stage array must not wipe answers.
  const challengeId = challenge?.id;
  useEffect(() => {
    resetForChallenge(challenge);
    bodyRef.current?.scrollTo({ top: 0 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [challengeId, resetForChallenge]);

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

  // A fresh stage starts a fresh session summary.
  const stageId = activeStage?.id;
  useEffect(() => {
    setFinished(false);
    setSessionXp(0);
    setSessionSolved([]);
  }, [stageId]);

  /* ------------------------------------------------------------------ actions */

  const advance = useCallback(() => {
    if (activeChallengeIndex + 1 < challenges.length) goToChallenge(activeChallengeIndex + 1);
    else setFinished(true);
  }, [activeChallengeIndex, challenges.length, goToChallenge]);

  const award = useCallback(
    async (target: Challenge, usedAttempts: number, submission: { answer?: unknown; code?: string }) => {
      const wasAlreadySolved = stats.completedChallenges.includes(target.id);
      // Right answer, but too many retries or hints: the lesson is not
      // completed (nothing is recorded) and the learner takes it again fresh.
      // A lesson solved on an earlier visit keeps its credit regardless.
      if (!wasAlreadySolved && !isPassingSolve(usedAttempts, revealedHints)) {
        setFailedPass(rawScore(usedAttempts, revealedHints));
        return;
      }
      const xp = await completeChallenge(target, {
        attempts: usedAttempts,
        hintsUsed: revealedHints,
        ...submission
      });
      const penalty = Math.max(0, usedAttempts - 1) * 10 + revealedHints * 10;
      const score = Math.max(50, 100 - penalty);
      setLastAwarded({
        xp: wasAlreadySolved ? 0 : xp,
        score,
        challengeId: target.id,
        firstTime: !wasAlreadySolved
      });
      setSessionXp((prev) => prev + xp);
      setSessionSolved((prev) => (prev.includes(target.id) ? prev : [...prev, target.id]));
      // Solved: the saved copy has done its job. A cleared lesson reopens at
      // its starter code, not at the learner's last keystroke. (The server
      // drops its own copy on the same solve.)
      if (isCodeType(target)) {
        setRestoredDraft(false);
        clearDraft(target.id);
      }
    },
    [completeChallenge, revealedHints, stats.completedChallenges, clearDraft]
  );

  const handleCheck = useCallback(async () => {
    if (!challenge || checked) return;
    const nextAttempts = attempts + 1;
    setAttempts(nextAttempts);

    const correct = checkAnswer(challenge, currentAnswer);
    setIsCorrect(correct);
    setChecked(true);
    if (correct) await award(challenge, nextAttempts, { answer: currentAnswer });
  }, [challenge, checked, attempts, currentAnswer, award]);

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
      const passed = result.status === 'passed';
      // Only the on-screen verdict belongs to whichever challenge is showing.
      // A pass is a pass: the XP goes to the challenge that was actually run,
      // whether or not the learner is still looking at it.
      if (stillMine()) {
        setExecResult(result);
        setIsCorrect(passed);
        setChecked(true);
      }
      if (passed) await award(challenge, nextAttempts, { code });
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
  }, [challenge, isRunning, attempts, code, executeCode, award]);

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
    // the highlighted answer does not linger.
    if (challenge && (challenge.type === 'quiz' || challenge.type === 'output_prediction')) {
      setAnswer(null);
    }
  }, [challenge]);

  const restartStage = useCallback(() => {
    setFinished(false);
    setSessionXp(0);
    setSessionSolved([]);
    goToChallenge(0);
  }, [goToChallenge]);

  /* -------------------------------------------------------------- keyboard */

  useEffect(() => {
    if (!activeStage) return;

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
      if (!checked && challenge && def?.kind === 'answer' && def.supportsNumberKeys && /^[1-9]$/.test(e.key)) {
        const position = Number(e.key) - 1;
        const index = optionOrder(challenge)[position];
        if (challenge.options && index !== undefined && index < challenge.options.length) {
          e.preventDefault();
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
        else if (checked && isCorrect) advance();
        else if (checked) handleTryAgain();
        else if (challenge && isCodeType(challenge)) handleRun();
        else if (challenge && isAnswerComplete(challenge, currentAnswer)) handleCheck();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [
    activeStage,
    challenge,
    questionHidden,
    answer,
    checked,
    isCorrect,
    finished,
    failedPass,
    closePractice,
    advance,
    resetForChallenge,
    handleCheck,
    handleRun,
    handleTryAgain
  ]);

  // Trap Tab inside the dialog while open, restore focus to the opener on close,
  // and recover focus when the control that had it is replaced (Check answer
  // becoming Next challenge used to drop focus to <body>).
  useFocusTrap(dialogRef, Boolean(activeStage));

  /* ----------------------------------------------------------------- render */

  const solvedInStage = useMemo(
    () => challenges.filter((c) => stats.completedChallenges.includes(c.id)).length,
    [challenges, stats.completedChallenges]
  );

  if (!activeStage || !challenge) return null;

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

  const hints = challenge.hints ?? [];
  const { testPassed } = stageStatus(activeStage, stats);
  // "Next stage" means the next one on THIS track - the C track's only stage
  // is not followed by Stage 2 of the core path.
  const trackStages = learnerStages.some((s) => s.id === activeStage.id) ? learnerStages : [activeStage];
  const nextStage = trackStages[trackStages.findIndex((s) => s.id === activeStage.id) + 1];
  const canCheck = isAnswerComplete(challenge, currentAnswer);
  const alreadySolved = stats.completedChallenges.includes(challenge.id);

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

  return (
    <div className="modal-overlay" onMouseDown={closePractice}>
      <div
        className={`modal-card practice-card ${definitionFor(challenge).wide ? 'is-wide' : ''} ${challenge.uiPreview || challenge.language === 'html' ? 'is-ui' : ''}`.trim()}
        onMouseDown={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={`${activeStage.name}: ${challenge.title}`}
        ref={dialogRef}
        tabIndex={-1}
      >
        {/* ------------------------------------------------------------ head */}
        <div className="modal-header">
          <div className="modal-header-main">
            <div className="modal-stage-badge">
              Stage {String(activeStage.index).padStart(2, '0')} · {activeStage.name}
              {isTestMode ? ' · Stage test' : ''}
              {!finished && !choosingMode ? ` · ${challenge.language} · ${typeLabel(challenge)}` : ''}
            </div>
            <h3 className="modal-title">
              {finished ? (isTestMode ? 'Stage cleared' : 'Lessons complete') : choosingMode ? activeStage.name : challenge.title}
            </h3>
            {!finished && !choosingMode && (
              <div className="modal-meta">
                <span className={`pill pill-${challenge.difficulty}`}>{challenge.difficulty}</span>
                {alreadySolved && <span className="pill pill-done">solved before</span>}
                {!isTestMode && hasLearnContent && <LearningModeSwitch size="sm" value={learningMode} onChange={setLearningMode} />}
                {!isTestMode && !hasLearnContent && (
                  <span className="pill pill-practice" title="This lesson has no teaching section - it is practice only">
                    <Zap size={11} aria-hidden="true" /> Practice
                  </span>
                )}
              </div>
            )}
          </div>
          <button type="button" className="modal-close-btn" onClick={closePractice} aria-label="Close">
            <X size={16} />
          </button>
        </div>

        {/* -------------------------------------------------------- progress */}
        <div className="modal-progress" role="progressbar" aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100}>
          <div className="modal-progress-bar" style={{ width: `${percent}%` }} />
        </div>

        {!finished && !isTestMode && !questionHidden && (
          <nav className="challenge-dots" aria-label="Challenges in this stage">
            {challenges.map((c, i) => {
              const done = stats.completedChallenges.includes(c.id);
              // Lessons open in order: anything past the first unsolved one is locked.
              const locked = i > reachableIndex;
              return (
                <button
                  key={c.id}
                  type="button"
                  className={`dot ${i === activeChallengeIndex ? 'is-active' : ''} ${done ? 'is-done' : ''} ${locked ? 'is-locked' : ''}`.replace(/\s+/g, ' ').trim()}
                  onClick={() => goToChallenge(i)}
                  aria-disabled={locked || undefined}
                  title={`${i + 1}. ${c.title}${done ? ' (solved)' : locked ? ` (solve lesson ${reachableIndex + 1} first)` : ''}`}
                  aria-label={`${locked ? 'Locked' : 'Go to'} challenge ${i + 1}: ${c.title}`}
                  aria-current={i === activeChallengeIndex}
                />
              );
            })}
          </nav>
        )}

        {/* ------------------------------------------------------------ body */}
        <div className="modal-body" ref={bodyRef}>
          {finished ? (
            <div className="celebration-view">
              <div className="celebration-icon" aria-hidden="true">
                {isTestMode || testPassed ? <Trophy size={20} /> : <ClipboardList size={20} />}
              </div>

              {isTestMode ? (
                <>
                  <h2 className="celebration-title">{activeStage.name} cleared</h2>
                  <p>
                    You passed the stage test.
                    {nextStage
                      ? ` Stage ${nextStage.index} - ${nextStage.name} - is now open.`
                      : ' That was the last stage.'}
                  </p>
                </>
              ) : testPassed ? (
                <>
                  <h2 className="celebration-title">{activeStage.name} complete</h2>
                  <p>Every lesson and the stage test are done.</p>
                </>
              ) : (
                <>
                  <h2 className="celebration-title">Lessons complete</h2>
                  <p>
                    {sessionSolved.length > 0 ? `${sessionSolved.length} solved this session. ` : ''}
                    One more step: the {activeStage.name} stage test. It is a single coding problem on
                    what you just learned, and passing it is what unlocks the next stage.
                  </p>
                </>
              )}

              <div className="celebration-stats">
                <div className="celebration-stat-box">
                  <strong>+{sessionXp}</strong>
                  <span>XP earned</span>
                </div>
                <div className="celebration-stat-box">
                  <strong>
                    {solvedInStage}/{activeStage.challenges.length}
                  </strong>
                  <span>Lessons solved</span>
                </div>
                <div className="celebration-stat-box">
                  <strong>{stats.streak}</strong>
                  <span>Day streak</span>
                </div>
              </div>

              <div className="celebration-actions">
                {!isTestMode && activeStage.test && !testPassed ? (
                  <>
                    <button type="button" className="btn btn-line btn-lg" onClick={closePractice}>
                      Later
                    </button>
                    <button
                      type="button"
                      className="btn btn-solid btn-lg"
                      onClick={() => openStageTest(activeStage.id)}
                    >
                      Take the stage test
                    </button>
                  </>
                ) : isTestMode && nextStage && nextStage.state !== 'Locked' ? (
                  <>
                    <button type="button" className="btn btn-line btn-lg" onClick={closePractice}>
                      Back to the path
                    </button>
                    <button
                      type="button"
                      className="btn btn-solid btn-lg"
                      onClick={() => openPractice(nextStage.id)}
                    >
                      Start Stage {nextStage.index}
                    </button>
                  </>
                ) : (
                  <>
                    {!isTestMode && (
                      <button type="button" className="btn btn-line btn-lg" onClick={restartStage}>
                        Replay stage
                      </button>
                    )}
                    <button type="button" className="btn btn-solid btn-lg" onClick={closePractice}>
                      Back to the path
                    </button>
                  </>
                )}
              </div>
            </div>
          ) : choosingMode ? (
            <LearningModeChooser
              stageName={activeStage.name}
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
              {readingSlot?.(challenge, closePractice)}
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
                      locked={checked && isCorrect}
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
                      showSolution={showSolution}
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
                    (!challenge.isStageTest || attempts >= 1) && (
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      onClick={() => setRevealedHints((n) => n + 1)}
                    >
                      Show a hint · {hints.length - revealedHints} left · costs 10% XP
                    </button>
                  )}
                </div>
              )}

              {/* --------------------------------------------------- feedback */}
              {learnMode && checked && isCorrect && challenge.concept && sessionSolved.includes(challenge.id) && (
                <LessonComplete conceptTitle={challenge.concept.title} />
              )}

              {checked && (
                <div className={`feedback-banner ${isCorrect ? 'correct' : 'incorrect'}`} role="status">
                  <span className="feedback-icon" aria-hidden="true">
                    {isCorrect ? <Check size={12} strokeWidth={3} /> : <X size={12} strokeWidth={3} />}
                  </span>
                  <div className="feedback-content">
                    <div className="feedback-heading-row">
                      <strong>
                        {isCorrect
                          ? failedPass !== null
                            ? 'Correct, but not passed.'
                            : attempts === 1 && revealedHints === 0
                              ? 'Correct, first try!'
                              : 'Correct!'
                          : 'Not quite.'}
                      </strong>
                      {isCorrect && failedPass !== null && (
                        <div className="feedback-points-cluster">
                          <span className="feedback-score-pill">
                            Score: {failedPass}% · pass mark {PASS_SCORE}%
                          </span>
                        </div>
                      )}
                      {isCorrect && failedPass === null && (
                        <div className="feedback-points-cluster">
                          {lastAwarded?.challengeId === challenge.id && lastAwarded.xp > 0 ? (
                            <>
                              <span className="feedback-xp-pill">+{lastAwarded.xp} XP</span>
                              <span className="feedback-score-pill">Score: {lastAwarded.score}%</span>
                            </>
                          ) : alreadySolved ? (
                            <span className="feedback-score-pill is-subtle">
                              Solved before · Practice complete
                            </span>
                          ) : (
                            <span className="feedback-xp-pill">+{challenge.xpReward} XP</span>
                          )}
                          {challenge.uiPreview && (
                            <span className="feedback-assessment-pill">
                              Frontend Assessment
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                    {/*
                      Learn mode: a wrong answer explains itself immediately and
                      in full - never just "wrong, try again" - and names the
                      option that was picked so it is clear why THAT fails too.
                      Practice mode keeps the question a question: one more
                      look before the explanation is given away.
                    */}
                    {failedPass !== null ? (
                      <span>
                        That took too many tries or hints to count. The lesson is not marked done - retry it for a fresh attempt.
                      </span>
                    ) : learnMode ? (
                      <>
                        {!isCorrect && selectedOptionText && <span>You answered "{selectedOptionText}". </span>}
                        <span>{challenge.explanation}</span>
                      </>
                    ) : (
                      <span>{isCorrect || attempts >= 2 ? challenge.explanation : 'Have another look.'}</span>
                    )}
                  </div>
                </div>
              )}

              {/* Only offered once they have genuinely tried. */}
              {isCodeType(challenge) && !isCorrect && attempts >= 2 && challenge.solutionCode && (
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
              <span className="challenge-xp-reward">+{challenge.xpReward} XP</span>
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
              ) : checked && isCorrect ? (
                <button type="button" className="btn btn-solid" onClick={advance}>
                  {activeChallengeIndex + 1 < challenges.length ? 'Next' : 'Finish stage'}
                </button>
              ) : checked ? (
                <>
                  {/* Skipping is only for a lesson already solved on an earlier visit; an unsolved one gates everything after it. */}
                  {!isTestMode && stats.completedChallenges.includes(challenge.id) && (
                    <button type="button" className="btn btn-line" onClick={advance}>
                      Skip
                    </button>
                  )}
                  <button type="button" className="btn btn-solid" onClick={handleTryAgain}>
                    Try again
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
