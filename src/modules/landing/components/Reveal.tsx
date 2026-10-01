import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { MOTION, prefersReducedMotion } from '@/ui';

/**
 * Scroll reveals for the landing page, on the shared `.reveal` contract
 * (components.css: fade + rise 12px over --dur-slower, once) plus the
 * landing extras in landing.css. No animation library in the landing chunk.
 *
 * Safe by construction - content is visible by default and is only hidden
 * once this file has checked it can bring it back:
 *   - no IntersectionObserver, or reduced motion: never hidden, no motion
 *   - on screen at mount: never waits on the observer; it plays the short
 *     entrance after the hero instead (a CSS animation with backwards fill,
 *     so a skipped animation still leaves it in place)
 *   - below the fold: hidden until it scrolls in; an observer that never
 *     reports at all, or printing the page, shows it anyway
 */

type Phase =
  /** Nothing to do: shown as rendered. */
  | 'visible'
  /** Was on screen at mount - plays the entrance. */
  | 'enter'
  /** Below the fold, waiting for the observer. */
  | 'hidden'
  /** Scrolled into view - the reveal transition runs. */
  | 'shown';

/** Reveal a little inside the viewport, so the motion is seen rather than finished at the edge. */
const ROOT_MARGIN = '0px 0px -48px 0px';
/** An observer reports every target once, straight after observe(). If it has not by now, it never will. */
const OBSERVER_FALLBACK_MS = 1000;

/* Layout effect: an element on screen must get its entrance before the first
   paint, or it would flash in place and then fade in again. */
const useIsoLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect;

/** Where an element is in its one-way reveal. Settles on 'visible', 'enter' or 'shown'. */
function useScrollEntry(ref: React.RefObject<HTMLElement>): Phase {
  const [phase, setPhase] = useState<Phase>('visible');

  useIsoLayoutEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === 'undefined' || prefersReducedMotion()) return;
    if (el.getBoundingClientRect().top < window.innerHeight) {
      setPhase('enter');
      return;
    }

    setPhase('hidden');
    let reported = false;
    const show = () => {
      setPhase('shown');
      cleanup();
    };
    const observer = new IntersectionObserver(
      (entries) => {
        reported = true;
        if (entries.some((e) => e.isIntersecting)) show();
      },
      { rootMargin: ROOT_MARGIN }
    );
    const fallback = window.setTimeout(() => {
      if (!reported) show();
    }, OBSERVER_FALLBACK_MS);
    const cleanup = () => {
      observer.disconnect();
      window.clearTimeout(fallback);
      window.removeEventListener('beforeprint', show);
    };
    observer.observe(el);
    window.addEventListener('beforeprint', show);
    return cleanup;
  }, [ref]);

  return phase;
}

/** True once the element has been on screen (or was never hidden). Never flips back. */
export function useInView<T extends HTMLElement>(): [React.RefObject<T>, boolean] {
  const ref = useRef<T>(null);
  const phase = useScrollEntry(ref);
  return [ref, phase !== 'hidden'];
}

interface RevealProps extends React.HTMLAttributes<HTMLElement> {
  /**
   * Position in a group that reveals together (cards in a row, stats in a
   * strip): one --stagger (40ms) per step, capped at the sixth. Rows inside
   * that carry `.reveal-item` + staggerStyle(i) follow the container.
   */
  step?: number;
  as?: 'div' | 'section' | 'li' | 'ol' | 'ul' | 'span' | 'p' | 'footer';
  children?: React.ReactNode;
}

/** Fades its children up the first time they scroll into view. */
export const Reveal: React.FC<RevealProps> = ({ step = 0, as = 'div', className = '', style, children, ...rest }) => {
  const ref = useRef<HTMLDivElement>(null);
  const phase = useScrollEntry(ref);
  const Tag = as as 'div';
  const capped = Math.max(0, Math.min(step, MOTION.staggerCap - 1));
  return (
    <Tag
      ref={ref}
      className={`reveal ${className}`.trim()}
      data-reveal={phase === 'visible' ? undefined : phase}
      style={capped ? ({ ...style, '--reveal-step': capped } as React.CSSProperties) : style}
      {...rest}
    >
      {children}
    </Tag>
  );
};

interface CountUpProps {
  value: number;
  /** Total duration in milliseconds. */
  duration?: number;
  className?: string;
}

/* Two reveal lengths: long enough to read as counting, finished soon after
   the strip around it has settled. */
const COUNT_MS = MOTION.slower * 2;

/**
 * A figure that counts up once, as it scrolls into view. A figure that is
 * already on screen (or with reduced motion) is simply the number - above
 * the fold nothing waits to become readable. Later changes count on from
 * the current figure rather than from zero.
 */
export const CountUp: React.FC<CountUpProps> = ({ value, duration = COUNT_MS, className }) => {
  const ref = useRef<HTMLSpanElement>(null);
  const phase = useScrollEntry(ref);
  const [shown, setShown] = useState(value);
  const current = useRef(value);

  useEffect(() => {
    const set = (n: number) => {
      current.current = n;
      setShown(n);
    };
    if (phase === 'hidden') return set(0);
    if (phase !== 'shown' || prefersReducedMotion()) return set(value);

    const from = current.current;
    if (from === value) return;
    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      set(Math.round(from + (value - from) * eased));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [phase, value, duration]);

  return (
    <span ref={ref} className={className}>
      {shown.toLocaleString()}
    </span>
  );
};
