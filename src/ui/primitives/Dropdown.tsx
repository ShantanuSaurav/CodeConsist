import React, { useEffect, useId, useRef, useState } from 'react';
import { ChevronDown, Check } from 'lucide-react';

export interface DropdownOption {
  value: string;
  label: React.ReactNode;
  icon?: React.ReactNode;
  hint?: string;
  disabled?: boolean;
}

export interface DropdownProps {
  id?: string;
  value: string;
  options: DropdownOption[];
  onChange: (value: string) => void;
  placeholder?: string;
  ariaLabel?: string;
  className?: string;
  triggerClassName?: string;
  menuClassName?: string;
  size?: 'sm' | 'md' | 'lg';
  disabled?: boolean;
}

/** The text a typed letter is matched against. */
const labelText = (opt: DropdownOption): string =>
  (typeof opt.label === 'string' || typeof opt.label === 'number' ? String(opt.label) : opt.value).toLowerCase();

/**
 * A select with a proper menu. Same height and radius as every other
 * control; the menu is the one place a shadow is allowed, because it floats.
 *
 * Keyboard: the arrow keys on the trigger open the menu, and focus moves into
 * it. There the arrows, Home and End move between options (the listbox points
 * at the current one with aria-activedescendant), a letter jumps to the next
 * option starting with it, Enter or Space picks, and Escape or Tab closes and
 * hands focus back to the trigger.
 */
