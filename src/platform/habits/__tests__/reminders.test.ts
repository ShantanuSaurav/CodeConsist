import { describe, expect, it } from 'vitest';
import { leagueResultBanner, pickHabitBanner, withoutName } from '../reminders';
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

describe("last week's league result", () => {
  const single = { weekId: '2026-09-21', rank: 4, xp: 340, outcome: 'single' as const, tierName: null };

  it('says where the learner finished, keyed to that week', () => {
    expect(leagueResultBanner(single, reminders)).toEqual({
      kind: 'leagueResult',
      title: 'Last week you finished #4 with 340 XP.',
      body: '',
      cta: null,
      key: 'leagueResult:2026-09-21'
    });
  });

  it('with tiers, says where they went - the plain sentence when the tier has no name', () => {
    expect(leagueResultBanner({ ...single, outcome: 'promoted', tierName: 'Silver' }, reminders)?.title).toBe(
      'Last week you finished #4 with 340 XP and moved up to Silver.'
    );
    expect(leagueResultBanner({ ...single, outcome: 'demoted', tierName: 'Bronze' }, reminders)?.title).toContain('moved down to Bronze');
    expect(leagueResultBanner({ ...single, outcome: 'stayed', tierName: 'Gold' }, reminders)?.title).toContain('stayed in Gold');
    expect(leagueResultBanner({ ...single, outcome: 'stayed', tierName: null }, reminders)?.title).toBe('Last week you finished #4 with 340 XP.');
  });

  it('is off with its switch, and says nothing without a result', () => {
    const off = { ...reminders, leagueResult: { ...reminders.leagueResult, enabled: false } };
    expect(leagueResultBanner(single, off)).toBeNull();
    expect(leagueResultBanner(null, reminders)).toBeNull();
    expect(leagueResultBanner({ ...single, rank: 0 }, reminders)).toBeNull();
  });

  it('waits behind the streak banners, and shows once they are dismissed or absent', () => {
    expect(pickHabitBanner(away, reminders, { name: 'Asha', leagueResult: single })?.kind).toBe('welcomeBack');
    const dismissed = (key: string) => key.startsWith('welcomeBack:');
    expect(pickHabitBanner(away, reminders, { name: 'Asha', leagueResult: single, dismissed })?.kind).toBe('leagueResult');
    expect(pickHabitBanner(null, reminders, { name: 'Asha', leagueResult: single })?.key).toBe('leagueResult:2026-09-21');
    expect(pickHabitBanner(null, reminders, { name: 'Asha', leagueResult: single, dismissed: () => true })).toBeNull();
  });
});
