import React from 'react';
import { Check } from 'lucide-react';

interface ProgressStepsProps {
  steps: string[];
  activeIndex: number;
}

/**
 * "Concept -> Example -> Why it works -> Try it -> Quick check" - the
 * beginner should always be able to see where they are in a lesson and what
 * is left, per the guided-teaching requirement. Purely presentational.
 */
export const ProgressSteps: React.FC<ProgressStepsProps> = ({ steps, activeIndex }) => (
  <ol className="lesson-steps" aria-label="Lesson progress">
    {steps.map((step, i) => {
      const state = i < activeIndex ? 'done' : i === activeIndex ? 'active' : 'upcoming';
      return (
        <li key={step} className={`lesson-step lesson-step-${state}`} aria-current={state === 'active'}>
          <span className="lesson-step-dot" aria-hidden="true">
            {state === 'done' ? <Check size={11} strokeWidth={3} /> : i + 1}
          </span>
          <span className="lesson-step-label">{step}</span>
          {i < steps.length - 1 && <span className="lesson-step-connector" aria-hidden="true" />}
        </li>
      );
    })}
  </ol>
);
