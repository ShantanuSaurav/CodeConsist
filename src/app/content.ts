import { useEffect, useState } from 'react';
import { makeBundle, type ContentBundle } from '@/platform/session';

/**
 * Fetch the challenge bank as its own chunk.
 *
 * `import()` here - not `import` at the top - is the whole point: the bank
 * is ~40% of the JavaScript we ship and nothing on the first screen needs it
 * to paint. Rollup gives it its own hashed file, so a content-only release
 * leaves every UI chunk cached in returning visitors' browsers, and a UI
 * release leaves the bank cached. The boundary check refuses a static import
 * of this entry from outside the module.
 */
export function loadContentBundle(): Promise<ContentBundle> {
  return import('@/modules/challenges/content').then(({ ALL_CHALLENGES, buildStages }) =>
    makeBundle(buildStages(), ALL_CHALLENGES)
  );
}

/**
 * The bundle, or null until it arrives. A failed fetch is rethrown during
 * render so the ErrorBoundary shows its screen instead of an app that looks
 * fine but has no lessons.
 */
export function useContentBundle(): ContentBundle | null {
  const [bundle, setBundle] = useState<ContentBundle | null>(null);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    let cancelled = false;
    loadContentBundle().then(
      (b) => !cancelled && setBundle(b),
      (err: unknown) => !cancelled && setError(err instanceof Error ? err : new Error(String(err)))
    );
    return () => {
      cancelled = true;
    };
  }, []);

  if (error) throw error;
  return bundle;
}
