import React from 'react';
import { Link } from 'react-router-dom';
import { Badge } from './Badge';
import { CheckGlyph, LockGlyph } from './glyphs';

export type ChallengeCardStatus = 'solved' | 'todo' | 'locked';
export type ChallengeCardDifficulty = 'easy' | 'medium' | 'hard';

interface ChallengeCardProps {
  title: React.ReactNode;
  status: ChallengeCardStatus;
  /** A mono line above the title: the stage ("Stage 03 · Loops"). */
  eyebrow?: React.ReactNode;
  difficulty?: ChallengeCardDifficulty;
  xp?: number;
  /** Badges under the title: the language, the type. */
  chips?: React.ReactNode;
  /** A control of its own (a Button). It sits above the card's own target. */
  action?: React.ReactNode;
  /** 'row' for a list, 'card' for a grid. */
  layout?: 'row' | 'card';
  /** Makes the whole card one link... */
  to?: string;
  /** ...or one button. */
  onClick?: () => void;
  /** The status in words for screen readers, in place of the defaults. */
  statusLabel?: string;
  as?: 'div' | 'li' | 'article';
  className?: string;
}

const STATUS_LABEL: Record<ChallengeCardStatus, string> = { solved: 'Solved', todo: 'Not solved yet', locked: 'Locked' };
const DIFFICULTY_LABEL: Record<ChallengeCardDifficulty, string> = { easy: 'Easy', medium: 'Medium', hard: 'Hard' };

/**
 * One challenge: a status glyph (an empty ring, a green check, a lock), the
 * title under a mono stage line, a difficulty dot and the XP it pays. Given
 * `to` or `onClick`, the title's link or button covers the whole card, which
 * lifts on hover; an `action` stays separately clickable above it.
 */
export const ChallengeCard: React.FC<ChallengeCardProps> = ({
  title,
  status,
  eyebrow,
  difficulty,
  xp,
  chips,
  action,
  layout = 'row',
  to,
  onClick,
  statusLabel,
  as: Tag = 'div',
  className = ''
}) => {
  const interactive = to !== undefined || onClick !== undefined;
  const heading =
    to !== undefined ? (
      <Link to={to} className="challenge-card-title challenge-card-link">
        {title}
      </Link>
    ) : onClick ? (
      <button type="button" className="challenge-card-title challenge-card-link" onClick={onClick}>
        {title}
      </button>
    ) : (
      <span className="challenge-card-title">{title}</span>
    );

  return (
    <Tag
      className={`card challenge-card is-${layout} is-${status} ${interactive ? 'card-interactive' : ''} ${className}`.replace(/\s+/g, ' ').trim()}
    >
      <span className={`challenge-card-status is-${status}`} role="img" aria-label={statusLabel ?? STATUS_LABEL[status]}>
        {status === 'solved' ? <CheckGlyph /> : status === 'locked' ? <LockGlyph size={11} /> : null}
      </span>
      <div className="challenge-card-main flex flex-col gap-0.5">
        {eyebrow && <span className="eyebrow mb-0">{eyebrow}</span>}
        {heading}
        {chips && <div className="flex flex-wrap gap-1 mt-1">{chips}</div>}
      </div>
      {(difficulty || xp !== undefined) && (
        <div className="flex flex-wrap items-center gap-3 font-mono text-xs text-fg-muted">
          {difficulty && <span className={`difficulty-dot is-${difficulty}`}>{DIFFICULTY_LABEL[difficulty]}</span>}
          {xp !== undefined && (
            <Badge tone="accent" mono pill>
              {xp} XP
            </Badge>
          )}
        </div>
      )}
      {action && <div className="challenge-card-action">{action}</div>}
    </Tag>
  );
};
