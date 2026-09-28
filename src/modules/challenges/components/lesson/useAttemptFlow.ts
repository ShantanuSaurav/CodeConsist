/**
 * The tries on one question in one slot of a run: how many wrong answers it
 * allows before its answer is shown (`effectiveAttemptBudget`), the options
 * already ruled out, whether the answer is shown now, and which "why" notes
 * go with the learner's answer.
 *
 * The state is kept per slot (`slotKey`: the run queue's question and round),
 * so on the render where the modal moves to another slot - the same question
 * requeued right after itself included - nothing of the previous one (an
 * answer shown, a ruled-out option) can show for a frame, and going back to
 * a slot finds it as it was left (an answer shown stays shown). `reset`
 * forgets every slot, for a new run.
 */
import { useCallback, useMemo, useState } from 'react';
import type { Challenge, FeedbackNote, LearningMode } from '@/types';
import type { Answer } from '@/platform/grading-engine/answers';
import { optionNotes } from '@/platform/grading-engine/feedback';
import { effectiveAttemptBudget, wrongAnswerNotesAllowed } from '@/platform/settings';
import type { PublicSettings } from '@/platform/settings';
import { feedbackNotes } from '../../challenge-types';
import { revealsAnswers } from '../../session/rules';
import type { AnswerContext } from '../../session/rules';

interface SlotState {
  /** Wrong checks in this slot. */
  wrong: number;
  /** The answer is shown (the budget ran out). */
  revealed: boolean;
  /** Single choice: options picked wrong in this slot. */
  ruledOut: number[];
}

const FRESH: SlotState = { wrong: 0, revealed: false, ruledOut: [] };

export interface AttemptFlow {
  /** Wrong answers allowed before the answer is shown; Infinity = never shown (tests, code). */
  budget: number;
  /** Wrong answers still allowed before the answer is shown (Infinity when never). */
  left: number;
  /** Wrong checks in this slot so far. */
  wrong: number;
  /** The answer is shown now. */
  revealed: boolean;
  /** Options ruled out (single choice). */
  ruledOut: number[];
  /** A wrong check happened: count it. `final` - it used up the budget, so the answer shows now. */
  noteWrong: (answer: Answer) => { final: boolean };
  /** The notes for this answer (and for the options already ruled out). */
  notesFor: (answer: Answer, checked: boolean, isCorrect: boolean) => FeedbackNote[];
  /** Forget every slot (a new run). */
  reset: () => void;
}

export function useAttemptFlow({
  challenge,
  slotKey,
  context,
  learningMode,
  settings
}: {
  challenge: Challenge | undefined;
  slotKey: string | null;
  context: AnswerContext;
  learningMode: LearningMode | null;
  settings: PublicSettings;
}): AttemptFlow {
  const [slots, setSlots] = useState<Readonly<Record<string, SlotState>>>({});
  const state = slotKey !== null && Object.prototype.hasOwnProperty.call(slots, slotKey) ? slots[slotKey] : FRESH;

  const budget = useMemo(
    () => (challenge ? effectiveAttemptBudget(challenge, context, learningMode, settings) : Infinity),
    [challenge, context, learningMode, settings]
  );
  // Never reveal where the answer must not be given away (stage tests, tests).
  const mayReveal = challenge ? revealsAnswers(context, challenge) : false;
  const notesAllowed = challenge ? wrongAnswerNotesAllowed(challenge, context, learningMode, settings.feedback) : false;

  const noteWrong = useCallback(
    (answer: Answer) => {
      const single = challenge?.type === 'quiz' || challenge?.type === 'output_prediction';
      const wrong = state.wrong + 1;
      const final = mayReveal && Number.isFinite(budget) && wrong >= budget;
      const next: SlotState = {
        wrong,
        revealed: state.revealed || final,
        ruledOut: single && typeof answer === 'number' && !state.ruledOut.includes(answer) ? [...state.ruledOut, answer] : state.ruledOut
      };
      if (slotKey !== null) setSlots((prev) => ({ ...prev, [slotKey]: next }));
      return { final };
    },
    [challenge?.type, state, slotKey, mayReveal, budget]
  );

  const reset = useCallback(() => setSlots({}), []);

  const notesFor = useCallback(
    (answer: Answer, checked: boolean, isCorrect: boolean): FeedbackNote[] => {
      if (!challenge) return [];
      // "Why this is right" joins in once the answer is known - revealed, or found.
      const reveal = mayReveal && (state.revealed || (checked && isCorrect));
      const notes = checked ? feedbackNotes(challenge, answer, reveal) : [];
      // Options ruled out earlier keep their note under them.
      for (const note of optionNotes(challenge, state.ruledOut, reveal)) {
        if (!notes.some((n) => n.position === note.position)) notes.push(note);
      }
      return notesAllowed ? notes : notes.filter((n) => n.kind === 'right');
    },
    [challenge, mayReveal, state.revealed, state.ruledOut, notesAllowed]
  );

  return {
    budget,
    left: Number.isFinite(budget) ? Math.max(0, budget - state.wrong) : Infinity,
    wrong: state.wrong,
    revealed: mayReveal && state.revealed,
    ruledOut: state.ruledOut,
    noteWrong,
    notesFor,
    reset
  };
}
