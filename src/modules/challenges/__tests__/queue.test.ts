import { describe, expect, it } from 'vitest';
import {
  EMPTY_HISTORY,
  comesBack,
  dropSolved,
  initialSlots,
  noteSlotLeft,
  reachableSlotIndex,
  requeue,
  slotDone,
  slotKey,
  solveTotals,
  solvedThisRun
} from '../session/queue';
import type { Slot } from '../session/queue';

const ids = (slots: Slot[]) => slots.map((s) => `${s.challengeId}${s.round ? `+${s.round}` : ''}`);
const start = initialSlots([{ id: 'a' }, { id: 'b' }, { id: 'c' }]);

describe('initialSlots', () => {
  it('is one round-0 slot per question, in order', () => {
    expect(start).toEqual([
      { challengeId: 'a', round: 0 },
      { challengeId: 'b', round: 0 },
      { challengeId: 'c', round: 0 }
    ]);
    expect(initialSlots([])).toEqual([]);
  });
});

describe('requeue', () => {
  it('appends the next round of the question at the end', () => {
    const once = requeue(start, 'a', 2)!;
    expect(ids(once)).toEqual(['a', 'b', 'c', 'a+1']);
    const twice = requeue(once, 'a', 2, 3)!;
    expect(ids(twice)).toEqual(['a', 'b', 'c', 'a+1', 'a+2']);
  });

  it('respects maxRounds: past it, and with 0, the question does not come back', () => {
    const once = requeue(start, 'a', 1)!;
    expect(requeue(once, 'a', 1, 3)).toBeNull();
    expect(requeue(start, 'a', 0)).toBeNull();
  });

  it('adds nothing while a later slot for the question is still to come, or for a question not in the run', () => {
    const once = requeue(start, 'b', 2)!;
    expect(requeue(once, 'b', 2, 1)).toBeNull();
    expect(requeue(start, 'zzz', 2)).toBeNull();
  });

  it('lets the same question hold two slots, even back to back', () => {
    const single = initialSlots([{ id: 'a' }]);
    const again = requeue(single, 'a', 2)!;
    expect(ids(again)).toEqual(['a', 'a+1']);
    expect(new Set(again.map(slotKey)).size).toBe(2);
  });
});

describe('dropSolved', () => {
  it('drops the slots still to come for a solved question, never its own place', () => {
    const slots = requeue(requeue(start, 'a', 2)!, 'b', 2)!; // a b c a+1 b+1
    expect(ids(dropSolved(slots, 0, ['a']))).toEqual(['a', 'b', 'c', 'b+1']);
    // A slot already reached (at or before fromIndex) stays.
    expect(ids(dropSolved(slots, 3, ['a']))).toEqual(['a', 'b', 'c', 'a+1', 'b+1']);
    // Nothing to drop: the same array back.
    expect(dropSolved(slots, 0, [])).toBe(slots);
  });
});

describe('solvedThisRun', () => {
  it('leaves out what was solved before the run began, so a replay still requeues', () => {
    expect(solvedThisRun(['a', 'b', 'c'], new Set(['a', 'b']))).toEqual(['c']);
    expect(solvedThisRun(['a'], new Set())).toEqual(['a']);
    // A replayed unit: its requeued slot is not dropped for a question solved long ago.
    const slots = requeue(start, 'a', 2)!; // a b c a+1
    expect(ids(dropSolved(slots, 1, solvedThisRun(['a', 'b', 'c'], new Set(['a', 'b', 'c']))))).toEqual(['a', 'b', 'c', 'a+1']);
  });
});

describe('comesBack', () => {
  it('matches what requeue will do: a round left, or a slot already waiting', () => {
    expect(comesBack(start, 'a', 2, 0)).toBe(true);
    expect(comesBack(start, 'a', 0, 0)).toBe(false);
    const once = requeue(start, 'a', 1)!; // a b c a+1
    // Back in its own place with a later slot still to come: it does come back.
    expect(comesBack(once, 'a', 1, 0)).toBe(true);
    // In its last round with none left: it does not.
    expect(comesBack(once, 'a', 1, 3)).toBe(false);
  });
});

describe('reachableSlotIndex', () => {
  it('is the first unsolved slot, or the last once all are solved', () => {
    expect(reachableSlotIndex(start, [], new Set())).toBe(0);
    expect(reachableSlotIndex(start, ['a'], new Set())).toBe(1);
    expect(reachableSlotIndex(start, ['a', 'b', 'c'], new Set())).toBe(2);
    expect(reachableSlotIndex([], [], new Set())).toBe(0);
  });

  it('skips a deferred slot - the question comes back later in its own slot', () => {
    const slots = requeue(start, 'a', 2)!; // a b c a+1
    const deferred = new Set([slotKey(slots[0])]);
    expect(reachableSlotIndex(slots, [], deferred)).toBe(1);
    expect(reachableSlotIndex(slots, ['b', 'c'], deferred)).toBe(3);
    // Deferred again in its later round with no round left: every slot is passed.
    expect(reachableSlotIndex(slots, ['b', 'c'], new Set([...deferred, slotKey(slots[3])]))).toBe(3);
  });
});

describe('slotDone (the progress dots)', () => {
  const own = { challengeId: 'a', round: 0 };
  const again = { challengeId: 'a', round: 1 };

  it('marks a question’s own place done once it is solved at all - on an earlier visit too', () => {
    expect(slotDone(own, { review: false, completed: ['a'], solvedInRun: new Set() })).toBe(true);
    expect(slotDone(own, { review: false, completed: [], solvedInRun: new Set() })).toBe(false);
  });

  it('marks a slot a question came back in done only once it was solved in this run', () => {
    // A replay: solved on an earlier visit, missed now - still to get right.
    expect(slotDone(again, { review: false, completed: ['a'], solvedInRun: new Set() })).toBe(false);
    expect(slotDone(again, { review: false, completed: ['a'], solvedInRun: new Set(['a']) })).toBe(true);
  });

  it('in a Practice session, marks only the questions answered right in it', () => {
    expect(slotDone(own, { review: true, completed: ['a'], solvedInRun: new Set() })).toBe(false);
    expect(slotDone(own, { review: true, completed: ['a'], solvedInRun: new Set(['a']) })).toBe(true);
    expect(slotDone(undefined, { review: true, completed: ['a'], solvedInRun: new Set(['a']) })).toBe(false);
  });
});

describe('history and solve totals', () => {
  it('adds up tries and hints across the slots a question was left in', () => {
    const left = noteSlotLeft(undefined, { attempts: 2, hints: 1, revealed: true });
    expect(left).toEqual({ attempts: 2, hints: 1, revealed: true, rounds: 0 });
    expect(solveTotals(left, { challengeId: 'a', round: 1 }, { attempts: 1, hints: 0 })).toEqual({ attempts: 3, hints: 1, revealed: true, requeued: true });
  });

  it('a clean first pass is neither requeued nor revealed', () => {
    expect(solveTotals(undefined, { challengeId: 'a', round: 0 }, { attempts: 1, hints: 0 })).toEqual({ attempts: 1, hints: 0, revealed: false, requeued: false });
    expect(solveTotals(EMPTY_HISTORY, null, { attempts: 2, hints: 1 })).toMatchObject({ requeued: false });
  });
});
