/* ==========================================================================
   Editable site copy in a component.

   `useCopy()` returns a `copy(key, vars)` function bound to the current
   settings snapshot (store.ts), and re-renders the component when an
   administrator's change arrives - so the offline banner, the landing page
   and every other piece of site copy change without a redeploy.

       const copy = useCopy();
       copy('copy.offline.banner');
       copy('copy.landing.pathLine', { stages: 10 });

   Outside React (a service, an error message built in a callback) use
   `getCopy` from store.ts directly - it reads the same snapshot.
   ========================================================================== */
import { useCallback, useSyncExternalStore } from 'react';
import { getCopy, getSettingsSnapshot, subscribe } from './store';

export type CopyVars = Record<string, string | number | null | undefined>;

export function useCopy(): (key: string, vars?: CopyVars) => string {
  const snapshot = useSyncExternalStore(subscribe, getSettingsSnapshot, getSettingsSnapshot);
  // A new function whenever the snapshot changes, so memoised children that
  // take it as a prop re-render with the new words too.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useCallback((key: string, vars: CopyVars = {}) => getCopy(key, vars), [snapshot]);
}
