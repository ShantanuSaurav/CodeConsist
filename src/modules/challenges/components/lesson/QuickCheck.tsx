import React from 'react';
import { ArrowRight } from 'lucide-react';

interface QuickCheckProps {
  onStart: () => void;
}

/**
 * The bridge from "here's the concept" into the actual graded question. The
 * question itself is the challenge already being rendered by PracticeModal -
 * this is just the short, deliberate hand-off so the mode switch (learning ->
 * being asked) is never abrupt.
 */
export const QuickCheck: React.FC<QuickCheckProps> = ({ onStart }) => (
  <div className="quick-check-bridge">
    <p>
      That's the idea. Now a quick check - one small question to make sure it stuck. Getting it wrong just shows you
      why, so there's nothing to worry about.
    </p>
    <button type="button" className="btn btn-solid" onClick={onStart}>
      <span>Start the quick check</span>
      <ArrowRight size={16} />
    </button>
  </div>
);
