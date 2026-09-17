import React, { useState } from 'react';
import { HelpCircle } from 'lucide-react';

interface ConceptExplanationProps {
  text: string;
  /** A plainer restatement, revealed on request. Optional. */
  explainDifferently?: string;
}

/**
 * The short, plain-language paragraph that introduces a concept - and,
 * per the "never just say Wrong" / progressive-disclosure requirement, an
 * "I don't understand" affordance that reveals a simpler restatement instead
 * of repeating the same words louder.
 */
export const ConceptExplanation: React.FC<ConceptExplanationProps> = ({ text, explainDifferently }) => {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="concept-explanation">
      <p className="concept-explanation-text">{text}</p>

      {explainDifferently && (
        <div className="concept-explain-more">
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => setExpanded((v) => !v)}
            aria-expanded={expanded}
          >
            <HelpCircle size={14} />
            <span>{expanded ? 'Hide the simpler explanation' : "I don't understand — explain this differently"}</span>
          </button>
          {expanded && (
            <div className="concept-explain-more-body" role="note">
              {explainDifferently}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
