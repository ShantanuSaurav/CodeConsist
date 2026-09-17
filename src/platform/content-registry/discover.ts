import type { ContentRecord, ContentSpec } from './types';

/** Normalise a path to POSIX separators without a leading "./". */
export function normalisePath(p: string): string {
  return p.replace(/\\/g, '/').replace(/^\.\//, '');
}

/** Does a file (relative to the spec's dir) count as content for this spec? */
export function matchesSpec(spec: Pick<ContentSpec<unknown>, 'extensions' | 'exclude'>, relativeFile: string): boolean {
  const file = normalisePath(relativeFile);
  if (!spec.extensions.some((ext) => file.endsWith(ext))) return false;
  if (spec.exclude?.includes(file)) return false;
  // Tests and type declarations are never content.
  if (/\.(test|spec|d)\.[tj]sx?$/.test(file)) return false;
  return true;
}

/** Default order: by file path, then by position in the file. */
export function byPathThenIndex<T>(a: ContentRecord<T>, b: ContentRecord<T>): number {
  return a.file < b.file ? -1 : a.file > b.file ? 1 : a.index - b.index;
}

/** Sort records with the spec's comparator (or the default). Stable. */
export function orderRecords<T>(spec: ContentSpec<T>, records: ContentRecord<T>[]): ContentRecord<T>[] {
  const compare = spec.compare ?? byPathThenIndex;
  return records
    .map((r, i) => ({ r, i }))
    .sort((x, y) => compare(x.r, y.r) || x.i - y.i)
    .map(({ r }) => r);
}
