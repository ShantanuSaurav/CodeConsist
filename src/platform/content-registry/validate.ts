import type { ZodError, ZodType } from 'zod';
import type { ContentIssue, ContentRecord, ContentSpec, LoadResult } from './types';
import { orderRecords } from './discover';

function describe(err: ZodError): string {
  return err.issues
    .slice(0, 5)
    .map((i) => `${i.path.length ? i.path.join('.') + ': ' : ''}${i.message}`)
    .join('; ');
}

/** Reject duplicate ids, naming where the first one lives. Pure. */
export function duplicateIds<T>(spec: ContentSpec<T>, records: ContentRecord<T>[]): ContentIssue[] {
  const issues: ContentIssue[] = [];
  const seen = new Map<string, string>();
  for (const record of records) {
    const id = spec.idOf(record.item);
    const where = `${record.file}#${record.index}`;
    const first = seen.get(id);
    if (first) issues.push({ file: record.file, id, message: `duplicate id "${id}" (first seen in ${first})` });
    else seen.set(id, where);
  }
  return issues;
}

/**
 * Validate raw records against a schema, reject duplicate ids, and return the
 * items in canonical order. Pure and synchronous: the same input gives the
 * same output in Vite and in Node, which is what the parity check relies on.
 * The schema is passed in because the spec only knows how to load it.
 */
export function validateRecords<T>(spec: ContentSpec<T>, raw: ContentRecord<unknown>[], schema: ZodType<T>): LoadResult<T> {
  const issues: ContentIssue[] = [];
  const valid: ContentRecord<T>[] = [];

  for (const record of raw) {
    const parsed = schema.safeParse(record.item);
    if (!parsed.success) {
      const maybeId = (record.item as { id?: unknown } | null)?.id;
      issues.push({
        file: record.file,
        id: typeof maybeId === 'string' ? maybeId : undefined,
        message: `#${record.index} invalid: ${describe(parsed.error)}`
      });
      continue;
    }
    valid.push({ item: parsed.data, file: record.file, index: record.index });
  }

  issues.push(...duplicateIds(spec, valid));

  const records = orderRecords(spec, valid);
  return { items: records.map((r) => r.item), records, issues };
}

/** Load the spec's schema, then validateRecords. What every loader and script calls. */
export async function validate<T>(spec: ContentSpec<T>, raw: ContentRecord<unknown>[]): Promise<LoadResult<T>> {
  return validateRecords(spec, raw, await spec.schema());
}

/** Format issues for a build log or a thrown error. */
export function formatIssues(spec: ContentSpec<unknown>, issues: ContentIssue[]): string {
  return [
    `${issues.length} problem(s) in ${spec.kind} content:`,
    ...issues.map((i) => `  ✗ ${spec.dir}/${i.file}: ${i.message}`)
  ].join('\n');
}

/** Validate and throw on the first problem - "fail loud" for scripts and tests. */
export async function assertValid<T>(spec: ContentSpec<T>, raw: ContentRecord<unknown>[]): Promise<LoadResult<T>> {
  const result = await validate(spec, raw);
  if (result.issues.length) throw new Error(formatIssues(spec as ContentSpec<unknown>, result.issues));
  return result;
}
