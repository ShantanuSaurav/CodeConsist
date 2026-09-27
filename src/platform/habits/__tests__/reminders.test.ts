import { describe, expect, it } from 'vitest';
import { pickHabitBanner, withoutName } from '../reminders';
import { habitStatus, streakFieldsOf } from '../streak';
import { DEFAULT_SETTINGS } from '../../settings/defaults';

const reminders = DEFAULT_SETTINGS.reminders;

/** A learner last active on the 16th, looked at on the 20th (4 days away, the streak gone). */
const away = habitStatus(streakFieldsOf({ streak: 4, bestStreak: 9, lastActiveDay: '2026-09-16' }), {
  today: '2026-09-20',
  now: new Date('2026-09-20T09:00:00Z'),
  zone: 'UTC',
  day: null,
  goal: null
});

describe('the welcome-back banner', () => {
  it('greets a signed-in learner by name', () => {
    const banner = pickHabitBanner(away, reminders, { name: 'Asha' });
    expect(banner).toMatchObject({ kind: 'welcomeBack', title: 'Welcome back, Asha' });
  });

  it('leaves the name out for a guest, with the comma before it', () => {
    const banner = pickHabitBanner(away, reminders, { name: null });
    expect(banner).toMatchObject({ kind: 'welcomeBack', title: 'Welcome back' });
  });
});

describe('withoutName', () => {
  it('takes {name} out wherever it sits', () => {
    expect(withoutName('Welcome back, {name}!')).toBe('Welcome back!');
    expect(withoutName('Hi {name}. Ready?')).toBe('Hi. Ready?');
    expect(withoutName('{name}, you are back')).toBe('You are back');
    expect(withoutName('No name here, friend')).toBe('No name here, friend');
  });
});
