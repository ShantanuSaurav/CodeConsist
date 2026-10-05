import React, { useId, useRef, useState } from 'react';

export type TooltipPlacement = 'top' | 'bottom' | 'left' | 'right';

interface TooltipProps {
  /** A short phrase. It describes the control; it never names it. */
  content: React.ReactNode;
  placement?: TooltipPlacement;
  /**
   * One element: the control the tip describes. It keeps its own accessible
   * name, so an icon button still needs its aria-label.
   */
  children: React.ReactElement<{ 'aria-describedby'?: string }>;
  className?: string;
}

/**
 * A short tip beside a control, shown on hover or keyboard focus after a
 * brief wait - all CSS (components.css), so nothing renders on hover. The tip
 * is wired as the control's description (aria-describedby) and is read out
 * with it. Escape hides a showing tip until the pointer or focus leaves.
 */
export const Tooltip: React.FC<TooltipProps> = ({ content, placement = 'top', children, className = '' }) => {
  const id = useId();
  const bubbleRef = useRef<HTMLSpanElement>(null);
  const [dismissed, setDismissed] = useState(false);
  const child = React.Children.only(children);
  const describedBy = [child.props['aria-describedby'], id].filter(Boolean).join(' ');

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key !== 'Escape' || dismissed || !bubbleRef.current) return;
    // Only a tip on screen takes the key; otherwise Escape is the page's (a dialog's close).
    if (getComputedStyle(bubbleRef.current).visibility !== 'visible') return;
    event.stopPropagation();
    setDismissed(true);
  };
  const reset = () => setDismissed(false);

  return (
    <span
      className={`tooltip tooltip-${placement} ${dismissed ? 'is-dismissed' : ''} ${className}`.replace(/\s+/g, ' ').trim()}
      onKeyDown={onKeyDown}
      onMouseLeave={reset}
      onBlur={reset}
    >
      {React.cloneElement(child, { 'aria-describedby': describedBy })}
      <span ref={bubbleRef} id={id} role="tooltip" className="tooltip-bubble">
        {content}
      </span>
    </span>
  );
};
