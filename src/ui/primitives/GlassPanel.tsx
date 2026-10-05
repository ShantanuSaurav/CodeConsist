import React from 'react';

interface GlassPanelProps extends React.HTMLAttributes<HTMLElement> {
  radius?: 'sm' | 'md' | 'lg' | 'xl';
  as?: 'div' | 'section' | 'aside' | 'nav' | 'header';
}

const RADIUS = { sm: 'rounded-sm', md: 'rounded-md', lg: 'rounded-lg', xl: 'rounded-xl' } as const;

/**
 * The frosted surface (`.glass` in components.css) as a component, for what
 * floats over the page: the nav, the rail, a menu, a palette. Never cards or
 * sections, and never a layout wrapper - backdrop-filter makes an element the
 * containing block of its fixed children.
 */
export const GlassPanel: React.FC<GlassPanelProps> = ({ radius = 'lg', as: Tag = 'div', className = '', children, ...rest }) => (
  <Tag className={`glass ${RADIUS[radius]} ${className}`.trim()} {...rest}>
    {children}
  </Tag>
);
