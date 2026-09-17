import React, { useMemo, useState } from 'react';
import { ArrowRight } from 'lucide-react';
import { Concept } from '../../types';
import { LessonIntro } from './LessonIntro';
import { ConceptExplanation } from './ConceptExplanation';
import { CodeExample } from './CodeExample';
import { InteractiveExample } from './InteractiveExample';
import { QuickCheck } from './QuickCheck';

interface ConceptTeachingProps {
  concept: Concept;
  /** Called once the learner is ready to answer the actual challenge (the quick check). */
  onDone: () => void;
}

type Phase = 'concept' | 'why' | 'tryit' | 'bridge';

/**
 * Guided teaching for ONE concept, shown before its quick check the first
 * time a learner reaches it: short intro + example -> why it works (with an
 * optional second, slightly harder example) -> a tiny ungraded try-it -> a
 * deliberate hand-off into the real question. Nothing here is graded and
 * nothing here awards XP - that starts the moment `onDone` fires and
 * PracticeModal renders the actual challenge.
 *
 * Kept as a small state machine over "phases" rather than one long scroll, so
 * a beginner sees one idea at a time (progressive disclosure) with a visible
 * sense of where they are (`ProgressSteps`, via LessonIntro).
 */
export const ConceptTeaching: React.FC<ConceptTeachingProps> = ({ concept, onDone }) => {
  const [phase, setPhase] = useState<Phase>('concept');

  const steps = useMemo(() => {
    const s = ['Concept', 'Example', 'Why it works'];
    if (concept.tryIt) s.push('Try it');
    s.push('Quick check');
    return s;
  }, [concept.tryIt]);

  const activeIndex = useMemo(() => {
    if (phase === 'concept') return 0;
    if (phase === 'why') return 2;
    if (phase === 'tryit') return steps.length - 2;
    return steps.length - 1; // bridge
  }, [phase, steps.length]);

  const advance = () => {
    if (phase === 'concept') setPhase('why');
    else if (phase === 'why') setPhase(concept.tryIt ? 'tryit' : 'bridge');
    else if (phase === 'tryit') setPhase('bridge');
  };

  return (
    <div className="concept-teaching">
      <LessonIntro title={concept.title} summary={concept.summary} steps={steps} activeIndex={activeIndex} />

      {phase === 'concept' && (
        <>
          <ConceptExplanation text={concept.intro} explainDifferently={concept.explainDifferently} />
          <CodeExample code={concept.example.code} language={concept.example.language} callouts={concept.example.callouts} />
          <button type="button" className="btn btn-solid" onClick={advance}>
            <span>Next: why does this work?</span>
            <ArrowRight size={16} />
          </button>
        </>
      )}

      {phase === 'why' && (
        <>
          <ConceptExplanation text={concept.why} />
          {concept.secondExample && (
            <CodeExample
              code={concept.secondExample.code}
              language={concept.secondExample.language}
              callouts={concept.secondExample.callouts}
              label="One more example"
            />
          )}
          <button type="button" className="btn btn-solid" onClick={advance}>
            <span>{concept.tryIt ? 'Next: try it yourself' : 'Continue to the quick check'}</span>
            <ArrowRight size={16} />
          </button>
        </>
      )}

      {phase === 'tryit' && concept.tryIt && (
        <>
          <InteractiveExample tryIt={concept.tryIt} />
          <button type="button" className="btn btn-solid" onClick={advance}>
            <span>Continue to the quick check</span>
            <ArrowRight size={16} />
          </button>
        </>
      )}

      {phase === 'bridge' && <QuickCheck onStart={onDone} />}
    </div>
  );
};
