import React from 'react';
import { ProgressSteps } from './ProgressSteps';

interface LessonIntroProps {
  title: string;
  summary: string;
  steps: string[];
  activeIndex: number;
}

/**
 * Header for a Concept's teaching sequence: what we're about to learn, why
 * (the one-line summary), and where the learner is in the flow. Kept short on
 * purpose - the goal is orientation, not another wall of text.
 */
export const LessonIntro: React.FC<LessonIntroProps> = ({ title, summary, steps, activeIndex }) => (
  <div className="lesson-intro">
    <div className="lesson-intro-badge">New concept</div>
    <h4 className="lesson-intro-title">{title}</h4>
    <p className="lesson-intro-summary">{summary}</p>
    <ProgressSteps steps={steps} activeIndex={activeIndex} />
  </div>
);
