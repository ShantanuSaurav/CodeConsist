import React from 'react';
import { ENV } from '@/config/env';

interface DevHintProps {
  children: React.ReactNode;
  /** Inline by default; `div` or `p` where the hint is its own line. */
  as?: 'span' | 'div' | 'p';
  className?: string;
}

/**
 * Instructions meant for whoever is running the app locally - "start the API
 * with npm run dev:api", "put JUDGE0_API_URL in .env" - and never for a
 * visitor. Renders its children in a development build only; a production
 * build shows the friendly text next to it and nothing else.
 */
export const DevHint: React.FC<DevHintProps> = ({ children, as: Tag = 'span', className = '' }) => {
  if (!ENV.isDev) return null;
  return (
    <Tag className={`dev-hint ${className}`.trim()} title="Shown in development builds only">
      {children}
    </Tag>
  );
};
