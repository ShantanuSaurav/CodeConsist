import React, { useEffect, useRef, useState } from 'react';

interface XpCountUpProps {
  from?: number;
  to: number;
  /** How long the count runs. 0 shows `to` at once. */
  durationMs?: number;
  prefix?: string;
  suffix?: string;
  className?: string;
}

function reducedMotion(): boolean {
  try {
    return typeof window !== 'undefined' && Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);
  } catch {
    return false;
  }
}

/**
 * A number that counts up from `from` to `to` with requestAnimationFrame
 * (ease-out). With reduced motion, or a duration of 0, the final value shows
 * at once. A new `to` (the server's figure arriving) counts on from where
 * the number is. The number is `aria-hidden`: the screen that shows it
 * carries a plain-text summary for screen readers.
 */
export const XpCountUp: React.FC<XpCountUpProps> = ({ from = 0, to, durationMs = 900, prefix = '+', suffix = ' XP', className = '' }) => {
  const [shown, setShown] = useState(() => (durationMs <= 0 || reducedMotion() ? to : from));
  const shownRef = useRef(shown);
  shownRef.current = shown;

  useEffect(() => {
    if (durationMs <= 0 || reducedMotion() || typeof requestAnimationFrame !== 'function') {
      setShown(to);
      return;
    }
    const start = shownRef.current;
    if (start === to) return;
    const began = performance.now();
    let frame = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - began) / durationMs);
      const eased = 1 - Math.pow(1 - t, 3);
      setShown(Math.round(start + (to - start) * eased));
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [to, durationMs]);

  return (
    <span className={`xp-count-up ${className}`.trim()} aria-hidden="true">
      {prefix}
      {shown.toLocaleString()}
      {suffix}
    </span>
  );
};
