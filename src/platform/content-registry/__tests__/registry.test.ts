import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import type { ContentSpec } from '../types';
import { matchesSpec, orderRecords } from '../discover';
import { assertValid, validate, validateRecords } from '../validate';
import { collectRecords, loadFromGlob } from '../loader.dev';

interface Item {
  id: string;
  weight: number;
}

const schema = z.object({ id: z.string().min(1), weight: z.number() }).strict();

const spec: ContentSpec<Item> = {
  kind: 'items',
  dir: 'modules/test/content',
  extensions: ['.ts'],
  exclude: ['index.ts', 'spec.ts'],
  shape: 'array',
  exportName: 'items',
  schema: async () => schema,
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
    const result = validateRecords(
      spec,
      [
        { item: { id: 'a', weight: 1 }, file: 'x.ts', index: 0 },
        { item: { id: 'b', weight: 'heavy' }, file: 'x.ts', index: 1 },
        { item: { id: 'c', weight: 2, extra: true }, file: 'y.ts', index: 0 }
      ],
      schema
    );
    expect(result.items.map((i) => i.id)).toEqual(['a']);
    expect(result.issues).toHaveLength(2);
    expect(result.issues[0]).toMatchObject({ file: 'x.ts', id: 'b' });
    expect(result.issues[0].message).toMatch(/#1 invalid/);
    expect(result.issues[1].message).toMatch(/Unrecognized key/);
  });

  it('validate() loads the schema from the spec on demand', async () => {
    let loads = 0;
    const lazy: ContentSpec<Item> = { ...spec, schema: async () => (loads++, schema) };
    const result = await validate(lazy, [{ item: { id: 'a', weight: 1 }, file: 'x.ts', index: 0 }]);
    expect(result.items).toHaveLength(1);
    expect(loads).toBe(1);
  });

  it('rejects duplicate ids and names where the first one lives', () => {
    const result = validateRecords(
      spec,
      [
        { item: { id: 'a', weight: 1 }, file: 'x.ts', index: 0 },
        { item: { id: 'a', weight: 2 }, file: 'y.ts', index: 3 }
      ],
      schema
    );
    expect(result.issues).toHaveLength(1);
    expect(result.issues[0].message).toMatch(/duplicate id "a" \(first seen in x\.ts#0\)/);
  });

  it('orders by file then position by default, or by the spec comparator', () => {
    const raw = [
      { item: { id: 'c', weight: 3 }, file: 'b.ts', index: 0 },
      { item: { id: 'a', weight: 1 }, file: 'a.ts', index: 1 },
      { item: { id: 'b', weight: 2 }, file: 'a.ts', index: 0 }
    ];
    expect(validateRecords(spec, raw, schema).items.map((i) => i.id)).toEqual(['b', 'a', 'c']);

    const byWeightDesc: ContentSpec<Item> = { ...spec, compare: (x, y) => y.item.weight - x.item.weight };
    expect(orderRecords(byWeightDesc, raw as any).map((r) => r.item.id)).toEqual(['c', 'b', 'a']);
  });

  it('assertValid throws a message that includes the path', async () => {
    await expect(assertValid(spec, [{ item: { id: '', weight: 1 }, file: 'topic/bad.ts', index: 0 }])).rejects.toThrow(
      /modules\/test\/content\/topic\/bad\.ts/
    );
  });

  describe('browser loader', () => {
    const modules = {
      './topic/b.ts': { items: [{ id: 'b1', weight: 2 }] },
      './topic/a.ts': { items: [{ id: 'a1', weight: 1 }, { id: 'a2', weight: 3 }] },
      './index.ts': { items: [{ id: 'ignored', weight: 0 }] },
      './topic/a.test.ts': { items: [{ id: 'ignored', weight: 0 }] }
    };

    it('collects records from the glob result, skipping excluded files', () => {
      const raw = collectRecords(spec, modules);
      expect(raw.map((r) => `${r.file}#${r.index}`)).toEqual(['topic/b.ts#0', 'topic/a.ts#0', 'topic/a.ts#1']);
    });

    it('throws on a missing export - an authoring mistake, not a data error', () => {
      expect(() => collectRecords(spec, { './topic/c.ts': { challenges: [] } })).toThrow(/expected a named export "items"/);
      expect(() => collectRecords(spec, { './topic/c.ts': { items: {} } })).toThrow(/is not an array/);
    });

    it('returns ordered items synchronously and verifies in the background', async () => {
      const result = loadFromGlob(spec, modules);
      expect(result.items.map((i) => i.id)).toEqual(['a1', 'a2', 'b1']);
      // Vitest runs in development mode, so the deferred check is present and clean.
      expect(result.verified).toBeDefined();
      await expect(result.verified).resolves.toEqual([]);
    });
  });
});
