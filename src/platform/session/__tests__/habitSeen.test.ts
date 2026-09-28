import { describe, expect, it } from 'vitest';
import { GUEST_OWNER, adoptGuestSeen, readSeen, writeSeen } from '../useHabitState';
import type { SeenStore } from '../useHabitState';
import { STORAGE_KEYS, writeJson } from '../../storage/storage';

describe('what has been announced, per learner (cq-habit-seen-v1)', () => {
  it('keeps each owner’s keys apart, and prunes old days and empty owners', () => {
    const store: SeenStore = { v: 2, owners: { u1: { 'goalMet:2026-09-20': '2026-09-20', 'goalMet:2026-08-01': '2026-08-01' }, u2: {} } };
    writeSeen(store, '2026-09-20');
    expect(readSeen()).toEqual({ v: 2, owners: { u1: { 'goalMet:2026-09-20': '2026-09-20' } } });
  });

  it('drops a copy with no owner (the first shape) and anything that is not a day', () => {
    writeJson(STORAGE_KEYS.habitSeen, { v: 1, keys: { 'goalMet:2026-09-20': '2026-09-20' } });
    expect(readSeen()).toEqual({ v: 2, owners: {} });
    writeJson(STORAGE_KEYS.habitSeen, { v: 2, owners: { u1: { a: 'nope', b: '2026-09-20' }, u2: 'junk' } });
    expect(readSeen().owners).toEqual({ u1: { b: '2026-09-20' } });
  });

  it('hands a guest’s keys to the account they sign in to, and to nobody else after', () => {
    const store: SeenStore = { v: 2, owners: { [GUEST_OWNER]: { 'goalMet:2026-09-20': '2026-09-20' }, u1: { 'dismissed:atRisk:2026-09-20': '2026-09-20' } } };
    expect(adoptGuestSeen(store, 'u1')).toBe(true);
    expect(store.owners).toEqual({ u1: { 'goalMet:2026-09-20': '2026-09-20', 'dismissed:atRisk:2026-09-20': '2026-09-20' } });
    // A second account on the same browser starts from its own keys.
    expect(adoptGuestSeen(store, 'u2')).toBe(false);
    expect(store.owners.u2).toBeUndefined();
  });
});
