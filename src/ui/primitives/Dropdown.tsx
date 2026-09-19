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

  // Close on outside click
  useEffect(() => {
    if (!isOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  const sizeClasses = {
    sm: 'px-3 py-1.5 text-xs font-semibold rounded-xl min-h-[32px]',
    md: 'px-3.5 py-2 text-sm font-medium rounded-xl min-h-[38px]',
    lg: 'px-4 py-2.5 text-sm font-semibold rounded-xl min-h-[44px]'
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
        className={`w-full inline-flex items-center justify-between gap-2.5 bg-white dark:bg-[#161b22] border border-black/10 dark:border-white/10 text-gray-800 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-[#1c2129] hover:border-black/20 dark:hover:border-white/20 focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]/25 focus:border-[var(--color-primary)] shadow-xs transition-all active:scale-[0.99] disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer ${
          sizeClasses[size]
        } ${triggerClassName}`.trim()}
      >
        <span className="flex items-center gap-2 truncate">
          {selectedOption?.icon && <span className="shrink-0">{selectedOption.icon}</span>}
          <span className="truncate">{selectedOption ? selectedOption.label : placeholder}</span>
        </span>
        <ChevronDown
          size={size === 'sm' ? 14 : 16}
          className={`shrink-0 text-gray-400 dark:text-gray-500 transition-transform duration-200 ${
            isOpen ? 'rotate-180 text-[var(--color-primary)]' : ''
          }`}
        />
      </button>

      {isOpen && (
        <div
          role="listbox"
          aria-label={ariaLabel}
          className={`absolute left-0 top-[calc(100%+6px)] z-[100] min-w-[200px] w-full max-h-64 overflow-y-auto scroll-thin rounded-2xl border border-black/10 dark:border-white/15 bg-white/95 dark:bg-[#161b22]/95 backdrop-blur-xl p-1.5 shadow-2xl shadow-black/15 dark:shadow-black/60 animate-in fade-in zoom-in-95 duration-100 ${menuClassName}`.trim()}
        >
          {options.map((opt) => {
            const isSelected = opt.value === value;
            return (
              <div
                key={opt.value}
                role="option"
                aria-selected={isSelected}
                onClick={() => handleSelect(opt.value, opt.disabled)}
                className={`flex items-center justify-between gap-3 px-3 py-2 rounded-xl text-sm transition-colors select-none ${
                  opt.disabled
                    ? 'opacity-40 cursor-not-allowed text-gray-400'
                    : isSelected
                      ? 'bg-[var(--color-primary)]/10 text-[var(--color-primary)] font-semibold dark:bg-[var(--color-primary)]/15 cursor-pointer'
                      : 'text-gray-800 dark:text-gray-200 hover:bg-black/5 dark:hover:bg-white/5 cursor-pointer'
                }`}
              >
                <div className="flex items-center gap-2.5 truncate min-w-0">
                  {opt.icon && <span className="shrink-0">{opt.icon}</span>}
                  <span className="truncate">{opt.label}</span>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  {opt.hint && (
                    <span
                      className={`text-xs font-normal ${
                        isSelected ? 'text-[var(--color-primary)]/80' : 'text-gray-400 dark:text-gray-500'
                      }`}
                    >
                      {opt.hint}
                    </span>
                  )}
                  {isSelected && <Check size={15} className="text-[var(--color-primary)] shrink-0" />}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
