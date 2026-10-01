import { RefObject, useLayoutEffect, useRef } from 'react';
import { MOTION, prefersReducedMotion } from '@/ui';

export type StepMotion = 'slide' | 'fade';

/**
 * A short entrance for a container's children whenever `stepKey` changes -
 * the next question, the concept walk-through, the stage summary.
 *
 * The children are animated where they stand (Web Animations API) instead of
 * being remounted under a new `key`, so nothing inside - an editor, a
 * half-typed answer, the reading panel - loses state for the sake of a
 * transition. New content slides 8px in from the side the learner is heading
 * toward: a higher `order` comes in from the right, a lower one from the
 * left; `fade` only fades. The first render, a null key (the dialog is
 * closing) and reduced motion play nothing: the content simply swaps.
 * Nothing waits on it - the old step is gone the moment the new one renders.
 */
export function useStepTransition(
  containerRef: RefObject<HTMLElement>,
  stepKey: string | null,
  order: number,
  motion: StepMotion = 'slide'
): void {
  const last = useRef<{ key: string; order: number } | null>(null);

  useLayoutEffect(() => {
    const prev = last.current;
    last.current = stepKey === null ? null : { key: stepKey, order };
    const root = containerRef.current;
    if (!prev || stepKey === null || prev.key === stepKey || !root) return;
    if (prefersReducedMotion() || typeof root.animate !== 'function') return;

    // Curve and distance come from tokens.css, like every other entrance.
    const tokens = getComputedStyle(root);
    const easing = tokens.getPropertyValue('--ease-out').trim() || 'ease-out';
    const shift = parseFloat(tokens.getPropertyValue('--shift-md')) || 8;
    const dir = motion === 'fade' ? 0 : Math.sign(order - prev.order);
    const keyframes: Keyframe[] = [
      { opacity: 0, transform: `translate3d(${dir * shift}px, 0, 0)` },
      { opacity: 1, transform: 'translate3d(0, 0, 0)' }
    ];

    try {
      for (const child of Array.from(root.children)) {
        child.animate(keyframes, { duration: MOTION.base, easing });
      }
    } catch {
      // A transition must never be the thing that breaks a lesson.
    }
  }, [containerRef, stepKey, order, motion]);
}
