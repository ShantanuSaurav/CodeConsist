import { RefObject, useEffect, useRef } from 'react';

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), ' +
  'textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

function focusables(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
    (el) => el.offsetParent !== null || el === document.activeElement
  );
}

/**
 * Keep keyboard focus inside a dialog while it is open, and put it back where
 * it came from when it closes.
 *
 * Without this, Tab from the dialog's last control wrapped to the top of the
 * document BEHIND the overlay - the skip link, the nav, the whole landing page
 * - while the modal stayed on screen. And when a control was removed on
 * activation (Check answer becomes Next challenge), focus fell to <body> and
 * the next Tab started from the page top.
 *
 * `initial` picks what receives focus on open; it falls back to the dialog
 * itself, which must therefore have tabIndex={-1}.
 *
 * `initial` is read through a ref rather than being a dependency of the setup
 * effect below. Callers very reasonably pass an inline `() => ...` closure,
 * which is a new function identity on every render. If that identity were a
 * dependency, typing into any field inside the dialog (a state update causing
 * a re-render) would tear down and rebuild the whole trap on every keystroke:
 * the teardown restores focus to the element that had it when the trap was
 * last (re)built - the control that originally opened the dialog - and the
 * rebuild then immediately moves focus back to `initial()` because focus
 * briefly appeared to be outside the dialog. Net effect: focus would keep
 * being yanked away from whatever the user just clicked (e.g. a password
 * field) and back to the initial field on every character typed. Reading
 * `initial` from a ref keeps the trap's setup/teardown tied only to the
 * dialog actually opening/closing, not to incidental re-renders while it's
 * open.
 */
export function useFocusTrap(
  ref: RefObject<HTMLElement>,
  active: boolean,
  initial?: () => HTMLElement | null | undefined
): void {
  const initialRef = useRef(initial);
  initialRef.current = initial;

  useEffect(() => {
    if (!active) return;
    const root = ref.current;
    if (!root) return;

    const opener = document.activeElement as HTMLElement | null;

    // Move focus in now (the element exists once this effect runs) and again
    // next frame in case the first attempt raced a still-mounting child.
    // rAF alone is throttled hard in a background tab, so it is not the only
    // attempt.
    const moveIn = () => {
      const target = initialRef.current?.() ?? root;
      if (target && !root.contains(document.activeElement)) target.focus({ preventScroll: true });
    };
    moveIn();
    const raf = requestAnimationFrame(moveIn);

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Tab') return;
      const items = focusables(root);
      if (items.length === 0) {
        event.preventDefault();
        root.focus();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      const current = document.activeElement as HTMLElement | null;
      const inside = current ? root.contains(current) : false;

      if (event.shiftKey) {
        if (!inside || current === first || current === root) {
          event.preventDefault();
          last.focus();
        }
      } else if (!inside || current === last) {
        event.preventDefault();
        first.focus();
      }
    };

    // If whatever had focus is removed from the DOM (a button that turns into
    // a different button), pull focus back into the dialog rather than
    // letting it drop to <body>.
    const onFocusOut = (event: FocusEvent) => {
      const next = event.relatedTarget as HTMLElement | null;
      if (next && root.contains(next)) return;
      // A macrotask, not rAF: rAF can be delayed hundreds of ms when the tab
      // is not in front, and focus must not be allowed to sit on <body>.
      setTimeout(() => {
        const current = document.activeElement;
        if (!current || current === document.body || !root.contains(current)) {
          const items = focusables(root);
          (items.find((el) => el.matches('.btn-solid')) ?? items[0] ?? root).focus({ preventScroll: true });
        }
      }, 0);
    };

    // When React REMOVES the focused element (Check answer becomes Next
    // challenge), browsers move focus to <body> without firing focusout at
    // all - there is no event to catch. Watch the DOM instead and recover
    // whenever a mutation has left nothing inside the dialog focused.
    const observer = new MutationObserver(() => {
      const current = document.activeElement;
      if (!current || current === document.body || !root.contains(current)) {
        const items = focusables(root);
        (items.find((el) => el.matches('.btn-solid')) ?? items[0] ?? root).focus({ preventScroll: true });
      }
    });
    observer.observe(root, { childList: true, subtree: true });

    document.addEventListener('keydown', onKeyDown, true);
    root.addEventListener('focusout', onFocusOut);

    return () => {
      cancelAnimationFrame(raf);
      observer.disconnect();
      document.removeEventListener('keydown', onKeyDown, true);
      root.removeEventListener('focusout', onFocusOut);
      // Restore to the control that opened the dialog, if it still exists.
      if (opener && opener.isConnected && typeof opener.focus === 'function') {
        opener.focus({ preventScroll: true });
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ref, active]);
}
