import React from 'react';

export type StatCardTone = 'neutral' | 'accent' | 'success' | 'warning' | 'info';

interface StatCardProps {
  label: string;
  value: React.ReactNode;
  /** A quiet icon in the corner (a lucide icon at about 15px). Decorative. */
  icon?: React.ReactNode;
  /** The change beside the figure ("+12 this week"). */
  delta?: React.ReactNode;
  /** A line under a hairline: context, or a link onward. */
  footer?: React.ReactNode;
  /** What the figure means; it colours the icon and the change, never the figure. */
  tone?: StatCardTone;
  className?: string;
}

/**
 * One figure on its own quiet card: mono label, large tabular value. For a
 * row of figures inside one surface, Stat with dividers reads better.
 */
export const StatCard: React.FC<StatCardProps> = ({ label, value, icon, delta, footer, tone = 'neutral', className = '' }) => (
  <div className={`card stat-card ${tone === 'neutral' ? '' : `tone-${tone}`} ${className}`.replace(/\s+/g, ' ').trim()}>
    {/* As tall as the icon either way, so the figures in a row of cards line up. */}
    <div className="flex items-center justify-between gap-3 min-h-7">
      <span className="stat-label">{label}</span>
      {icon && (
        <span className="stat-card-icon" aria-hidden="true">
          {icon}
        </span>
      )}
    </div>
    <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
      <span className="stat-value">{value}</span>
      {delta && <span className="stat-card-delta font-mono text-xs font-medium tabular-nums">{delta}</span>}
    </div>
    {footer && <div className="mt-1 pt-3 border-t border-border-subtle text-xs text-fg-muted">{footer}</div>}
  </div>
);