export const Dropdown: React.FC<DropdownProps> = ({
  id,
  value,
  options,
  onChange,
  placeholder = 'Select…',
  ariaLabel,
  className = '',
  triggerClassName = '',
  menuClassName = '',
  size = 'md',
  disabled = false
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const listId = useId();

  const selectedOption = options.find((opt) => opt.value === value);
  const enabled = options.flatMap((opt, i) => (opt.disabled ? [] : [i]));

  // Close on outside click
  useEffect(() => {
    if (!isOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setIsOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  // The open menu takes focus, so its keys work however it was opened.
  useEffect(() => {
    if (isOpen) listRef.current?.focus({ preventScroll: true });
  }, [isOpen]);

  // Keep the active option in view while the keys move through a long list.
  // Only the list scrolls: scrollIntoView would move the page or a dialog too.
  useEffect(() => {
    const list = listRef.current;
    const item = isOpen && list ? (list.children[activeIndex] as HTMLElement | undefined) : undefined;
    if (!list || !item) return;
    // The list's own padding, kept clear at either end.
    const pad = (list.firstElementChild as HTMLElement).offsetTop;
    const top = item.offsetTop - pad;
    const bottom = item.offsetTop + item.offsetHeight + pad;
    if (top < list.scrollTop) list.scrollTop = top;
    else if (bottom > list.scrollTop + list.clientHeight) list.scrollTop = bottom - list.clientHeight;
  }, [isOpen, activeIndex]);

  const sizeClasses = {
    sm: 'h-(--control-h-sm) px-2.5 text-[0.8125rem]',
    md: 'h-(--control-h) px-3 text-sm',
    lg: 'h-(--control-h-lg) px-3.5 text-sm'
  };

  // Opens on the chosen option, else the first (or, coming up from below, the last) enabled one.
  const open = (from: 'first' | 'last' = 'first') => {
    const chosen = options.findIndex((opt) => opt.value === value && !opt.disabled);
    setActiveIndex(chosen >= 0 ? chosen : ((from === 'last' ? enabled[enabled.length - 1] : enabled[0]) ?? -1));
    setIsOpen(true);
  };

  // Focus was inside the menu, which is about to unmount, so it goes back to the trigger.
  const close = () => {
    setIsOpen(false);
    triggerRef.current?.focus();
  };

  const handleSelect = (val: string, optDisabled?: boolean) => {
    if (optDisabled) return;
    onChange(val);
    close();
  };

  const onTriggerKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      open(e.key === 'ArrowUp' ? 'last' : 'first');
    }
  };

  const onListKeyDown = (e: React.KeyboardEvent) => {
    const at = enabled.indexOf(activeIndex);
    const moveTo = (index: number | undefined) => {
      e.preventDefault();
      if (index !== undefined) setActiveIndex(index);
    };
    switch (e.key) {
      case 'ArrowDown':
        return moveTo(enabled[Math.min(at + 1, enabled.length - 1)]);
      case 'ArrowUp':
        return moveTo(enabled[at < 0 ? enabled.length - 1 : Math.max(at - 1, 0)]);
      case 'Home':
        return moveTo(enabled[0]);
      case 'End':
        return moveTo(enabled[enabled.length - 1]);
      case 'Enter':
      case ' ':
        e.preventDefault();
        if (activeIndex >= 0) handleSelect(options[activeIndex].value, options[activeIndex].disabled);
        return;
      case 'Escape':
        // Stops here, so a dialog the menu sits in does not close with it.
        e.preventDefault();
        e.stopPropagation();
        close();
        return;
      case 'Tab':
        // Back to the trigger rather than on through the page: inside a
        // focus-trapped dialog the menu is not one of the trap's stops.
        e.preventDefault();
        close();
        return;
    }
    if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
      const letter = e.key.toLowerCase();
      const after = [...enabled.slice(at + 1), ...enabled.slice(0, at + 1)];
      const hit = after.find((i) => labelText(options[i]).startsWith(letter));
      if (hit !== undefined) moveTo(hit);
    }
  };

  return (
    <div ref={containerRef} className={`relative inline-block text-left ${className}`}>
      <button
        ref={triggerRef}
        id={id}
        type="button"
        disabled={disabled}
        onClick={() => (isOpen ? close() : open())}
        onKeyDown={onTriggerKeyDown}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-controls={isOpen ? listId : undefined}
        aria-label={ariaLabel}
        className={`w-full inline-flex items-center justify-between gap-2 rounded-sm border border-border bg-surface text-fg font-medium hover:border-border-strong focus:outline-none focus-visible:border-focus focus-visible:ring-2 focus-visible:ring-focus/40 transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
          sizeClasses[size]
        } ${triggerClassName}`.trim()}
      >
        <span className="flex items-center gap-2 truncate">
          {selectedOption?.icon && <span className="shrink-0 text-fg-muted">{selectedOption.icon}</span>}
          <span className="truncate">{selectedOption ? selectedOption.label : placeholder}</span>
        </span>
        <ChevronDown size={size === 'sm' ? 13 : 15} className="shrink-0 text-fg-muted" />
      </button>

      {isOpen && (
        // The active option carries the focus mark (a violet ring while the
        // keyboard is in use), so the list itself draws none.
        <div
          ref={listRef}
          id={listId}
          role="listbox"
          aria-label={ariaLabel}
          aria-activedescendant={activeIndex >= 0 ? `${listId}-${activeIndex}` : undefined}
          tabIndex={-1}
          onKeyDown={onListKeyDown}
          className={`group absolute left-0 top-[calc(100%+4px)] z-[100] min-w-[200px] w-full max-h-64 overflow-y-auto scroll-thin rounded-md border border-border bg-surface p-1 shadow-menu focus:outline-none ${menuClassName}`.trim()}
        >
          {options.map((opt, i) => {
            const isSelected = opt.value === value;
            const isActive = i === activeIndex;
            return (
              <div
                key={opt.value}
                id={`${listId}-${i}`}
                role="option"
                aria-selected={isSelected}
                aria-disabled={opt.disabled || undefined}
                onClick={() => handleSelect(opt.value, opt.disabled)}
                onMouseMove={() => {
                  if (!opt.disabled && !isActive) setActiveIndex(i);
                }}
                className={`flex items-center justify-between gap-3 px-2.5 py-1.5 rounded-sm text-sm select-none ${
                  opt.disabled
                    ? 'opacity-40 cursor-not-allowed text-fg-muted'
                    : `cursor-pointer ${isSelected || isActive ? 'text-fg' : 'text-fg-secondary'} ${isSelected ? 'font-medium' : ''} ${
                        isActive ? 'bg-surface-2 group-focus-visible:ring-1 group-focus-visible:ring-inset group-focus-visible:ring-focus' : ''
                      }`
                }`}
              >
                <div className="flex items-center gap-2 truncate min-w-0">
                  {opt.icon && <span className="shrink-0 text-fg-muted">{opt.icon}</span>}
                  <span className="truncate">{opt.label}</span>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  {opt.hint && <span className="text-xs font-mono text-fg-muted">{opt.hint}</span>}
                  {isSelected && <Check size={14} className="text-accent-text shrink-0" />}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
