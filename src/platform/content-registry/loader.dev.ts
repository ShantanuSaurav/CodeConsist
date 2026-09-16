import type { ContentRecord, ContentSpec, LoadResult } from './types';
import { matchesSpec, normalisePath } from './discover';
import { formatIssues, validateRecords } from './validate';

/**
 * Turn the result of an eager `import.meta.glob(...)` into validated content.
 *
 * Vite needs the glob pattern as a literal in the calling module, so each
 * module's content/index.ts owns its own `import.meta.glob`; this function is
 * everything after that. scripts/check-content-parity.mjs asserts that the
 * literal matches the spec, so the two cannot drift silently.
 *
 * Every item is validated. In development a bad file throws with its path; in
 * production (where the bundle already passed `npm run content:validate`) a
 * problem is logged and the valid items are served rather than a blank page.
 */
export function loadFromGlob<T>(
  spec: ContentSpec<T>,
  modules: Record<string, unknown>,
  options: { strict?: boolean } = {}
): LoadResult<T> {
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

  const result = validateRecords(spec, raw);
  if (result.issues.length) {
    const message = formatIssues(spec as ContentSpec<unknown>, result.issues);
    if (options.strict ?? import.meta.env.DEV) throw new Error(message);
    console.error(message);
  }
  return result;
}
