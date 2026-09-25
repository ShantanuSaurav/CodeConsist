import React, { useMemo, useState } from 'react';
import { AlertTriangle, Wand2 } from 'lucide-react';
import { formulaThresholds, levelFromXp, xpForLevel } from '@/platform/xp-leveling/leveling';
import { Button, Card } from '../ui';
import { GenericSection } from './GenericSection';
import type { SectionProps } from './GenericSection';

/**
 * Levels & ranks: the generic fields, plus three things that make a curve
 * change safe to make.
 *   - "Generate curve": fill the table from the classic formula
 *     (base × (L−1) × L) for a number of levels, then a fixed step.
 *   - The impact: how many learners' levels the unsaved curve would change.
 *     A level is always derived from XP, so nobody gains or loses XP.
 *   - A warning when the top rank cannot be reached with all the XP the
 *     content is worth.
 */
export const LevelsSection: React.FC<SectionProps> = (props) => {
  const { draft, saved, context, onChange } = props;
  const [base, setBase] = useState(50);
  const [count, setCount] = useState(40);
  const [step, setStep] = useState(4000);

  const impact = useMemo(() => {
    const xps = context?.levels.learnerXp ?? [];
    let up = 0;
    let down = 0;
    for (const xp of xps) {
      const before = levelFromXp(xp, saved.levels);
      const after = levelFromXp(xp, draft.levels);
      if (after > before) up += 1;
      else if (after < before) down += 1;
    }
    return { learners: xps.length, up, down };
  }, [context, saved.levels, draft.levels]);

  const topRank = draft.levels.ranks[draft.levels.ranks.length - 1];
  const totalXp = context?.content?.totalXp ?? null;
  const reachable = totalXp === null ? null : levelFromXp(totalXp, draft.levels);
  const unreachable = topRank && reachable !== null && reachable < topRank.minLevel;

  const generate = () => {
    const safeCount = Math.max(2, Math.min(100, Math.floor(count)));
    onChange('levels.thresholds', formulaThresholds(Math.max(1, Math.floor(base)), safeCount));
    onChange('levels.overflowStep', Math.max(1, Math.floor(step)));
  };

  return (
    <div>
      <Card className="mb-4 !bg-surface-2">
        <div className="flex items-center gap-2 mb-2">
          <Wand2 size={15} className="text-fg-muted" />
          <h3 className="text-sm font-medium text-fg">Generate curve</h3>
        </div>
        <p className="text-xs text-fg-muted mb-3">
          Level L needs base × (L−1) × L XP, for the first N levels; after that every level costs the step. Base 50, 40 levels and a
          4000 step is the curve learners have always had.
        </p>
        <div className="flex flex-wrap items-end gap-3">
          <label className="text-xs text-fg-secondary">
            Base
            <input type="number" className="block w-24 mt-1" value={base} min={1} onChange={(e) => setBase(Number(e.target.value) || 1)} />
          </label>
          <label className="text-xs text-fg-secondary">
            Levels
            <input type="number" className="block w-24 mt-1" value={count} min={2} max={100} onChange={(e) => setCount(Number(e.target.value) || 2)} />
          </label>
          <label className="text-xs text-fg-secondary">
            Step after
            <input type="number" className="block w-28 mt-1" value={step} min={1} onChange={(e) => setStep(Number(e.target.value) || 1)} />
          </label>
          <Button type="button" variant="secondary" size="sm" onClick={generate}>
            Fill the table
          </Button>
        </div>
      </Card>

      <div className="mb-4 space-y-2 text-sm">
        <p className="text-fg-secondary" data-testid="level-impact">
          {impact.up + impact.down === 0
            ? `With these changes no learner's level changes (${impact.learners} ${impact.learners === 1 ? 'learner' : 'learners'} checked).`
            : `${impact.up + impact.down} of ${impact.learners} learners would change level (${impact.up} up, ${impact.down} down). Nobody's XP changes - a level is always computed from XP.`}
        </p>
        {unreachable && topRank && (
          <p className="flex items-start gap-2 text-warning" role="alert">
            <AlertTriangle size={15} className="shrink-0 mt-0.5" />
            <span>
              The top rank, "{topRank.title}", starts at level {topRank.minLevel} ({xpForLevel(topRank.minLevel, draft.levels).toLocaleString()} XP), but all
              the content together is worth {totalXp?.toLocaleString()} XP - level {reachable} at most. Nobody can reach it.
            </span>
          </p>
        )}
      </div>

      <GenericSection {...props} />
    </div>
  );
};
