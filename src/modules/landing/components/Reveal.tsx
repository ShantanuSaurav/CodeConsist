import React, { useEffect, useRef, useState } from 'react';

/**
 * Scroll-reveal helpers for the landing page. Everything is driven by a single
 * IntersectionObserver per element and plain CSS (landing.css) so there is no
 * animation library in the landing chunk. With reduced motion the CSS simply
 * shows the element and none of this matters.
 */

const OBSERVER_OPTIONS: IntersectionObserverInit = { rootMargin: '0px 0px -10% 0px', threshold: 0.15 };

/** True once the element has entered the viewport. Never flips back. */
export function useInView<T extends HTMLElement>(): [React.RefObject<T>, boolean] {
  const ref = useRef<T>(null);
  const [seen, setSeen] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el || seen) return;
    if (typeof IntersectionObserver === 'undefined') {
      setSeen(true);
      return;
    }
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) {
        setSeen(true);
        io.disconnect();
      }
    }, OBSERVER_OPTIONS);
    io.observe(el);
    return () => io.disconnect();
  }, [seen]);

  return [ref, seen];
}

interface RevealProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Stagger, in milliseconds. */
  delay?: number;
  as?: 'div' | 'section' | 'li' | 'ol' | 'ul' | 'span' | 'p' | 'footer';
  children?: React.ReactNode;
}

/** Fades its children up the first time they scroll into view. */
export const Reveal: React.FC<RevealProps> = ({ delay = 0, as = 'div', className = '', style, children, ...rest }) => {
  const [ref, seen] = useInView<HTMLDivElement>();
  const Tag = as as 'div';
  return (
    <Tag
      ref={ref}
      className={`reveal ${seen ? 'is-in' : ''} ${className}`.replace(/\s+/g, ' ').trim()}
      style={delay ? { ...style, transitionDelay: `${delay}ms` } : style}
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

/** Counts from 0 to `value` once the number is on screen. */
export const CountUp: React.FC<CountUpProps> = ({ value, duration = 1100, className }) => {
  const [ref, seen] = useInView<HTMLSpanElement>();
  const [shown, setShown] = useState(0);

  useEffect(() => {
    if (!seen) return;
    const reduced = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (reduced || value <= 0) {
      setShown(value);
      return;
    }
    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      setShown(Math.round(eased * value));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [seen, value, duration]);

  return (
    <span ref={ref} className={className}>
      {shown.toLocaleString()}
    </span>
  );
};
