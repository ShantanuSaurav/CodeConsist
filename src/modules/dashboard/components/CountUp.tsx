import React, { useEffect, useRef, useState } from 'react';
import { MOTION, prefersReducedMotion } from '@/ui';

/* The progress-fill duration, on the same ease-out curve, so the counts and
   the continue-learning bar settle on one rhythm. */
const COUNT_MS = MOTION.slower;
/* Below this a count is only flicker (0, 1, 2, 3), so small figures just appear. */
const MIN_COUNT = 10;
/* Once per page load, not per visit: the dashboard remounts every time the
   learner comes back to it, and a replayed count is decoration, not news. */
let countedThisSession = false;

/* Quint ease-out, the JS twin of --ease-out. */
const easeOut = (t: number) => 1 - (1 - t) ** 5;

interface CountUpProps {
  to: number;
  format?: (n: number) => string;
}

/**
 * A figure that counts up from zero the first time the dashboard mounts in a
 * session, easing out so it settles rather than stops. Later visits, later
 * changes and reduced motion all show the figure at once. Its own component,
 * so a frame re-renders one text node and not the page. Pair it with tabular
 * figures (.stat-value) so the width holds steady while it counts.
 */
export const CountUp: React.FC<CountUpProps> = ({ to, format = String }) => {
  const [shown, setShown] = useState(() =>
    to < MIN_COUNT || countedThisSession || prefersReducedMotion() ? to : 0
  );
  const current = useRef(shown);
  const settled = useRef(shown === to);

  useEffect(() => {
    if (settled.current || typeof requestAnimationFrame === 'undefined' || prefersReducedMotion()) {
      settled.current = true;
      current.current = to;
      setShown(to);
      return;
    }
    // Resume from wherever the count is - StrictMode re-runs this effect and
    // the figure can change mid-count - rather than from zero again.
    const from = current.current;
    const start = performance.now();
    let frame = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / COUNT_MS);
      current.current = Math.round(from + (to - from) * easeOut(t));
      setShown(current.current);
      if (t < 1) frame = requestAnimationFrame(tick);
      else {
        settled.current = true;
        countedThisSession = true;
      }
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [to]);

  return <>{format(shown)}</>;
};
