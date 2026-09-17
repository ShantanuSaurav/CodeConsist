import { describe, expect, it } from 'vitest';
import { canonicalize, checkBlank, matchesExpected, parseExpected, sameSet } from '../grading';
import { choiceOrder, moveItem, optionOrder, shuffleLines } from '../answers';
import type { Challenge } from '@/types';

describe('matchesExpected', () => {
  it('compares structurally, not by text', () => {
    expect(matchesExpected([0, 1], '[0, 1]')).toBe(true);
    expect(matchesExpected([0, 1], '[0,1]')).toBe(true);
    expect(matchesExpected({ b: 1, a: 2 }, '{"a": 2, "b": 1}')).toBe(true);
    expect(matchesExpected('1', '1')).toBe(false); // a string is not a number
    expect(matchesExpected(1, '"1"')).toBe(false);
  });

  it('handles cyclic values without hanging', () => {
    const a: any = { name: 'a' };
    a.self = a;
    expect(typeof canonicalize(a)).toBe('string');
  });

  it('parseExpected reports non-JSON literals', () => {
    expect(parseExpected('[1, 2]').ok).toBe(true);
    expect(parseExpected('undefined').ok).toBe(false);
  });
});

describe('blank and set checks', () => {
  it('checkBlank normalises whitespace and accepts alternatives', () => {
    expect(checkBlank('  const ', 'const', [])).toBe(true);
    expect(checkBlank('let', 'const', ['let'])).toBe(true);
    expect(checkBlank('var', 'const', ['let'])).toBe(false);
  });

  it('sameSet ignores order and duplicates', () => {
    expect(sameSet([2, 0, 1], [0, 1, 2])).toBe(true);
    expect(sameSet([0, 1], [0, 1, 2])).toBe(false);
  });
});

describe('seeded shuffles', () => {
  const challenge = {
    id: 'stage-1-a01',
    options: ['a', 'b', 'c', 'd'],
    pseudocodeLines: ['one', 'two', 'three', 'four']
  } as unknown as Challenge;

  it('are deterministic per challenge and cover every option', () => {
    const first = optionOrder(challenge);
    expect(optionOrder(challenge)).toEqual(first);
    expect([...first].sort()).toEqual([0, 1, 2, 3]);
  });

  it('never hand back the correct pseudocode order', () => {
    const shuffled = shuffleLines(challenge);
    expect(shuffled).not.toEqual(challenge.pseudocodeLines);
    expect([...shuffled].sort()).toEqual([...(challenge.pseudocodeLines ?? [])].sort());
  });

  it('choiceOrder keeps the same choices', () => {
    const out = choiceOrder(challenge, 0, ['x', 'y', 'z']);
    expect([...out].sort()).toEqual(['x', 'y', 'z']);
  });

  it('moveItem is a pure reorder', () => {
    const items = ['a', 'b', 'c'];
    expect(moveItem(items, 0, 2)).toEqual(['b', 'c', 'a']);
    expect(items).toEqual(['a', 'b', 'c']);
    expect(moveItem(items, 5, 0)).toBe(items);
  });
});
