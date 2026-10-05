import React from 'react';

export type BadgeTone = 'neutral' | 'accent' | 'success' | 'warning' | 'error' | 'info';

interface BadgeProps {
  tone?: BadgeTone;
  /** Monospace, for technical labels such as a language or a type. */
  mono?: boolean;
  outline?: boolean;
  /** Fully rounded ends. */
  pill?: boolean;
  /** A small dot in the badge's colour before the text. */
  dot?: boolean;
  className?: string;
  title?: string;
  children: React.ReactNode;
}

const TONE: Record<BadgeTone, string> = {
  neutral: '',
  accent: 'badge-accent',
  success: 'badge-success',
  warning: 'badge-warning',
  error: 'badge-error',
  info: 'badge-info'
};

/** Small status/category label. Quiet by default; colour only when it means something. */
export const Badge: React.FC<BadgeProps> = ({ tone = 'neutral', mono, outline, pill, dot, className = '', title, children }) => (
  <span
    className={`badge ${TONE[tone]} ${mono ? 'badge-mono' : ''} ${outline ? 'badge-outline' : ''} ${pill ? 'badge-pill' : ''} ${dot ? 'badge-dot' : ''} ${className}`
      .replace(/\s+/g, ' ')
      .trim()}
    title={title}
  >
    {children}
  </span>
);
