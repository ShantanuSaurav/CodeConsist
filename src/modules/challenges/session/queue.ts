/**
 * The order a run of a unit walks its questions in, with the missed ones
 * coming back at the end.
 *
 * A run starts as one slot per question (round 0). When a question's answer
 * had to be shown - the learner used up their tries - "Continue" DEFERS its
 * slot and, rules allowing, a new slot for the same question is appended
 * (round 1, 2, ...), so every unit ends with every question answered right.
 * Solving a question drops any slot for it that is still to come.
 *
 * Pure, so the rules are tested without React (__tests__/queue.test.ts);
 * PracticeSessionProvider holds the state.
 */
import type { Challenge } from '@/types';

export interface Slot {
  challengeId: string;
  /** 0 for the question's own place; 1, 2, ... for each time it came back. */
  round: number;
}

/** What one question has taken so far in this run, across all its slots. */
export interface ItemHistory {
  /** Checks (or runs) on the slots already left behind. */
  attempts: number;
  /** Hints shown on the slots already left behind. */
  hints: number;
  /** Its answer was shown in an earlier slot. */
  revealed: boolean;
  /** How many times it has come back. */
  rounds: number;
}

export const EMPTY_HISTORY: ItemHistory = { attempts: 0, hints: 0, revealed: false, rounds: 0 };

/** A slot's own key: the question and the round (each pair occurs once in a run). */
export const slotKey = (slot: Slot): string => `${slot.challengeId}#${slot.round}`;

/** One slot per question, in order. */
export function initialSlots(challenges: readonly Pick<Challenge, 'id'>[]): Slot[] {
  return challenges.map((c) => ({ challengeId: c.id, round: 0 }));
}

/**
 * Append a slot for `id` at the end - its next round - unless it has already
 * come back `maxRounds` times (or has a slot still to come). Null when it
 * may not come back.
 */
export function requeue(slots: readonly Slot[], id: string, maxRounds: number, fromIndex = -1): Slot[] | null {
  const own = slots.filter((s) => s.challengeId === id);
  if (own.length === 0) return null;
  // Already waiting further on: nothing to add.
  if (slots.some((s, i) => i > fromIndex && s.challengeId === id && s.round > 0)) return null;
  const round = Math.max(...own.map((s) => s.round)) + 1;
  if (round > Math.max(0, Math.floor(maxRounds))) return null;
  return [...slots, { challengeId: id, round }];
}

/**
 * Will the question in the slot at `fromIndex` come back later in this run:
 * a slot for it is already waiting further on, or `requeue` would add one?
 * What the feedback line promises after a reveal has to match what
 * "Continue" then does.
 */
export function comesBack(slots: readonly Slot[], id: string, maxRounds: number, fromIndex: number): boolean {
  return slots.some((s, i) => i > fromIndex && s.challengeId === id && s.round > 0) || requeue(slots, id, maxRounds, fromIndex) !== null;
}

/**
 * The questions solved during this run: solved now and not when it began.
 * A replayed unit's questions were solved on an earlier visit, so they are
 * left out - a slot requeued for one of them after a miss still comes up.
 */
export function solvedThisRun(completed: readonly string[], solvedBefore: ReadonlySet<string>): string[] {
  return solvedBefore.size ? completed.filter((id) => !solvedBefore.has(id)) : [...completed];
}

/**
 * Drop the slots still to come (after `fromIndex`) for questions that are now
 * solved: a question solved in its own place - or after going back to it -
 * does not come back again. `completed` is what was solved during this run
 * (`solvedThisRun`).
 */
export function dropSolved(slots: readonly Slot[], fromIndex: number, completed: readonly string[]): Slot[] {
  const solved = new Set(completed);
  const next = slots.filter((s, i) => i <= fromIndex || s.round === 0 || !solved.has(s.challengeId));
  return next.length === slots.length ? (slots as Slot[]) : next;
}

/**
 * The furthest slot the learner may open: the first one whose question is
 * not solved and that was not deferred (moved past after its answer was
 * shown). Everything before it is solved or deferred, so questions are still
 * taken in order - only a missed one can be stepped over, and it comes back.
 * With every slot passed, the last one.
 */
export function reachableSlotIndex(slots: readonly Slot[], completed: readonly string[], deferred: ReadonlySet<string>): number {
  const solved = new Set(completed);
  const first = slots.findIndex((s) => !solved.has(s.challengeId) && !deferred.has(slotKey(s)));
  return first >= 0 ? first : Math.max(0, slots.length - 1);
}

/**
 * Is a slot done, as the run's progress dots show it? A slot a question came
 * back in, and any slot of a Practice session (whose questions were all
 * solved long ago), only once the question was answered right in this run
 * (`solvedInRun`); a question's own place in a unit once it is solved at
 * all (`completed` - a lesson solved on an earlier visit stays done).
 */
export function slotDone(
  slot: Slot | null | undefined,
  run: { review: boolean; completed: readonly string[]; solvedInRun: ReadonlySet<string> }
): boolean {
  if (!slot) return false;
  if (run.review || slot.round > 0) return run.solvedInRun.has(slot.challengeId);
  return run.completed.includes(slot.challengeId);
}

/** The history once a slot is left behind with these attempts and hints (and maybe its answer shown). */
export function noteSlotLeft(history: ItemHistory | undefined, left: { attempts: number; hints: number; revealed: boolean }): ItemHistory {
  const before = history ?? EMPTY_HISTORY;
  return {
    attempts: before.attempts + Math.max(0, left.attempts),
    hints: before.hints + Math.max(0, left.hints),
    revealed: before.revealed || left.revealed,
    rounds: before.rounds
  };
}

/** What a solve in this slot reports: every try and hint of the run, and whether the answer was shown first. */
export function solveTotals(
  history: ItemHistory | undefined,
  slot: Slot | null,
  current: { attempts: number; hints: number }
): { attempts: number; hints: number; revealed: boolean; requeued: boolean } {
  const before = history ?? EMPTY_HISTORY;
  return {
    attempts: before.attempts + current.attempts,
    hints: before.hints + current.hints,
    revealed: before.revealed,
    // Back after a miss - in a later round, or in its own place after its answer was shown.
    requeued: Boolean(slot && slot.round > 0) || before.revealed || before.attempts > 0
  };
}
