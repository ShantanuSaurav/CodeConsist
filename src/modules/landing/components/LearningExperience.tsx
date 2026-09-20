import React, { useMemo } from 'react';
import { Check, Play } from 'lucide-react';
import { useSession } from '@/platform/session';
import { intents } from '@/platform/events';
import { Button, CodeBlock } from '@/ui';

const FORMATS = [
  ['Quiz & output prediction', 'Read a snippet, say exactly what it prints.'],
  ['Fill the blanks & ordering', 'Complete code inline, or put pseudocode in the right order.'],
  ['Code & debug', 'Write the function or fix the planted bug. Graded by real test runs.'],
  ['Stage tests', 'One coding problem with hidden cases at the end of every stage.']
];

/** "Learn by doing" - shows a real coding challenge from the bank, not a mock-up. */
export const LearningExperience: React.FC = () => {
  const { allChallenges } = useSession();

  const sample = useMemo(
    () =>
      allChallenges.find(
        (c) => c.stageId === 'stage-1' && c.type === 'code_runner' && (c.starterCode?.split('\n').length ?? 0) <= 8
      ) ?? allChallenges.find((c) => c.type === 'code_runner'),
    [allChallenges]
  );

  return (
    <section className="py-20 sm:py-28 border-t border-border bg-surface">
      <div className="max-w-6xl mx-auto px-6 grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-20 items-center">
        <div className="max-w-lg">
          <div className="eyebrow">Practice</div>
          <h2 className="text-[1.75rem] sm:text-[2.25rem] font-semibold tracking-tight text-fg leading-tight">Learn by doing.</h2>
          <p className="mt-4 text-fg-secondary text-lg leading-relaxed">
            No long videos. Seven interactive lesson formats that get straight to the point, and a coding test at the end of
            every stage.
          </p>

          <ul className="mt-8 border-t border-border-subtle">
            {FORMATS.map(([title, desc]) => (
              <li key={title} className="flex items-start gap-3 py-3.5 border-b border-border-subtle">
                <span className="w-5 h-5 rounded-xs bg-success-soft text-success flex items-center justify-center shrink-0 mt-0.5">
                  <Check size={12} strokeWidth={2.5} />
                </span>
                <div>
                  <div className="text-sm font-medium text-fg">{title}</div>
                  <div className="text-sm text-fg-secondary mt-0.5">{desc}</div>
                </div>
              </li>
            ))}
          </ul>
        </div>

        {sample && (
          <div className="panel overflow-hidden min-w-0">
            <div className="panel-head !py-2.5">
              <div className="min-w-0">
                <div className="font-mono text-[11px] uppercase tracking-wider text-fg-muted">
                  Stage 01 · {sample.language} · Code
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
              <span className="font-mono text-xs text-fg-muted">+{sample.xpReward} XP</span>
              <Button variant="primary" size="sm" onClick={() => intents.openPractice(sample.stageId, sample.id)}>
                <Play size={13} />
                Solve it now
              </Button>
            </div>
          </div>
        )}
      </div>
    </section>
  );
};
