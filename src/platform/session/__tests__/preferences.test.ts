import { describe, expect, it } from 'vitest';
import { reconcilePreferences, resolveDailyGoalId, resolveSoundOn, settledLocal } from '../preferences';

describe('sound on or off', () => {
  it('resolves from the account, then this browser, then the default', () => {
    expect(resolveSoundOn({ soundOn: false }, { soundOn: true, pendingSync: null }, true)).toBe(false);
    expect(resolveSoundOn({ soundOn: null }, { soundOn: false, pendingSync: null }, true)).toBe(false);
    expect(resolveSoundOn(null, { soundOn: null, pendingSync: null }, true)).toBe(true);
    expect(resolveSoundOn(undefined, { soundOn: null, pendingSync: null }, false)).toBe(false);
  });
});

describe('reconcilePreferences', () => {
  it('sends a guest choice up only when the account has none', () => {
    expect(reconcilePreferences('u1', { soundOn: null }, { soundOn: false, pendingSync: 'guest' }).patch).toEqual({ soundOn: false });
    const kept = reconcilePreferences('u1', { soundOn: true }, { soundOn: false, pendingSync: 'guest' });
    expect(kept.patch).toBeNull();
    // The account's choice is remembered here, so a sign-out keeps it.
    expect(kept.local).toEqual({ soundOn: true, pendingSync: null });
  });

  it('sends this account’s own offline choice up, over what the account had', () => {
    expect(reconcilePreferences('u1', { soundOn: true }, { soundOn: false, pendingSync: 'u1' }).patch).toEqual({ soundOn: false });
    // Another account's pending choice is not this account's to take.
    expect(reconcilePreferences('u2', { soundOn: true }, { soundOn: false, pendingSync: 'u1' }).patch).toBeNull();
  });

  it('with nothing pending and nothing on the account, keeps the local choice as it is', () => {
    expect(reconcilePreferences('u1', {}, { soundOn: false, pendingSync: null })).toEqual({ patch: null, local: { soundOn: false, pendingSync: null } });
  });
});

describe('the daily goal and the time zone (Phase 3)', () => {
  const none = { soundOn: null, pendingSync: null };

  it('a guest’s goal is theirs; a signed-in learner’s is the account’s unless one made here is on its way up', () => {
    expect(resolveDailyGoalId(null, null, { ...none, dailyGoalId: 'serious', goalPendingSync: 'guest' })).toBe('serious');
    expect(resolveDailyGoalId(null, null, none)).toBeNull();
    expect(resolveDailyGoalId('u1', { dailyGoalId: 'casual' }, { ...none, dailyGoalId: 'serious', goalPendingSync: null })).toBe('casual');
    // Chosen offline under this account: in use until it lands.
    expect(resolveDailyGoalId('u1', { dailyGoalId: 'casual' }, { ...none, dailyGoalId: 'serious', goalPendingSync: 'u1' })).toBe('serious');
    // A guest's choice never beats one the account already made.
    expect(resolveDailyGoalId('u1', { dailyGoalId: 'casual' }, { ...none, dailyGoalId: 'serious', goalPendingSync: 'guest' })).toBe('casual');
    expect(resolveDailyGoalId('u1', { dailyGoalId: null }, { ...none, dailyGoalId: 'serious', goalPendingSync: 'guest' })).toBe('serious');
  });

  it('sends a guest goal up only where the account has none, and remembers the account’s otherwise', () => {
    const guest = { ...none, dailyGoalId: 'intense', goalPendingSync: 'guest' };
    expect(reconcilePreferences('u1', { dailyGoalId: null }, guest).patch).toEqual({ dailyGoalId: 'intense' });
    const kept = reconcilePreferences('u1', { dailyGoalId: 'casual' }, guest);
    expect(kept.patch).toBeNull();
    expect(kept.local).toMatchObject({ dailyGoalId: 'casual', goalPendingSync: null });
    // This account's own offline choice goes up over the account's.
    expect(reconcilePreferences('u1', { dailyGoalId: 'casual' }, { ...guest, goalPendingSync: 'u1' }).patch).toEqual({ dailyGoalId: 'intense' });
    expect(reconcilePreferences('u2', { dailyGoalId: 'casual' }, { ...guest, goalPendingSync: 'u1' }).patch).toBeNull();
  });

  it('sends this device’s zone when it differs from the account’s', () => {
    expect(reconcilePreferences('u1', { timeZone: 'Asia/Kolkata' }, none, { zone: 'Europe/London' }).patch).toEqual({ timeZone: 'Europe/London' });
    expect(reconcilePreferences('u1', { timeZone: 'Asia/Kolkata' }, none, { zone: 'Asia/Kolkata' }).patch).toBeNull();
    expect(reconcilePreferences('u1', { timeZone: null }, none, { zone: null }).patch).toBeNull();
  });

  it('drops a pending goal for an option switched off since, so the sound and the zone still go up', () => {
    const local = { soundOn: false, pendingSync: 'u1', dailyGoalId: 'serious', goalPendingSync: 'u1' };
    const offered = (id: string) => id !== 'serious';
    const out = reconcilePreferences('u1', { soundOn: true, dailyGoalId: 'casual', timeZone: 'UTC' }, local, { zone: 'Asia/Kolkata', isGoalAvailable: offered });
    expect(out.patch).toEqual({ soundOn: false, timeZone: 'Asia/Kolkata' });
    // The account's goal is the one in use; nothing about the goal is pending any more.
    expect(out.local).toMatchObject({ dailyGoalId: 'casual', goalPendingSync: null, pendingSync: 'u1' });
    // Going back to the default (null) is always available.
    expect(reconcilePreferences('u1', { dailyGoalId: 'casual' }, { ...local, dailyGoalId: null }, { isGoalAvailable: offered }).patch).toMatchObject({ dailyGoalId: null });
  });

  it('clears only what a landed patch carried', () => {
    const local = { soundOn: false, pendingSync: 'u1', dailyGoalId: 'serious', goalPendingSync: 'u1' };
    expect(settledLocal(local, { dailyGoalId: 'serious' })).toEqual({ ...local, goalPendingSync: null });
    expect(settledLocal(local, { soundOn: false, timeZone: 'UTC' })).toEqual({ ...local, pendingSync: null });
  });
});
