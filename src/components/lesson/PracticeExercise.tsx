import React from 'react';
import { Dumbbell } from 'lucide-react';

interface PracticeExerciseProps {
  conceptTitle: string;
}

/**
 * A small, quiet marker on the challenges that follow a taught concept
 * (same stage, learner has already seen the concept this session or before)
 * - it labels them as practice rather than a new, unexplained pop quiz.
 */
export const PracticeExercise: React.FC<PracticeExerciseProps> = ({ conceptTitle }) => (
  <div className="practice-marker">
    <Dumbbell size={13} aria-hidden="true" />
    <span>Practice - applying {conceptTitle}</span>
  </div>
);
