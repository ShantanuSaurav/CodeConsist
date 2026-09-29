import { describe, expect, it } from 'vitest';
import {
  effectiveOnboarding,
  needsOnboarding,
  reconcileOnboarding,
  reconcilePreferences,
  resolveAnswers,
  resolveDailyGoalId,
  resolveSoundOn,
  settledLocal,
  unionConcepts,
  withFieldPending
} from '../preferences';

describe('unionConcepts', () => {
  it('keeps every id once, in first-seen order, ignoring what is not an id', () => {
    expect(unionConcepts(['a', 'b'], ['b', 'c'], null, undefined, ['a', 4 as unknown as string, '', 'd'])).toEqual(['a', 'b', 'c', 'd']);
    expect(unionConcepts()).toEqual([]);
    // The server's list starts empty for every account: the browser's history survives.
    expect(unionConcepts(['local-1', 'local-2'], [])).toEqual(['local-1', 'local-2']);
  });
});

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
    expect(reconcilePreferences('u1', {}, { soundOn: false, pendingSync: null })).toEqual({ patch: null, local: { soundOn: false, pendingSync: null }, adopt: {} });
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

describe('the track, the learning mode and the setup answers (Phase 5)', () => {
  const none = { soundOn: null, pendingSync: null };
  const visible = (id: string) => ['core', 'c'].includes(id);
  const answers = (id: string) => ['job', 'fun'].includes(id);

  it('an account with no track or mode takes this device’s (the first device wins)', () => {
    const out = reconcilePreferences('u1', { trackId: null, learningMode: null }, none, {
      device: { trackId: 'c', learningMode: 'practice' },
      isTrackAvailable: visible
    });
    expect(out.patch).toEqual({ trackId: 'c', learningMode: 'practice' });
    expect(out.adopt).toEqual({});
  });

  it('an account that has them wins: this device switches to them, and nothing is sent back', () => {
    const out = reconcilePreferences('u1', { trackId: 'core', learningMode: 'learn' }, none, {
      device: { trackId: 'c', learningMode: 'practice' },
      isTrackAvailable: visible
    });
    expect(out.patch).toBeNull();
    expect(out.adopt).toEqual({ trackId: 'core', learningMode: 'learn' });
    // Already the same here: nothing to adopt either.
    expect(reconcilePreferences('u1', { trackId: 'c' }, none, { device: { trackId: 'c', learningMode: null }, isTrackAvailable: visible }).adopt).toEqual({});
  });

  it('a change this account made here while offline goes up over the account’s', () => {
    const local = withFieldPending(withFieldPending(none, 'trackId', 'u1'), 'learningMode', 'u1');
    const out = reconcilePreferences('u1', { trackId: 'core', learningMode: 'learn' }, local, {
      device: { trackId: 'c', learningMode: 'practice' },
      isTrackAvailable: visible
    });
    expect(out.patch).toEqual({ trackId: 'c', learningMode: 'practice' });
    // Still pending until it lands; then settled.
    expect(out.local.fieldsPending).toEqual({ trackId: 'u1', learningMode: 'u1' });
    expect(settledLocal(out.local, out.patch!).fieldsPending).toBeUndefined();
    // Another account's offline change is not this one's.
    expect(reconcilePreferences('u2', { trackId: 'core' }, local, { device: { trackId: 'c', learningMode: null }, isTrackAvailable: visible }).patch).toBeNull();
  });

  it('a track learners are no longer shown is never sent - the account’s is taken', () => {
    const out = reconcilePreferences('u1', { trackId: 'core' }, withFieldPending(none, 'trackId', 'u1'), {
      device: { trackId: 'java', learningMode: null },
      isTrackAvailable: visible
    });
    expect(out.patch).toBeNull();
    expect(out.adopt).toEqual({ trackId: 'core' });
    expect(out.local.fieldsPending).toBeUndefined();
  });

  it('a guest’s setup answers go up only where the account has none, and never an unknown one', () => {
    const guest = withFieldPending(withFieldPending({ ...none, motivation: 'job', experience: 'some' }, 'motivation', 'guest'), 'experience', 'guest');
    expect(reconcilePreferences('u1', { motivation: null, experience: null }, guest, { isMotivation: answers }).patch).toEqual({ motivation: 'job', experience: 'some' });
    const kept = reconcilePreferences('u1', { motivation: 'fun', experience: 'new' }, guest, { isMotivation: answers });
    expect(kept.patch).toBeNull();
    expect(kept.local).toMatchObject({ motivation: 'fun', experience: 'new' });
    expect(kept.local.fieldsPending).toBeUndefined();
    // An answer the admin removed since is not sent.
    const removed = withFieldPending({ ...none, motivation: 'fame' }, 'motivation', 'guest');
    expect(reconcilePreferences('u1', { motivation: null }, removed, { isMotivation: answers }).patch).toBeNull();
  });
});

