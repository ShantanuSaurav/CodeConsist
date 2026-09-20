import React from 'react';

interface SectionHeaderProps {
  title: React.ReactNode;
  description?: React.ReactNode;
  aside?: React.ReactNode;
  as?: 'h2' | 'h3';
  className?: string;
}

/** Heading + one line of context + an optional control, above a section of a page. */
export const SectionHeader: React.FC<SectionHeaderProps> = ({ title, description, aside, as: Tag = 'h2', className = '' }) => (
  <div className={`flex flex-wrap items-end justify-between gap-3 mb-4 ${className}`.trim()}>
    <div className="flex-1 min-w-[12rem]">
      <Tag className="section-title">{title}</Tag>
      {description && <p className="section-desc">{description}</p>}
    </div>
    {aside && <div className="shrink-0">{aside}</div>}
  </div>
);
