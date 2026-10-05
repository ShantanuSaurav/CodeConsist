import React from 'react';

interface EmptyStateProps {
  /** A quiet icon above the title (a lucide icon at about 20px). Decorative. */
  icon?: React.ReactNode;
  title?: React.ReactNode;
  children?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}

/** Nothing to show yet. Plain words and, if there is one, the way forward. */
export const EmptyState: React.FC<EmptyStateProps> = ({ icon, title, children, action, className = '' }) => (
  <div className={`empty-state ${className}`.trim()}>
    {icon && (
      <span className="empty-state-icon" aria-hidden="true">
        {icon}
      </span>
    )}
    {title && <div className="text-fg font-medium">{title}</div>}
    {children && <div className={`text-sm text-fg-secondary ${title ? 'mt-1' : ''}`}>{children}</div>}
    {action && <div className="mt-4 flex justify-center">{action}</div>}
  </div>
);
