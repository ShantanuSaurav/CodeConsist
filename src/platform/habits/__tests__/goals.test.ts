import { describe, expect, it } from 'vitest';
import type { DailyGoalOption } from '@/types';
import {
  DEFAULT_GOAL_SETTINGS,
  dayGoalStatus,
  describeGoalProgress,
  describeGoalTarget,
  effectiveGoal,
  goalProgress,
  isGoalOptionAvailable
} from '../goals';
import { applyActivityEvent, dayRow, emptyActivityLog } from '../../activity/log';
import { DEFAULT_SETTINGS } from '../../settings/defaults';

const goals = DEFAULT_GOAL_SETTINGS;
const option = (id: string): DailyGoalOption => goals.options.find((o) => o.id === id)!;

describe('effectiveGoal', () => {
  it('is the learner’s choice while it is offered', () => {
    expect(effectiveGoal('serious', goals)?.id).toBe('serious');
  });

  it('falls back to the default when the choice is unknown or switched off - keeping the choice', () => {
    expect(effectiveGoal('nope', goals)?.id).toBe('regular');
    expect(effectiveGoal(null, goals)?.id).toBe('regular');
    const off = { ...goals, options: goals.options.map((o) => (o.id === 'serious' ? { ...o, enabled: false } : o)) };
    expect(effectiveGoal('serious', off)?.id).toBe('regular');
    // Enabled again, the stored choice applies again.
    expect(effectiveGoal('serious', goals)?.id).toBe('serious');
    expect(isGoalOptionAvailable('serious', off)).toBe(false);
    expect(isGoalOptionAvailable('serious', goals)).toBe(true);
  });

  it('is nothing when goals are off', () => {
    expect(effectiveGoal('regular', { ...goals, enabled: false })).toBeNull();
  });

  it('matches the settings defaults: XP goals, Regular (100 XP) by default', () => {
    expect(DEFAULT_SETTINGS.goals.defaultOptionId).toBe('regular');
    expect(DEFAULT_SETTINGS.goals.options.map((o) => [o.id, o.metric, o.target, o.bonusXp])).toEqual([
      ['casual', 'xp', 50, 5],
      ['regular', 'xp', 100, 10],
      ['serious', 'xp', 250, 25],
      ['intense', 'xp', 500, 50]
    ]);
  });
});

describe('goalProgress', () => {
  it('the xp metric ignores 0-XP re-solves: it reads only XP that was paid', () => {
    let log = emptyActivityLog();
    const ctx = { day: '2026-09-20', at: '2026-09-20T10:00:00.000Z' };
    log = applyActivityEvent(log, { type: 'solve', challengeId: 'a', isTest: false, firstSolve: true, awardedXp: 40 }, ctx);
    for (let i = 0; i < 5; i++) log = applyActivityEvent(log, { type: 'solve', challengeId: 'a', isTest: false, firstSolve: false, awardedXp: 0 }, ctx);
    const day = dayRow(log, '2026-09-20');
    expect(day.reSolves).toBe(5);
    expect(goalProgress(day, option('casual'))).toEqual({ done: 40, target: 50, met: false, percent: 80 });
  });

  it('lessons counts first-time lessons and review answers', () => {
    const lessons: DailyGoalOption = { id: 'three', label: 'Three', blurb: '', metric: 'lessons', target: 3, bonusXp: 0, enabled: true };
    expect(goalProgress({ lessons: 2, reSolves: 4 }, lessons).met).toBe(false);
    expect(goalProgress({ lessons: 2, reviews: 1 }, lessons)).toMatchObject({ done: 3, met: true });
  });

  it('units counts units completed', () => {
    const units: DailyGoalOption = { id: 'u', label: 'Unit', blurb: '', metric: 'units', target: 1, bonusXp: 0, enabled: true };
    expect(goalProgress({ units: 1 }, units).met).toBe(true);
    expect(goalProgress(null, units)).toEqual({ done: 0, target: 1, met: false, percent: 0 });
  });

  it('describes a target and progress', () => {
    expect(describeGoalTarget('xp', 100)).toBe('100 XP');
    expect(describeGoalTarget('lessons', 1)).toBe('1 lesson');
    expect(describeGoalTarget('units', 2)).toBe('2 units');
    expect(describeGoalProgress('xp', 40, 100)).toBe('40 / 100 XP');
    expect(describeGoalProgress('lessons', 1, 3)).toBe('1 / 3 lessons');
  });
});

describe('a met goal stays met', () => {
  it('after the learner picks a bigger goal', () => {
    let log = emptyActivityLog();
    const ctx = { day: '2026-09-20', at: '2026-09-20T10:00:00.000Z' };
    log = applyActivityEvent(log, { type: 'solve', challengeId: 'a', isTest: false, firstSolve: true, awardedXp: 60 }, ctx);
    log = applyActivityEvent(log, { type: 'goal', goal: { optionId: 'casual', metric: 'xp', target: 50, metAt: ctx.at }, bonusXp: 5 }, ctx);
    const day = dayRow(log, '2026-09-20');
    expect(day).toMatchObject({ xp: 60, goalBonusXp: 5, goal: { optionId: 'casual', target: 50 } });

    // Now "Intense" (500 XP): the day keeps the goal it met.
    const status = dayGoalStatus(day, option('intense'), goals.options);
    expect(status).toMatchObject({ met: true, optionId: 'casual', label: 'Casual', target: 50, percent: 100, fromSnapshot: true, bonusXp: 5 });
  });

  it('and a second goal event on a met day changes nothing', () => {
    let log = emptyActivityLog();
    const ctx = { day: '2026-09-20', at: '2026-09-20T10:00:00.000Z' };
    log = applyActivityEvent(log, { type: 'goal', goal: { optionId: 'casual', metric: 'xp', target: 50, metAt: ctx.at }, bonusXp: 5 }, ctx);
    const again = applyActivityEvent(log, { type: 'goal', goal: { optionId: 'intense', metric: 'xp', target: 500, metAt: ctx.at }, bonusXp: 50 }, ctx);
    expect(dayRow(again, '2026-09-20')).toMatchObject({ goalBonusXp: 5, goal: { optionId: 'casual' } });
  });
});

describe('a goal reached but not yet counted', () => {
  it('is reached, not met, until a solve snapshots it (the goal was lowered after the last lesson)', () => {
    // 60 XP done under Regular (100); the learner switches to Casual (50).
    const status = dayGoalStatus({ xp: 60, lessons: 2 }, option('casual'), goals.options);
    expect(status).toMatchObject({ optionId: 'casual', done: 60, target: 50, met: false, reached: true, metAt: null, percent: 100, bonusXp: 5 });
    // Below the goal: neither.
    expect(dayGoalStatus({ xp: 40 }, option('casual'), goals.options)).toMatchObject({ met: false, reached: false });
    // Snapshotted by a solve: met (and reached).
    const met = dayGoalStatus(
      { xp: 70, goal: { optionId: 'casual', metric: 'xp', target: 50, metAt: '2026-09-20T10:00:00.000Z' }, goalBonusXp: 5 },
      option('casual'),
      goals.options
    );
    expect(met).toMatchObject({ met: true, reached: true, metAt: '2026-09-20T10:00:00.000Z' });
  });
});
