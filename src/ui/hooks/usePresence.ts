import { useEffect, useState } from 'react';
import { prefersReducedMotion } from '../motion';

export type PresenceState = 'open' | 'closed';

/**
 * Keep a node mounted long enough to animate out.
 *
 * `open` flips to true: mounted at once, state "open" (the CSS entrance
 * runs on mount). `open` flips to false: still mounted, state "closed" (the
 * CSS exit runs), unmounted `exitMs` later. Reopening mid-exit cancels the
 * unmount. Reduced motion unmounts straight away.
 *
 *   const menu = usePresence(open, MOTION.fast);
 *   {menu.mounted && <div className="menu-surface" data-state={menu.state}>…</div>}
 */
export function usePresence(open: boolean, exitMs: number): { mounted: boolean; state: PresenceState } {
  const [mounted, setMounted] = useState(open);

  useEffect(() => {
    if (open) {
      setMounted(true);
      return;
    }
    const ms = prefersReducedMotion() ? 0 : exitMs;
    if (ms <= 0) {
      setMounted(false);
      return;
    }
    const timer = window.setTimeout(() => setMounted(false), ms);
    return () => window.clearTimeout(timer);
  }, [open, exitMs]);

  return { mounted: open || mounted, state: open ? 'open' : 'closed' };
}
