import type { ZodType } from 'zod';

/**
 * Describes one kind of authored content - challenges, roadmaps, articles -
 * so the same discovery and validation code serves all of them. A module
 * declares a spec; the dev loader (Vite glob) and the build loader (Node) both
 * consume it, so "what counts as valid content" is defined exactly once.
 */
export interface ContentSpec<T> {
  /** 'challenges', 'roadmaps', 'articles', ... */
  kind: string;
  /** Content directory, relative to src/. */
  dir: string;
  /** File extensions that hold content. */
  extensions: readonly string[];
  /** Files under `dir` that are not content (loaders, specs, metadata), relative to `dir`. */
  exclude?: readonly string[];
  /**
   * How a file yields items:
   * - 'array'  a TS module whose `exportName` is an array of items
   * - 'single' a TS module whose `exportName` is one item
   * - 'text'   a text file; `parse` turns the whole file into one item
   */
  shape: 'array' | 'single' | 'text';
  exportName?: string;
  /** For 'text' content: turn the file into an item. Receives the path for ids/messages. */
  parse?: (text: string, file: string) => unknown;
  /**
   * The zod schema, loaded on demand: `() => import('../schema').then((m) => m.X)`.
   *
   * Lazy on purpose. Validation runs in development and in `npm run check`;
   * a production bundle has already passed it, so it never calls this and the
   * schema (and zod itself, ~50 kB) never reach the browser. See ADR 0002.
   */
  schema: () => Promise<ZodType<T>>;
  idOf: (item: T) => string;
  /** Deterministic order shared by every loader. Defaults to file path, then position. */
  compare?: (a: ContentRecord<T>, b: ContentRecord<T>) => number;
}

/** One item plus where it came from. */
export interface ContentRecord<T> {
  item: T;
  /** Path relative to the content dir, POSIX separators. */
  file: string;
  /** Position within the file, for 'array' shapes. */
  index: number;
}

export interface ContentIssue {
  file: string;
  id?: string;
  message: string;
}

export interface LoadResult<T> {
  items: T[];
  records: ContentRecord<T>[];
  issues: ContentIssue[];
  /**
   * Set by the dev loader: resolves once the deferred schema check has run
   * (with its issues), so tests can await it. Absent in production builds.
   */
  verified?: Promise<ContentIssue[]>;
}
