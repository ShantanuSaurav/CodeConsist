import React from 'react';

interface EmptyStateProps {
  title?: React.ReactNode;
  children?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}

/** Nothing to show yet. Plain words and, if there is one, the way forward. */
export const EmptyState: React.FC<EmptyStateProps> = ({ title, children, action, className = '' }) => (
  <div className={`rounded-lg border border-dashed border-border px-6 py-10 text-center ${className}`.trim()}>
    {title && <div className="text-fg font-medium">{title}</div>}
    {children && <div className={`text-sm text-fg-secondary ${title ? 'mt-1' : ''}`}>{children}</div>}
    {action && <div className="mt-4 flex justify-center">{action}</div>}
  </div>
);
