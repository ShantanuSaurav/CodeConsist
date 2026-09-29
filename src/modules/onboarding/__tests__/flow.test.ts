import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from '@/platform/settings';
import type { OnboardingSettings } from '@/platform/settings';
import { needsOnboarding } from '@/platform/session/preferences';
import { answersToKeep, experienceAction, isExperienceLevel, nextAction, recommendedMode, stepAnswered, visibleSteps } from '../flow';

const config = (): OnboardingSettings => JSON.parse(JSON.stringify(DEFAULT_SETTINGS.onboarding));

describe('visibleSteps', () => {
  it('shows every step switched on, in the admin’s order', () => {
    expect(visibleSteps(config(), { hasGoals: true, trackCount: 3 }).map((s) => s.id)).toEqual(['motivation', 'track', 'experience', 'goal', 'mode']);
    const reordered = config();
    reordered.steps = [reordered.steps[4], reordered.steps[1], reordered.steps[2], reordered.steps[0], reordered.steps[3]];
    expect(visibleSteps(reordered, { hasGoals: true, trackCount: 3 }).map((s) => s.id)).toEqual(['mode', 'track', 'experience', 'motivation', 'goal']);
  });

  it('hides the goal step without daily goals, and the track step with one track', () => {
    expect(visibleSteps(config(), { hasGoals: false, trackCount: 3 }).map((s) => s.id)).not.toContain('goal');
    expect(visibleSteps(config(), { hasGoals: true, trackCount: 1 }).map((s) => s.id)).not.toContain('track');
  });

  it('leaves out steps switched off, a repeated step, and everything when the setup is off', () => {
    const c = config();
    c.steps[0].enabled = false;
    c.steps.push({ ...c.steps[1] });
    expect(visibleSteps(c, { hasGoals: true, trackCount: 3 }).map((s) => s.id)).toEqual(['track', 'experience', 'goal', 'mode']);
    expect(visibleSteps({ ...config(), enabled: false }, { hasGoals: true, trackCount: 3 })).toEqual([]);
  });
});

describe('the experience answer', () => {
  it('branches: new starts, some is offered a placement, experienced goes to one', () => {
    const c = config();
    expect(experienceAction(c, 'new')).toBe('start');
    expect(experienceAction(c, 'some')).toBe('offer-placement');
    expect(experienceAction(c, 'experienced')).toBe('placement');
    expect(experienceAction(c, null)).toBeNull();
    expect(experienceAction(c, '__proto__')).toBeNull();
    expect(isExperienceLevel('guru')).toBe(false);
  });

  it('suggests a mode ("none" suggests nothing)', () => {
    const c = config();
    expect(recommendedMode(c, 'new')).toBe('learn');
    expect(recommendedMode(c, 'experienced')).toBe('practice');
    c.experience.options.some.recommendMode = 'none';
    expect(recommendedMode(c, 'some')).toBeNull();
    expect(recommendedMode(c, undefined)).toBeNull();
  });

  it('leads Finish into a placement only while one is possible', () => {
    const c = config();
    expect(nextAction({ experience: 'experienced' }, c, { placementAvailable: true })).toBe('placement');
    expect(nextAction({ experience: 'some' }, c, { placementAvailable: true })).toBe('offer-placement');
    expect(nextAction({ experience: 'new' }, c, { placementAvailable: true })).toBe('start');
    // Placement off, or nothing left to place: the path.
    expect(nextAction({ experience: 'experienced' }, c, { placementAvailable: false })).toBe('start');
    // No answer (skipped): the path.
    expect(nextAction({}, c, { placementAvailable: true })).toBe('start');
    // The admin can point an answer anywhere.
    c.experience.options.new.action = 'placement';
    expect(nextAction({ experience: 'new' }, c, { placementAvailable: true })).toBe('placement');
  });
});

describe('the answers kept', () => {
  it('keeps only the answers of the steps shown and answered', () => {
    const steps = visibleSteps(config(), { hasGoals: false, trackCount: 3 });
    const kept = answersToKeep(steps, { motivation: 'job', trackId: 'c', experience: 'guru', dailyGoalId: 'regular', learningMode: 'learn' });
    // The goal step is hidden (no goals) and "guru" is no answer.
    expect(kept).toEqual({ motivation: 'job', trackId: 'c', learningMode: 'learn' });
    expect(stepAnswered({ id: 'mode' }, { learningMode: null })).toBe(false);
    expect(stepAnswered({ id: 'motivation' }, { motivation: '' })).toBe(false);
  });
});

describe('who is sent to the setup', () => {
  it('never a learner who already has progress', () => {
    expect(needsOnboarding(null, 0)).toBe(true);
    expect(needsOnboarding(null, 12)).toBe(false);
    expect(needsOnboarding({ completedAt: null, dismissedAt: null }, 3)).toBe(false);
  });
});
