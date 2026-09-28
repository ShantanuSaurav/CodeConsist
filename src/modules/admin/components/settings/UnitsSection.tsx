import React from 'react';
import { Link } from 'react-router-dom';
import { GenericSection } from './GenericSection';
import type { SectionProps } from './GenericSection';

/**
 * Units: the generic fields, plus what they add up to - how many units
 * learners see and the most the perfect-unit bonus could ever pay in total
 * (every unit perfect), at the value being edited. A stage's own grouping is
 * edited from Stages > Units.
 */
export const UnitsSection: React.FC<SectionProps> = (props) => {
  const { context, draft } = props;
  const count = context?.content?.unitCount ?? null;
  const bonus = draft.units.perfectBonusXp;
  return (
    <div>
      <p className="text-sm text-fg-secondary mb-4" data-testid="units-impact">
        {count === null
          ? 'The server has not reported its units yet.'
          : `${count} ${count === 1 ? 'unit' : 'units'} across the published stages. At ${bonus} XP a perfect unit, the bonus can pay at most ${(count * bonus).toLocaleString()} XP in total.`}{' '}
        <Link to="/admin/stages" className="link-btn">
          Group a stage's lessons
        </Link>
      </p>
      <GenericSection {...props} />
    </div>
  );
};
