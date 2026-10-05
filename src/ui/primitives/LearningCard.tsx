import React, { useId } from 'react';
import { ProgressBar } from './ProgressBar';

interface LearningCardProps {
  eyebrow?: React.ReactNode;
  title: React.ReactNode;
  /** Small facts under the title ("Stage 3 · 12 lessons"), set in mono. */
  meta?: React.ReactNode;
  /** 0-100. Shows a bar, named by the title, with the figure beside it. */
  progress?: number;
  /** The way on: usually one primary Button or ButtonLink. */
  action?: React.ReactNode;
  as?: 'div' | 'article' | 'section';
  titleAs?: 'h2' | 'h3';
  className?: string;
  children?: React.ReactNode;
}

/**
 * The large featured card: where you are and the way on. One per screen at
 * most - it is the thing to do next, not a grid item.
 */
export const LearningCard: React.FC<LearningCardProps> = ({
  eyebrow,
  title,
  meta,
  progress,
  action,
  as: Tag = 'div',
  titleAs: Title = 'h3',
  className = '',
  children
}) => {
  const titleId = useId();
  const pct = progress === undefined ? null : Math.max(0, Math.min(100, Math.round(progress)));
  return (
    <Tag className={`card learning-card ${className}`.trim()}>
      {eyebrow && <span className="eyebrow mb-0">{eyebrow}</span>}
      <Title id={titleId} className="section-title">
        {title}
      </Title>
      {meta && <div className="flex flex-wrap gap-x-3 gap-y-1 font-mono text-xs text-fg-muted">{meta}</div>}
      {children && <div className="max-w-2xl text-fg-secondary">{children}</div>}
      {pct !== null && (
        <div className="flex items-center gap-3 w-full mt-3">
          <ProgressBar value={pct} labelledBy={titleId} className="flex-1" />
          <span className="shrink-0 font-mono text-xs text-fg-secondary tabular-nums">{pct}%</span>
        </div>
      )}
      {action && <div className="flex flex-wrap gap-2 mt-3">{action}</div>}
    </Tag>
  );
};
