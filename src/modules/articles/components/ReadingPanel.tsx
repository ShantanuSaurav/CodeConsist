import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { BookOpen, ChevronDown, ExternalLink } from 'lucide-react';
import type { Challenge } from '@/types';
import { Markdown } from '@/platform/markdown';
import { ROUTES } from '@/config/routes';
import { MOTION, usePresence } from '@/ui';
import { sectionFor } from '../content';
import '../styles/article.css';

interface ReadingPanelProps {
  challenge: Challenge;
  /** Called before navigating to the full article, so the modal can close. */
  onNavigate?: () => void;
}

type SectionMatch = NonNullable<ReturnType<typeof sectionFor>>;

/**
 * "Read about this topic" - the article section that explains the concept a
 * challenge is testing, collapsible above the prompt. Reading is never
 * penalised; it is the lesson, and the challenge is the exercise.
 *
 * Keyed by challenge, so a new challenge starts collapsed in the same render
 * (the prompt is what you see first) - no exit plays for content that was
 * never on screen. Only the toggle animates.
 */
export const ReadingPanel: React.FC<ReadingPanelProps> = ({ challenge, onNavigate }) => {
  const match = sectionFor(challenge);
  if (!match) return null;
  return <ReadingPanelBody key={challenge.id} challenge={challenge} match={match} onNavigate={onNavigate} />;
};

/**
 * Opening mounts the body at full height and fades it in as it settles from
 * the toggle; closing fades it out a step faster, then unmounts it.
 */
const ReadingPanelBody: React.FC<ReadingPanelProps & { match: SectionMatch }> = ({ challenge, match, onNavigate }) => {
  const [open, setOpen] = useState(false);
  const body = usePresence(open, MOTION.fast);
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

      {body.mounted && (
        <div id={`reading-${challenge.id}`} className="reading-body presence-fade" data-state={body.state}>
          <Markdown source={section.body} headingOffset={1} className="text-[14px] article-prose" />
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
