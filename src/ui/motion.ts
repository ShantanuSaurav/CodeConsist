import type React from 'react';

/**
 * The motion tokens (tokens.css) as numbers, for the few places JS has to
 * know a duration - mainly how long usePresence keeps an exiting node
 * mounted. Keep the two in step; CSS stays the source of the actual curves.
 *
 *   const menu = usePresence(open, MOTION.fast);
 */
export const MOTION = {
  instant: 80,
  fast: 140,
  base: 220,
  slow: 320,
  slower: 480,
  stagger: 40,
  /** Items with their own stagger delay; the sixth onward share the last one. */
  staggerCap: 6
} as const;

/** Has the visitor asked for less motion? Safe to call anywhere; false where there is no window. */
export function prefersReducedMotion(): boolean {
  try {
    return typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

/**
 * The inline style for a `.stagger-item` - the list position, capped, so
 * item 40 waits no longer than item 6 (index 5, 200ms), same as `.stagger`.
 *
 *   <li className="stagger-item" style={staggerStyle(i)}>
 */
export function staggerStyle(index: number): React.CSSProperties {
  return { '--i': Math.max(0, Math.min(index, MOTION.staggerCap - 1)) } as React.CSSProperties;
}
