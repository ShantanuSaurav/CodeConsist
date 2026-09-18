import React from 'react';
import { Sparkles } from 'lucide-react';

interface LessonCompleteProps {
  conceptTitle: string;
}

/**
 * Shown once, right after the learner answers a concept's quick check
 * correctly for the first time - closes the teaching loop before they move
 * into practice (the following lessons in the stage).
 */
export const LessonComplete: React.FC<LessonCompleteProps> = ({ conceptTitle }) => (
  <div className="lesson-complete-banner" role="status">
    <Sparkles size={16} aria-hidden="true" />
    <span>
      <strong>{conceptTitle}</strong> learned. The next lessons are practice - the same idea, applied a bit
      differently each time.
    </span>
  </div>
);
