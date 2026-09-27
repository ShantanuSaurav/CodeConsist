import { describe, expect, it } from 'vitest';
import {
  addUnit,
  assignQuestion,
  editUnit,
  mergeWithNext,
  moveAcross,
  moveQuestion,
  moveUnit,
  removeUnit,
  splitAt,
  unplaced
} from '../services/unitEditing';
import type { EditorUnit } from '../services/unitEditing';

const ALL = ['q1', 'q2', 'q3', 'q4', 'q5', 'q6', 'q7'];
const start = (): EditorUnit[] => [
  { key: 'k1', id: 's:a1', name: 'One', challengeIds: ['q1', 'q2', 'q3'] },
  { key: 'k2', id: 's:a2', name: 'Two', challengeIds: ['q4', 'q5'] },
  { key: 'k3', id: 's:b1', name: 'Three', challengeIds: ['q6', 'q7'] }
];

/** Every question is in exactly one unit, and none is lost or invented. */
function expectEachOnce(units: EditorUnit[], all: string[] = ALL) {
  const placed = units.flatMap((u) => u.challengeIds);
  expect([...placed].sort()).toEqual([...all].sort());
  expect(new Set(placed).size).toBe(placed.length);
}

describe('unit editing operations', () => {
  it('each keeps every question exactly once', () => {
    const ops: Array<(u: EditorUnit[]) => EditorUnit[]> = [
      (u) => moveQuestion(u, 0, 0, 1),
      (u) => moveQuestion(u, 0, 2, 1), // past the end: no-op
      (u) => moveAcross(u, 1, 0, -1),
      (u) => moveAcross(u, 1, 1, 1),
      (u) => moveAcross(u, 0, 0, -1), // no previous unit: no-op
      (u) => splitAt(u, 0, 1, 'k-new'),
      (u) => splitAt(u, 0, 0, 'k-new'), // splitting before the first: no-op
      (u) => mergeWithNext(u, 1),
      (u) => mergeWithNext(u, 2), // no next: no-op
      (u) => addUnit(u, 'Four', 'k4'),
      (u) => removeUnit(u, 0), // not empty: no-op
      (u) => moveUnit(u, 2, -1),
      (u) => editUnit(u, 1, { name: 'Renamed', description: 'd' })
    ];
    for (const op of ops) expectEachOnce(op(start()));
    // And any sequence of them.
    let units = start();
    for (const op of [...ops, ...ops.reverse()]) units = op(units);
    expectEachOnce(units);
  });

  it('moves a question inside its unit and across units', () => {
    expect(moveQuestion(start(), 0, 0, 1)[0].challengeIds).toEqual(['q2', 'q1', 'q3']);
    const back = moveAcross(start(), 1, 0, -1);
    expect(back[0].challengeIds).toEqual(['q1', 'q2', 'q3', 'q4']);
    expect(back[1].challengeIds).toEqual(['q5']);
    const forward = moveAcross(start(), 0, 2, 1);
    expect(forward[1].challengeIds).toEqual(['q3', 'q4', 'q5']);
  });

  it('splits a unit into a new one right after it, keeping the id on the first half', () => {
    const split = splitAt(start(), 0, 1, 'k-new');
    expect(split.map((u) => [u.key, u.id, u.challengeIds])).toEqual([
      ['k1', 's:a1', ['q1']],
      ['k-new', undefined, ['q2', 'q3']],
      ['k2', 's:a2', ['q4', 'q5']],
      ['k3', 's:b1', ['q6', 'q7']]
    ]);
  });

  it('merges with the next unit, keeping the first id and name', () => {
    const merged = mergeWithNext(start(), 0);
    expect(merged).toHaveLength(2);
    expect(merged[0]).toMatchObject({ id: 's:a1', name: 'One', challengeIds: ['q1', 'q2', 'q3', 'q4', 'q5'] });
  });

  it('adds an empty unit, and deletes only an empty one', () => {
    const added = addUnit(start(), 'Four', 'k4');
    expect(added[3]).toEqual({ key: 'k4', name: 'Four', challengeIds: [] });
    expect(removeUnit(added, 3)).toHaveLength(3);
    expect(removeUnit(added, 0)).toHaveLength(4);
  });

  it('places a question that is in no unit, once', () => {
    const units = start().map((u) => (u.key === 'k3' ? { ...u, challengeIds: ['q6'] } : u));
    expect(unplaced(units, ALL)).toEqual(['q7']);
    const placed = assignQuestion(units, 'q7', 1);
    expectEachOnce(placed);
    // Already placed: left alone.
    expect(assignQuestion(placed, 'q7', 0)).toBe(placed);
  });
});
