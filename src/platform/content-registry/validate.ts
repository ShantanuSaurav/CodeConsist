import type { ZodError } from 'zod';
import type { ContentIssue, ContentRecord, ContentSpec, LoadResult } from './types';
import { orderRecords } from './discover';

function describe(err: ZodError): string {
  return err.issues
    .slice(0, 5)
    .map((i) => `${i.path.length ? i.path.join('.') + ': ' : ''}${i.message}`)
    .join('; ');
}

/**
 * Validate raw records against the spec's schema, reject duplicate ids, and
 * return the items in canonical order. Pure: the same input gives the same
 * output in Vite and in Node, which is what the parity check relies on.
 */
export function validateRecords<T>(spec: ContentSpec<T>, raw: ContentRecord<unknown>[]): LoadResult<T> {
  const issues: ContentIssue[] = [];
  const valid: ContentRecord<T>[] = [];

  for (const record of raw) {
    const parsed = spec.schema.safeParse(record.item);
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

  const seen = new Map<string, string>();
  for (const record of valid) {
    const id = spec.idOf(record.item);
    const where = `${record.file}#${record.index}`;
    const first = seen.get(id);
    if (first) issues.push({ file: record.file, id, message: `duplicate id "${id}" (first seen in ${first})` });
    else seen.set(id, where);
  }

  const records = orderRecords(spec, valid);
  return { items: records.map((r) => r.item), records, issues };
}

/** Format issues for a build log or a thrown error. */
export function formatIssues(spec: ContentSpec<unknown>, issues: ContentIssue[]): string {
  return [
    `${issues.length} problem(s) in ${spec.kind} content:`,
    ...issues.map((i) => `  ✗ ${spec.dir}/${i.file}: ${i.message}`)
  ].join('\n');
}

/** Validate and throw on the first problem - the dev loader's "fail loud". */
export function assertValid<T>(spec: ContentSpec<T>, raw: ContentRecord<unknown>[]): LoadResult<T> {
  const result = validateRecords(spec, raw);
  if (result.issues.length) throw new Error(formatIssues(spec as ContentSpec<unknown>, result.issues));
  return result;
}
