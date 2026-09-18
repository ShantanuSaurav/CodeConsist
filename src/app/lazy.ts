import React from 'react';

const RETRY_KEY = 'cq-chunk-retry';

/**
 * Has the browser tried to fetch a script chunk and failed? The message text
 * differs per browser, so match generously; a stale deploy is the usual cause.
 */
function isChunkLoadError(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err);
  return /Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module|Loading chunk .* failed/i.test(
    message
  );
}

/**
 * `React.lazy` for a named export, with one safety net.
 *
 * Every deploy renames the hashed chunks. A tab that was opened before the
 * deploy still holds the old index.html, and the first navigation to a route
 * it has not visited asks for a chunk that no longer exists. Rather than
 * showing the crash screen, reload once - the fresh index.html knows the new
 * names. sessionStorage remembers the attempt so a genuine outage cannot loop.
 *
 *   const LearnPage = lazyPage(() => import('@/modules/challenges'), 'LearnPage');
 */
export function lazyPage<M, K extends keyof M>(
  loader: () => Promise<M>,
  name: K
): React.LazyExoticComponent<M[K] extends React.ComponentType<infer P> ? React.ComponentType<P> : never> {
  type Comp = M[K] extends React.ComponentType<infer P> ? React.ComponentType<P> : never;
  return React.lazy(async () => {
    try {
      const mod = await loader();
      try {
        sessionStorage.removeItem(RETRY_KEY);
      } catch {
        /* storage may be unavailable; the retry guard is best-effort */
      }
      return { default: mod[name] as unknown as Comp };
    } catch (err) {
      let retried = false;
      try {
        retried = sessionStorage.getItem(RETRY_KEY) === '1';
        if (!retried && isChunkLoadError(err)) sessionStorage.setItem(RETRY_KEY, '1');
      } catch {
        /* fall through to the crash screen */
      }
      if (!retried && isChunkLoadError(err)) {
        window.location.reload();
        // Keep React suspended until the reload takes over.
        return new Promise<never>(() => {});
      }
      throw err;
    }
  });
}
