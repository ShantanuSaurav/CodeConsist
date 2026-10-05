import React, { useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { useFocusTrap } from '../hooks/useFocusTrap';
import { useBodyScrollLock } from '../hooks/useBodyScrollLock';

export type ModalSize = 'sm' | 'md' | 'lg' | 'xl';

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  /** Names the dialog (aria-labelledby). */
  title: React.ReactNode;
  /** A small mono line above the title. */
  eyebrow?: React.ReactNode;
  /** One line under the title, read out with it (aria-describedby). */
  description?: React.ReactNode;
  /** sm 26rem, md 38rem, lg 46rem, xl 56rem. */
  size?: ModalSize;
  /** 'sheet' rises from the bottom on a phone instead of filling the screen. */
  variant?: 'dialog' | 'sheet';
  /** Actions along the bottom, to the right. */
  footer?: React.ReactNode;
  /** What takes focus on open; the dialog itself when left out. */
  initialFocus?: () => HTMLElement | null | undefined;
  closeLabel?: string;
  className?: string;
  bodyClassName?: string;
  children?: React.ReactNode;
}

const SIZE: Record<ModalSize, string> = { sm: 'modal-sm', md: 'modal-md', lg: 'modal-lg', xl: '' };

/**
 * A dialog on the shared recipe (.modal-* in components.css), the same one the
 * practice, sign-in and checkout dialogs use. Focus is trapped inside and goes
 * back to the opener on close, the page behind stops scrolling, and Escape, a
 * press on the scrim or the close button all call `onClose`. Props only; the
 * caller owns `open`.
 */
export const Modal: React.FC<ModalProps> = ({
  open,
  onClose,
  title,
  eyebrow,
  description,
  size = 'md',
  variant = 'dialog',
  footer,
  initialFocus,
  closeLabel = 'Close',
  className = '',
  bodyClassName = '',
  children
}) => {
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const descriptionId = useId();
  useFocusTrap(ref, open, initialFocus);
  useBodyScrollLock(open);

  if (!open) return null;

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key !== 'Escape') return;
    // Handled here: nothing behind the dialog (a page's own Escape) reacts.
    event.preventDefault();
    event.stopPropagation();
    onClose();
  };

  const sheet = variant === 'sheet' ? 'is-sheet' : '';

  // On <body>, so no transformed or filtered ancestor can trap the fixed overlay.
  return createPortal(
    <div
      className={`modal-overlay ${sheet}`.trim()}
      onMouseDown={(event) => {
        // The scrim only: a drag that starts inside the card never closes it.
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
        tabIndex={-1}
        onKeyDown={onKeyDown}
        className={`modal-card ${SIZE[size]} ${sheet} ${className}`.replace(/\s+/g, ' ').trim()}
      >
        <div className="modal-header">
          <div className="modal-header-main">
            {eyebrow && <div className="modal-stage-badge">{eyebrow}</div>}
            <h2 id={titleId} className="modal-title">
              {title}
            </h2>
            {description && (
              <p id={descriptionId} className="modal-desc">
                {description}
              </p>
            )}
          </div>
          <button type="button" className="modal-close-btn" onClick={onClose} aria-label={closeLabel}>
            <X size={16} />
          </button>
        </div>
        <div className={`modal-body ${bodyClassName}`.trim()}>{children}</div>
        {footer && <div className="modal-footer justify-end">{footer}</div>}
      </div>
    </div>,
    document.body
  );
};
