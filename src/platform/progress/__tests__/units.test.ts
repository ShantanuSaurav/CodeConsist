import { describe, expect, it } from 'vitest';
import type { ChallengeType } from '@/types';
import { DEFAULT_UNIT_SETTINGS, defaultUnits, estimateMinutes, resolveUnits, toUnitDefs, unitFor, unitStates, validateUnitOverride } from '../units';
import type { UnitLesson } from '../units';

/** `n` lessons in batch `letter` of `stageId`, quizzes worth 10 XP. */
function batch(stageId: string, letter: string, n: number, type: ChallengeType = 'quiz'): UnitLesson[] {
  return Array.from({ length: n }, (_, i) => ({ id: `${stageId}-${letter}${String(i + 1).padStart(2, '0')}`, type, xpReward: 10 }));
}

const sizes = (lessons: UnitLesson[], stageId = 's') => defaultUnits(stageId, lessons).map((u) => u.challengeIds.length);

describe('defaultUnits', () => {
  it('cuts a run into balanced chunks: 10, 12, 11, 15, 17', () => {
    expect(sizes(batch('s', 'a', 10))).toEqual([5, 5]);
    expect(sizes(batch('s', 'a', 12))).toEqual([6, 6]);
    expect(sizes(batch('s', 'a', 11))).toEqual([6, 5]);
    expect(sizes(batch('s', 'a', 15))).toEqual([5, 5, 5]);
    expect(sizes(batch('s', 'a', 17))).toEqual([6, 6, 5]);
  });

  it('splits by batch letter, in order, and names the ids stageId:letter+k', () => {
    const units = defaultUnits('stage-3', [...batch('stage-3', 'a', 10), ...batch('stage-3', 'b', 10)]);
    expect(units.map((u) => u.id)).toEqual(['stage-3:a1', 'stage-3:a2', 'stage-3:b1', 'stage-3:b2']);
    expect(units.map((u) => u.name)).toEqual(['Unit 1', 'Unit 2', 'Unit 3', 'Unit 4']);
    expect(units.every((u) => u.source === 'default')).toBe(true);
    // Stage 1 does not claim stage 10's lessons.
    expect(defaultUnits('stage-1', batch('stage-10', 'a', 5)).map((u) => u.id)).toEqual(['stage-1:x1']);
  });

  it('puts ids without a batch letter (written in the admin) in run x', () => {
    const lessons = [...batch('stage-3', 'a', 5), { id: 'custom-stage-3-loops-ab12', type: 'quiz' as const }, { id: 'custom-stage-3-maps-cd34', type: 'quiz' as const }, { id: 'custom-stage-3-sets-ef56', type: 'quiz' as const }];
    expect(defaultUnits('stage-3', lessons).map((u) => u.id)).toEqual(['stage-3:a1', 'stage-3:x1']);
  });

  it('merges a small trailing run into the unit before when that stays within maxSize', () => {
    const two = [...batch('s', 'a', 5), ...batch('s', 'x', 2)];
    expect(sizes(two)).toEqual([7]);
    // 6 + 3 = 9 > 8: stays separate (and 3 is not below minSize anyway).
    expect(sizes([...batch('s', 'a', 6), ...batch('s', 'x', 3)])).toEqual([6, 3]);
    // 7 + 2 = 9 > 8: the small tail stays on its own.
    expect(sizes([...batch('s', 'a', 7), ...batch('s', 'x', 2)])).toEqual([7, 2]);
  });

  it('leaves the stage test out, and keeps a returning letter unique', () => {
    const lessons = [...batch('s', 'a', 5), { id: 's-test', type: 'code_runner' as const, isStageTest: true }, ...batch('s', 'b', 5)];
    expect(defaultUnits('s', lessons).flatMap((u) => u.challengeIds)).not.toContain('s-test');
    const interleaved = [...batch('s', 'a', 5), ...batch('s', 'b', 5), ...batch('s', 'a', 5).map((l) => ({ ...l, id: `${l.id}z` }))];
    const ids = defaultUnits('s', interleaved).map((u) => u.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('resolveUnits', () => {
  const lessons = [...batch('s', 'a', 6), { id: 's-test', type: 'code_runner' as const, isStageTest: true }];

  it('uses the default grouping without an override', () => {
    const units = resolveUnits('s', lessons, null);
    expect(units.map((u) => u.challengeIds.length)).toEqual([6]);
    expect(units[0]).toMatchObject({ stageId: 's', index: 0, source: 'default', xp: 60, estMinutes: 3 });
  });

  it('drops unknown and hidden ids and empty units, never includes the test, and appends leftovers to :auto', () => {
    // s-a06 is hidden (not among the lessons passed in); s-a05 is in no unit.
    const visible = lessons.filter((l) => l.id !== 's-a06');
    const units = resolveUnits('s', visible, [
      { id: 's:m1', name: 'Second', challengeIds: ['s-a03', 's-a04', 'ghost', 's-test'] },
      { id: 's:m2', name: 'Empty', challengeIds: ['s-a06'] },
      { id: 's:m3', name: 'First', challengeIds: ['s-a01', 's-a02', 's-a03'] }
    ]);
    expect(units.map((u) => [u.id, u.challengeIds])).toEqual([
      ['s:m1', ['s-a03', 's-a04']],
      ['s:m3', ['s-a01', 's-a02']],
      ['s:auto', ['s-a05']]
    ]);
    expect(units.map((u) => u.source)).toEqual(['custom', 'custom', 'auto']);
    // The units ARE the lesson order.
    expect(units.flatMap((u) => u.challenges.map((c) => c.id))).toEqual(['s-a03', 's-a04', 's-a01', 's-a02', 's-a05']);
  });

  it('keeps the source the server sent, and round-trips through toUnitDefs', () => {
    const units = resolveUnits('s', lessons, [{ id: 's:a1', name: 'Unit 1', challengeIds: batch('s', 'a', 6).map((l) => l.id), source: 'default' }]);
    expect(units[0].source).toBe('default');
    expect(toUnitDefs(units)).toEqual([{ id: 's:a1', name: 'Unit 1', challengeIds: batch('s', 'a', 6).map((l) => l.id), source: 'default' }]);
  });

  it('with the default cut from every lesson, hiding one shrinks only its own unit', () => {
    const all = [...batch('s', 'a', 10), ...batch('s', 'b', 10)];
    const visible = all.filter((l) => l.id !== 's-a01');
    const units = resolveUnits('s', visible, defaultUnits('s', all));
    expect(units.map((u) => u.challengeIds.length)).toEqual([4, 5, 5, 5]);
    expect(units[1].challengeIds[0]).toBe('s-a06');
    // Cut from the visible lessons alone, the stage would re-balance and s-a06 would move.
    expect(resolveUnits('s', visible, null)[0].challengeIds).toContain('s-a06');
  });

  it('numbers default units by place, so a wholly hidden one leaves no gap - an admin name is kept', () => {
    const all = [...batch('s', 'a', 10), ...batch('s', 'b', 10)];
    const visible = all.filter((l) => !['s-a06', 's-a07', 's-a08', 's-a09', 's-a10'].includes(l.id));
    const units = resolveUnits('s', visible, defaultUnits('s', all));
    expect(units.map((u) => [u.id, u.name])).toEqual([
      ['s:a1', 'Unit 1'],
      ['s:b1', 'Unit 2'],
      ['s:b2', 'Unit 3']
    ]);
    const custom = resolveUnits('s', visible, [
      { id: 's:m1', name: 'Gone', challengeIds: ['s-a06'] },
      { id: 's:m2', name: 'Kept name', challengeIds: visible.map((l) => l.id) }
    ]);
    expect(custom.map((u) => u.name)).toEqual(['Kept name']);
  });
});

describe('unitStates, unitFor, estimateMinutes', () => {
  const units = [
    { id: 'u1', challengeIds: ['a', 'b'] },
    { id: 'u2', challengeIds: ['c', 'd'] },
    { id: 'u3', challengeIds: ['e'] }
  ];

  it('opens units in order: done, then the current one, then locked - a done unit later on stays open', () => {
    expect(unitStates(units, []).map((s) => s.state)).toEqual(['current', 'locked', 'locked']);
    expect(unitStates(units, ['a', 'b', 'c']).map((s) => [s.state, s.done, s.total])).toEqual([
      ['done', 2, 2],
      ['current', 1, 2],
      ['locked', 0, 1]
    ]);
    expect(unitStates(units, ['e']).map((s) => s.state)).toEqual(['current', 'locked', 'done']);
    expect(unitStates(units, ['a', 'b', 'c', 'd', 'e']).every((s) => s.state === 'done')).toBe(true);
  });

  it('finds the unit of a question', () => {
    expect(unitFor(units, 'd')?.id).toBe('u2');
    expect(unitFor(units, 'zzz')).toBeNull();
    expect(unitFor(null, 'a')).toBeNull();
  });

  it('adds up the minutes per kind, to the nearest half minute', () => {
    expect(estimateMinutes([{ type: 'quiz' }, { type: 'code_runner' }, { type: 'output_prediction' }])).toBe(5.5);
    expect(estimateMinutes([{ type: 'quiz' }], { minutesByType: { ...DEFAULT_UNIT_SETTINGS.minutesByType, quiz: 2 } })).toBe(2);
  });
});

describe('validateUnitOverride', () => {
  const lessons: UnitLesson[] = [
    ...batch('s', 'a', 6).map((l, i) => ({ ...l, title: `Lesson ${i + 1}` })),
    { id: 's-test', type: 'code_runner', isStageTest: true }
  ];
  const ids = lessons.filter((l) => !l.isStageTest).map((l) => l.id);
  const stageOf = (id: string) => (id.startsWith('t-') ? 't' : id.startsWith('s-') ? 's' : null);
  const validate = (units: unknown) => validateUnitOverride('s', lessons, { units }, DEFAULT_UNIT_SETTINGS, { stageOf });
  const messages = (units: unknown) => validate(units).issues.map((i) => `${i.path}: ${i.message}`);

  it('accepts a grouping that places every lesson once, and tidies names', () => {
    const result = validate([{ id: 's:a1', name: '  Basics  ', challengeIds: ids.slice(0, 3) }, { name: 'More', description: 'd', challengeIds: ids.slice(3) }]);
    expect(result.issues).toEqual([]);
    expect(result.units).toEqual([
      { id: 's:a1', name: 'Basics', challengeIds: ids.slice(0, 3) },
      { name: 'More', description: 'd', challengeIds: ids.slice(3) }
    ]);
  });

  it('refuses every broken grouping, naming where', () => {
    expect(messages([{ name: 'A', challengeIds: [...ids, 't-a01'] }])).toEqual(['units.0.challengeIds.6: t-a01 belongs to another stage (t).']);
    expect(messages([{ name: 'A', challengeIds: [...ids, 'ghost'] }])).toEqual(['units.0.challengeIds.6: There is no question ghost in this stage.']);
    expect(messages([{ name: 'A', challengeIds: [...ids, 's-test'] }])[0]).toMatch(/^units\.0\.challengeIds\.6: The stage test/);
    expect(messages([{ name: 'A', challengeIds: ids }, { name: 'B', challengeIds: [ids[0]] }])[0]).toMatch(/^units\.1\.challengeIds\.0: .* already in unit 1/);
    expect(messages([{ name: 'A', challengeIds: ids.slice(1) }])).toEqual([`units: "Lesson 1" (${ids[0]}) is not in any unit.`]);
    expect(messages([{ name: ' ', challengeIds: ids }])).toEqual(['units.0.name: Give the unit a name.']);
    expect(messages([{ name: 'x'.repeat(61), challengeIds: ids }])).toEqual(['units.0.name: At most 60 characters.']);
    expect(messages([{ name: 'A', description: 'd'.repeat(201), challengeIds: ids }])).toEqual(['units.0.description: At most 200 characters.']);
    expect(messages([{ name: 'A', challengeIds: ids }, { name: 'Empty', challengeIds: [] }])[0]).toMatch(/^units\.1\.challengeIds: A unit needs at least one question/);
    expect(messages([{ id: 't:a1', name: 'A', challengeIds: ids }])[0]).toMatch(/^units\.0\.id: /);
    expect(messages([{ id: 'nonsense', name: 'A', challengeIds: ids }])[0]).toMatch(/^units\.0\.id: /);
    expect(messages([{ id: 's:m1', name: 'A', challengeIds: ids.slice(0, 3) }, { id: 's:m1', name: 'B', challengeIds: ids.slice(3) }])).toEqual([
      'units.1.id: s:m1 is used by two units.'
    ]);
    expect(validate('nope').issues).toEqual([{ path: 'units', message: 'Send the units as a list.' }]);
  });

  it('refuses more than 40 units and more than 30 questions in one', () => {
    const many = Array.from({ length: 41 }, (_, i) => ({ name: `U${i}`, challengeIds: i < ids.length ? [ids[i]] : [] }));
    expect(validate(many).issues.map((i) => i.message)).toContain('At most 40 units.');
    const big: UnitLesson[] = batch('s', 'a', 31);
    const result = validateUnitOverride('s', big, { units: [{ name: 'All', challengeIds: big.map((l) => l.id) }] });
    expect(result.issues.map((i) => i.message)).toContain('At most 30 questions in a unit.');
  });

  it('warns - without refusing - about a unit outside the size or time targets', () => {
    const result = validate([{ name: 'Tiny', challengeIds: ids.slice(0, 1) }, { name: 'Rest', challengeIds: ids.slice(1) }]);
    expect(result.issues).toEqual([]);
    expect(result.warnings).toEqual([{ path: 'units.0', message: '1 question - outside the 3-8 target.' }]);
    const code: UnitLesson[] = batch('s', 'a', 3, 'code_runner');
    const slow = validateUnitOverride('s', code, { units: [{ name: 'Code', challengeIds: code.map((l) => l.id) }] });
    expect(slow.warnings).toEqual([{ path: 'units.0', message: 'About 12 minutes - over the 8-minute target.' }]);
  });
});
