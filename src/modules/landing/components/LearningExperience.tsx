import React from 'react';
import { Play } from 'lucide-react';
import { intents } from '@/platform/events';
import { Button, CodeBlock } from '@/ui';
import type { Challenge } from '@/types';
import { Reveal } from './Reveal';
import { useNextChallenge } from './useNextChallenge';

const FORMATS = [
  ['Quiz & output prediction', 'Read a snippet, say exactly what it prints.'],
  ['Fill the blanks & ordering', 'Complete code inline, or put pseudocode in the right order.'],
  ['Code & debug', 'Write the function or fix the planted bug. Graded by real test runs.'],
  ['Stage tests', 'One coding problem with hidden cases at the end of every stage.']
];

/** Short code challenges only, so the starter code fits the panel. */
const fitsPanel = (c: Challenge) => c.type === 'code_runner' && (c.starterCode?.split('\n').length ?? 0) <= 8;

/** "Learn by doing" - the visitor's next unsolved coding challenge, not a mock-up. */
export const LearningExperience: React.FC = () => {
  const next = useNextChallenge(fitsPanel);
  const sample = next?.challenge;

  return (
    <section className="py-20 sm:py-28 border-t border-border bg-surface">
      <div className="max-w-6xl mx-auto px-6 grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-20 items-center">
        <div className="max-w-lg">
          <Reveal>
            <div className="eyebrow">Practice</div>
            <h2 className="text-[1.75rem] sm:text-[2.25rem] font-semibold tracking-tight text-fg leading-tight">Learn by doing.</h2>
            <p className="mt-4 text-fg-secondary text-lg leading-relaxed">
              No long videos. Seven interactive lesson formats that get straight to the point, and a coding test at the end of
              every stage.
            </p>
          </Reveal>

          <ol className="mt-8 border-t border-border-subtle">
            {FORMATS.map(([title, desc], i) => (
              <Reveal as="li" key={title} delay={120 + i * 90} className="flex items-start gap-4 py-3.5 border-b border-border-subtle">
                <span className="font-mono text-xs text-fg-muted pt-0.5 w-5 shrink-0">{String(i + 1).padStart(2, '0')}</span>
                <div>
                  <div className="text-sm font-medium text-fg">{title}</div>
                  <div className="text-sm text-fg-secondary mt-0.5">{desc}</div>
                </div>
              </Reveal>
            ))}
          </ol>
        </div>

        {sample && (
          <Reveal delay={150} className="min-w-0">
            <div className="panel practice-panel overflow-hidden">
              <div className="panel-head !py-2.5">
                <div className="min-w-0">
                  <div className="font-mono text-[11px] uppercase tracking-wider text-fg-muted">
                    Stage {next?.stage?.index ?? '01'} · {sample.language} · Code
                  </div>
                  <div className="text-sm font-medium text-fg truncate">{sample.title}</div>
                </div>
                <span className="badge">{sample.testCases?.length ?? 0} tests</span>
              </div>
              <div className="p-4 sm:p-5 flex flex-col gap-4">
                <p className="text-sm text-fg-secondary leading-relaxed">{sample.prompt}</p>
                <CodeBlock code={sample.starterCode ?? ''} language={sample.language} showLineNumbers />
              </div>
              <div className="px-4 sm:px-5 py-3 border-t border-border-subtle bg-surface-2 flex items-center justify-between gap-3">
                <span className="font-mono text-xs text-fg-muted">
                  +{sample.xpReward} XP
                </span>
                {/* No challenge id: the practice session opens at the first unsolved lesson of the stage, so nothing is skipped. */}
                <Button variant="primary" size="sm" onClick={() => intents.openPractice(sample.stageId)}>
                  <Play size={13} />
                  Continue Stage {next?.stage?.index ?? '01'}
                </Button>
              </div>
            </div>
          </Reveal>
        )}
      </div>
    </section>
  );
};
