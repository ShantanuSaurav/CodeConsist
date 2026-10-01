import { RefObject, useEffect } from 'react';
import { prefersReducedMotion } from '../motion';

/** An observer reports every target once, straight after observe(). If it has not by now, it never will. */
const OBSERVER_FALLBACK_MS = 1000;

/**
 * Fade-and-rise an element the first time it scrolls into view (`.reveal`).
 *
 * Safe by construction: the element is visible until this hook has checked
 * that IntersectionObserver exists, motion is allowed and the element is
 * actually below the fold - only then does it set data-reveal="hidden".
 * Anything already on screen, any browser without the observer, and print
 * all see the content with no animation at all; an observer that never
 * reports, or printing the page, shows it anyway (same as landing/Reveal).
 *
 *   const ref = useRef<HTMLElement>(null);
 *   useReveal(ref);
 *   <section ref={ref} className="reveal">…</section>
 */
export function useReveal(ref: RefObject<HTMLElement>): void {
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === 'undefined' || prefersReducedMotion()) return;
    if (el.getBoundingClientRect().top < window.innerHeight) return;

    el.setAttribute('data-reveal', 'hidden');
    let reported = false;
    const show = () => {
      el.setAttribute('data-reveal', 'shown');
      stop();
    };
    // Any intersection at all reveals: no threshold or negative margin that a
    // short footer or a very tall section could fail to cross.
    const observer = new IntersectionObserver((entries) => {
      reported = true;
      if (entries.some((e) => e.isIntersecting)) show();
    });
    const fallback = window.setTimeout(() => {
      if (!reported) show();
    }, OBSERVER_FALLBACK_MS);
    const stop = () => {
      observer.disconnect();
      window.clearTimeout(fallback);
      window.removeEventListener('beforeprint', show);
    };
    observer.observe(el);
    window.addEventListener('beforeprint', show);
    return () => {
      stop();
      el.removeAttribute('data-reveal');
    };
  }, [ref]);
}
