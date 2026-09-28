/**
 * The default unit grouping over the REAL challenge bank: every core stage
 * splits into four units, C and C++ into three, every unit has 5-8
 * questions, 46 in all - and the units, read in order, are exactly the
 * authored lesson order (grouping never reorders the default path).
 */
import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from '@/platform/settings';
import { defaultUnits, resolveUnits } from '@/platform/progress';
import { levelFromXp } from '@/platform/xp-leveling/leveling';
import { withUnits } from '@/platform/session';
import { ALL_CHALLENGES, STAGE_META, buildStages } from '../content';

const cfg = DEFAULT_SETTINGS.units;
const stages = buildStages(ALL_CHALLENGES);

describe('the default units of the real bank', () => {
  it('gives every core stage four units and the C and C++ stages three', () => {
    for (const stage of stages) {
      const units = defaultUnits(stage.id, stage.challenges, cfg);
      const expected = /^stage-\d+$/.test(stage.id) ? 4 : 3;
      expect(units.length, `${stage.id}: ${units.map((u) => u.challengeIds.length).join('/')}`).toBe(expected);
    }
  });

  it('keeps every unit between 5 and 8 questions, 46 units in all', () => {
    const all = stages.flatMap((stage) => defaultUnits(stage.id, stage.challenges, cfg));
    expect(all).toHaveLength(46);
    for (const unit of all) {
      expect(unit.challengeIds.length, unit.id).toBeGreaterThanOrEqual(5);
      expect(unit.challengeIds.length, unit.id).toBeLessThanOrEqual(8);
    }
  });

  it('reads back in the authored order, with the stage test in no unit', () => {
    for (const stage of stages) {
      const units = resolveUnits(stage.id, stage.challenges, null, cfg);
      expect(units.flatMap((u) => u.challengeIds)).toEqual(stage.challenges.map((c) => c.id));
      if (stage.test) expect(units.flatMap((u) => u.challengeIds)).not.toContain(stage.test.id);
    }
  });

  it('is what the session builds for the bundled content', () => {
    const withDefaults = withUnits(stages, cfg);
    for (const stage of withDefaults) {
      const original = stages.find((s) => s.id === stage.id)!;
      expect(stage.challenges.map((c) => c.id)).toEqual(original.challenges.map((c) => c.id));
      expect(stage.units?.map((u) => u.id)).toEqual(defaultUnits(stage.id, original.challenges, cfg).map((u) => u.id));
      expect(stage.units?.every((u) => u.estMinutes > 0 && u.xp > 0)).toBe(true);
    }
  });

  it('lets the top rank be reached with the free content alone, on the default curve', () => {
    const premium = new Set(STAGE_META.filter((s) => s.isPremium).map((s) => s.id));
    const freeXp = ALL_CHALLENGES.filter((c) => !premium.has(c.stageId)).reduce((sum, c) => sum + c.xpReward, 0);
    const topRank = DEFAULT_SETTINGS.levels.ranks[DEFAULT_SETTINGS.levels.ranks.length - 1];
    expect(levelFromXp(freeXp, DEFAULT_SETTINGS.levels)).toBeGreaterThanOrEqual(topRank.minLevel);
  });
});
