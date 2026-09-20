import React, { useEffect, useRef, useState } from 'react';
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

/**
 * A select with a proper menu. Same height and radius as every other
 * control; the menu is the one place a shadow is allowed, because it floats.
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
  const containerRef = useRef<HTMLDivElement>(null);

  const selectedOption = options.find((opt) => opt.value === value);

  // Close on outside click / Escape
  useEffect(() => {
    if (!isOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setIsOpen(false);
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  const sizeClasses = {
    sm: 'h-[28px] px-2.5 text-[0.8125rem]',
    md: 'h-[34px] px-3 text-sm',
    lg: 'h-[40px] px-3.5 text-sm'
  };

  const handleSelect = (val: string, optDisabled?: boolean) => {
    if (optDisabled) return;
    onChange(val);
    setIsOpen(false);
  };

  return (
    <div ref={containerRef} className={`relative inline-block text-left ${className}`}>
      <button
        id={id}
        type="button"
        disabled={disabled}
        onClick={() => setIsOpen((prev) => !prev)}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-label={ariaLabel}
        className={`w-full inline-flex items-center justify-between gap-2 rounded-sm border border-border bg-surface text-fg font-medium hover:border-border-strong focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
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
        <div
          role="listbox"
          aria-label={ariaLabel}
          className={`absolute left-0 top-[calc(100%+4px)] z-[100] min-w-[200px] w-full max-h-64 overflow-y-auto scroll-thin rounded-md border border-border bg-surface p-1 shadow-menu ${menuClassName}`.trim()}
        >
          {options.map((opt) => {
            const isSelected = opt.value === value;
            return (
              <div
                key={opt.value}
                role="option"
                aria-selected={isSelected}
                onClick={() => handleSelect(opt.value, opt.disabled)}
                className={`flex items-center justify-between gap-3 px-2.5 py-1.5 rounded-xs text-sm select-none ${
                  opt.disabled
                    ? 'opacity-40 cursor-not-allowed text-fg-muted'
                    : isSelected
                      ? 'bg-surface-2 text-fg font-medium cursor-pointer'
                      : 'text-fg-secondary hover:bg-surface-2 hover:text-fg cursor-pointer'
                }`}
              >
                <div className="flex items-center gap-2 truncate min-w-0">
                  {opt.icon && <span className="shrink-0 text-fg-muted">{opt.icon}</span>}
                  <span className="truncate">{opt.label}</span>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  {opt.hint && <span className="text-xs font-mono text-fg-muted">{opt.hint}</span>}
                  {isSelected && <Check size={14} className="text-accent shrink-0" />}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
