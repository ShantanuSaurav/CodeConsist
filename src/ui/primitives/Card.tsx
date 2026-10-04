import React from 'react';
import { Link } from 'react-router-dom';

export type CardVariant = 'plain' | 'raised' | 'interactive' | 'glass';
export type CardPadding = 'none' | 'sm' | 'md' | 'lg';

export interface CardProps extends React.HTMLAttributes<HTMLElement> {
  variant?: CardVariant;
  padding?: CardPadding;
  /** The element to render. Ignored when `to` is set. */
  as?: 'div' | 'article' | 'section' | 'li' | 'button';
  /** Render a router link to this path instead, so the whole card is one target. */
  to?: string;
  /** For `as="button"`; a button card is type="button" unless told otherwise. */
  type?: 'button' | 'submit' | 'reset';
  disabled?: boolean;
}

const VARIANT: Record<CardVariant, string> = {
  plain: '',
  raised: 'card-raised',
  interactive: 'card-interactive',
  glass: 'glass'
};

const PADDING: Record<CardPadding, string> = { none: '', sm: 'card-pad-sm', md: 'card-pad-md', lg: 'card-pad-lg' };

/**
 * A surface for one thing: a lesson, a stat, a choice. Plain at rest, raised
 * when it sits above the page, interactive when the whole card is a target
 * (give it `to` or `as="button"`; it lifts on hover), glass only when it
 * floats over the page. Cards inside cards are a smell, as with Panel.
 */
export const Card: React.FC<CardProps> = ({
  variant = 'plain',
  padding = 'md',
  as: Tag = 'div',
  to,
  type = 'button',
  disabled,
  className = '',
  children,
  ...rest
}) => {
  const classes = `card ${VARIANT[variant]} ${PADDING[padding]} ${className}`.replace(/\s+/g, ' ').trim();
  if (to !== undefined) {
    return (
      <Link to={to} className={classes} {...rest}>
        {children}
      </Link>
    );
  }
  if (Tag === 'button') {
    return (
      <button type={type} disabled={disabled} className={classes} {...rest}>
        {children}
      </button>
    );
  }
  return (
    <Tag className={classes} {...rest}>
      {children}
    </Tag>
  );
};
