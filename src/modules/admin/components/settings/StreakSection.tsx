import React, { useMemo } from 'react';
import { Flame, Users } from 'lucide-react';
import { effectiveGoal, emptyHabit, habitRulesFrom, settle } from '@/platform/habits';
import type { HabitRules } from '@/platform/habits';
import { addDays } from '@/platform/time/days';
import { Card } from '../ui';
import { GenericSection } from './GenericSection';
import type { SectionProps } from './GenericSection';
import { learners, useEngagement } from './useEngagement';

/** A fixed day for the worked examples; only the gaps between days matter. */
const TODAY = '2026-01-10';
const STREAK = 5;

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/**
 * What the rules being edited do to a 5-day streak after `missed` days away
 * holding `freezes` freezes - worked out by the same engine learners run,
 * so the sentence is exactly what would happen.
 */
export function workedExample(missed: number, freezes: number, rules: HabitRules): string {
  const lastActiveDay = addDays(TODAY, -(missed + 1));
  const { state, events } = settle(
    { streak: STREAK, bestStreak: STREAK, lastActiveDay, habit: { ...emptyHabit(0), freezes, runStart: addDays(lastActiveDay, -(STREAK - 1)) } },
    TODAY,
    rules
  );
  const holding = `${plural(missed, 'missed day')}, holding ${plural(freezes, 'freeze')}`;
  if (state.streak > 0) {
    return `${holding}: protected - ${plural(events.frozenDays.length, 'freeze')} used, the streak stays at ${STREAK} (next lesson makes it ${STREAK + 1}).`;
  }
  const used = events.frozenDays.length > 0 ? `${plural(events.frozenDays.length, 'freeze')} used, then ` : '';
  const repair = state.habit.repair;
  if (repair) {
    const left = Math.max(0, Math.round((Date.parse(repair.expiresDay) - Date.parse(TODAY)) / 86_400_000));
    const by = left === 0 ? 'by the end of today' : left === 1 ? 'by the end of tomorrow' : `within the next ${left + 1} days`;
    return `${holding}: ${used}the ${STREAK}-day streak ends. Finishing ${plural(repair.required, 'lesson')} ${by} wins it back.`;
  }
  return `${holding}: ${used}the ${STREAK}-day streak ends${rules.repair.enabled ? ' - too many days missed to repair it' : ''}.`;
}

/**
 * Streak, freezes & repair: the generic fields, plus a worked example that
 * follows the values being edited ("Miss 1 day holding 1 freeze: protected")
 * and who a change affects (streaks going, freezes held and used, repairs).
 */
export const StreakSection: React.FC<SectionProps> = (props) => {
  const { draft } = props;
  const engagement = useEngagement();
  // The rules in effect (goal-met with daily goals off counts any solve).
  const rules = useMemo(() => habitRulesFrom(draft, draft.retention), [draft]);
  const goalsOff = effectiveGoal(null, draft.goals) === null;
  const examples = useMemo(
    () => [workedExample(1, 1, rules), workedExample(1, 0, rules), workedExample(2, 1, rules), workedExample(rules.repair.windowDays + 1, 0, rules)],
    [rules]
  );
  const freeze = rules.freeze;
  const dayRule =
    rules.dayRule === 'goal-met'
      ? 'A day counts only when the daily goal is met.'
      : rules.dayRule === 'xp-earned'
        ? 'A day counts when a solve pays XP (a re-solve pays none).'
        : draft.streak.dayRule === 'goal-met'
          ? 'Daily goals are off, so no goal can be met: a day counts with any passing solve, re-solves included.'
          : 'A day counts with any passing solve, re-solves included.';

  return (
    <div>
      <Card className="mb-4 !bg-surface-2">
        <div className="flex items-center gap-2 mb-2">
          <Flame size={15} className="text-fg-muted" />
          <h3 className="text-sm font-medium text-fg">With these values</h3>
        </div>
        <ul className="space-y-1.5 text-sm text-fg-secondary list-disc pl-5" data-testid="streak-example">
          <li>{dayRule}</li>
          <li>
            {!freeze.enabled
              ? 'Freezes are off: none are used or earned (learners keep the ones they hold).'
              : goalsOff
                ? `Freezes are earned on goal days, and daily goals are off: none are earned. Up to ${plural(freeze.maxHeld, 'freeze')} held; new learners start with ${freeze.startingCount}.`
                : `Meeting the daily goal on ${plural(freeze.earnEveryGoalDays, 'day')} earns a freeze, up to ${plural(freeze.maxHeld, 'freeze')} held. New learners start with ${freeze.startingCount}.`}
          </li>
          {examples.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      </Card>

      {engagement && (
        <Card className="mb-4 !bg-surface-2">
          <div className="flex items-center gap-2 mb-2">
            <Users size={15} className="text-fg-muted" />
            <h3 className="text-sm font-medium text-fg">Who this affects</h3>
          </div>
          <p className="text-sm text-fg-secondary" data-testid="streak-impact">
            {learners(engagement.learnersWithStreak)} of {engagement.learners} {engagement.learnersWithStreak === 1 ? 'has' : 'have'} a streak going
            {engagement.learnersWithStreak > 0 ? ` (average ${plural(engagement.avgStreak, 'day')})` : ''}; {engagement.atRiskNow} at risk right now.{' '}
            {plural(engagement.freezesHeld, 'freeze')} held, {engagement.freezesUsed7d} used in the last 7 days. {plural(engagement.repairsOpen, 'repair')} open,{' '}
            {engagement.repairsDone7d} completed this week. {learners(engagement.learnersWithTimeZone)} {engagement.learnersWithTimeZone === 1 ? 'has' : 'have'} a
            time zone on record.
          </p>
        </Card>
      )}

      <GenericSection {...props} />
    </div>
  );
};
