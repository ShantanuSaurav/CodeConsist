import React from 'react';

interface KbdProps {
  children: React.ReactNode;
  /** The key's full name when the cap shows a symbol ("Command" for ⌘). */
  title?: string;
  className?: string;
}

/** A key-cap for a shortcut hint (`.kbd` in components.css). One key per Kbd. */
export const Kbd: React.FC<KbdProps> = ({ children, title, className = '' }) => (
  <kbd className={`kbd ${className}`.trim()} title={title}>
    {children}
  </kbd>
);
