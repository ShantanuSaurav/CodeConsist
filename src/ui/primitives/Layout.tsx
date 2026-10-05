import React from 'react';

interface SectionProps extends React.HTMLAttributes<HTMLElement> {
  as?: 'section' | 'div' | 'header' | 'footer' | 'article';
  /** The app's tighter rhythm (--section-y-app) rather than the marketing pages' (--section-y). */
  tight?: boolean;
}

/** A band of the page, spaced on the section rhythm. Holds a Container. */
export const Section: React.FC<SectionProps> = ({ as: Tag = 'section', tight = false, className = '', children, ...rest }) => (
  <Tag className={`section ${tight ? 'is-tight' : ''} ${className}`.replace(/\s+/g, ' ').trim()} {...rest}>
    {children}
  </Tag>
);

interface ContainerProps extends React.HTMLAttributes<HTMLElement> {
  as?: 'div' | 'main' | 'section' | 'header' | 'footer';
  /** The wider page measure (--page-max-wide). */
  wide?: boolean;
  /** The prose measure (--reading-max). */
  reading?: boolean;
}

/**
 * Centres content at the page measure with the fluid gutter (--gutter) either
 * side. Never give it a transform or a filter: a page root must not become the
 * containing block of the fixed drawers inside it.
 */
export const Container: React.FC<ContainerProps> = ({ as: Tag = 'div', wide = false, reading = false, className = '', children, ...rest }) => (
  <Tag
    className={`page-container ${wide ? 'is-wide' : ''} ${reading ? 'is-reading' : ''} ${className}`.replace(/\s+/g, ' ').trim()}
    {...rest}
  >
    {children}
  </Tag>
);
