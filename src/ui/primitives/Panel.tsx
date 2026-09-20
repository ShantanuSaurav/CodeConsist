import React from 'react';

interface PanelProps {
  title?: React.ReactNode;
  /** Right-hand slot in the header - a count, a link, a control. */
  aside?: React.ReactNode;
  /** Remove the body padding, for tables and lists that run edge to edge. */
  flush?: boolean;
  className?: string;
  bodyClassName?: string;
  children: React.ReactNode;
  as?: 'div' | 'section' | 'article';
}

/**
 * A bordered surface. Use it when a group of things genuinely needs a
 * container (a table, a form, a summary); otherwise prefer a heading and a
 * divider. Cards inside cards are a smell.
 */
export const Panel: React.FC<PanelProps> = ({ title, aside, flush, className = '', bodyClassName = '', children, as: Tag = 'div' }) => (
  <Tag className={`panel ${className}`.trim()}>
    {(title || aside) && (
      <div className="panel-head">
        {title ? <h3 className="panel-title">{title}</h3> : <span />}
        {aside}
      </div>
    )}
    <div className={flush ? bodyClassName : `panel-body ${bodyClassName}`.trim()}>{children}</div>
  </Tag>
);
