import { describe, expect, it } from 'vitest';
import { reconcilePreferences, resolveSoundOn } from '../preferences';

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
