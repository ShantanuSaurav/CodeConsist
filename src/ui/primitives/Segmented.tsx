import React from 'react';

export interface SegmentedOption<T extends string> {
  value: T;
  label: React.ReactNode;
  title?: string;
}

interface SegmentedProps<T extends string> {
  value: T;
  options: SegmentedOption<T>[];
  onChange: (value: T) => void;
  size?: 'sm' | 'md';
  ariaLabel: string;
  className?: string;
}

/** A small set of mutually exclusive choices - filters, view modes. */
export function Segmented<T extends string>({ value, options, onChange, size = 'md', ariaLabel, className = '' }: SegmentedProps<T>) {
  return (
    <div className={`segmented ${size === 'sm' ? 'segmented-sm' : ''} ${className}`.replace(/\s+/g, ' ').trim()} role="group" aria-label={ariaLabel}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          className={`segmented-option ${o.value === value ? 'is-active' : ''}`.trim()}
          aria-pressed={o.value === value}
          title={o.title}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
