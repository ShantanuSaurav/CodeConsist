import { RefObject, useEffect, useLayoutEffect, useRef } from 'react';

/**
 * One shared indicator that glides to whichever child matches `selector` -
 * the segmented thumb, the sidebar's active bar.
 *
 * The indicator sits absolutely at the container's top-left and moves only
 * with transform. Positions come from layout offsets, which ignore
 * transforms, so a control inside a dialog that is still scaling in measures
 * true; the target's offsetParent must therefore be the container (make it
 * `position: relative`, keep the wrappers in between static). When the target
 * changes size as well as place, the indicator starts drawn at the old size
 * (scaled) and eases to the new one at scale 1 - a FLIP, so nothing but
 * transform animates and the resting shape is exact. The first placement and
 * any re-measure after a resize jump without animating. While placed, the
 * container carries [data-indicator], which the CSS uses to hide the
 * per-item fallback.
 *
 *   useSlidingIndicator(rootRef, thumbRef, '.is-active', 'x', value);
 */
export function useSlidingIndicator(
  rootRef: RefObject<HTMLElement>,
  indicatorRef: RefObject<HTMLElement>,
  selector: string,
  axis: 'x' | 'y',
  activeKey: unknown
): void {
  const last = useRef<[pos: number, size: number] | null>(null);
  const place = useRef<(animate: boolean) => void>(() => {});

  place.current = (animate) => {
    const root = rootRef.current;
    const bar = indicatorRef.current;
    if (!root || !bar) return;
    const x = axis === 'x';
    const target = root.querySelector<HTMLElement>(selector);
    const size = target && target.offsetParent === root ? (x ? target.offsetWidth : target.offsetHeight) : 0;
    if (!target || !size) {
      // Nothing to point at, or not measurable (hidden): step aside for the per-item style.
      bar.style.opacity = '0';
      root.removeAttribute('data-indicator');
      last.current = null;
      return;
    }
    const pos = x ? target.offsetLeft : target.offsetTop;
    const to = (p: number, s: number) => (x ? `translateX(${p}px) scaleX(${s})` : `translateY(${p}px) scaleY(${s})`);
    const prev = animate ? last.current : null;

    bar.style[x ? 'width' : 'height'] = `${size}px`;
    bar.style.transition = 'none';
    bar.style.transform = prev ? to(prev[0], prev[1] / size) : to(pos, 1);
    bar.style.opacity = '1';
    root.setAttribute('data-indicator', '');
    // Commit the start frame, then hand the transition back to the stylesheet.
    void bar.offsetWidth;
    bar.style.transition = '';
    bar.style.transform = to(pos, 1);
    last.current = [pos, size];
  };

  useLayoutEffect(() => place.current(true), [activeKey]);

  // Fonts landing, the container resizing, a hidden rail becoming visible.
  useEffect(() => {
    const root = rootRef.current;
    if (!root || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() => place.current(false));
    observer.observe(root);
    return () => observer.disconnect();
  }, [rootRef]);
}
