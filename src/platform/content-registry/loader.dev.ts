import type { ContentRecord, ContentSpec, LoadResult } from './types';
import { matchesSpec, normalisePath, orderRecords } from './discover';
import { formatIssues, validateRecords } from './validate';

/**
 * Turn an eager `import.meta.glob(...)` result into raw records: one per
 * item, tagged with its file and position. Shape problems (a missing export,
 * a non-array) throw right here - they are author mistakes, not data errors.
 */
export function collectRecords<T>(spec: ContentSpec<T>, modules: Record<string, unknown>): ContentRecord<unknown>[] {
  const raw: ContentRecord<unknown>[] = [];

  for (const [globPath, mod] of Object.entries(modules)) {
    const file = normalisePath(globPath);
    if (!matchesSpec(spec, file)) continue;

    if (spec.shape === 'text') {
      const text = typeof mod === 'string' ? mod : ((mod as { default?: unknown })?.default as string);
      raw.push({ item: spec.parse ? spec.parse(String(text), file) : text, file, index: 0 });
      continue;
    }

    const exported = (mod as Record<string, unknown>)[spec.exportName ?? 'default'];
    if (exported === undefined) {
      throw new Error(`${spec.dir}/${file}: expected a named export "${spec.exportName}"`);
    }
    if (spec.shape === 'array') {
      if (!Array.isArray(exported)) throw new Error(`${spec.dir}/${file}: "${spec.exportName}" is not an array`);
      exported.forEach((item, index) => raw.push({ item, file, index }));
    } else {
      raw.push({ item: exported, file, index: 0 });
    }
  }
  return raw;
}

/**
 * The browser-side loader: everything after the module's own
 * `import.meta.glob` literal (Vite needs the pattern in the calling file;
 * scripts/check-content-parity.mjs asserts it matches the spec).
 *
 * It orders the records and returns them synchronously WITHOUT running the
 * schema. A production bundle only exists because `npm run content:validate`
 * passed on exactly these files, so re-validating in every visitor's browser
 * would buy nothing and cost them zod plus the schemas (~55 kB). In
 * development the schema is fetched in the background and any problem is
 * thrown with its file path - the same message the CI check prints.
 */
export function loadFromGlob<T>(spec: ContentSpec<T>, modules: Record<string, unknown>): LoadResult<T> {
  const raw = collectRecords(spec, modules);
  const records = orderRecords(spec, raw as ContentRecord<T>[]);
  const result: LoadResult<T> = { items: records.map((r) => r.item), records, issues: [] };

  if (import.meta.env.DEV) {
    result.verified = spec.schema().then((schema) => {
      const { issues } = validateRecords(spec, raw, schema);
      if (issues.length) {
        const message = formatIssues(spec as ContentSpec<unknown>, issues);
        console.error(message);
        // Surface it as an uncaught error too, so it is impossible to miss.
        queueMicrotask(() => {
          throw new Error(message);
        });
      }
      return issues;
    });
  }

  return result;
}