describe('the first-run setup (Phase 5)', () => {
  const done = { completedAt: '2026-09-01T10:00:00.000Z', dismissedAt: null };

  it('is never asked of a learner with progress, nor after it was finished or put aside', () => {
    expect(needsOnboarding(null, 0)).toBe(true);
    expect(needsOnboarding(null, 1)).toBe(false);
    expect(needsOnboarding({ completedAt: null, dismissedAt: null }, 0)).toBe(true);
    expect(needsOnboarding(done, 0)).toBe(false);
    expect(needsOnboarding({ completedAt: null, dismissedAt: '2026-09-01T10:00:00.000Z' }, 0)).toBe(false);
  });

  it('a guest’s state is this browser’s; an account’s is the account’s, or one made here on its way up', () => {
    const local = { ...done, pendingSync: 'guest' };
    expect(effectiveOnboarding(null, null, local)).toEqual(done);
    // A guest who signed in to an account that has not done it: theirs, until it lands.
    expect(effectiveOnboarding('u1', null, local)).toEqual(done);
    // The account's own state wins.
    const account = { completedAt: null, dismissedAt: '2026-09-02T10:00:00.000Z' };
    expect(effectiveOnboarding('u1', account, local)).toEqual(account);
    // Another account's copy left in this browser is not this account's.
    expect(effectiveOnboarding('u2', null, { ...done, pendingSync: 'u1' })).toBeNull();
  });

  it('reconciles: a setup finished here goes up to an account without one; otherwise the account’s is kept here', () => {
    expect(reconcileOnboarding('u1', null, { ...done, pendingSync: 'guest' }).action).toBe('completed');
    expect(reconcileOnboarding('u1', null, { completedAt: null, dismissedAt: 'x', pendingSync: 'u1' }).action).toBe('dismissed');
    const kept = reconcileOnboarding('u1', done, { completedAt: null, dismissedAt: 'y', pendingSync: 'guest' });
    expect(kept.action).toBeNull();
    expect(kept.local).toEqual({ ...done, pendingSync: null });
    expect(reconcileOnboarding('u1', null, { completedAt: null, dismissedAt: null, pendingSync: null })).toEqual({
      action: null,
      local: { completedAt: null, dismissedAt: null, pendingSync: null }
    });
  });

  it('fills the setup in again from the account, else from this browser', () => {
    const local = withFieldPending({ soundOn: null, pendingSync: null, motivation: 'job', experience: 'some' }, 'motivation', 'guest');
    expect(resolveAnswers(null, null, local)).toEqual({ motivation: 'job', experience: 'some' });
    expect(resolveAnswers('u1', { motivation: 'fun', experience: 'new' }, local)).toEqual({ motivation: 'fun', experience: 'new' });
    // The guest's answer while the account has none (it is on its way up).
    expect(resolveAnswers('u1', { motivation: null, experience: null }, local)).toEqual({ motivation: 'job', experience: null });
  });
});
