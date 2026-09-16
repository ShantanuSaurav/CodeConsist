import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import type { ContentSpec } from '../types';
import { matchesSpec, orderRecords } from '../discover';
import { assertValid, validateRecords } from '../validate';

interface Item {
  id: string;
  weight: number;
}

const spec: ContentSpec<Item> = {
  kind: 'items',
  dir: 'modules/test/content',
  extensions: ['.ts'],
  exclude: ['index.ts', 'spec.ts'],
  shape: 'array',
  exportName: 'items',
  schema: z.object({ id: z.string().min(1), weight: z.number() }).strict(),
  idOf: (i) => i.id
};

describe('content registry', () => {
  it('matches content files and skips loaders, specs, tests and declarations', () => {
    expect(matchesSpec(spec, 'topic/a.ts')).toBe(true);
    expect(matchesSpec(spec, 'index.ts')).toBe(false);
    expect(matchesSpec(spec, 'spec.ts')).toBe(false);
    expect(matchesSpec(spec, 'topic/a.test.ts')).toBe(false);
    expect(matchesSpec(spec, 'types.d.ts')).toBe(false);
    expect(matchesSpec(spec, 'notes.md')).toBe(false);
  });

  it('validates against the schema and reports the file and position', () => {
    const result = validateRecords(spec, [
      { item: { id: 'a', weight: 1 }, file: 'x.ts', index: 0 },
      { item: { id: 'b', weight: 'heavy' }, file: 'x.ts', index: 1 },
      { item: { id: 'c', weight: 2, extra: true }, file: 'y.ts', index: 0 }
    ]);
    expect(result.items.map((i) => i.id)).toEqual(['a']);
    expect(result.issues).toHaveLength(2);
    expect(result.issues[0]).toMatchObject({ file: 'x.ts', id: 'b' });
    expect(result.issues[0].message).toMatch(/#1 invalid/);
    expect(result.issues[1].message).toMatch(/Unrecognized key/);
  });

  it('rejects duplicate ids and names where the first one lives', () => {
    const result = validateRecords(spec, [
      { item: { id: 'a', weight: 1 }, file: 'x.ts', index: 0 },
      { item: { id: 'a', weight: 2 }, file: 'y.ts', index: 3 }
    ]);
    expect(result.issues).toHaveLength(1);
    expect(result.issues[0].message).toMatch(/duplicate id "a" \(first seen in x\.ts#0\)/);
  });

  it('orders by file then position by default, or by the spec comparator', () => {
    const raw = [
      { item: { id: 'c', weight: 3 }, file: 'b.ts', index: 0 },
      { item: { id: 'a', weight: 1 }, file: 'a.ts', index: 1 },
      { item: { id: 'b', weight: 2 }, file: 'a.ts', index: 0 }
    ];
    expect(validateRecords(spec, raw).items.map((i) => i.id)).toEqual(['b', 'a', 'c']);

    const byWeightDesc: ContentSpec<Item> = { ...spec, compare: (x, y) => y.item.weight - x.item.weight };
    expect(orderRecords(byWeightDesc, raw as any).map((r) => r.item.id)).toEqual(['c', 'b', 'a']);
  });

  it('assertValid throws a message that includes the path', () => {
    expect(() => assertValid(spec, [{ item: { id: '', weight: 1 }, file: 'topic/bad.ts', index: 0 }])).toThrow(
      /modules\/test\/content\/topic\/bad\.ts/
    );
  });
});
