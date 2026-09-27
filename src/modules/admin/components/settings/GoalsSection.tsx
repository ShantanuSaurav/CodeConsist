import React from 'react';
import { AlertTriangle, Users } from 'lucide-react';
import { describeGoalTarget } from '@/platform/habits';
import { Card } from '../ui';
import { GenericSection } from './GenericSection';
import type { SectionProps } from './GenericSection';
import { learners, useEngagement } from './useEngagement';

/**
 * Daily goal: the generic fields, plus who a change affects - how many
 * learners chose each option (a switched-off or removed option sends its
 * learners to the default until it is back, keeping their choice), how many
 * follow the default, and how many met their goal today.
 */
export const GoalsSection: React.FC<SectionProps> = (props) => {
  const { draft, context } = props;
  const engagement = useEngagement();
  const counts = context?.goals?.choiceCounts ?? engagement?.goalChoice ?? null;
  const unset = context?.goals?.unset ?? engagement?.goalUnset ?? null;
  const goals = draft.goals;
  const fallback = goals.options.find((o) => o.id === goals.defaultOptionId && o.enabled);
  const stranded = counts
    ? Object.entries(counts).filter(([id, n]) => n > 0 && !goals.options.some((o) => o.id === id && o.enabled))
    : [];

  return (
    <div>
      <Card className="mb-4 !bg-surface-2">
        <div className="flex items-center gap-2 mb-2">
          <Users size={15} className="text-fg-muted" />
          <h3 className="text-sm font-medium text-fg">Who this affects</h3>
        </div>
        {counts === null ? (
          <p className="text-xs text-fg-muted">The server has not reported the learners' goal choices.</p>
        ) : (
          <div className="space-y-2 text-sm text-fg-secondary" data-testid="goal-impact">
            <ul className="flex flex-wrap gap-x-5 gap-y-1">
              {goals.options.map((o) => (
                <li key={o.id}>
                  <span className="text-fg">{o.label || o.id}</span> ({describeGoalTarget(o.metric, o.target)}): {learners(counts[o.id] ?? 0)}
                  {!o.enabled && <span className="text-fg-muted"> · switched off</span>}
                </li>
              ))}
            </ul>
            {unset !== null && (
              <p>
                {learners(unset)} {unset === 1 ? 'follows' : 'follow'} the default
                {fallback ? ` (${fallback.label}, ${describeGoalTarget(fallback.metric, fallback.target)})` : ''} - guests too, until they choose.
              </p>
            )}
            {engagement && (
              <p>
                {learners(engagement.metGoalToday)} met their goal today.
                {goals.enabled ? '' : ' Daily goals are switched off: nobody sees a goal or earns its bonus.'}
              </p>
            )}
            {stranded.length > 0 && (
              <p className="flex items-start gap-2 text-warning" role="alert">
                <AlertTriangle size={15} className="shrink-0 mt-0.5" />
                <span>
                  {stranded.map(([id, n]) => `${learners(n)} chose "${id}"`).join('; ')}, which is not offered with these changes. They follow the default
                  until it is on again; their choice is kept.
                </span>
              </p>
            )}
          </div>
        )}
      </Card>
      <GenericSection {...props} />
    </div>
  );
};
