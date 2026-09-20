import React from 'react';

interface PageHeaderProps {
  eyebrow?: string;
  title: string;
  description?: React.ReactNode;
  /** Right-hand slot for actions or a summary figure. */
  aside?: React.ReactNode;
  className?: string;
}

/** Title block at the top of every page. One size, one weight, everywhere. */
export const PageHeader: React.FC<PageHeaderProps> = ({ eyebrow, title, description, aside, className = '' }) => (
  <header className={`flex flex-wrap items-end justify-between gap-4 pb-6 mb-6 border-b border-border-subtle ${className}`.trim()}>
    <div className="flex-1 max-w-2xl min-w-[16rem]">
      {eyebrow && <div className="eyebrow">{eyebrow}</div>}
      <h1 className="text-[1.75rem] leading-tight font-semibold tracking-tight text-fg">{title}</h1>
      {description && <p className="text-fg-secondary mt-2 text-[0.9375rem] leading-relaxed">{description}</p>}
    </div>
    {aside && <div className="shrink-0">{aside}</div>}
  </header>
);
