/* ==========================================================================
   Answer normalisation & comparison.

   Shared by the in-browser grader, the Node test harness and
   scripts/validate-content.mjs so that "correct" means one thing everywhere.
   ========================================================================== */

/**
 * Deterministic string form of a runtime value: object keys sorted, undefined
 * folded to null, Sets/Maps given a stable shape. Two values are equal iff
 * their canonical forms are equal.
 */
export function canonicalize(value: unknown): string {
  // The set of objects on the CURRENT path from the root, not every object
  // ever visited. A value that appears twice - `const row = [0, 0]; return
  // [row, row]` - is a perfectly good answer and must canonicalise to its
  // contents both times. Only a true cycle (an object inside itself) gets the
  // marker. The previous visit-set rejected every shared sub-object.
  const onPath = new WeakSet<object>();

  const walk = (v: any): any => {
    if (v === undefined) return null;
    if (v === null) return null;

    const t = typeof v;
    if (t === 'number') {
      if (Number.isNaN(v)) return '__NaN__';
      if (!Number.isFinite(v)) return v > 0 ? '__Infinity__' : '__-Infinity__';
      // -0 and 0 are the same answer as far as a learner is concerned.
      return v === 0 ? 0 : v;
    }
    if (t === 'bigint') return `${v.toString()}n`;
    if (t === 'string' || t === 'boolean') return v;
    if (t === 'function') return '__function__';
    if (t === 'symbol') return String(v);

    if (onPath.has(v)) return '__circular__';
    onPath.add(v);
    try {
      if (Array.isArray(v)) return v.map(walk);
      if (v instanceof Set) return { __set: Array.from(v).map(walk) };
      if (v instanceof Map) {
        return { __map: Array.from(v.entries()).map(([k, val]) => [walk(k), walk(val)]) };
      }
      if (v instanceof Date) return { __date: v.toISOString() };
      if (v instanceof Error) return { __error: v.message };

      const out: Record<string, any> = {};
      for (const key of Object.keys(v).sort()) out[key] = walk(v[key]);
      return out;
    } finally {
      onPath.delete(v);
    }
  };

  try {
    return JSON.stringify(walk(value));
  } catch {
    return String(value);
  }
}

/** Turn Python/JS-flavoured literals into something JSON.parse accepts. */
function toJsonish(raw: string): string[] {
  const variants = new Set<string>();
  const trimmed = raw.trim();
  variants.add(trimmed);

  // Python literals
  variants.add(
    trimmed
      .replace(/\bTrue\b/g, 'true')
      .replace(/\bFalse\b/g, 'false')
      .replace(/\bNone\b/g, 'null')
  );

  // Single-quoted strings -> double-quoted (only when there are no double quotes
  // already, so we never corrupt a string that legitimately contains quotes).
  if (trimmed.includes("'") && !trimmed.includes('"')) {
    variants.add(trimmed.replace(/'/g, '"'));
  }

  // Trailing commas
  variants.add(trimmed.replace(/,\s*([}\]])/g, '$1'));

  return Array.from(variants);
}

/**
 * Parse an authored `expected` literal. Returns `{ok:false}` when the text is
 * not a literal at all — callers then fall back to loose string comparison.
 */
export function parseExpected(expected: string): { ok: true; value: unknown } | { ok: false } {
  for (const candidate of toJsonish(expected)) {
    try {
      return { ok: true, value: JSON.parse(candidate) };
    } catch {
      /* try the next variant */
    }
  }
  return { ok: false };
}

/** Whitespace-insensitive comparison of two strings. */
function looseTextEqual(a: string, b: string): boolean {
  const clean = (s: string) => s.trim().replace(/\s+/g, ' ');
  return clean(a) === clean(b);
}

/**
 * Does a produced value match the authored expectation?
 *
 * When `expected` is a literal (the documented format), the comparison is
 * structural and TYPED: `[0,1]` matches `[0, 1]`, and `3` does not match `"3"`.
 * The earlier fallbacks here stripped quotes and flattened arrays before
 * comparing, so `String(a + b)` passed a numeric expectation and `[1, [2, 3]]`
 * passed `[1, 2, 3]` - the grader was quietly accepting wrong answers.
 *
 * The only leniency kept is for an `expected` that is not a literal at all
 * (bare prose like `world hello`), which is compared as text against a string
 * result, ignoring whitespace differences.
 */
export function matchesExpected(actual: unknown, expected: string): boolean {
  const parsed = parseExpected(expected);

  if (parsed.ok) {
    if (canonicalize(actual) === canonicalize(parsed.value)) return true;
    // A string result against a string literal: forgive whitespace only.
    if (typeof actual === 'string' && typeof parsed.value === 'string') {
      return looseTextEqual(actual, parsed.value);
    }
    return false;
  }

  // Not a literal: the author wrote prose. Only a string can match it.
  return typeof actual === 'string' && looseTextEqual(actual, expected);
}

/** Display form for "you returned ..." in the results panel. */
export function displayValue(value: unknown): string {
  if (typeof value === 'string') return JSON.stringify(value);
  if (value === undefined) return 'undefined';
  return canonicalize(value);
}

/** `twoSum` + `[2, 7], 9` -> `twoSum(2, 7, 9)`? No — -> `twoSum([2, 7], 9)`. */
export function formatCall(entryFunction: string, input: string): string {
  return `${entryFunction}(${input})`;
}

/* --------------------------------------------------------------------------
   Non-code answer checking
   -------------------------------------------------------------------------- */

export function normalizeBlank(text: string): string {
  return text.trim().replace(/\s+/g, ' ');
}

export function checkBlank(
  submitted: string,
  answer: string,
  alternatives: string[] = []
): boolean {
  const got = normalizeBlank(submitted);
  if (!got) return false;
  const accepted = [answer, ...alternatives].map(normalizeBlank);
  if (accepted.includes(got)) return true;
  // Be forgiving about case only when the answer is a single word of prose.
  const lower = got.toLowerCase();
  return accepted.some(a => a.toLowerCase() === lower && !/[^a-z0-9_]/i.test(a));
}

export function sameSet(a: number[], b: number[]): boolean {
  if (a.length !== b.length) return false;
  const sortedA = [...a].sort((x, y) => x - y);
  const sortedB = [...b].sort((x, y) => x - y);
  return sortedA.every((v, i) => v === sortedB[i]);
}
