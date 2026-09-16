import React from 'react';

interface PageHeaderProps {
  eyebrow?: string;
  title: string;
  description?: React.ReactNode;
  /** Right-hand slot for actions or a summary figure. */
  aside?: React.ReactNode;
}

/** Title block used at the top of every dashboard page. */
export const PageHeader: React.FC<PageHeaderProps> = ({ eyebrow, title, description, aside }) => (
  <header className="flex flex-wrap items-end justify-between gap-4 mb-8">
    <div className="max-w-2xl">
      {eyebrow && (
        <div className="text-xs font-mono uppercase tracking-wider text-[var(--color-primary)] mb-2">{eyebrow}</div>
      )}
      <h1 className="text-3xl font-bold text-gray-900 dark:text-white">{title}</h1>
      {description && <p className="text-gray-600 dark:text-gray-400 mt-2">{description}</p>}
    </div>
    {aside}
  </header>
);
