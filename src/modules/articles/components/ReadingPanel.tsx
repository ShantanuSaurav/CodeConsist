import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { BookOpen, ChevronDown, ExternalLink } from 'lucide-react';
import type { Challenge } from '@/types';
import { Markdown } from '@/platform/markdown';
import { ROUTES } from '@/config/routes';
import { sectionFor } from '../content';

interface ReadingPanelProps {
  challenge: Challenge;
  /** Called before navigating to the full article, so the modal can close. */
  onNavigate?: () => void;
}

/**
 * "Read about this topic" - the article section that explains the concept a
 * challenge is testing, collapsible above the prompt. Reading is never
 * penalised; it is the lesson, and the challenge is the exercise.
 */
export const ReadingPanel: React.FC<ReadingPanelProps> = ({ challenge, onNavigate }) => {
  const match = sectionFor(challenge);
  const [open, setOpen] = useState(false);

  // A new challenge collapses the panel so the prompt is what you see first.
  useEffect(() => setOpen(false), [challenge.id]);

  if (!match) return null;
  const { article, section } = match;

  return (
    <div className="reading-panel" data-open={open ? 'true' : 'false'}>
      <button
        type="button"
        className="reading-toggle"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls={`reading-${challenge.id}`}
      >
        <BookOpen size={15} aria-hidden="true" />
        <span className="reading-label">
          Read about this topic: <strong>{section.title}</strong>
        </span>
        <ChevronDown size={16} className="reading-chevron" aria-hidden="true" />
      </button>

      {open && (
        <div id={`reading-${challenge.id}`} className="reading-body">
          <Markdown source={section.body} headingOffset={1} className="text-[14px]" />
          <div className="reading-foot">
            <span>
              From <em>{article.title}</em> · {article.readingMinutes} min
            </span>
            <Link
              to={ROUTES.article(challenge.stageId, section.id)}
              onClick={onNavigate}
              className="reading-link"
            >
              Open the full article <ExternalLink size={12} aria-hidden="true" />
            </Link>
          </div>
        </div>
      )}
    </div>
  );
};
