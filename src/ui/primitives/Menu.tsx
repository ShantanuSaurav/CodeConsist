import React, { createContext, useContext, useEffect, useId, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { buttonClass } from './Button';

/** What a custom trigger spreads onto its <button>. */
export interface MenuTriggerProps {
  ref: React.RefObject<HTMLButtonElement>;
  id: string;
  'aria-haspopup': 'menu';
  'aria-expanded': boolean;
  'aria-controls': string | undefined;
  onClick: () => void;
  onKeyDown: (event: React.KeyboardEvent) => void;
}

interface MenuProps {
  /** The trigger's content, drawn as a secondary button. Not used with `trigger`. */
  label?: React.ReactNode;
  /** Draws the trigger instead: spread the props onto a <button>. */
  trigger?: (props: MenuTriggerProps) => React.ReactNode;
  /** Names the menu for screen readers; the trigger names it when left out. */
  ariaLabel?: string;
  /** The trigger edge the menu lines up with. */
  align?: 'start' | 'end';
  className?: string;
  menuClassName?: string;
  /** MenuItem and MenuSeparator. */
  children: React.ReactNode;
}

/** Closes the menu and hands focus back to its trigger. */
const MenuContext = createContext<() => void>(() => {});

const ITEMS = '[role="menuitem"]:not(:disabled)';

/**
 * A popover of actions - the account menu, a row's "more". The trigger says
 * it opens a menu (aria-haspopup, aria-expanded). Opening moves focus to the
 * first item (ArrowUp on the trigger: the last); ArrowUp and ArrowDown move
 * round the items, Home and End jump to the ends. Escape, Tab, or choosing an
 * item closes it and focus returns to the trigger; a press outside closes it
 * and leaves focus where the press put it. Props only.
 */
export const Menu: React.FC<MenuProps> = ({ label, trigger, ariaLabel, align = 'start', className = '', menuClassName = '', children }) => {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  // Which end focus lands on when the menu opens.
  const startAt = useRef<'first' | 'last'>('first');
  const id = useId();
  const triggerId = `${id}-trigger`;
  const menuId = `${id}-menu`;

  const items = () => Array.from(menuRef.current?.querySelectorAll<HTMLElement>(ITEMS) ?? []);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, [open]);

  // The open menu takes focus however it was opened, so its keys always work.
  useEffect(() => {
    if (!open) return;
    const list = items();
    const target = startAt.current === 'last' ? list[list.length - 1] : list[0];
    (target ?? menuRef.current)?.focus();
  }, [open]);

  const openAt = (at: 'first' | 'last') => {
    startAt.current = at;
    setOpen(true);
  };

  // Focus was inside the menu, which is about to unmount, so it goes back to the trigger.
  const close = () => {
    setOpen(false);
    triggerRef.current?.focus();
  };

  const onTriggerKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      openAt(event.key === 'ArrowUp' ? 'last' : 'first');
    }
  };

  const onMenuKeyDown = (event: React.KeyboardEvent) => {
    const list = items();
    const at = list.indexOf(document.activeElement as HTMLElement);
    const focus = (index: number) => {
      event.preventDefault();
      list[index]?.focus();
    };
    switch (event.key) {
      case 'ArrowDown':
        return focus((at + 1) % list.length);
      case 'ArrowUp':
        return focus(at <= 0 ? list.length - 1 : at - 1);
      case 'Home':
        return focus(0);
      case 'End':
        return focus(list.length - 1);
      case 'Escape':
        // Stops here, so a dialog the menu sits in does not close with it.
        event.preventDefault();
        event.stopPropagation();
        close();
        return;
      case 'Tab':
        // Back to the trigger, as Dropdown does: inside a focus-trapped
        // dialog the items are not the trap's stops.
        event.preventDefault();
        close();
        return;
    }
  };

  const triggerProps: MenuTriggerProps = {
    ref: triggerRef,
    id: triggerId,
    'aria-haspopup': 'menu',
    'aria-expanded': open,
    'aria-controls': open ? menuId : undefined,
    onClick: () => (open ? close() : openAt('first')),
    onKeyDown: onTriggerKeyDown
  };

  return (
    <div ref={wrapRef} className={`relative inline-block ${className}`.trim()}>
      {trigger ? (
        trigger(triggerProps)
      ) : (
        <button type="button" className={buttonClass({ variant: 'secondary' })} {...triggerProps}>
          {label}
        </button>
      )}
      {open && (
        <div
          ref={menuRef}
          id={menuId}
          role="menu"
          aria-label={ariaLabel}
          aria-labelledby={ariaLabel ? undefined : triggerId}
          tabIndex={-1}
          onKeyDown={onMenuKeyDown}
          className={`menu glass ${align === 'end' ? 'is-end' : ''} ${menuClassName}`.replace(/\s+/g, ' ').trim()}
        >
          <MenuContext.Provider value={close}>{children}</MenuContext.Provider>
        </div>
      )}
    </div>
  );
};

interface MenuItemProps {
  /** Runs on a click, Enter or Space; the menu then closes. */
  onSelect?: () => void;
  /** A router link instead of an action. */
  to?: string;
  /** A quiet icon before the text (a lucide icon at about 15px). Decorative. */
  icon?: React.ReactNode;
  /** Destructive (sign out, delete): drawn in the error colour. */
  danger?: boolean;
  disabled?: boolean;
  children: React.ReactNode;
}

/** One action in a Menu. Hovering moves focus to it, so keys and pointer share one highlight. */
export const MenuItem: React.FC<MenuItemProps> = ({ onSelect, to, icon, danger = false, disabled = false, children }) => {
  const close = useContext(MenuContext);
  const className = `menu-item ${danger ? 'is-danger' : ''}`.trim();
  const choose = () => {
    onSelect?.();
    close();
  };
  const follow = (event: React.MouseEvent<HTMLElement>) => event.currentTarget.focus();
  const body = (
    <>
      {icon && (
        <span className="menu-item-icon" aria-hidden="true">
          {icon}
        </span>
      )}
      {children}
    </>
  );
  if (to !== undefined && !disabled) {
    return (
      <Link to={to} role="menuitem" tabIndex={-1} className={className} onClick={choose} onMouseEnter={follow}>
        {body}
      </Link>
    );
  }
  return (
    <button type="button" role="menuitem" tabIndex={-1} disabled={disabled} className={className} onClick={choose} onMouseEnter={follow}>
      {body}
    </button>
  );
};

/** A hairline between groups of items. */
export const MenuSeparator: React.FC = () => <div role="separator" className="menu-separator" />;
