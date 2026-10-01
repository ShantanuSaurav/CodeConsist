import React, { useRef } from 'react';
import { useSlidingIndicator } from '../hooks/useSlidingIndicator';

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

/**
 * A small set of mutually exclusive choices - filters, view modes. The
 * raised thumb slides to the chosen option rather than jumping.
 */
export function Segmented<T extends string>({ value, options, onChange, size = 'md', ariaLabel, className = '' }: SegmentedProps<T>) {
  const rootRef = useRef<HTMLDivElement>(null);
  const thumbRef = useRef<HTMLSpanElement>(null);
  useSlidingIndicator(rootRef, thumbRef, '.segmented-option.is-active', 'x', value);

  return (
    <div
      ref={rootRef}
      className={`segmented ${size === 'sm' ? 'segmented-sm' : ''} ${className}`.replace(/\s+/g, ' ').trim()}
      role="group"
      aria-label={ariaLabel}
    >
      <span ref={thumbRef} className="segmented-thumb" aria-hidden="true" />
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
